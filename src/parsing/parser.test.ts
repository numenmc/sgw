import { describe, it, expect } from "vitest";
import { parseTokens } from "./parser.js";
import {
  ASTNodeType,
  ASTUnexpectedEOFError,
  ASTUnexpectedTokenError,
  TokenType,
  type Token
} from "./parsing.types.js";

describe("parseTokens", () => {
  it("returns an empty document for no tokens", () => {
    expect(parseTokens([])).toEqual({
      type: ASTNodeType.Document,
      children: []
    });
  });

  it("parses a single text token as a paragraph", () => {
    const tokens: Token[] = [{ type: TokenType.Text, value: "hello" }];
    expect(parseTokens(tokens)).toEqual({
      type: ASTNodeType.Document,
      children: [
        {
          type: ASTNodeType.Paragraph,
          children: [{ type: ASTNodeType.Text, value: "hello" }]
        }
      ]
    });
  });

  it("parses multiple paragraphs separated by newlines", () => {
    const tokens: Token[] = [
      { type: TokenType.Text, value: "first" },
      { type: TokenType.Newline },
      { type: TokenType.Text, value: "second" }
    ];
    expect(parseTokens(tokens)).toEqual({
      type: ASTNodeType.Document,
      children: [
        {
          type: ASTNodeType.Paragraph,
          children: [{ type: ASTNodeType.Text, value: "first" }]
        },
        {
          type: ASTNodeType.Paragraph,
          children: [{ type: ASTNodeType.Text, value: "second" }]
        }
      ]
    });
  });
});

describe("headers", () => {
  it("parses a header token", () => {
    const tokens: Token[] = [{ type: TokenType.Header, level: 1, value: "Title" }];
    expect(parseTokens(tokens)).toEqual({
      type: ASTNodeType.Document,
      children: [
        {
          type: ASTNodeType.Header,
          level: 1,
          children: [{ type: ASTNodeType.Text, value: "Title" }]
        }
      ]
    });
  });

  it("parses headers of different levels", () => {
    const tokens: Token[] = [
      { type: TokenType.Header, level: 2, value: "Sub" },
      { type: TokenType.Header, level: 3, value: "SubSub" }
    ];
    const doc = parseTokens(tokens) as any;
    expect(doc.children[0]).toMatchObject({ type: ASTNodeType.Header, level: 2 });
    expect(doc.children[1]).toMatchObject({ type: ASTNodeType.Header, level: 3 });
  });
});

describe("bold", () => {
  it("parses bold wrapping text", () => {
    const tokens: Token[] = [
      { type: TokenType.Bold },
      { type: TokenType.Text, value: "strong" },
      { type: TokenType.Bold }
    ];
    expect(parseTokens(tokens)).toEqual({
      type: ASTNodeType.Document,
      children: [
        {
          type: ASTNodeType.Paragraph,
          children: [
            {
              type: ASTNodeType.Bold,
              children: [{ type: ASTNodeType.Text, value: "strong" }]
            }
          ]
        }
      ]
    });
  });

  it("parses bold with multiple inline children", () => {
    const tokens: Token[] = [
      { type: TokenType.Bold },
      { type: TokenType.Text, value: "a" },
      { type: TokenType.Text, value: "b" },
      { type: TokenType.Bold }
    ];
    const doc = parseTokens(tokens) as any; // Why check types when you can do "as any"
    const bold = (doc.children[0] as any).children[0];
    expect(bold.type).toBe(ASTNodeType.Bold);
    expect(bold.children).toHaveLength(2);
  });
});

describe("italic", () => {
  it("parses italic wrapping text", () => {
    const tokens: Token[] = [
      { type: TokenType.Italic },
      { type: TokenType.Text, value: "em" },
      { type: TokenType.Italic }
    ];
    const doc = parseTokens(tokens) as any;
    expect((doc.children[0] as any).children[0]).toEqual({
      type: ASTNodeType.Italic,
      children: [{ type: ASTNodeType.Text, value: "em" }]
    });
  });
});

describe("link", () => {
  it("parses a link token", () => {
    const tokens: Token[] = [
      { type: TokenType.Link, target: "https://example.com", text: "Example" }
    ];
    const doc = parseTokens(tokens) as any;
    expect((doc.children[0] as any).children[0]).toEqual({
      type: ASTNodeType.Link,
      target: "https://example.com",
      text: "Example"
    });
  });
});

describe("template", () => {
  it("parses a template token", () => {
    const tokens: Token[] = [{ type: TokenType.Template, name: "infobox", args: ["a", "b"] }];
    const doc = parseTokens(tokens) as any;
    expect((doc.children[0] as any).children[0]).toEqual({
      type: ASTNodeType.Template,
      name: "infobox",
      args: ["a", "b"]
    });
  });

  it("parses a template with no args", () => {
    const tokens: Token[] = [{ type: TokenType.Template, name: "hr", args: [] }];
    const doc = parseTokens(tokens) as any;
    expect((doc.children[0] as any).children[0]).toMatchObject({
      type: ASTNodeType.Template,
      name: "hr",
      args: []
    });
  });
});

describe("errors", () => {
  it("throws ASTUnexpectedTokenError for invalid inline token", () => {
    const tokens: Token[] = [
      { type: TokenType.Bold },
      { type: TokenType.Header, level: 1, value: "L bozo" },
      { type: TokenType.Bold }
    ];
    expect(() => parseTokens(tokens)).toThrow(ASTUnexpectedTokenError);
  });
});
