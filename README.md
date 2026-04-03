# ssg-wiki

Static site generated wiki software which uses a markup language similar to WikiText and Markdown.

> [!WARNING]
> Project is in very very very early development so nothing is stable.

# Guide

To create an SGW project, run these commands:

```bash
npm install @numenmc/sgw
npx sgw init docs # "docs" can be any directory name

# Clone a theme (optional, you can use defualts)
cd docs
npx sgw clone theme default # there are currently two built-in themes: "default" and "water"
cd ..

# Start dev server
npx sgw dev -i ./docs --port 7616

# Build out
# The -g argument tells sgw where the git repository root is. It is used for getting commits and modified dates.
# You can use it in sgw dev but it is not reccomended, it may be slow
# You can omit -g
npx sgw build -i ./docs -g . -o ./dist
```

# SGW Markdown

```
**Bold text**
_Italic text_
**_Italic and bold text_**

    == Header 2 ==
   === Header 3 ===
  ==== Headar 4 ====
 ===== Header 5 =====
====== Header 6 ======

Header 1 does not exist because that is the page title.

[[Page Name]] a link to Page Name
[[Page Name|Custom Name]] a link to Page Name with a custom name
[[https://example.com]] an external link
[[https://example.com|Example]] an external link with a custom name

{{Template name|arg1=abc|arg2=abc|arg3=abc}}

{{Template name
| arg1=abc
| arg2=abc
| arg3=abc
}}

If a template argument needs to use special characters, enclose the whole thing in quotes.
{{Template name|"arg1=H|i"}}
```

# SGW Filesystem

- A file named `Main Page.sgw` will render to "Main Page"
- A nested file named `Nested/About.sgw` will render to "About"

- If the `Nested/` directory has a `Nested/.sgw-namespace` it will instead render to "Nested:About"

- If there is a `Main Page.sgw-name` in the same directory as `Main Page.sgw` it will render to whatever is inside `Main Page.sgw-name`

# SGW Templating

- Templates belong in the `Template` directory. It should be marked as a namespace.
- The code for a template goes into `Template/Template name.sgw.js` and exports a default function:

```js
/**
 * @param {Record<string, string>} params Parameters passed into the template
 * @param {Object} context Utility functions
 * @param {(text: string) => string} context.safe Escapes HTML tags
 * @param {(x: string, encase?: boolean) => Promise<string>} context.render Renders SGW Markdown to HTML. When "encase" is true it will be rendered into a <p>
 * @returns {Promise<string>|string} The rendered HTML
 */
export default async function TemplateName(params, { safe, render }) {
  return await render(params.text);
}
```

- The template can be asynchronous or synchronous
- Template documentation can be placed in `Template/Template name.sgw`

# SGW Theming

- You can set the `theme` property in your sgw.json config to a path (`./myTheme`) or the name of a built-in theme (`default`)
- A theme consists of an `index.html` which renders every page. Other files are copied over

## SGW Theming - Templating Variables

```
{{ article.html }} - Parsed article HTML
{{ article.title }} - Article title
{{ meta.byline }} - Byline set in config
{{ meta.wikiName }} - Wiki name set in config
{{ meta.buildTime }} - ISO8601 string at the time the wiki was built
{{ meta.lastModified }} - Last modified ISO8601 string sourced from Git
{{ meta.gitCommit }} - Current git commit sourced from Git
{{ meta.filePath }} - Source path of the rendered file
```

# SGW Searching

The built wiki includes a search index `search.sgw.json`.
