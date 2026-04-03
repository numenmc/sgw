import fs from "node:fs/promises";
import path from "node:path";

import { ASTNodeType, type ASTNode } from "./parsing.types.js";
import { safeFilename } from "../build.js";
import type { SGWConfig } from "../config.types.js";
import { pathToFileURL } from "node:url";
import { parseTokens } from "./parser.js";
import { tokenizeInput } from "./tokenizer.js";

export async function toHtml(
  node: ASTNode,
  dirInput: string,
  config: SGWConfig,
  linkMap: Record<string, string>,
  encase: boolean = true
): Promise<string> {
  switch (node.type) {
    case ASTNodeType.Document: {
      const children = await Promise.all(node.children.map((a) => toHtml(a, dirInput, config, linkMap, encase)));
      return children.join("");
    }

    case ASTNodeType.Paragraph: {
      const children = await Promise.all(node.children.map((a) => toHtml(a, dirInput, config, linkMap)));
      if (encase) return children.length > 0 ? `<p>${children.join("")}</p>` : "";
      else return children.join("");
    }

    case ASTNodeType.Header: {
      const children = await Promise.all(node.children.map((a) => toHtml(a, dirInput, config, linkMap)));
      return `<h${node.level} id="${createHeaderId(children.join(""))}">${children.join("")}</h${node.level}>`;
    }

    case ASTNodeType.Bold: {
      const children = await Promise.all(node.children.map((a) => toHtml(a, dirInput, config, linkMap)));
      return `<strong>${children.join("")}</strong>`;
    }

    case ASTNodeType.Italic: {
      const children = await Promise.all(node.children.map((a) => toHtml(a, dirInput, config, linkMap)));
      return `<em>${children.join("")}</em>`;
    }

    case ASTNodeType.Link: {
      const target = node.target.trim();
      const isExternal = /^https?:\/\//.test(target);

      const href = isExternal ? target : linkMap[target];

      const label = node.text.trim() == "" ? target : node.text;

      if (href && isExternal) {
        return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
      }

      if (href && !isExternal) {
        const isIndex = target == config.build.index;
        return `<a href="${escapeHtml(isIndex ? "index" : safeFilename(target))}.html">${escapeHtml(label)}</a>`;
      }

      return `<span class="sgw-unknown-link">${escapeHtml(label)}</span>`;
    }

    case ASTNodeType.Text:
      return escapeHtml(node.value);

    case ASTNodeType.Template:
      return await renderTemplate(dirInput, node.name, config, linkMap, node.args);
  }
}

async function renderTemplate(
  dirInput: string,
  templateName: string,
  config: SGWConfig,
  linkMap: Record<string, string>,
  args: string[]
): Promise<string> {
  const templatePath = path.join(dirInput, "Template", `${templateName}.sgw.js`);
  if (!(await fileExists(templatePath)))
    return `<span class="sgw-unknown-template">Unknown template "${escapeHtml(templateName)}"</span>`;

  const params = Object.fromEntries(
    args.map((arg) => {
      const index = arg.indexOf("=");

      if (index === -1) {
        return [arg, ""];
      }

      const key = arg.slice(0, index);
      const value = arg.slice(index + 1);

      return [key, value];
    })
  );

  try {
    const url = pathToFileURL(templatePath).href;
    const mod = await import(`${url}?v=${Date.now()}`);

    return await mod.default(params, {
      safe: escapeHtml,
      render: async (x: string, encase: boolean = false) => {
        return await toHtml(parseTokens(tokenizeInput(x)), dirInput, config, linkMap, encase);
      }
    });
  } catch (err) {
    return `<span class="sgw-unknown-template">${escapeHtml(String(err))}</span>`;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createHeaderId(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
