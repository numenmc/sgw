import fs from "node:fs/promises";
import fsRaw from "node:fs";
import path from "node:path";
import { tokenizeInput } from "./parsing/tokenizer.js";
import { parseTokens } from "./parsing/parser.js";
import { toHtml } from "./parsing/renderer.js";
import { renderHtml, Theme } from "./templater.js";
import type { SGWConfig } from "./config.types.js";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import type { BuildResult } from "./build.types.js";
import * as git from "isomorphic-git";
import type { PageIndex } from "./search.types.js";
import { convert } from "html-to-text";

export async function build(
  gitRoot: string | null,
  input: string,
  disableLogging?: boolean
): Promise<BuildResult> {
  // steps to builkd
  // 1. create page structures (flatten directories etc.)
  // 2. render each ast to html
  // 3. Update links to correct pathes
  // 4. Insert into Nunjucks renderer

  const startTime = new Date();

  let gitCommit: string | null = null;
  if (gitRoot) {
    try {
      gitCommit = (
        await git.resolveRef({
          fs: fsRaw,
          dir: gitRoot,
          ref: "HEAD"
        })
      ).slice(0, 7);
    } catch {}
  }

  if (!disableLogging) console.log(`Git root is ${gitRoot}`);

  const window = new JSDOM("").window;
  const DOMPurify = createDOMPurify(window);

  const config: SGWConfig = JSON.parse(
    (await fs.readFile(path.join(input, "./sgw.json"), "utf-8")).toString()
  );

  let theme: Theme;

  const result: BuildResult = {};
  const searchIndex: PageIndex[] = [];

  try {
    theme = new Theme(config.build.theme, input);
    await theme.loadTheme();
    if (!disableLogging) console.log(`Loaded the theme ${config.build.theme}`);
  } catch {
    throw new Error("Theme didn't load. Is the selected theme valid and not missing?");
  }

  if (config.build.staticFiles) {
    for (const [k, v] of Object.entries(
      await recurseCollect(path.join(input, config.build.staticFiles))
    )) {
      result[path.join(".", k)] = v;
    }
  }

  for (const [n, c] of Object.entries(theme.getCopyList())) {
    result[path.join(".", n)] = c;
  }

  const pages: Record<string, string> = await createPageStructure(input);

  for (const [pageName, pagePath] of Object.entries(pages)) {
    const pageContents = (await fs.readFile(pagePath, "utf-8")).toString();
    const tokens = tokenizeInput(pageContents);
    const ast = parseTokens(tokens);

    const fields = {};
    const html = config.build.noDOMPurify
      ? await toHtml(ast, input, config, pages, fields)
      : DOMPurify.sanitize(await toHtml(ast, input, config, pages, fields));

    const isIndex = pageName == config.build.index;
    const outputPath = path.join(".", (isIndex ? "index" : safeFilename(pageName)) + ".html");

    searchIndex.push({
      title: pageName,
      path: outputPath,
      content: pageName.startsWith("Template:") ? "" : convert(html, { preserveNewlines: false })
    });

    const rendered = renderHtml(
      theme,
      html,
      pageName,
      config,
      startTime,
      fixFilepath(path.relative(input, pagePath)),
      fields,
      gitCommit || undefined,
      gitRoot
        ? (await getLastModified(gitRoot, path.relative(gitRoot, pagePath))) || undefined
        : undefined
    );

    result[outputPath] = rendered;
  }

  result["search.sgw.json"] = JSON.stringify(searchIndex, null, 4);

  return result;
}

async function createPageStructure(dir: string, topLevel = true) {
  // Stores "Page title": "/path/to/Page"
  const pages: Record<string, string> = {};

  // check all files in current dir
  for (const name1 of await fs.readdir(dir)) {
    const stats = await fs.stat(path.join(dir, name1));

    // if it's a directory still put it at root unless it has a namespace
    if (stats.isDirectory()) {
      const isNamespace = topLevel && (await fileExists(path.join(dir, name1, ".sgw-namespace")));
      const pages1 = await createPageStructure(path.join(dir, name1), false);
      for (const [k, v] of Object.entries(pages1)) {
        const zz = pages[isNamespace ? `${name1}:${k}` : k];
        if (zz) {
          throw new Error(`Duplicate page titles: "${path.join(dir, name1, k)}.sgw" and "${zz}"`);
        }

        pages[isNamespace ? `${name1}:${k}` : k] = v;
      }
    } else if (name1.endsWith(".sgw")) {
      const baseName = name1.slice(0, -4);

      const nameFile = path.join(dir, `${baseName}.sgw-name`);

      let title = baseName;

      if (await fileExists(nameFile)) {
        const content = (await fs.readFile(nameFile, "utf-8"))
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .join(" ");
        if (content.trim()) {
          title = content;
        }
      }

      const zz = pages[title];

      if (zz) {
        throw new Error(`Duplicate page titles: "${path.join(dir, name1)}" and "${zz}"`);
      }

      pages[title] = path.join(dir, name1);
    }
  }

  return pages;
}

async function recurseCollect(source: string, basePath = ""): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};

  const stats = await fs.stat(source);

  if (stats.isDirectory()) {
    const entries = await fs.readdir(source);

    for (const entry of entries) {
      const srcPath = path.join(source, entry);
      const relativePath = path.join(basePath, entry);

      const nested = await recurseCollect(srcPath, relativePath);

      Object.assign(result, nested);
    }
  } else if (stats.isFile()) {
    const content = await fs.readFile(source);
    result[basePath] = new Uint8Array(content);
  }

  return result;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function safeFilename(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function fixFilepath(filepath: string) {
  return filepath.split(path.sep).join("/");
}

async function getLastModified(dir: string, filepath: string) {
  const commits = await git.log({
    fs: fsRaw,
    dir,
    filepath: fixFilepath(filepath),
    depth: 1
  });

  if (!commits.length) return null;

  const commit = commits[0];

  if (commit) return new Date(commit.commit.committer.timestamp * 1000);
  else return undefined;
}
