import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { execFileAsync, objectSchema } from './tools/shared.js';
import { workspacePath } from './change-history.js';

const extensions = new Set(['.js', '.mjs', '.cjs']);
const ignored = new Set(['node_modules', '.git', 'db', '.ai-harness', 'coverage']);

// A bounded lexical index, not a semantic parser: strings, comments and template
// bodies are excluded. Scope resolution and template interpolations are not indexed.
export function javascriptTokens(source) {
  const tokens = [];
  const pattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(pattern)) {
    const text = match[0];
    if (text.startsWith('//') || text.startsWith('/*') || text.startsWith('`')) continue;
    tokens.push({ text, offset: match.index, string: text[0] === '"' || text[0] === "'" });
  }
  return tokens;
}
const location = (source, offset) => {
  const prefix = source.slice(0, offset);
  return { line: prefix.split('\n').length, column: offset - prefix.lastIndexOf('\n') };
};

export async function javascriptFiles(root, requested, authorize, options = {}) {
  const start = await workspacePath(root, requested);
  const files = [];
  let visited = 0;
  async function visit(target) {
    options.signal?.throwIfAborted();
    if (++visited > 3000 || files.length >= 500) return;
    const relative = path.relative(await fs.realpath(root), target) || '.';
    await workspacePath(root, relative);
    const stat = await fs.lstat(target);
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(target, { withFileTypes: true })) {
        if (!entry.isSymbolicLink() && !ignored.has(entry.name)) await visit(path.join(target, entry.name));
      }
    } else if (extensions.has(path.extname(target)) && stat.size <= 1000000) {
    try { await authorize('read_file', relative, options); } catch (error) {
      if (options.signal?.aborted) throw error;
      if (error.message.startsWith('Permission denied:')) return;
      throw error;
    }
      files.push(target);
    }
  }
  await visit(start);
  return { files, truncated: files.length >= 500 || visited > 3000 };
}

export async function checkJavaScript(root, requested, { signal } = {}) {
  const target = await workspacePath(root, requested);
  if (!extensions.has(path.extname(target))) return { ok: true, skipped: true, diagnostics: [] };
  const source = await fs.readFile(target, 'utf8');
  if (Buffer.byteLength(source) > 1000000) throw new Error('JavaScript checks support files up to 1 MB.');
  const diagnostics = [];
  // Never inherit Node preload hooks; --check parses without executing the file.
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  try { await execFileAsync(process.execPath, ['--check', target], { signal, env, timeout: 10000, maxBuffer: 100000 }); }
  catch (error) {
    signal?.throwIfAborted();
    const output = String(error.stderr || error.message);
    diagnostics.push({ severity: 'error', source: 'node --check', message: output.slice(0, 8000) });
  }
  const tokens = javascriptTokens(source);
  const require = createRequire(target);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.string) continue;
    const previous = tokens[i - 1]?.text;
    const head = tokens[i - 2]?.text;
    if (!(previous === 'from' || previous === 'import' || (previous === '(' && ['require', 'import'].includes(head)))) continue;
    const specifier = token.text.slice(1, -1);
    if (specifier.includes('\\') || /^(https?:|data:)/.test(specifier)) continue;
    let message;
    if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
      if (!builtinModules.includes(specifier.replace(/^node:/, ''))) message = `Unknown Node builtin: ${specifier}`;
    } else if (specifier.startsWith('.')) {
      // ESM imports require an exact file; CommonJS uses Node's resolver.
      if (head === 'require') { try { require.resolve(specifier); } catch { message = `Cannot resolve require: ${specifier}`; } }
      else {
        try { if (!(await fs.stat(path.resolve(path.dirname(target), specifier.split(/[?#]/)[0]))).isFile()) message = `Import is not a file: ${specifier}`; }
        catch { message = `Cannot resolve relative import: ${specifier}`; }
      }
    } else {
      try { require.resolve(specifier); } catch { message = `Package resolution hint: ${specifier} was not found under CommonJS resolution (ESM export conditions may differ).`; }
    }
    if (message) diagnostics.push({ severity: 'warning', source: 'import scan', ...location(source, token.offset), message });
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), path: requested, diagnostics };
}

export function createJavaScriptTool({ workspace, authorize = async () => true }) {
  return {
    name: 'javascript',
    description: 'Node.js/vanilla JavaScript tooling for .js/.mjs/.cjs: diagnostics (syntax and import hints), symbols (lexical declarations), references (lexical identifier matches). No execution, types, or scope-aware resolution.',
    parameters: objectSchema({ path: { type: 'string' }, action: { type: 'string', enum: ['diagnostics', 'symbols', 'references'] }, query: { type: ['string', 'null'], description: 'Identifier for references; optional symbol-name filter.' } }),
    async execute({ path: requested, action, query }, options = {}) {
      if (!['diagnostics', 'symbols', 'references'].includes(action)) throw new Error('Unknown JavaScript action.');
      if (action === 'references' && !/^[A-Za-z_$][\w$]*$/.test(query || '')) throw new Error('References require an identifier.');
      const scan = await javascriptFiles(workspace, requested, authorize, options);
      const results = [];
      for (const target of scan.files) {
        if (results.length >= 1000) break;
        const relative = path.relative(await fs.realpath(workspace), target);
        await authorize('read_file', relative, options);
        if (action === 'diagnostics') { results.push(await checkJavaScript(workspace, relative, options)); continue; }
        const source = await fs.readFile(target, 'utf8');
        const tokens = javascriptTokens(source);
        for (let i = 0; i < tokens.length && results.length < 1000; i++) {
          const token = tokens[i];
          if (token.string || !/^[A-Za-z_$][\w$]*$/.test(token.text)) continue;
          const kind = tokens[i - 1]?.text;
          if (action === 'symbols' && !['function', 'class', 'const', 'let', 'var'].includes(kind)) continue;
          if (query && (action === 'references' ? token.text !== query : !token.text.includes(query))) continue;
          results.push({ path: relative, name: token.text, kind: action === 'symbols' ? kind : 'lexical-reference', ...location(source, token.offset) });
        }
      }
      return { ok: action !== 'diagnostics' || results.every((result) => result.ok), results, truncated: scan.truncated || results.length >= 1000, scope: 'Lexical JavaScript/Node.js only; not a language server.' };
    },
  };
}
