export enum TokenType {
  Text,
  Bold, // Delimiter
  Italic, // Delimiter
  Header,
  Link,
  Template,
  Newline
}

export type Token =
  | { type: TokenType.Text; value: string }
  | { type: TokenType.Bold; }
  | { type: TokenType.Italic; }
  | { type: TokenType.Header; level: number; value: string }
  | { type: TokenType.Link; target: string; text: string }
  | { type: TokenType.Template; name: string; args: string[] }
  | { type: TokenType.Newline };

export enum ASTNodeType {
  Document,
  Paragraph,
  Header,
  Bold,
  Italic,
  Link,
  Template,
  Text
}

export type ASTNode =
  | { type: ASTNodeType.Document; children: ASTNode[] }
  | { type: ASTNodeType.Paragraph; children: ASTNode[] }
  | { type: ASTNodeType.Header; level: number; children: ASTNode[] }
  | { type: ASTNodeType.Bold; children: ASTNode[] }
  | { type: ASTNodeType.Italic; children: ASTNode[] }
  | { type: ASTNodeType.Link; target: string; text: string }
  | { type: ASTNodeType.Template; name: string; args: string[] }
  | { type: ASTNodeType.Text; value: string };

export class ASTUnexpectedEOFError extends Error {
  constructor() {
    super("Unexpected EOF");
  }
}

export class ASTUnexpectedTokenError extends Error {
  constructor() {
    super("Unexpected Token");
  }
}