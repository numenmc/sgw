import { describe, it, expect } from "vitest";
import { tokenizeInput } from "./tokenizer.js";
import { TokenType } from "./parsing.types.js";

describe("tokenize", () => {
  it("parses headers correctly", () => {
    const input = "== Header 2 ==\n===       Header 3 ===";
    const tokens = tokenizeInput(input);

    expect(tokens).toEqual([
      { type: TokenType.Header, level: 2, value: "Header 2" },
      { type: TokenType.Newline },
      { type: TokenType.Header, level: 3, value: "Header 3" }
    ]);
  });

  it("bolds text correctly", () => {
    const input = "This is text **that is bold**.";
    const tokens = tokenizeInput(input);

    expect(tokens).toEqual([
      { type: TokenType.Text, value: "This is text " },
      { type: TokenType.Bold },
      { type: TokenType.Text, value: "that is bold" },
      { type: TokenType.Bold },
      { type: TokenType.Text, value: "." }
    ]);
  });

  it("italicizes text correctly", () => {
    const input = "This is text _that is italics_.";
    const tokens = tokenizeInput(input);

    expect(tokens).toEqual([
      { type: TokenType.Text, value: "This is text " },
      { type: TokenType.Italic },
      { type: TokenType.Text, value: "that is italics" },
      { type: TokenType.Italic },
      { type: TokenType.Text, value: "." }
    ]);
  });

  it("handles raw text correctly", () => {
    const input = "This is raw text{{and a breaking character to confuse it.";
    const tokens = tokenizeInput(input);

    expect(tokens).toEqual([
      { type: TokenType.Text, value: "This is raw text" },
      { type: TokenType.Text, value: "{" },
      { type: TokenType.Text, value: "{and a breaking character to confuse it." }
    ]);
  });
});
