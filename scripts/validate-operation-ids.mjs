// Validates that every `operationId` in api/paths/**/*.yaml:
//   1. is shaped `controller#action`
//   2. has a `controller` matching its directory path (relative to api/paths)
//      and an `action` matching its file name
//   3. corresponds to a real controller#action pair in e621ng's routes, as of
//      the commit pinned in `e621ng-commit`
//   4. is exposed in api/api.yaml under an HTTP method that pair is actually
//      routed on in e621ng
//
// It also checks the other direction: every e621ng route that exists but isn't
// documented anywhere is reported as a missing route, unless it's listed in
// ignored-routes.jsonc at the repo root - either as an exact "controller#action"
// pair, "*#action" to match that action on any controller, or "controller#*"
// to ignore an entire controller. Either side can also contain shell-style
// `{a,b,c}` brace groups to cover several entries in one line, e.g.
// "staff/{wiki_versions,post_versions}#diff".
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
//
// The exported route table is cached at .cache/routes/<commit>-<exporter
// hash>.json, so most runs skip the clone/bundle/boot entirely - CI persists
// that directory across runs. The commit is either the one pinned in
// e621ng-commit, or (when E621NG_PATH is set) whatever HEAD actually is at
// that path, as long as it's a clean checkout - a dirty tree always gets a
// fresh, uncached export, so iterating on local e621ng changes never reads
// stale results. Delete .cache/routes to force a fresh export regardless.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
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

const routeCacheDir = path.join(repoRoot, ".cache/routes");

// The commit actually checked out at `dir`, or null if that's not a clean
// checkout of *some* commit (uncommitted changes, or not a git repo at
// all) - in which case caching would risk serving stale/wrong results, so
// callers should treat null as "don't cache".
function resolveCleanCommit(dir) {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
    if (status.trim() !== "") return null;
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// Cache key covers both the e621ng commit and export_routes.rb's own
// content, so editing the exporter (e.g. adding a new field) invalidates
// caches from before that change instead of silently serving stale data.
function routeCacheKey(commit) {
  const exporterHash = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, "scripts/export_routes.rb")))
    .digest("hex")
    .slice(0, 16);
  return `${commit}-${exporterHash}`;
}

function getCachedRoutes(commit) {
  const cachePath = path.join(routeCacheDir, `${routeCacheKey(commit)}.json`);
  if (!existsSync(cachePath)) return null;
  console.log(`Using cached route table at ${cachePath}`);
  return JSON.parse(readFileSync(cachePath, "utf8"));
}

function setCachedRoutes(commit, routes) {
  mkdirSync(routeCacheDir, { recursive: true });
  const cachePath = path.join(routeCacheDir, `${routeCacheKey(commit)}.json`);
  writeFileSync(cachePath, JSON.stringify(routes));
}

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

// Expands shell-style `{a,b,c}` brace groups anywhere in a string into every
// literal combination, e.g. "staff/{wiki,post}_versions" -> ["staff/wiki_versions",
// "staff/post_versions"], and "{a,b}/{c,d}" -> all four combinations. Groups
// don't nest. A string with no `{...}` group is returned as a single-element
// array unchanged.
function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]*)\}/);
  if (!match) return [pattern];
  const [whole, inner] = match;
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + whole.length);
  return inner.split(",").flatMap(option => expandBraces(`${before}${option}${after}`));
}

// Strips `//` and `/* */` comments from JSONC source ahead of JSON.parse,
// respecting string contents (so a reason like "https://..." or an escaped
// quote doesn't get misread as the start/end of a comment).
function stripJsonComments(text) {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      result += char;
      if (char === "\\") {
        result += next;
        i++;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      result += char;
    } else if (char === "/" && next === "/") {
      inLineComment = true;
      i++;
    } else if (char === "/" && next === "*") {
      inBlockComment = true;
      i++;
    } else {
      result += char;
    }
  }
  return result;
}

// ignored-routes.jsonc maps a "controller#action" pair to a human-readable
// reason. Used to silence routes that are real, but aren't meaningfully part of
// the documented API (HTML-only forms/confirmation pages, etc). Either side can be `*`:
// "*#action" matches that action on any controller (e.g. "*#new"),
// "controller#*" ignores an entire controller (e.g. "staff/ip_addrs#*").
// Either side can also contain `{a,b,c}` brace groups (see expandBraces),
// e.g. "staff/users#{anonymize,edit_blacklist}" covers two actions on one
// controller in a single entry.
function loadIgnoredRoutes() {
  const raw = JSON.parse(stripJsonComments(readFileSync(path.join(repoRoot, "ignored-routes.jsonc"), "utf8")));
  const exact = new Set();
  const wildcardActions = new Set();
  const wildcardControllers = new Set();
  const rawKeyMatchers = new Map();
  for (const key of Object.keys(raw)) {
    const [controllerPattern, actionPattern] = key.split("#");
    const matchers = [];
    for (const controller of expandBraces(controllerPattern)) {
      for (const action of expandBraces(actionPattern)) {
        if (controller === "*") {
          wildcardActions.add(action);
          matchers.push({ type: "wildcardAction", value: action });
        } else if (action === "*") {
          wildcardControllers.add(controller);
          matchers.push({ type: "wildcardController", value: controller });
        } else {
          const pair = `${controller}#${action}`;
          exact.add(pair);
          matchers.push({ type: "exact", value: pair });
        }
      }
    }
    rawKeyMatchers.set(key, matchers);
  }
  return { exact, wildcardActions, wildcardControllers, raw, rawKeyMatchers };
}

function isIgnored(pair, ignored) {
  if (ignored.exact.has(pair)) return true;
  const [controller, action] = pair.split("#");
  return ignored.wildcardActions.has(action) || ignored.wildcardControllers.has(controller);
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

// E621NG_PATH, when given, is trusted to be cacheable too, but only once we
// can confirm it's a clean checkout of a known commit - a dirty tree (local
// routes.rb edits being iterated on) always gets a fresh, uncached export.
function getRoutes() {
  const explicitDir = process.env.E621NG_PATH?.trim();
  const expectedCommit = explicitDir
    ? resolveCleanCommit(explicitDir)
    : readFileSync(path.join(repoRoot, "e621ng-commit"), "utf8").trim();

  if (expectedCommit) {
    const cached = getCachedRoutes(expectedCommit);
    if (cached) return cached;
  }

  const { dir: e621ngDir, cleanup } = setupE621ng();
  let routes;
  try {
    routes = exportRoutes(e621ngDir);
  } finally {
    cleanup();
  }

  if (expectedCommit) setCachedRoutes(expectedCommit, routes);
  return routes;
}

function main() {
  const routes = getRoutes();

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
  const documentedPairs = new Set();

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
    documentedPairs.add(routeKey);
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

  // Real e621ng routes with no documentation and no entry in gnored-routes.json.
  const ignored = loadIgnoredRoutes();
  const realPairs = new Set(
    routes.filter(r => r.controller && r.action).map(r => `${r.controller}#${r.action}`)
  );
  const missingRoutes = [...realPairs]
    .filter(pair => !documentedPairs.has(pair) && !isIgnored(pair, ignored))
    .sort();

  // ignored-routes.jsonc entries that no longer match anything real and undocumented - either
  // the route's gone, e621ng, or it got documented since. Surfaced as a nudge to prune the file,
  // not a failure.
  const wouldBeMissingWithoutIgnores = new Set(
    [...realPairs].filter(pair => !documentedPairs.has(pair))
  );
  // A raw key is stale only if every one of its (possibly brace-expanded)
  // exact/wildcard-controller matchers is unused - a brace group where only
  // some options still match something real is left alone rather than
  // reported. "*#action" entries are never checked, same as before brace
  // groups existed: a blanket action-wildcard is expected to sit unused for
  // most controllers.
  const staleIgnores = [...ignored.rawKeyMatchers.entries()]
    .filter(([, matchers]) => {
      const checkable = matchers.filter(m => m.type !== "wildcardAction");
      if (checkable.length === 0) return false;
      return checkable.every(m => m.type === "exact"
        ? !wouldBeMissingWithoutIgnores.has(m.value)
        : ![...wouldBeMissingWithoutIgnores].some(pair => pair.startsWith(`${m.value}#`)));
    })
    .map(([key]) => key)
    .sort();

  const problems = shapeMismatches.length + routeMismatches.length + methodMismatches.length + missingRoutes.length;
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
    if (missingRoutes.length) {
      console.error(`\n${missingRoutes.length} route(s) in e621ng with no documentation (add to api/paths, or to ignored-routes.jsonc if intentional):`);
      for (const m of missingRoutes) console.error(`  ${m}`);
    }
    console.error(`\n${files.length} files checked, ${problems} problem(s) found.`);
    process.exit(1);
  }

  if (staleIgnores.length) {
    console.warn(`\n${staleIgnores.length} ignored-routes.jsonc entr(y/ies) no longer apply (route missing, no longer JSON, or already documented) - consider pruning:`);
    for (const m of staleIgnores) console.warn(`  ${m}`);
  }

  console.log(`All ${files.length} operationIds match their directory/file name and a real e621ng route + method, and no undocumented JSON routes were found.`);
}

main();
