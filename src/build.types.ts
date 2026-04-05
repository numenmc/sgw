/** path: contents */
export type BuildResult = Record<string, Uint8Array | string>;

export interface PageContext {
    pageName: string;
    pagePath: string;
    outputPath: string;
    config: SGWConfig;
    fields: Record<string, any>;
}

import type { SGWConfig } from "./config.types.js";

export interface SGWPlugin {
    name: string;

    onConfigLoad?(config: SGWConfig): Promise<void> | void;

    onPageStructure?(
        pages: Record<string, string>
    ): Promise<Record<string, string>> | Record<string, string>;

    onTokens?(tokens: any[], context: PageContext): Promise<any[]> | any[];

    onAST?(ast: any, context: PageContext): Promise<any> | any;

    onHTML?(html: string, context: PageContext): Promise<string> | string;

    onRendered?(
        output: string,
        context: PageContext
    ): Promise<string> | string;

    onBuildEnd?(result: BuildResult): Promise<void> | void;
}
