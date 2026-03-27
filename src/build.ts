import fs from "node:fs/promises";
import path from "node:path";
import { tokenizeInput } from "./parsing/tokenizer.js";
import { parseTokens } from "./parsing/parser.js";
import { toHtml } from "./parsing/renderer.js";
import { renderHtml, Theme } from "./templater.js";
import type { SGWConfig } from "./config.types.js";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import type { BuildResult } from "./build.types.js";

// export async function build(input: string, output: string) {
//   // steps to builkd
//   // 1. create page structures (flatten directories etc.)
//   // 2. render each ast to html
//   // 3. Update links to correct pathes
//   // 4. Insert into Nunjucks renderer

//   const startTime = new Date();

//   const window = new JSDOM("").window;
//   const DOMPurify = createDOMPurify(window);

//   const config: SGWConfig = JSON.parse((await fs.readFile(path.join(input, "./sgw.json"), "utf-8")).toString());

//   let theme: Theme;

//   const result: BuildResult = {};

//   try {
//     theme = new Theme(config.build.theme);
//     await theme.loadTheme();
//     console.log(`Loaded the theme ${config.build.theme}`);
//   } catch { throw new Error("Theme didn't load. Is the selected theme valid and not missing?"); }

//   if (await fileExists(output)) {
//     await fs.rm(output, { recursive: true, force: true });
//   }

//   await fs.mkdir(output);

//   if (config.build.staticFiles) {
//     console.log("Copying static files...");
//     await recurseCopy(path.join(input, config.build.staticFiles), output);
//   }

//   for (const [n, c] of Object.entries(theme.getCopyList())) {
//     await fs.writeFile(path.join(output, n), c);
//   }

//   const pages: Record<string, string> = await createPageStructure(input);

//   for (const [pageName, pagePath] of Object.entries(pages)) {
//     const pageContents = (await fs.readFile(pagePath, "utf-8")).toString();
//     const tokens = tokenizeInput(pageContents);
//     const ast = parseTokens(tokens);
//     const html = DOMPurify.sanitize(await toHtml(ast, input, config, pages));

//     const rendered = renderHtml(theme, html, pageName, config, startTime);
//     const isIndex = pageName == config.build.index;
//     await fs.writeFile(path.join(output, (isIndex ? "index" : safeFilename(pageName)) + ".html"), rendered);
//   }
// }

export async function build(input: string, disableLogging?: boolean): Promise<BuildResult> {
  // steps to builkd
  // 1. create page structures (flatten directories etc.)
  // 2. render each ast to html
  // 3. Update links to correct pathes
  // 4. Insert into Nunjucks renderer

  const startTime = new Date();

  const window = new JSDOM("").window;
  const DOMPurify = createDOMPurify(window);

  const config: SGWConfig = JSON.parse((await fs.readFile(path.join(input, "./sgw.json"), "utf-8")).toString());

  let theme: Theme;

  const result: BuildResult = {};

  try {
    theme = new Theme(config.build.theme);
    await theme.loadTheme();
    if (!disableLogging) console.log(`Loaded the theme ${config.build.theme}`);
  } catch { throw new Error("Theme didn't load. Is the selected theme valid and not missing?"); }

  if (config.build.staticFiles) {
    for (const [k, v] of Object.entries(await recurseCollect(path.join(input, config.build.staticFiles)))) {
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
    const html = DOMPurify.sanitize(await toHtml(ast, input, config, pages));

    const rendered = renderHtml(theme, html, pageName, config, startTime);
    const isIndex = pageName == config.build.index;
    result[path.join(".", (isIndex ? "index" : safeFilename(pageName)) + ".html")] = rendered;
  }

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
      const zz = pages[name1.slice(0, -4)];
      if (zz) {
        throw new Error(`Duplicate page titles: "${path.join(dir, name1)}" and "${zz}"`);
      }

      pages[name1.slice(0, -4)] = path.join(dir, name1);
    }
  }

  return pages;
}

async function recurseCollect(
  source: string,
  basePath = ""
): Promise<Record<string, Uint8Array>> {
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
