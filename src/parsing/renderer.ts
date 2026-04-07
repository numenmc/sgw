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
  fields: object,
  templates: Record<string, string>,
  stripLinks: boolean,
  encase: boolean = true
): Promise<string> {
  switch (node.type) {
    case ASTNodeType.Document: {
      const children = [];

      for (const a of node.children) {
        children.push(await toHtml(a, dirInput, config, linkMap, fields, templates, stripLinks, encase));
      }

      return children.join("");
    }

    case ASTNodeType.Paragraph: {
      const children = [];

      for (const a of node.children) {
        children.push(await toHtml(a, dirInput, config, linkMap, fields, templates, stripLinks));
      }

      if (encase) return children.length > 0 ? `<div class="sgw-paragraph">${children.join("")}</div>` : "";
      else return children.join("");
    }

    case ASTNodeType.Header: {
      const children = [];

      for (const a of node.children) {
        children.push(await toHtml(a, dirInput, config, linkMap, fields, templates, stripLinks));
      }

      const text = children.join("");
      const id = createHeaderId(text);

      pushField(fields, "sgw_table_of_contents", {
        level: node.level - 2,
        text,
        id
      });

      return `<h${node.level} id="${id}">${text}</h${node.level}>`;
    }

    case ASTNodeType.Bold: {
      const children = [];

      for (const a of node.children) {
        children.push(await toHtml(a, dirInput, config, linkMap, fields, templates, stripLinks));
      }

      return `<strong>${children.join("")}</strong>`;
    }

    case ASTNodeType.Italic: {
      const children = [];

      for (const a of node.children) {
        children.push(await toHtml(a, dirInput, config, linkMap, fields, templates, stripLinks));
      }

      return `<em>${children.join("")}</em>`;
    }

    case ASTNodeType.Link: {
      const target = node.target.trim();
      const isExternal = /^https?:\/\//.test(target);

      const { page: splitTarget, fragment, literal } = isExternal ? { page: "", fragment: "" } : splitLinkTarget(target);

      const fragmentId = fragment ? (literal ? fragment : createHeaderId(fragment)) : "";
      const href = isExternal ? target : linkMap[splitTarget];
      const label = node.text.trim() == "" ? splitTarget : node.text;

      if (href && isExternal) {
        return `<a class="sgw-external-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
      }

      if (href && !isExternal) {
        const isIndex = target == config.build.index;
        return `<a href="${escapeHtml(isIndex ? "index" : `/w/${safeFilename(splitTarget)}${fragmentId ? `#${fragmentId}` : ""}`)}${stripLinks ? "" : ".html"}">${escapeHtml(label)}</a>`;
      }

      return `<span class="sgw-unknown-link">${escapeHtml(label)}</span>`;
    }

    case ASTNodeType.Text:
      return escapeHtml(node.value);

    case ASTNodeType.Template:
      return await renderTemplate(dirInput, node.name, config, linkMap, node.args, fields, stripLinks, templates);
  }
}

async function renderTemplate(
  dirInput: string,
  templateName: string,
  config: SGWConfig,
  linkMap: Record<string, string>,
  args: string[],
  fields: object,
  stripLinks: boolean,
  templates: Record<string, string>
): Promise<string> {
  const templatePath = templates[templateName];

  if (!templatePath || !(await fileExists(templatePath)))
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
        return await toHtml(
          parseTokens(tokenizeInput(x)),
          dirInput,
          config,
          linkMap,
          fields,
          templates,
          stripLinks,
          encase
        );
      },
      getField: (path: string) => getField(fields, path),
      setField: (path: string, value: any) => setField(fields, path, value),
      pushField: (path: string, value: any) => pushField(fields, path, value)
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

function unescapeLinkPart(str: string): string {
  return str
    .replace(/\\\\/g, "\\") // \\ to \
    .replace(/\\#/g, "#");   // \# to #
}

function isEscaped(str: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && str[i] == "\\"; i--) {
    count++;
  }
  return count % 2 == 1;
}

function splitLinkTarget(input: string): {
  page: string;
  fragment: string | undefined;
  literal: boolean;
} {
  let page = "";
  let fragment = "";
  let inFragment = false;
  let literal = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char == "#" && !isEscaped(input, i) && !inFragment) {
      const next = input[i + 1];

      if (next == "#" && !isEscaped(input, i + 1)) {
        literal = true;
        inFragment = true;
        i++;
      } else {
        inFragment = true;
      }

      continue;
    }

    if (inFragment) {
      fragment += char;
    } else {
      page += char;
    }
  }

  return {
    page: unescapeLinkPart(page.trim()),
    fragment: fragment ? unescapeLinkPart(fragment.trim()) : undefined,
    literal,
  };
}

function getField(fields: any, path: string): any | undefined {
  const parts = path.split(".");
  let current = fields;

  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function setField(fields: any, path: string, value: any): void {
  const parts = path.split(".");
  let current = fields;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;

    if (current[part] == null) {
      current[part] = {};
    } else if (typeof current[part] !== "object") {
      throw new Error(`setField: "${parts.slice(0, i + 1).join(".")}" is not an object`);
    }

    current = current[part];
  }

  current[parts.at(-1)!] = value;
}

function pushField(fields: any, path: string, value: any): void {
  let list = getField(fields, path);

  if (list === undefined) {
    list = [];
  } else if (!Array.isArray(list)) {
    throw new Error(`pushField: "${path}" is not an array`);
  }

  list.push(value);
  setField(fields, path, list);
}
