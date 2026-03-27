import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const start = performance.now();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("Compiling project with TypeScript compiler...");
execSync("tsc", { stdio: "inherit" });
console.log("TypeScript compiler finished.")

function recurseCopy(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);

    if (fs.statSync(srcPath).isDirectory()) {
      recurseCopy(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy themes
console.log("Copying themes...");
recurseCopy(path.join(__dirname, "./src/themes"), path.join(__dirname, "./dist/themes"));

// Exit
console.log(`Done! Took ${Math.round(performance.now() - start)}ms`);
