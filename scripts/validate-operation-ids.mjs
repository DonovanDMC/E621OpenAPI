// Validates that every `operationId` in api/paths/**/*.yaml:
//   1. is shaped `controller#action`
//   2. has a `controller` matching its directory path (relative to api/paths)
//      and an `action` matching its file name
//   3. corresponds to a real controller#action pair in e621ng's routes, as of
//      the commit pinned in `e621ng-commit`
//   4. is exposed in api/api.yaml under an HTTP method that pair is actually
//      routed on in e621ng
//
// Usage:
//   node scripts/validate-operation-ids.mjs
//
// By default this clones e621ng into a temp directory, installs its gems,
// and boots it (RAILS_ENV=test, no database/redis needed) to dump its route
// table. That requires `git`, `ruby`, and `bundler` on PATH, and network
// access to GitHub + rubygems.org.
//
// Set E621NG_PATH to point at an existing e621ng checkout (already on the
// commit you want to check against, with `bundle install` already run) to
// skip the clone/bundle step, e.g. for local iteration:
//   E621NG_PATH=/path/to/e621ng node scripts/validate-operation-ids.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const pathsDir = path.join(repoRoot, "api/paths");

// Known, deliberate deviations from a strict controller/action/path match.
// Each entry documents *why* the deviation exists so it doesn't get "fixed"
// by accident later.
//
// iqdb_queries has one Rails action (`show`) reachable over both GET and
// POST with meaningfully different request bodies. OpenAPI requires globally
// unique operationIds, so we split the docs into get/show.yaml and
// post/show.yaml, and suffix the POST variant's action with `_post`.
const PATH_EXCEPTIONS = new Map([
  ["iqdb_queries/get/show.yaml", { controller: "iqdb_queries", action: "show" }],
  ["iqdb_queries/post/show.yaml", { controller: "iqdb_queries", action: "show_post" }]
]);
const ROUTE_EXCEPTIONS = new Map([["iqdb_queries#show_post", "iqdb_queries#show"]]);

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
}

function setupE621ng() {
  const existing = process.env.E621NG_PATH?.trim();
  if (existing) {
    if (!existsSync(existing)) {
      throw new Error(`E621NG_PATH does not exist: ${existing}`);
    }
    return { dir: existing, cleanup: () => {} };
  }

  const commit = readFileSync(path.join(repoRoot, "e621ng-commit"), "utf8").trim();
  if (!commit) {
    throw new Error("e621ng-commit is empty");
  }

  const dir = mkdtempSync(path.join(tmpdir(), "e621ng-"));
  console.log(`Cloning e621ng@${commit} into ${dir}...`);
  run("git", ["init", "--quiet", dir]);
  run("git", ["remote", "add", "origin", "https://github.com/e621ng/e621ng.git"], { cwd: dir });
  run("git", ["fetch", "--quiet", "--depth", "1", "origin", commit], { cwd: dir });
  run("git", ["checkout", "--quiet", "FETCH_HEAD"], { cwd: dir });

  // config/danbooru_local_config.rb is gitignored and required unconditionally
  // by config/application.rb. docker/danbooru_local_config.rb is the checked-in
  // template `bin/setup` copies from, and is enough to boot the app.
  const localConfig = path.join(dir, "config/danbooru_local_config.rb");
  if (!existsSync(localConfig)) {
    copyFileSync(path.join(dir, "docker/danbooru_local_config.rb"), localConfig);
  }

  console.log("Running bundle install (this can take a while)...");
  run("bundle", ["install"], { cwd: dir });

  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function exportRoutes(e621ngDir) {
  const workDir = mkdtempSync(path.join(tmpdir(), "e621ng-routes-"));
  try {
    const outFile = path.join(workDir, "routes.json");
    const runnerScript = `
      require "json"
      load ${JSON.stringify(path.join(repoRoot, "scripts/export_routes.rb"))}
      File.write(${JSON.stringify(outFile)}, RouteExporter.export.to_json)
    `;
    const runnerPath = path.join(workDir, "runner.rb");
    writeFileSync(runnerPath, runnerScript);

    console.log("Booting e621ng to dump its route table...");
    run("bundle", ["exec", "rails", "runner", runnerPath], {
      cwd: e621ngDir,
      env: {
        ...process.env,
        RAILS_ENV: "test",
        // config/initializers/secret_token.rb requires these to be set
        // (either as files under ~/.danbooru or as env vars) before it'll
        // boot at all. We're only introspecting routes, not serving
        // requests, so throwaway values are fine.
        SECRET_TOKEN: process.env.SECRET_TOKEN ?? "0".repeat(32),
        SESSION_SECRET_KEY: process.env.SESSION_SECRET_KEY ?? "0".repeat(32)
      }
    });

    return JSON.parse(readFileSync(outFile, "utf8"));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

// Maps each `./paths/...yaml` $ref in api/api.yaml to the HTTP method it's
// nested under, e.g. "post_flags/destroy.yaml" -> Set{"DELETE"}. Parsed with
// a small indentation-tracking state machine rather than a YAML parser,
// since we only care about two things: the nearest enclosing `get:`/`post:`/
// etc. key, and `$ref:` lines that point into ./paths/.
function parseApiYamlMethods() {
  const text = readFileSync(path.join(repoRoot, "api/api.yaml"), "utf8");
  const lines = text.split("\n");
  const startIndex = lines.findIndex(l => l === "paths:");
  if (startIndex === -1) {
    throw new Error("Could not find a top-level 'paths:' key in api/api.yaml");
  }

  const methodsByFile = new Map();
  let currentMethod = null;

  for (const line of lines.slice(startIndex + 1)) {
    const methodMatch = line.match(/^\s+(get|post|put|patch|delete):\s*$/);
    if (methodMatch) {
      currentMethod = methodMatch[1].toUpperCase();
      continue;
    }

    const refMatch = line.match(/^\s+\$ref:\s*"\.\/paths\/(.+\.yaml)"\s*$/);
    if (refMatch) {
      if (!currentMethod) {
        throw new Error(`Found a $ref to ${refMatch[1]} in api/api.yaml with no enclosing HTTP method`);
      }
      const rel = refMatch[1];
      if (!methodsByFile.has(rel)) methodsByFile.set(rel, new Set());
      methodsByFile.get(rel).add(currentMethod);
    }
  }

  return methodsByFile;
}

function walkYamlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkYamlFiles(full));
    } else if (entry.name.endsWith(".yaml")) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const { dir: e621ngDir, cleanup } = setupE621ng();
  let routes;
  try {
    routes = exportRoutes(e621ngDir);
  } finally {
    cleanup();
  }

  // controller#action -> set of HTTP methods e621ng actually routes it on
  const realMethodsByPair = new Map();
  for (const r of routes) {
    if (!r.controller || !r.action) continue;
    const key = `${r.controller}#${r.action}`;
    for (const method of r.method.split("|")) {
      if (!realMethodsByPair.has(key)) realMethodsByPair.set(key, new Set());
      realMethodsByPair.get(key).add(method);
    }
  }

  const docMethodsByFile = parseApiYamlMethods();

  const files = walkYamlFiles(pathsDir).sort();
  const routeMismatches = [];
  const shapeMismatches = [];
  const methodMismatches = [];

  for (const file of files) {
    const rel = path.relative(pathsDir, file).split(path.sep).join("/");
    const text = readFileSync(file, "utf8");
    const match = text.match(/^operationId:\s*(\S+)$/m);

    if (!match) {
      shapeMismatches.push(`${rel}: no operationId found`);
      continue;
    }

    const operationId = match[1];
    const hashIndex = operationId.indexOf("#");
    if (hashIndex === -1) {
      shapeMismatches.push(`${rel}: operationId '${operationId}' is not shaped 'controller#action'`);
      continue;
    }

    const controller = operationId.slice(0, hashIndex);
    const action = operationId.slice(hashIndex + 1);

    const exception = PATH_EXCEPTIONS.get(rel);
    const expectedController = exception ? exception.controller : path.dirname(rel);
    const expectedAction = exception ? exception.action : path.basename(rel, ".yaml");

    if (controller !== expectedController) {
      shapeMismatches.push(`${rel}: operationId controller '${controller}' does not match directory '${path.dirname(rel)}'`);
    }
    if (action !== expectedAction) {
      shapeMismatches.push(`${rel}: operationId action '${action}' does not match file name '${path.basename(rel, ".yaml")}'`);
    }

    const routeKey = ROUTE_EXCEPTIONS.get(operationId) ?? operationId;
    const realMethods = realMethodsByPair.get(routeKey);
    if (!realMethods) {
      routeMismatches.push(`${rel}: operationId '${operationId}' has no matching route in e621ng`);
      continue;
    }

    const docMethods = docMethodsByFile.get(rel);
    if (!docMethods || docMethods.size === 0) {
      methodMismatches.push(`${rel}: is not $ref'd from any HTTP method in api/api.yaml`);
      continue;
    }
    for (const docMethod of docMethods) {
      if (!realMethods.has(docMethod)) {
        methodMismatches.push(
          `${rel}: documented under ${docMethod} but e621ng routes '${operationId}' as ${[...realMethods].join("/")}`
        );
      }
    }
  }

  const problems = shapeMismatches.length + routeMismatches.length + methodMismatches.length;
  if (problems) {
    if (shapeMismatches.length) {
      console.error(`\n${shapeMismatches.length} operationId/path naming mismatch(es):`);
      for (const m of shapeMismatches) console.error(`  ${m}`);
    }
    if (routeMismatches.length) {
      console.error(`\n${routeMismatches.length} operationId(s) with no matching e621ng route:`);
      for (const m of routeMismatches) console.error(`  ${m}`);
    }
    if (methodMismatches.length) {
      console.error(`\n${methodMismatches.length} HTTP method mismatch(es):`);
      for (const m of methodMismatches) console.error(`  ${m}`);
    }
    console.error(`\n${files.length} files checked, ${problems} problem(s) found.`);
    process.exit(1);
  }

  console.log(`All ${files.length} operationIds match their directory/file name and a real e621ng route + method.`);
}

main();
