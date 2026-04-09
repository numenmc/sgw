import fs from "node:fs/promises";
import fsRaw from "node:fs";
import path from "node:path";
import { tokenizeInput } from "./parsing/tokenizer.js";
import { parseTokens } from "./parsing/parser.js";
import { escapeHtml, toHtml } from "./parsing/renderer.js";
import { renderHtml, Theme } from "./templater.js";
import type { SGWConfig } from "./config.types.js";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import type { BuildResult, PageContext, SGWPlugin, WrappedValue } from "./build.types.js";
import * as git from "isomorphic-git";
import type { PageIndex } from "./search.types.js";
import { convert } from "html-to-text";
import { pathToFileURL } from "node:url";

export async function build(
  gitRoot: string | null,
  input: string,
  disableLogging?: boolean
): Promise<BuildResult> {
  // steps to build
  // 1. create page structures (flatten directories etc.)
  // 2. render each ast to html
  // 3. Update links to correct paths
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
    } catch { }
  }

  if (!disableLogging) console.log(`Git root is ${gitRoot ?? "not set"}`);

  const window = new JSDOM("").window;
  const DOMPurify = createDOMPurify(window);

  const config: SGWConfig = JSON.parse(
    (await fs.readFile(path.join(input, "./sgw.json"), "utf-8")).toString()
  );

  const plugins: SGWPlugin[] = await Promise.all((config.plugins || []).map(async (plugin) => {
    const url = pathToFileURL(path.join(input, plugin)).href;
    const mod = await import(`${url}?v=${Date.now()}`);
    return mod.default;
  }));

  await runHook(plugins, "onConfigLoad", config);

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
      result[path.join(".", k).split(path.sep).join("/")] = v;
    }
  }

  for (const [n, c] of Object.entries(theme.getCopyList())) {
    result[path.join(".", n).split(path.sep).join("/")] = c;
  }

  const pages: Record<string, string> = await createPageStructure(input);
  const templates: Record<string, string> = await scanTemplates(input);
  await runHook(plugins, "onPageStructure", pages);

  for (const [pageName, pagePath] of Object.entries(pages)) {
    const isIndex = pageName == config.build.index;
    const outputPath = path.join(
      ".",
      (isIndex ? "index" : `${pageName == "404" ? "" : "w/"}${safeFilename(pageName)}`) + ".html"
    ).split(path.sep).join("/");

    const context: PageContext = {
      pageName,
      pagePath,
      outputPath,
      config,
      fields: {}
    };

    const pageContents: WrappedValue<string> = {
      value: (await fs.readFile(pagePath, "utf-8")).toString()
    };
    await runHook(plugins, "onRead", pageContents, context);

    const tokens = tokenizeInput(pageContents.value);
    await runHook(plugins, "onTokens", tokens, context);

    const ast = parseTokens(tokens);
    await runHook(plugins, "onAST", ast, context);

    const html: WrappedValue<string> = {
      value: config.build.noDOMPurify
        ? await toHtml(
          ast,
          input,
          config,
          pages,
          context.fields,
          templates,
          config.build.stripLinkExtension == true
        )
        : DOMPurify.sanitize(
          await toHtml(
            ast,
            input,
            config,
            pages,
            context.fields,
            templates,
            config.build.stripLinkExtension == true
          )
        )
    };

    await runHook(plugins, "onHTML", html, context);

    searchIndex.push({
      title: pageName,
      path: outputPath,
      content: convert(html.value, { preserveNewlines: false })
    });

    const rendered: WrappedValue<string> = {
      value: renderHtml(
        theme,
        html.value,
        pageName,
        config,
        startTime,
        fixFilepath(path.relative(input, pagePath)),
        context.fields,
        gitCommit || undefined,
        gitRoot
          ? (await getLastModified(gitRoot, path.relative(gitRoot, pagePath))) || undefined
          : undefined
      )
    };

    await runHook(plugins, "onRendered", rendered, context);

    result[outputPath] = rendered.value;
  }

  await runHook(plugins, "onSearchIndex", searchIndex);
  result["search.sgw.json"] = JSON.stringify(searchIndex, null, 4);

  await runHook(plugins, "onBuildEnd", result);
  return result;
}

async function createPageStructure(
  dir: string,
  currentNamespace = ""
): Promise<Record<string, string>> {
  const pages: Record<string, string> = {};

  const entries = await fs.readdir(dir);

  const hasNamespace = await fileExists(path.join(dir, ".sgw-namespace"));
  const localNamespace = hasNamespace
    ? path.basename(dir)
    : currentNamespace;

  const namespacePrefix =
    currentNamespace && localNamespace && hasNamespace
      ? `${currentNamespace}:${localNamespace}`
      : localNamespace || currentNamespace;

  for (const name1 of entries) {
    const fullPath = path.join(dir, name1);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const pages1 = await createPageStructure(fullPath, namespacePrefix);

      for (const [k, v] of Object.entries(pages1)) {
        const finalKey = namespacePrefix && !k.includes(":")
          ? `${namespacePrefix}:${k}`
          : k;

        const existing = pages[finalKey];
        if (existing) {
          throw new Error(
            `Duplicate page titles: "${v}" and "${existing}"`
          );
        }

        pages[finalKey] = v;
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

      const finalKey = namespacePrefix ? `${namespacePrefix}:${title}` : title;

      const existing = pages[finalKey];
      if (existing) {
        throw new Error(
          `Duplicate page titles: "${fullPath}" and "${existing}"`
        );
      }

      pages[finalKey] = fullPath;
    }
  }

  return pages;
}

async function scanTemplates(dir: string): Promise<Record<string, string>> {
  const templates: Record<string, string> = {};

  async function walk(currentDir: string) {
    for (const name of await fs.readdir(currentDir)) {
      const fullPath = path.join(currentDir, name);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        await walk(fullPath);
      } else if (name.endsWith(".sgw.js")) {
        const baseName = name.slice(0, -7);

        if (templates[baseName]) {
          throw new Error(`Duplicate template name: "${baseName}"`);
        }

        templates[baseName] = fullPath;
      }
    }
  }

  const rootTemplateDir = dir;
  if (await fileExists(rootTemplateDir)) {
    await walk(rootTemplateDir);
  }

  return templates;
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
  return fileName
    .replace(/[^a-zA-Z0-9._\-:/\+\$@%~]/g, "_")
    .replace(/:/g, "/");
}

function fixFilepath(filepath: string) {
  return filepath.split(path.sep).join("/");
}

async function getLastModified(dir: string, filepath: string) {
  try {
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
  } catch { }
}

async function runHook<T>(
  plugins: SGWPlugin[],
  hook: keyof SGWPlugin,
  value: T,
  ...args: any[]
): Promise<void> {
  let current = value;

  for (const plugin of plugins) {
    const fn = plugin[hook];

    if (typeof fn == "function") {
      await (fn as any)(current, ...args);
    }
  }
}
