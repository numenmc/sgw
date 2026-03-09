#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("sgw")
  .description("Static-site-generated wiki software/renderer.")
  .version("1.0.0");

program
  .command("dev")
  .description("Start local development server")
  .option("-p, --port <port>", "port to listen on", "7616")
  .option("-v, --verbose", "enable verbose logging")
  .option("-e, --expose", "expose to network")
  .action((opts) => {
    console.log(`Starting dev server on port ${opts.port}...`);
  });

program.parse(process.argv);