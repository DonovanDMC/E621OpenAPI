# e621 MCP server

A remote MCP server that exposes the [e621.net](https://e621.net) API — as documented by [`../openapi.yaml`](../openapi.yaml) — as tools for Claude and other MCP clients.

Rather than one tool per endpoint (345 operations would flood the context window), this uses a **search + execute** pattern:

- `search_e621_operations` — keyword search over the whole API catalog, returns matching operations with their parameter/body schemas.
- `e621_get` — calls a read-only (GET) operation by `operationId`.
- `e621_write` — calls a mutating (POST/PUT/PATCH/DELETE) operation by `operationId`.

The catalog (`src/operations.json`) is generated at build time from `../openapi.dereferenced.yaml` — it is not committed, run `npm run build:catalog` (or just `npm run dev` / `npm run deploy`, which do it automatically) after pulling spec changes.

The server answers at two mount points — `https://mcp.e621.wiki` (root) and `https://e621.wiki/mcp` (a path on the existing site) — registered as two exact entries in `OAuthProvider`'s `apiHandlers` map (see `src/index.ts`).

## Auth

e621 has no OAuth — API access is HTTP Basic auth with a username + personal API key (from *e621.net → My Account*). Since this server is meant to be added by anyone as a shared connector, it runs its **own** OAuth authorization server (via `@cloudflare/workers-oauth-provider`) whose "login" step is a small form asking for that username + API key. The key is verified against `GET /users/me.json` through the internal `E621_PROXY_BASE` when configured and then carried as MCP `props` for the session — it's never persisted outside the OAuth grant record in `OAUTH_KV`.

If you only want this for yourself, it's simpler to skip the OAuth flow entirely and hardcode credentials from `wrangler secret` — see `references/auth.md`'s "Tier 1" pattern in the `build-mcp-server` skill if you want to swap to that.

## Setup

```bash
npm install
npx wrangler kv namespace create OAUTH_KV
# paste the returned id into wrangler.toml's [[kv_namespaces]] id
```

`wrangler.toml`'s `[[routes]]` bind the Worker to both `mcp.e621.wiki` (a Cloudflare Custom Domain — claims the whole subdomain) and `e621.wiki/mcp*` (a path-scoped route on the existing zone, leaving the rest of `e621.wiki` served by whatever already serves it). Both require the `e621.wiki` zone to be on the same Cloudflare account as the Worker; `wrangler deploy` provisions the DNS record/certificate for the custom domain automatically.

## Develop

```bash
npm run dev   # regenerates the catalog, then wrangler dev on http://localhost:8787/mcp
```

## Deploy

```bash
npm run deploy
```

Once deployed, add `https://mcp.e621.wiki` or `https://e621.wiki/mcp` as a custom connector in Claude — both point at the same server.

## Lint / typecheck

```bash
cd .. && npx eslint mcp/src   # reuses the repo root's eslint config
cd mcp && npm run typecheck
```
