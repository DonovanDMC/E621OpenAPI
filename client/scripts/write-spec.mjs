// Writes src/spec.ts, which records the commit the client was generated from
// and fetches the spec at that commit. Runs after openapi-ts, which clears src.

import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

writeFileSync("src/spec.ts", `// Written by scripts/write-spec.mjs

/** The E621OpenAPI commit this client was generated from. */
export const specCommit = "${sha}";

/** The spec this client was generated from. */
export const specURL = \`https://raw.githubusercontent.com/DonovanDMC/E621OpenAPI/\${specCommit}/openapi.yaml\`;

/** The spec this client was generated from, with every \`$ref\` inlined. */
export const dereferencedSpecURL = \`https://raw.githubusercontent.com/DonovanDMC/E621OpenAPI/\${specCommit}/openapi.dereferenced.yaml\`;

export interface FetchSpecOptions {
    /** Fetch the version with every \`$ref\` inlined. */
    dereferenced?: boolean;
    /** The fetch implementation to use, defaults to the global fetch. */
    fetch?: typeof fetch;
}

/** Fetches the spec this client was generated from, as YAML. */
export async function fetchSpec(options: FetchSpecOptions = {}): Promise<string> {
    const response = await (options.fetch ?? fetch)(options.dereferenced ? dereferencedSpecURL : specURL);
    if (!response.ok) {
        throw new Error(\`Failed to fetch the spec: \${response.status} \${response.statusText}\`);
    }
    return response.text();
}
`);

// the generated index only re-exports the sdk and types
appendFileSync("src/index.ts", "export * from './spec.js';\n");
console.log(`Wrote src/spec.ts for ${sha}`);
