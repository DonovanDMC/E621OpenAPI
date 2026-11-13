// Validates that:
//   1. the ModActionAction enum (everything above its `# legacy` marker)
//      matches the keys of KnownActions in e621ng's app/models/mod_action.rb,
//      as of the commit pinned in `e621ng-commit`
//   2. every action in the enum, legacy ones included, has exactly one entry in
//      the ModAction oneOf, and the oneOf has no actions the enum doesn't
//
// Usage:
//   node scripts/validate-mod-actions.mjs
//
// By default mod_action.rb is fetched from GitHub at the pinned commit. Set
// E621NG_PATH to read it from an existing e621ng checkout instead.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const enumPath = "api/components/schemas/enums/ModActionAction.yml";
const modelPath = "api/components/schemas/models/ModAction.yml";

async function loadModActionSource() {
  const existing = process.env.E621NG_PATH?.trim();
  if (existing) {
    const file = path.join(existing, "app/models/mod_action.rb");
    if (!existsSync(file)) {
      throw new Error(`${file} does not exist`);
    }
    return { source: readFileSync(file, "utf8"), from: file };
  }

  const commit = readFileSync(path.join(repoRoot, "e621ng-commit"), "utf8").trim();
  if (!commit) {
    throw new Error("e621ng-commit is empty");
  }
  const url = `https://raw.githubusercontent.com/e621ng/e621ng/${commit}/app/models/mod_action.rb`;
  const response = await fetch(url, { headers: { "user-agent": "e621-open-api-build" } });
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed with ${response.status}`);
  }
  return { source: await response.text(), from: `e621ng@${commit}` };
}

function parseKnownActions(source) {
  const start = source.indexOf("KnownActions = {");
  const end = source.indexOf("}.freeze", start);
  if (start === -1 || end === -1) {
    throw new Error("Could not find KnownActions in mod_action.rb");
  }
  const keys = [...source.slice(start, end).matchAll(/^\s*(\w+): \{/gm)].map(m => m[1]);
  if (keys.length === 0) {
    throw new Error("Found no actions in KnownActions");
  }
  return keys;
}

function parseEnum() {
  const lines = readFileSync(path.join(repoRoot, enumPath), "utf8").split("\n");
  const current = [];
  const legacy = [];
  let inLegacy = false;
  for (const line of lines) {
    if (/^\s*#\s*legacy\s*$/.test(line)) {
      inLegacy = true;
      continue;
    }
    const m = line.match(/^\s+- (\w+)/);
    if (m) (inLegacy ? legacy : current).push(m[1]);
  }
  return { current, legacy };
}

// Returns the action enum values of each oneOf entry, keyed by its title.
// Parsed by indentation, so it relies on the layout ModAction.yml already uses.
function parseOneOf() {
  const lines = readFileSync(path.join(repoRoot, modelPath), "utf8").split("\n");
  const start = lines.findIndex(l => l === "oneOf:");
  if (start === -1) {
    throw new Error(`Could not find a top-level 'oneOf:' key in ${modelPath}`);
  }
  const entries = [];
  let entry = null;
  let state = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const item = line.match(/^ {2}- (?:title: (\S+))?/);
    if (item) {
      entry = { title: item[1] ?? `#${entries.length}`, actions: [] };
      entries.push(entry);
      state = null;
      continue;
    }
    if (/^ {6}action:\s*$/.test(line)) state = "action";
    else if (state === "action" && /^ {8}enum:\s*$/.test(line)) state = "enum";
    else if (state === "enum" && /^ {10}- /.test(line)) entry.actions.push(line.trim().slice(2));
    else if (state === "enum" && !/^ {10}/.test(line)) state = null;
    else if (state === "action" && !/^ {8}/.test(line)) state = null;
  }
  return entries;
}

function duplicates(list) {
  return [...new Set(list.filter((v, i) => list.indexOf(v) !== i))];
}

async function main() {
  const { source, from } = await loadModActionSource();
  const known = parseKnownActions(source);
  const { current, legacy } = parseEnum();
  const entries = parseOneOf();

  const problems = [];
  const report = (title, list) => {
    if (list.length) problems.push(`${list.length} ${title}:\n${list.map(v => `  ${v}`).join("\n")}`);
  };

  const enumAll = [...current, ...legacy];
  report(`action(s) in ${from} missing from ${enumPath}`, known.filter(a => !current.includes(a)));
  report(`action(s) in ${enumPath} that aren't in ${from} (remove them, or move them under '# legacy')`, current.filter(a => !known.includes(a)));
  report(`duplicate action(s) in ${enumPath}`, duplicates(enumAll));

  const oneOfActions = entries.flatMap(e => e.actions);
  report(`action(s) in ${enumPath} with no entry in the ${modelPath} oneOf`, enumAll.filter(a => !oneOfActions.includes(a)));
  report(`action(s) in the ${modelPath} oneOf that aren't in ${enumPath}`, oneOfActions.filter(a => !enumAll.includes(a)));
  report(`action(s) with more than one entry in the ${modelPath} oneOf`, duplicates(oneOfActions));
  report(`${modelPath} oneOf entr(y/ies) with no action enum`, entries.filter(e => e.actions.length === 0).map(e => e.title));

  if (problems.length) {
    for (const p of problems) console.error(`\n${p}`);
    process.exit(1);
  }

  console.log(`All ${known.length} actions in ${from} are in the enum, and all ${enumAll.length} enum actions have one entry in the ModAction oneOf.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
