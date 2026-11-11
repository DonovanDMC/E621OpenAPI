# e621 MCP server

A remote MCP server that exposes the [e621.net](https://e621.net) API — as documented by [`../openapi.yaml`](../openapi.yaml) — as tools for Claude and other MCP clients.

Rather than one tool per endpoint (345 operations would flood the context window), this uses a **search + execute** pattern:

- `search_e621_operations` — keyword search over the whole API catalog, returns matching operations with their parameter/body schemas.
- `e621_get` — calls a public read-only (GET) operation by `operationId`.

Calls are made anonymously, so only operations that don't need authentication are exposed (filtered in `src/catalog.ts`).

The catalog (`src/operations.json`) is generated at build time from `../openapi.dereferenced.yaml` — it is not committed, run `npm run build:catalog` (or just `npm run dev` / `npm run deploy`, which do it automatically) after pulling spec changes.

The server answers at two mount points — `https://mcp.e621.wiki` (root) and `https://e621.wiki/mcp` (a path on the existing site) — both registered in `OAuthProvider`'s `apiHandlers` map (see `src/index.ts`). The OAuth endpoints only live on `mcp.e621.wiki`: the protected resource metadata for `e621.wiki/mcp` names `https://mcp.e621.wiki` as its authorization server, so nothing besides `/mcp*` and `/.well-known/oauth-protected-resource/mcp*` is claimed on `e621.wiki`.

## Auth

MCP clients need dynamic client registration, which e621 doesn't offer, so this server runs its **own** OAuth authorization server (via `@cloudflare/workers-oauth-provider`) and uses an e621 OAuth application to sign users in:

1. `/authorize` shows a consent page naming the MCP client and where it will redirect, then sends the user to `https://e621.net/oauth/authorize` (authorization code + PKCE, `openid profile` scope).
2. `/callback` exchanges the code at `/oauth/token` and reads the user's id and name from `/oauth/userinfo` (e621 doesn't put those claims in the `id_token`). Only those are stored in the grant; the e621 token itself is discarded.

The `full` scope is never requested, so the server can't act on anyone's behalf; OAuth only identifies who connected.

Server-side e621 calls (the token exchange and API calls) go through `E621_PROXY_BASE`, since e621 blocks Workers.

The e621 OAuth application needs `https://mcp.e621.wiki/callback` as its redirect URI.

## Setup

```bash
npm install
npx wrangler kv namespace create OAUTH_KV
# paste the returned id into wrangler.toml's [[kv_namespaces]] id
npx wrangler secret put E621_OAUTH_CLIENT_ID
npx wrangler secret put E621_OAUTH_CLIENT_SECRET
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
