import {
  ASTNodeType,
  ASTUnexpectedEOFError,
  ASTUnexpectedTokenError,
  TokenType,
  type ASTNode,
  type Token
} from "./parsing.types.js";

export function parseTokens(tokens: Token[]): ASTNode {
  let i = 0;
  const children: ASTNode[] = [];

  while (i < tokens.length) {
    const result = parseBlock(tokens, i);
    children.push(result.node);
    i = result.pos;
  }

  return {
    type: ASTNodeType.Document,
    children
  };
}

function parseBlock(tokens: Token[], i: number) {
  const token = tokens[i];
  if (!token) throw new ASTUnexpectedEOFError();

  if (token.type == TokenType.Header) {
    return {
      node: {
        type: ASTNodeType.Header,
        level: token.level,
        children: [{ type: ASTNodeType.Text, value: token.value }]
      } as ASTNode,
      pos: i + 1
    };
  }

  return parseParagraph(tokens, i);
}

function parseParagraph(tokens: Token[], i: number) {
  const children: ASTNode[] = [];

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) throw new ASTUnexpectedEOFError();

    if (token.type == TokenType.Newline) {
      if (tokens[i + 1]?.type === TokenType.Newline) {
        i += 2;
        break;
      } else {
        i++;
        children.push({ type: ASTNodeType.Text, value: " " });
        continue;
      }
    }

    const result = parseInline(tokens, i);
    children.push(result.node);
    i = result.pos;
  }

  return {
    node: {
      type: ASTNodeType.Paragraph,
      children
    } as ASTNode,
    pos: i
  };
}

function parseInline(tokens: Token[], i: number) {
  const token = tokens[i];
  if (!token) throw new ASTUnexpectedEOFError();

  switch (token.type) {
    case TokenType.Text:
      return {
        node: {
          type: ASTNodeType.Text,
          value: token.value
        } as ASTNode,
        pos: i + 1
      };

    case TokenType.Bold:
      return parseBold(tokens, i + 1);

    case TokenType.Italic:
      return parseItalic(tokens, i + 1);

    case TokenType.Link:
      return {
        node: {
          type: ASTNodeType.Link,
          target: token.target,
          text: token.text
        } as ASTNode,
        pos: i + 1
      };

    case TokenType.Template:
      return {
        node: {
          type: ASTNodeType.Template,
          name: token.name,
          args: token.args
        } as ASTNode,
        pos: i + 1
      };

    default:
      throw new ASTUnexpectedTokenError();
  }
}

function parseBold(tokens: Token[], i: number) {
  const children: ASTNode[] = [];

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) throw new ASTUnexpectedEOFError();

    if (token.type == TokenType.Bold) {
      i++;
      break;
    }

    const result = parseInline(tokens, i);
    children.push(result.node);
    i = result.pos;
  }

  return {
    node: {
      type: ASTNodeType.Bold,
      children
    } as ASTNode,
    pos: i
  };
}

function parseItalic(tokens: Token[], i: number) {
  const children: ASTNode[] = [];

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) throw new ASTUnexpectedEOFError();

    if (token.type == TokenType.Italic) {
      i++;
      break;
    }

    const result = parseInline(tokens, i);
    children.push(result.node);
    i = result.pos;
  }

  return {
    node: {
      type: ASTNodeType.Italic,
      children
    } as ASTNode,
    pos: i
  };
}
