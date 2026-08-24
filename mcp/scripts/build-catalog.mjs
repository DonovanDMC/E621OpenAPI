import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, "../../openapi.dereferenced.yaml");
const OUT_PATH = path.resolve(__dirname, "../src/operations.json");

const METHODS = ["get", "post", "put", "patch", "delete"];
const MAX_DESCRIPTION_LENGTH = 400;

function truncate(text, max = MAX_DESCRIPTION_LENGTH) {
    if (!text) return undefined;
    const clean = String(text).trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function summarizeSchema(schema) {
    if (!schema || typeof schema !== "object") return undefined;
    const out = {};
    if (schema.type) out.type = schema.type;
    if (schema.enum) out.enum = schema.enum;
    if (schema.default !== undefined) out.default = schema.default;
    if (schema.format) out.format = schema.format;
    if (schema.type === "array" && schema.items) out.items = summarizeSchema(schema.items);
    return out;
}

function summarizeParameters(parameters) {
    if (!Array.isArray(parameters)) return undefined;
    const summarized = parameters
        .filter(p => p && p.name && p.in)
        .map(p => ({
            name: p.name,
            in: p.in,
            required: Boolean(p.required),
            description: truncate(p.description, 200),
            schema: summarizeSchema(p.schema),
        }));
    return summarized.length ? summarized : undefined;
}

function summarizeRequestBody(requestBody) {
    if (!requestBody || typeof requestBody !== "object") return undefined;
    const content = requestBody.content;
    if (!content) return undefined;
    // e621's write endpoints are exclusively form-urlencoded; fall back to the first content type present.
    const contentType = content["application/x-www-form-urlencoded"] ? "application/x-www-form-urlencoded" : Object.keys(content)[0];
    if (!contentType) return undefined;
    const schema = content[contentType]?.schema;
    if (!schema || schema.type !== "object") {
        return { contentType, required: Boolean(requestBody.required) };
    }
    const properties = schema.properties ?? {};
    const requiredFields = new Set(schema.required ?? []);
    const fields = Object.entries(properties).map(([name, propSchema]) => ({
        name,
        required: requiredFields.has(name),
        description: truncate(propSchema?.description, 200),
        ...summarizeSchema(propSchema),
    }));
    return {
        contentType,
        required: Boolean(requestBody.required),
        fields: fields.length ? fields : undefined,
    };
}

function main() {
    const raw = readFileSync(SPEC_PATH, "utf8");
    const spec = parse(raw);
    const operations = [];

    for (const [rawPath, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const method of METHODS) {
            const op = pathItem[method];
            if (!op || typeof op !== "object") continue;

            const requiresAuth = Array.isArray(op.security) && op.security.length > 0
                ? op.security.some(s => Object.keys(s).length > 0)
                : false;

            operations.push({
                operationId: op.operationId ?? `${method}_${rawPath}`,
                method: method.toUpperCase(),
                path: rawPath,
                summary: op.summary,
                description: truncate(op.description),
                tags: op.tags ?? [],
                requiresAuth,
                parameters: summarizeParameters(op.parameters),
                requestBody: summarizeRequestBody(op.requestBody),
            });
        }
    }

    operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
    writeFileSync(OUT_PATH, JSON.stringify(operations), "utf8");
    console.log(`Wrote ${operations.length} operations to ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
