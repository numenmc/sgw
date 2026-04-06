/** path: contents */
export type BuildResult = Record<string, Uint8Array | string>;

export interface PageContext {
    pageName: string;
    pagePath: string;
    outputPath: string;
    config: SGWConfig;
    fields: Record<string, any>;
}

export type WrappedValue<T = any> = { value: T };

import type { SGWConfig } from "./config.types.js";
import type { PageIndex } from "./search.types.js";

export interface SGWPlugin {
    name: string;

    onConfigLoad?(config: SGWConfig): Promise<void> | void;

    onPageStructure?(
        pages: Record<string, string>
    ): Promise<void> | void;

    onRead?(wikitext: WrappedValue<string>, context: PageContext): Promise<void> | void;

    onTokens?(tokens: any[], context: PageContext): Promise<void> | void;

    onAST?(ast: any, context: PageContext): Promise<void> | void;

    onHTML?(html: WrappedValue<string>, context: PageContext): Promise<void> | void;

    onSearchIndex?(searchIndex: PageIndex[]): Promise<void> | void;

    onRendered?(
        output: WrappedValue<string>,
        context: PageContext
    ): Promise<void> | void;

    onBuildEnd?(result: BuildResult): Promise<void> | void;
}
