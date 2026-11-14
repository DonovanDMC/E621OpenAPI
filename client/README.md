# e621-openapi

TypeScript types, JSON schemas, and a fetch-based SDK for the [e621.net](https://e621.net) API, generated with [@hey-api/openapi-ts](https://heyapi.dev) from the [E621OpenAPI](https://github.com/DonovanDMC/E621OpenAPI) spec. A new version is published every time the spec is updated.

<!-- spec-commit -->

Generated from the latest version of the spec.

<!-- /spec-commit -->

This is the raw generated code. For a higher level client, see [e621](https://www.npmjs.com/package/e621).

```ts
import { posts_index } from "e621-openapi";
import { client } from "e621-openapi/client";

client.setConfig({
    headers: {
        "User-Agent": "MyProject/1.0 (by username on e621)",
        // optional, see https://e621.wiki/authentication/
        Authorization: `Basic ${btoa("username:api_key")}`,
    },
});

const { data } = await posts_index({ query: { tags: "fox", limit: 10 } });
```

The spec the package was generated from can be fetched with `fetchSpec()`, which returns it as YAML. Pass `{ dereferenced: true }` for the version with every `$ref` inlined. The commit and URLs are exported as `specCommit`, `specURL`, and `dereferencedSpecURL`.

```ts
import { fetchSpec } from "e621-openapi";

const spec = await fetchSpec();
```

The generated files can also be imported on their own: `e621-openapi/types`, `e621-openapi/schemas`, `e621-openapi/sdk`, `e621-openapi/client`, and `e621-openapi/spec`.

Issues with endpoints, parameters, or response types should be reported to [E621OpenAPI](https://github.com/DonovanDMC/E621OpenAPI/issues).
