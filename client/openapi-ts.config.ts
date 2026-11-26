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
        {
            name: "@hey-api/typescript",
            // keep schema type names matching the spec (e.g. `APIKey`, not `ApiKey`)
            definitions: { case: "preserve" },
            // this would apply to all enums
            // enums: { mode: "typescript", case: "SCREAMING_SNAKE_CASE" }
        },
        "@hey-api/sdk",
        "@hey-api/schemas",
        "@hey-api/client-fetch",
    ],
});
