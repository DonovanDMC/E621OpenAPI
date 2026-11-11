import { authorizeUrl, exchangeCode, randomToken, type E621OAuthEnv } from "./e621OAuth.js";
import authorizeStyles from "./templates/authorize.css";
import authorizeTemplate from "./templates/authorize.html";

import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

interface Env extends E621OAuthEnv {
    OAUTH_KV: KVNamespace;
    OAUTH_PROVIDER: OAuthHelpers;
}

interface PendingAuthorization {
    codeVerifier: string;
    oauthReqInfo: AuthRequest;
}

const STATE_COOKIE = "e621_mcp_state";
const STATE_TTL = 600;

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

function renderTemplate(template: string, values: Record<string, string>): string {
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

function callbackUrl(url: URL): string {
    return `${url.origin}/callback`;
}

function stateCookie(value: string, maxAge: number): string {
    return `${STATE_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function readStateCookie(request: Request): string | undefined {
    for (const part of request.headers.get("cookie")?.split(";") ?? []) {
        const [name, ...value] = part.trim().split("=");
        if (name === STATE_COOKIE) return value.join("=");
    }
    return undefined;
}

function errorPage(url: URL, message: string, status = 400): Response {
    const html = renderTemplate(authorizeTemplate, {
        stylesheetHref: "/authorize.css",
        body: `<h1>Couldn't connect your e621 account</h1><p class="error">${escapeHtml(message)}</p><p class="hint">Go back to your MCP client and try connecting again.</p>`,
    });
    return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function consentPage(url: URL, { clientName, redirectHost, state }: { clientName: string; redirectHost: string; state: string }): Response {
    const html = renderTemplate(authorizeTemplate, {
        stylesheetHref: "/authorize.css",
        body: `<h1>Connect your e621 account</h1>
  <p><strong>${escapeHtml(clientName)}</strong> wants to connect to the e621 MCP server. e621 will confirm who you are; the server can't act as you, and only makes anonymous, read-only API calls.</p>
  <p class="hint">After approving, you'll be sent back to <strong>${escapeHtml(redirectHost)}</strong>. Only continue if you started this from a client you trust.</p>
  <form method="POST" action="/authorize">
    <input type="hidden" name="state" value="${escapeHtml(state)}">
    <button type="submit">Continue to e621</button>
  </form>`,
    });
    return new Response(html, {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "set-cookie": stateCookie(state, STATE_TTL),
        },
    });
}

function authorizeStylesheet(): Response {
    return new Response(authorizeStyles, {
        headers: {
            "cache-control": "public, max-age=3600",
            "content-type": "text/css; charset=utf-8",
        },
    });
}

async function handleAuthorizeGet(request: Request, env: Env, url: URL): Promise<Response> {
    const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    const clientInfo = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
    if (!clientInfo) return errorPage(url, "Unknown MCP client.");

    // The pending request lives in KV so the browser only ever holds an opaque state value.
    const state = randomToken();
    const pending: PendingAuthorization = { oauthReqInfo, codeVerifier: randomToken() };
    await env.OAUTH_KV.put(`e621_auth:${state}`, JSON.stringify(pending), { expirationTtl: STATE_TTL });

    return consentPage(url, {
        clientName: clientInfo.clientName ?? "An MCP client",
        redirectHost: new URL(oauthReqInfo.redirectUri).host,
        state,
    });
}

async function handleAuthorizePost(request: Request, env: Env, url: URL): Promise<Response> {
    const form = await request.formData();
    const state = form.get("state");
    if (typeof state !== "string" || state !== readStateCookie(request)) {
        return errorPage(url, "This authorization request is invalid or has expired.");
    }

    const pending = await env.OAUTH_KV.get<PendingAuthorization>(`e621_auth:${state}`, "json");
    if (!pending) return errorPage(url, "This authorization request has expired.");

    return Response.redirect(await authorizeUrl(env, {
        redirectUri: callbackUrl(url),
        state,
        codeVerifier: pending.codeVerifier,
    }), 302);
}

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
    const state = url.searchParams.get("state");
    if (!state || state !== readStateCookie(request)) {
        return errorPage(url, "This authorization request is invalid or has expired.");
    }

    const key = `e621_auth:${state}`;
    const pending = await env.OAUTH_KV.get<PendingAuthorization>(key, "json");
    if (!pending) return errorPage(url, "This authorization request has expired.");
    await env.OAUTH_KV.delete(key);

    const upstreamError = url.searchParams.get("error");
    if (upstreamError) {
        return errorPage(url, url.searchParams.get("error_description") ?? `e621 denied the request (${upstreamError}).`);
    }
    const code = url.searchParams.get("code");
    if (!code) return errorPage(url, "e621 didn't return an authorization code.");

    let user;
    try {
        user = await exchangeCode(env, { code, codeVerifier: pending.codeVerifier, redirectUri: callbackUrl(url) });
    } catch (error) {
        console.error("e621 code exchange failed:", error instanceof Error ? error.message : error);
        return errorPage(url, "e621 rejected the authorization. Try again.", 502);
    }

    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: pending.oauthReqInfo,
        userId: String(user.id),
        scope: pending.oauthReqInfo.scope,
        metadata: { username: user.name },
        props: { e621UserId: user.id, e621Username: user.name },
    });

    return new Response(null, {
        status: 302,
        headers: { "location": redirectTo, "set-cookie": stateCookie("", 0) },
    });
}

export const authHandler = {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const { pathname } = url;

        if (pathname === "/authorize" && request.method === "GET") return handleAuthorizeGet(request, env, url);
        if (pathname === "/authorize" && request.method === "POST") return handleAuthorizePost(request, env, url);
        if (pathname === "/callback" && request.method === "GET") return handleCallback(request, env, url);
        if (pathname === "/authorize.css" && request.method === "GET") return authorizeStylesheet();
        // "/" and "/mcp*" are claimed by the MCP apiHandlers (see index.ts), so this only
        // ever sees requests on mcp.e621.wiki.
        return new Response("Not found", { status: 404 });
    },
};
