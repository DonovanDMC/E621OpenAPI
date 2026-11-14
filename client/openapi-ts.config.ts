import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
    input: "../openapi.yaml",
    output: {
        path: "src",
        importFileExtension: ".js",
        fileName: {
            suffix: null,
        },
    },
    plugins: [
        // keep schema type names matching the spec (e.g. `APIKey`, not `ApiKey`)
        { name: "@hey-api/typescript", definitions: { case: "preserve" } },
        "@hey-api/sdk",
        "@hey-api/schemas",
        "@hey-api/client-fetch",
    ],
});
