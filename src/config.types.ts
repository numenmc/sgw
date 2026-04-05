export interface SGWConfig {
  meta: {
    /**
     * The name of the wiki.
     */
    name: string;

    /**
     * The byline that appears under the page title. This is rendered depending on the selected theme.
     */
    byline: string;
  };
  build: {
    /**
     * The name of the main page. The page specified here will be rendered to index.html instead of the regular file name.
     */
    index: string;

    /**
     * The theme to render the wiki with. The build step will attempt to find a built-in theme with the name specified, and if it does not exist, it will try to locate a theme directory with the name.
     */
    theme: string;

    /**
     * If this field is specified, the directory entered here will have its contents copied to the output directory's root.
     */
    staticFiles?: string;

    /**
     * Should DOMPurify be disabled? Defualt to false
     */
    noDOMPurify?: boolean;

    /**
     * Should the renderer remove the .html from links? This is useful if your hosting allows fetching without a extension and you want clean links.
     */
    stripLinkExtension?: boolean;
  };
  plugins?: string[];
  opts?: Record<string, any>;
}
