#!/usr/bin/env node

import { Command } from "commander";
import path from "node:path";
import { build } from "./build.js";
import { Theme } from "./templater.js";

import fs from "fs/promises";
import type { SGWConfig } from "./config.types.js";
import type { BuildResult } from "./build.types.js";

import chokidar from "chokidar";
import express from "express";

const defaultConfig: SGWConfig = {
  meta: {
    name: "Wiki",
    byline: "from Wiki"
  },
  build: {
    index: "Main Page",
    theme: "default"
  }
};

const defaultPageContents =
  "Welcome to your brand new wiki created using the **sgw init** command line tool!";

const program = new Command();
program.name("sgw").description("Static-site-generated wiki software/renderer.").version("1.0.0");

program
  .command("dev")
  .description("Start local development server")
  .option("-i, --input <input>", "source directory to use")
  .option("-p, --port <port>", "port to listen on", "7616")
  .option("-e, --expose", "expose to network")
  .action(async (opts, cmd) => {
    if (!opts.input) cmd.error("Property input (-i) not specified.");
    const inLocation = path.resolve(process.cwd(), opts.input as string);

    console.log(`Starting dev server on port ${opts.port}...`);
    let currentBuild: BuildResult = await build(inLocation);

    chokidar.watch(inLocation).on("all", async (event, path) => {
      currentBuild = await build(inLocation, true);
    });

    const server = express();
    server.use((req, res, next) => {
      let p = req.path;

      if (p == "/") p = "/index.html";
      const f = currentBuild[path.join(".", p)];
      if (f) {
        res.type(path.extname(p));
        res.send(f);
      }
      else res.status(404);
    });

    server.listen(opts.port, () => {
      console.log("Dev server UP");
    });
  });

program
  .command("build")
  .description("Build to directory")
  .option("-i, --input <input>", "source directory to use")
  .option("-o, --output <output>", "directory to output to", "sgwdist")
  .action(async (opts, cmd) => {
    if (!opts.input) cmd.error("Property input (-i) not specified.");

    const inLocation = path.resolve(process.cwd(), opts.input as string);
    const outLocation = path.resolve(process.cwd(), opts.output as string);

    console.log(`Building to ${outLocation}`);

    const result = await build(inLocation);

    for (const [file, content] of Object.entries(result)) {
      const outPath = path.join(outLocation, file);

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, content);

      console.log(`Write ${outPath} OK`);
    }
  });

const clone = program.command("clone").description("Clone resources to wiki directory");

clone
  .command("theme <name>")
  .description("Clone a built-in theme to the working directory")
  .action(async (name, opts, cmd) => {
    let theme: Theme;

    try {
      theme = new Theme(name);
      await theme.loadTheme();
      console.log(`Loaded the theme ${name}`);
    } catch {
      cmd.error(`Couldn't load the theme ${name}`);
      return;
    }
    try {
      await fs.access(path.join(process.cwd(), name));
      cmd.error(`The theme already exists - try moving or deleting the ${name}/ directory.`);
    } catch {}

    await fs.mkdir(path.join(process.cwd(), name));

    await fs.writeFile(
      path.join(process.cwd(), `./${name}`, `index.html`),
      theme.getThemeTemplate()
    );
    for (const [file, contents] of Object.entries(theme.getCopyList())) {
      await fs.writeFile(path.join(process.cwd(), `./${name}`, file), contents);
    }

    console.log(`Cloned the theme to /${name}`);
  });

program
  .command("init [dir]")
  .description("Create a ssg-wiki project at the specified path")
  .action(async (dir, opts, cmd) => {
    const startDir = path.resolve(process.cwd(), dir ?? ".");

    try {
      await fs.access(startDir);
      cmd.error(`There's already a directory here. Please supply a different directory.`);
    } catch {}

    await fs.mkdir(startDir, { recursive: true });
    await fs.mkdir(path.join(startDir, "Template"), { recursive: true });
    await fs.writeFile(path.join(startDir, "Template", ".sgw-namespace"), "");
    await fs.writeFile(path.join(startDir, "sgw.json"), JSON.stringify(defaultConfig, null, 4));
    await fs.writeFile(path.join(startDir, "Main Page.sgw"), defaultPageContents);
  });

program.parse(process.argv);
