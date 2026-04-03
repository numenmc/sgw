import { TokenType, type Token } from "./parsing.types.js";

export function tokenizeInput(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  input = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < input.length) {
    // Handle escaping
    {
      if (input[i] == "\\") {
        const next = input[i + 1];
        const nextnext = input[i + 2];

        if (next == "\\") {
          tokens.push({ type: TokenType.Text, value: "\\" });
          i += 2;
          continue;
        }

        // Multi character
        if (next == "*" && nextnext == "*") {
          tokens.push({ type: TokenType.Text, value: "**" });
          i += 3;
          continue;
        }

        if (next == "[" && nextnext == "[") {
          tokens.push({ type: TokenType.Text, value: "[[" });
          i += 3;
          continue;
        }

        if (next == "{" && nextnext == "{") {
          tokens.push({ type: TokenType.Text, value: "{{" });
          i += 3;
          continue;
        }

        // Single character
        if (next == "*" || next == "_" || next == "=") {
          tokens.push({ type: TokenType.Text, value: next });
          i += 2;
          continue;
        }
      }
    }

    // 1. Headers
    {
      const match = input.slice(i).match(/^(={2,6})\s*(.+?)\s*\1/);
      if (match) {
        tokens.push({
          type: TokenType.Header,
          level: match[1]!.length,
          value: match[2]!
        });

        i += match[0].length;
        continue;
      }
    }

    // 2. Bold text
    if (input.slice(i).startsWith("**")) {
      tokens.push({ type: TokenType.Bold });
      i += 2;
      continue;
    }

    // 3. Italics
    if (input[i] === "_" || input[i] === "*") {
      tokens.push({ type: TokenType.Italic });
      i++;
      continue;
    }

    // 4. Links
    {
      const match = input.slice(i).match(/^\[\[(.+?)(\|(.+?))?\]\]/);
      if (match) {
        tokens.push({
          type: TokenType.Link,
          target: match[1]!,
          text: match[3] ?? match[1]!
        });

        i += match[0].length;
        continue;
      }
    }

    // 5. Newline
    if (input[i] == "\n") {
      tokens.push({ type: TokenType.Newline });
      i++;
      continue;
    }

    // 6. Template
    {
      if (input.slice(i, i + 2) == "{{") {
        let start = i + 2;
        let j = start;
        let depth = 1;
        let inQuotes = false;

        while (j < input.length && depth > 0) {
          const two = input.slice(j, j + 2);
          const char = input[j];

          // Toggle quotes
          if (char == `"`) {
            inQuotes = !inQuotes;
            j++;
            continue;
          }

          if (!inQuotes) {
            if (two == "{{") {
              depth++;
              j += 2;
              continue;
            }
            if (two == "}}") {
              depth--;
              j += 2;
              continue;
            }
          }

          j++;
        }

        if (depth == 0) {
          const content = input.slice(start, j - 2);

          const parts = (() => {
            const parts = [];
            let c = "";
            let inQuotes = false;

            for (let k = 0; k < content.length; k++) {
              const char = content[k];

              if (char == `"` && !inQuotes) {
                inQuotes = true;
              } else if (char == `"` && inQuotes) {
                inQuotes = false;
              } else if (char == `|` && !inQuotes) {
                parts.push(c.trim());
                c = "";
              } else {
                c += char;
              }
            }

            if (c || parts.length > 0) {
              parts.push(c.trim());
            }

            return parts;
          })();

          tokens.push({
            type: TokenType.Template,
            name: parts[0] ?? "void",
            args: parts.slice(1)
          });

          i = j;
          continue;
        }
      }
    }

    // 7. Raw text
    {
      let j = i;
      while (j < input.length && !/^(\*\*|_|\[\[|\{\{|\n|={2,6}|\\)/.test(input.slice(j))) {
        j++;
      }
      if (j == i) {
        tokens.push({ type: TokenType.Text, value: input[i]! });
        i++;
      } else {
        tokens.push({ type: TokenType.Text, value: input.slice(i, j) });
        i = j;
      }
    }
  }

  return tokens;
}
