// Validates that api/api.yaml's `components` stay in sync with the files under
// api/components:
//   1. every file under api/components/<section> is registered in the matching
//      components.<section> of api/api.yaml (schemas, parameters, responses,
//      requestBodies), and every registered $ref points at a file that exists
//   2. schema keys match their file names, sit under the right `# Enums`,
//      `# Models` or `# Responses` comment for their directory, and are sorted
//      within it
//   3. every $ref in api/api.yaml, api/paths and api/components resolves to a
//      file that exists, and refs into api/components only target registered
//      files - an unregistered one still bundles, but gets inlined instead of
//      showing up as a named component
//
// Parsed line by line (like the other validators), so it relies on the layout
// api/api.yaml already uses.
//
// Usage:
//   node scripts/validate-components.mjs

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const apiDir = path.join(repoRoot, "api");
const apiFile = path.join(apiDir, "api.yaml");

const SECTIONS = ["schemas", "parameters", "responses", "requestBodies"];
const SCHEMA_GROUPS = new Map([
  ["Enums", "enums"],
  ["Models", "models"],
  ["Responses", "responses"]
]);

const rel = file => path.relative(repoRoot, file);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.ya?ml$/.test(e.name) ? [full] : [];
  });
}

// Matches `$ref: "x"`, `"$ref": "x"`, `$ref: 'x'` and `$ref: x`.
const REF_RE = /["']?\$ref["']?\s*:\s*["']?([^"'\s]+)["']?/;

// Returns each registered component as { section, key, group, file, line }.
function parseComponents() {
  const lines = readFileSync(apiFile, "utf8").split("\n");
  const start = lines.indexOf("components:");
  if (start === -1) {
    throw new Error("Could not find a top-level 'components:' key in api/api.yaml");
  }
  const entries = [];
  let section = null;
  let group = null;
  let entry = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;
    const sec = line.match(/^ {2}(\w+):\s*$/);
    if (sec) {
      section = SECTIONS.includes(sec[1]) ? sec[1] : null;
      group = null;
      entry = null;
      continue;
    }
    if (!section) continue;
    const comment = line.match(/^ {4}#\s*(.+?)\s*$/);
    if (comment) {
      group = comment[1];
      continue;
    }
    const key = line.match(/^ {4}(\w+):\s*$/);
    if (key) {
      entry = { section, key: key[1], group, file: null, line: i + 1 };
      entries.push(entry);
      continue;
    }
    const ref = line.match(REF_RE);
    if (ref && entry && /^ {6}/.test(line)) {
      entry.file = path.resolve(apiDir, ref[1]);
    }
  }
  return entries;
}

function collectRefs(file) {
  return readFileSync(file, "utf8").split("\n").flatMap((line, i) => {
    const m = line.match(REF_RE);
    return m ? [{ from: file, line: i + 1, ref: m[1] }] : [];
  });
}

function duplicates(list) {
  return [...new Set(list.filter((v, i) => list.indexOf(v) !== i))];
}

function main() {
  const entries = parseComponents();
  const problems = [];
  const report = (title, list) => {
    if (list.length) problems.push(`${list.length} ${title}:\n${list.map(v => `  ${v}`).join("\n")}`);
  };

  const registered = new Map(entries.filter(e => e.file).map(e => [e.file, e]));

  report("component(s) in api/api.yaml with no $ref", entries.filter(e => !e.file).map(e => `${e.section}.${e.key} (line ${e.line})`));
  report("registered component(s) pointing at a file that doesn't exist", entries.filter(e => e.file && !existsSync(e.file)).map(e => `${e.section}.${e.key} -> ${rel(e.file)}`));
  for (const section of SECTIONS) {
    report(`duplicate key(s) in components.${section}`, duplicates(entries.filter(e => e.section === section).map(e => e.key)));
  }
  report("file(s) registered more than once", duplicates(entries.filter(e => e.file).map(e => rel(e.file))));

  // Files on disk vs. what's registered, per section.
  const unregistered = [];
  const wrongSection = [];
  for (const section of SECTIONS) {
    const dir = path.join(apiDir, "components", section);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const entry = registered.get(file);
      if (!entry) unregistered.push(rel(file));
      else if (entry.section !== section) wrongSection.push(`${entry.section}.${entry.key} -> ${rel(file)}`);
    }
  }
  report(`file(s) under api/components not registered in api/api.yaml`, unregistered);
  report("component(s) registered under the wrong section for their directory", wrongSection);

  // Schema naming, grouping and ordering.
  const schemas = entries.filter(e => e.section === "schemas" && e.file);
  report("schema key(s) that don't match their file name", schemas
    .filter(e => path.basename(e.file).replace(/\.ya?ml$/, "") !== e.key)
    .map(e => `${e.key} -> ${rel(e.file)}`));
  report("schema(s) under the wrong comment group for their directory", schemas
    .filter(e => SCHEMA_GROUPS.get(e.group) !== path.basename(path.dirname(e.file)))
    .map(e => `${e.key} is under '# ${e.group ?? "(none)"}' but lives in ${rel(path.dirname(e.file))}`));
  const unsorted = [];
  for (const group of SCHEMA_GROUPS.keys()) {
    const keys = schemas.filter(e => e.group === group).map(e => e.key);
    for (let i = 1; i < keys.length; i++) {
      if (keys[i - 1] > keys[i]) unsorted.push(`'# ${group}': ${keys[i]} should come before ${keys[i - 1]}`);
    }
  }
  report("schema(s) out of order", unsorted);

  // Every $ref in the tree resolves, and component refs target registered files.
  const refFiles = [apiFile, ...walk(path.join(apiDir, "paths")), ...walk(path.join(apiDir, "components"))];
  const missing = [];
  const unregisteredTargets = [];
  const componentsDir = path.join(apiDir, "components") + path.sep;
  for (const file of refFiles) {
    for (const { from, line, ref } of collectRefs(file)) {
      const [target] = ref.split("#");
      if (!target) continue;
      const resolved = path.resolve(path.dirname(from), target);
      const where = `${rel(from)}:${line} -> ${ref}`;
      if (!existsSync(resolved)) missing.push(where);
      else if (resolved.startsWith(componentsDir) && !registered.has(resolved)) unregisteredTargets.push(where);
    }
  }
  report("$ref(s) to a file that doesn't exist", missing);
  report("$ref(s) to a component file that isn't registered in api/api.yaml", unregisteredTargets);

  if (problems.length) {
    for (const p of problems) console.error(`\n${p}`);
    process.exit(1);
  }

  console.log(`All ${entries.length} components in api/api.yaml match the files under api/components, and every $ref resolves.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
