import nunjucks from "nunjucks";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SGWConfig } from "./config.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class Theme {
  private path: string;
  private copyFiles: Record<string, Buffer> = {};
  private template: string = "";

  public constructor(name: string, inputPath: string | null) {
    if (["water", "default"].includes(name) || inputPath == null)
      this.path = path.join(__dirname, "themes", name);
    else this.path = path.join(inputPath, name);
  }

  public async loadTheme() {
    for (const fileName of await fs.readdir(this.path)) {
      const stats = await fs.stat(path.join(this.path, fileName));
      if (stats.isDirectory()) continue;
      if (fileName == "index.html") continue;

      this.copyFiles[fileName] = await fs.readFile(path.join(this.path, fileName));
    }

    this.template = (await fs.readFile(path.join(this.path, "index.html"), "utf-8")).toString();
  }

  public getThemeTemplate() {
    return this.template;
  }

  public getCopyList() {
    return this.copyFiles;
  }
}

export function renderHtml(
  theme: Theme,
  parsedAST: string,
  title: string,
  config: SGWConfig,
  buildDate: Date,
  originalFilePath: string,
  fields: object,
  gitCommit?: string,
  lastModified?: Date,
) {
  return nunjucks.renderString(theme.getThemeTemplate(), {
    article: {
      html: parsedAST,
      title,
      fields
    },
    meta: {
      byline: config.meta.byline,
      wikiName: config.meta.name,
      buildTime: buildDate,
      lastModified: lastModified ? lastModified.toISOString() : undefined,
      gitCommit: gitCommit || undefined,
      filePath: originalFilePath
    }
  });
}
