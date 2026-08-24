import { verifyE621Credentials } from "./e621Client.js";

import type { E621Env } from "./e621Client.js";

interface OAuthHelpers {
    completeAuthorization(options: {
        metadata: Record<string, unknown>;
        props: Record<string, unknown>;
        request: Record<string, unknown>;
        scope: Array<string>;
        userId: string;
    }): Promise<{ redirectTo: string }>;
    lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
    parseAuthRequest(request: Request): Promise<Record<string, unknown>>;
}

interface Env extends E621Env {
    OAUTH_PROVIDER: OAuthHelpers;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

function page(body: string): Response {
    return new Response(
        `<!doctype html><html><head><meta charset="utf-8"><title>e621 MCP Server</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}
input{display:block;width:100%;padding:.5rem;margin:.25rem 0 1rem;box-sizing:border-box}
button{padding:.5rem 1.5rem;background:#2b6cb0;color:#fff;border:none;border-radius:4px;cursor:pointer}
.error{color:#c53030;margin-bottom:1rem}
.hint{color:#666;font-size:.875rem}
</style></head><body>${body}</body></html>`,
        { headers: { "content-type": "text/html; charset=utf-8" } },
    );
}

async function handleAuthorizeGet(request: Request, env: Env): Promise<Response> {
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const clientInfo = await env.OAUTH_PROVIDER.lookupClient(String(oauthReqInfo.clientId));
    const clientName = clientInfo?.clientName ? escapeHtml(clientInfo.clientName) : "An MCP client";
    const state = btoa(JSON.stringify(oauthReqInfo));

    return page(`
<h1>Connect your e621 account</h1>
<p><strong>${clientName}</strong> wants to use your e621 account to call the e621 API on your behalf.</p>
<p class="hint">Your API key is available at <a href="https://e621.net/users/home" target="_blank" rel="noopener">e621.net → My Account</a>. It is stored only to authorize this connector session and is sent solely to e621.net.</p>
<form method="POST" action="/authorize">
  <input type="hidden" name="oauthReqInfo" value="${state}">
  <label>e621 username</label>
  <input type="text" name="username" autocomplete="username" required>
  <label>e621 API key</label>
  <input type="password" name="apiKey" autocomplete="current-password" required>
  <button type="submit">Authorize</button>
</form>
`);
}

async function handleAuthorizePost(request: Request, env: Env): Promise<Response> {
    const form = await request.formData();
    const encodedReqInfo = form.get("oauthReqInfo");
    const username = form.get("username");
    const apiKey = form.get("apiKey");

    if (typeof encodedReqInfo !== "string" || typeof username !== "string" || typeof apiKey !== "string") {
        return page(`<h1>Connect your e621 account</h1><p class="error">Malformed request. Go back and try again.</p>`);
    }

    const oauthReqInfo = JSON.parse(atob(encodedReqInfo)) as Record<string, unknown>;
    const user = await verifyE621Credentials(env, { username, apiKey });

    if (!user) {
        const state = btoa(JSON.stringify(oauthReqInfo));
        return page(`
<h1>Connect your e621 account</h1>
<p class="error">Those credentials didn't work. Double-check your username and API key.</p>
<form method="POST" action="/authorize">
  <input type="hidden" name="oauthReqInfo" value="${state}">
  <label>e621 username</label>
  <input type="text" name="username" value="${escapeHtml(username)}" autocomplete="username" required>
  <label>e621 API key</label>
  <input type="password" name="apiKey" autocomplete="current-password" required>
  <button type="submit">Authorize</button>
</form>
`);
    }

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: String(user.id),
        scope: Array.isArray(oauthReqInfo.scope) ? oauthReqInfo.scope as Array<string> : [],
        metadata: { username: user.name },
        props: { e621Username: user.name, e621ApiKey: apiKey },
    });

    return Response.redirect(redirectTo, 302);
}

export const authHandler = {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/authorize" && request.method === "GET") {
            return handleAuthorizeGet(request, env);
        }
        if (url.pathname === "/authorize" && request.method === "POST") {
            return handleAuthorizePost(request, env);
        }
        // "/" and "/mcp" are both claimed by the MCP apiHandlers (see index.ts) — an
        // unauthenticated request there gets OAuthProvider's 401 challenge directly,
        // never reaching this defaultHandler.
        return new Response("Not found", { status: 404 });
    },
};
