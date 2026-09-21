import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const fileHash = (content) => content === null ? null : crypto.createHash('sha256').update(content).digest('hex');
const locks = new Map();

export function validateFileEdits(edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 50) throw new Error('Provide 1–50 file edits.');
  edits.forEach((edit, index) => {
    const entry = `edits[${index}]`;
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error(`${entry} must be a file edit object.`);
    if (typeof edit.path !== 'string' || !edit.path.trim() || edit.path.includes('\0')) throw new Error(`${entry}.path is required: provide a file path inside the workspace (for example, public/index.html).`);
    if (Object.hasOwn(edit, 'old_text') && (typeof edit.old_text !== 'string' || typeof edit.new_text !== 'string')) throw new Error(`${entry} (${edit.path}) requires string old_text and new_text.`);
  });
}

export async function workspacePath(root, requested) {
  if (typeof requested !== 'string' || !requested || requested.includes('\0')) throw new Error('A workspace-relative path is required.');
  const base = await fs.realpath(root);
  const target = path.resolve(base, requested);
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path is outside the workspace.');
  let cursor = base;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('Symbolic links are not allowed for workspace tools.');
      if (stat.isFile() && stat.nlink > 1) throw new Error('Hard-linked files are not supported by workspace tools.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

async function contentAt(target) {
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 2000000) throw new Error('Changes support regular UTF-8 files up to 2 MB.');
    const bytes = await fs.readFile(target);
    const text = bytes.toString('utf8');
    if (text.includes('\0') || !Buffer.from(text).equals(bytes)) throw new Error('Changes require UTF-8 text without NUL bytes.');
    return text;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function unifiedDiff(name, before, after) {
  const oldLines = before === null ? [] : before.split('\n');
  const newLines = after === null ? [] : after.split('\n');
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  if (prefix === oldLines.length && prefix === newLines.length) return '';
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines.at(-1 - suffix) === newLines.at(-1 - suffix)) suffix++;
  const start = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  return [`--- ${before === null ? '/dev/null' : `a/${name}`}`, `+++ ${after === null ? '/dev/null' : `b/${name}`}`, `@@ -${oldLines.length ? start + 1 : 0},${oldEnd - start} +${newLines.length ? start + 1 : 0},${newEnd - start} @@`,
    ...oldLines.slice(start, prefix).map((line) => ` ${line}`),
    ...oldLines.slice(prefix, oldLines.length - suffix).map((line) => `-${line}`),
    ...newLines.slice(prefix, newLines.length - suffix).map((line) => `+${line}`),
    ...oldLines.slice(oldLines.length - suffix, oldEnd).map((line) => ` ${line}`),
  ].join('\n');
}

async function replace(target, content, mode) {
  if (content === null) { await fs.unlink(target); return; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.harness-${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode: mode ?? 0o644 });
    await fs.rename(temporary, target);
  } finally { await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
}

export function createChangeHistory({ root, store, authorize = async () => true }) {
  const key = `changes:${path.resolve(root)}`;
  let memory = [];
  const read = () => store?.getRuntimeValue(key) || memory;
  const save = (rows) => { if (store) store.setRuntimeValue(key, rows); else memory = rows; };
  const locked = async (fn) => {
    const previous = locks.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(fn);
    locks.set(key, pending);
    try { return await pending; } finally { if (locks.get(key) === pending) locks.delete(key); }
  };
  return {
    async apply(edits, { signal, label = 'Edit files' } = {}) {
      return locked(async () => {
        validateFileEdits(edits);
        const files = [];
        const seen = new Set();
        for (const edit of edits) {
          signal?.throwIfAborted();
          const target = await workspacePath(root, edit.path);
          if (seen.has(target)) throw new Error('Use one edit per file in a batch.');
          seen.add(target);
          const before = await contentAt(target);
          if (edit.expected_hash !== undefined && edit.expected_hash !== null && fileHash(before) !== edit.expected_hash) throw new Error(`Stale file: ${edit.path}`);
          let after = edit.content;
          if (Object.hasOwn(edit, 'old_text')) {
            if (edit.old_text === '') {
              if (before !== null && before !== '') throw new Error(`Cannot create ${edit.path}: file is not empty. Read the file and provide a unique nonempty old_text, or use write_file for a full replacement.`);
              after = edit.new_text;
            } else {
              if (before === null) throw new Error(`Cannot edit ${edit.path}: file does not exist. Use old_text: "" to create it.`);
              const first = before.indexOf(edit.old_text);
              if (first < 0 || before.indexOf(edit.old_text, first + 1) >= 0) throw new Error(`Edit must match exactly once: ${edit.path}`);
              after = before.slice(0, first) + edit.new_text + before.slice(first + edit.old_text.length);
            }
          }
          if (typeof after !== 'string' || Buffer.byteLength(after) > 2000000 || after.includes('\0')) throw new Error('New content must be UTF-8 text up to 2 MB.');
          files.push({ path: path.relative(await fs.realpath(root), target), before, after, mode: before === null ? null : (await fs.stat(target)).mode & 0o777 });
        }
        const row = { id: crypto.randomUUID(), label, at: Date.now(), state: 'prepared', files };
        const rows = read();
        rows.push(row);
        save(rows); // Write-ahead record permits recovery after a process crash.
        try {
          for (const file of files) {
            signal?.throwIfAborted();
            const target = await workspacePath(root, file.path);
            if (await contentAt(target) !== file.before) throw new Error(`Concurrent modification: ${file.path}`);
            await replace(target, file.after, file.mode);
          }
          for (const file of files) {
            if (await contentAt(await workspacePath(root, file.path)) !== file.after) throw new Error(`Write verification failed: ${file.path}`);
          }
          row.state = 'applied';
          save(rows);
          return { ok: true, change_id: row.id, paths: files.map((file) => file.path), hashes: Object.fromEntries(files.map((file) => [file.path, fileHash(file.after)])) };
        } catch (error) {
          // Restore only our exact written bytes; never clobber a concurrent edit.
          let conflict = false;
          for (const file of files) {
            try {
              const target = await workspacePath(root, file.path);
              const current = await contentAt(target);
              if (current === file.after && current !== file.before) await replace(target, file.before, file.mode);
              else if (current !== file.before) conflict = true;
            } catch { conflict = true; }
          }
          row.state = conflict ? 'prepared' : 'undone';
          save(rows);
          throw new Error(`${error.message} (recovery record ${row.id}${conflict ? '; inspect before undo' : '; batch rolled back'})`);
        }
      });
    },
    list() { return read().slice(-100).reverse().map(({ files, ...row }) => ({ ...row, paths: files.map((file) => file.path) })); },
    async inspect(id, options = {}) {
      const row = read().find((item) => item.id === id);
      if (!row) throw new Error('Unknown change ID.');
      for (const file of row.files) await authorize('read_file', file.path, options);
      return { ...row, files: row.files.map((file) => ({ path: file.path, diff: unifiedDiff(file.path, file.before, file.after).slice(0, 100000), before_hash: fileHash(file.before), after_hash: fileHash(file.after), before: file.before?.slice(0, 50000) ?? null, after: file.after.slice(0, 50000), truncated: (file.before?.length || 0) > 50000 || file.after.length > 50000 })) };
    },
    async restore(id, direction, options = {}) {
      return locked(async () => {
        const rows = read();
        const row = rows.find((item) => item.id === id);
        if (!row) throw new Error('Unknown change ID.');
        if (!['undo', 'redo'].includes(direction)) throw new Error('Use undo or redo.');
        if (direction === 'redo' ? row.state !== 'undone' : !['applied', 'prepared'].includes(row.state)) throw new Error(`Cannot ${direction} a ${row.state} change.`);
        const files = [];
        for (const file of row.files) {
          await authorize('write_file', file.path, options);
          const target = await workspacePath(root, file.path);
          const expected = direction === 'undo' ? file.after : file.before;
          const desired = direction === 'undo' ? file.before : file.after;
          const current = await contentAt(target);
          if (current !== expected && !(row.state === 'prepared' && current === desired)) throw new Error(`Recovery conflict: ${file.path} has later changes. No files restored.`);
          files.push({ ...file, target, current, desired });
        }
        row.state = 'prepared';
        save(rows);
        for (const file of files) {
          options.signal?.throwIfAborted();
          await workspacePath(root, file.path);
          if (await contentAt(file.target) !== file.current) throw new Error(`Concurrent recovery conflict: ${file.path}`);
          if (file.current !== file.desired) await replace(file.target, file.desired, file.mode);
        }
        row.state = direction === 'undo' ? 'undone' : 'applied';
        save(rows);
        return { ok: true, change_id: id, state: row.state, paths: row.files.map((file) => file.path) };
      });
    },
  };
}
