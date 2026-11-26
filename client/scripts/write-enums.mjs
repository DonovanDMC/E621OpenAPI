// Turns each component schema with x-enum-varnames into a TypeScript enum.
// hey-api's `enums` option would do this for every enum.

import { readFileSync, writeFileSync } from "node:fs";
import { load } from "js-yaml";

const spec = load(readFileSync("../openapi.yaml", "utf8"));

const toKey = name => name.replace(/([a-z\d])([A-Z])/g, "$1_$2").replace(/[^A-Za-z\d]+/g, "_").toUpperCase();
const toValue = value => typeof value === "string" ? `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'` : String(value);

let types = readFileSync("src/types.ts", "utf8");
const names = [];
for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const varnames = schema["x-enum-varnames"];
    if (!varnames) continue;
    if (!Array.isArray(schema.enum) || schema.enum.length !== varnames.length) {
        throw new Error(`${name}: x-enum-varnames has ${varnames.length} names for ${schema.enum?.length ?? 0} enum values`);
    }

    const decl = new RegExp(`^export type ${name} = .+;$`, "m");
    if (!decl.test(types)) throw new Error(`${name}: no generated type found in src/types.ts`);

    const members = varnames.map((varname, i) => `    ${toKey(varname)} = ${toValue(schema.enum[i])}`).join(",\n");
    types = types.replace(decl, `export enum ${name} {\n${members}\n}`);
    names.push(name);
}
writeFileSync("src/types.ts", types);

// the generated index exports these as types only, which would drop the const
if (names.length !== 0) {
    const index = readFileSync("src/index.ts", "utf8");
    const updated = index.replace(/^export type \{ (.+) \} from '\.\/types\.js';$/m, (_, list) => {
        const rest = list.split(", ").filter(n => !names.includes(n));
        return `export type { ${rest.join(", ")} } from './types.js';\nexport { ${names.join(", ")} } from './types.js';`;
    });
    if (updated === index) throw new Error("Failed to update the type exports in src/index.ts");
    writeFileSync("src/index.ts", updated);
}

console.log(`Wrote enums for ${names.join(", ") || "nothing"}`);
