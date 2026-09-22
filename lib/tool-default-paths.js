import fs from "node:fs/promises";
import path from "node:path";

export async function inferredWriteFilePath(args, root) {
  if (args?.path !== undefined && args?.path !== null && args.path !== "") return null;
  if (typeof args?.content !== "string") return null;
  const content = args.content;
  if (/^\uFEFF?\s*(?:<!doctype\s+html\b|<html\b)/i.test(content)) return "index.html";

  const namedCss = /^\uFEFF?\s*\/\*[\s\S]{0,500}?\b([A-Za-z][\w-]*\.css)\b/i.exec(content)?.[1] || null;
  const looksLikeCss = namedCss || /^\uFEFF?\s*(?:\/\*[\s\S]*?\*\/\s*)?(?:@(?:charset|import|media|layer)\b|:root\b|[.#*a-z][^{}]{0,120}\{)/i.test(content);
  if (!looksLikeCss) return null;

  const candidates = [];
  for (const indexPath of ["index.html", "public/index.html"]) {
    let html;
    try { html = await fs.readFile(path.join(root, indexPath), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const match of html.matchAll(/href\s*=\s*["']([^"']+\.css(?:\?[^"']*)?)["']/gi)) {
      const basename = path.posix.basename(match[1].split("?")[0]);
      if (namedCss && basename !== namedCss) continue;
      candidates.push(path.posix.join(path.posix.dirname(indexPath), basename));
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) return null;
  return namedCss;
}
