// Adjusts generated types the spec can't express, same as the e621 module's
// scripts/replace-types.ts. Fails if one stops matching, so changes to the
// generated output don't silently drop them.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPLACEMENTS = {
    // BodyInit only exists with the DOM lib
    "BodyInit": "RequestInit['body']",
    // the spec types page as a string so it can take `a<id>`/`b<id>`, accept plain numbers too
    "        page?: string;": "        page?: number | `${number}` | `${'a' | 'b'}${number}`;",
    // patterns come out as `string`
    "export type UploadStatus = 'completed' | 'failed' | 'processing' | 'queued' | 'pending' | string": "export type UploadStatus = 'completed' | 'failed' | 'processing' | 'queued' | 'pending' | `duplicate: ${number}`",
    "export type TagRequestStatus = 'active' | 'deleted' | 'processing' | 'queued' | 'retired' | 'pending' | string": "export type TagRequestStatus = 'active' | 'deleted' | 'processing' | 'queued' | 'retired' | 'pending' | `error: ${string}`",
};

const unmatched = new Set(Object.keys(REPLACEMENTS));
for (const file of readdirSync("src", { recursive: true })) {
    if (!file.endsWith(".ts")) continue;
    const full = path.join("src", file);
    const content = readFileSync(full, "utf8");
    let updated = content;
    for (const [find, replace] of Object.entries(REPLACEMENTS)) {
        if (updated.includes(find)) {
            unmatched.delete(find);
            updated = updated.replaceAll(find, replace);
        }
    }
    if (updated !== content) {
        writeFileSync(full, updated);
        console.log(`Updated ${full}`);
    }
}

if (unmatched.size !== 0) {
    console.error("No matches found for:");
    for (const find of unmatched) console.error(`- "${find}"`);
    process.exit(1);
}
