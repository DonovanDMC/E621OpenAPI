// Writes the commit the spec was generated from into README.md, between the
// spec-commit markers. Run right before publishing.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// the hash would point at a different spec than the one that was generated
if (git("status", "--porcelain", "--", "../openapi.yaml")) {
    console.error("openapi.yaml has uncommitted changes, commit them before publishing");
    process.exit(1);
}

const sha = git("rev-parse", "HEAD");
const readme = readFileSync("README.md", "utf8");
const pattern = /(<!-- spec-commit -->).*?(<!-- \/spec-commit -->)/;
if (!pattern.test(readme)) {
    console.error("Could not find the spec-commit markers in README.md");
    process.exit(1);
}

const line = `Generated from spec commit [\`${sha.slice(0, 7)}\`](https://github.com/DonovanDMC/E621OpenAPI/blob/${sha}/openapi.yaml).`;
writeFileSync("README.md", readme.replace(pattern, `$1${line}$2`));
console.log(`Stamped README.md with ${sha}`);
