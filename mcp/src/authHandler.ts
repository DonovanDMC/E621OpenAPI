import { verifyE621Credentials } from "./e621Client.js";
import authorizeStyles from "./templates/authorize.css";
import authorizeTemplate from "./templates/authorize.html";

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

function renderTemplate(template: string, values: Record<string, string>): string {
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

function stylesheetHref(url: URL): string {
    return url.pathname.startsWith("/mcp/") ? "/mcp/application.css" : "/authorize.css";
}

function authorizePage({ clientName, errorMessage, oauthReqInfo, stylesheetHref, username = "" }: {
    clientName: string;
    errorMessage?: string;
    oauthReqInfo: string;
    stylesheetHref: string;
    username?: string;
}): Response {
    const html = renderTemplate(authorizeTemplate, {
        clientName: escapeHtml(clientName),
        errorHtml: errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : "",
        oauthReqInfo: escapeHtml(oauthReqInfo),
        stylesheetHref: escapeHtml(stylesheetHref),
        username: escapeHtml(username),
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
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
    const clientInfo = await env.OAUTH_PROVIDER.lookupClient(String(oauthReqInfo.clientId));
    const clientName = clientInfo?.clientName ?? "An MCP client";
    const state = btoa(JSON.stringify(oauthReqInfo));

    return authorizePage({ clientName, oauthReqInfo: state, stylesheetHref: stylesheetHref(url) });
}

async function handleAuthorizePost(request: Request, env: Env, url: URL): Promise<Response> {
    const form = await request.formData();
    const encodedReqInfo = form.get("oauthReqInfo");
    const username = form.get("username");
    const apiKey = form.get("apiKey");

    if (typeof encodedReqInfo !== "string" || typeof username !== "string" || typeof apiKey !== "string") {
        return authorizePage({
            clientName: "e621 MCP Server",
            errorMessage: "Malformed request. Go back and try again.",
            oauthReqInfo: "",
            stylesheetHref: stylesheetHref(url),
        });
    }

    const oauthReqInfo = JSON.parse(atob(encodedReqInfo)) as Record<string, unknown>;
    const user = await verifyE621Credentials(env, { username, apiKey });

    if (!user) {
        const state = btoa(JSON.stringify(oauthReqInfo));
        return authorizePage({
            clientName: "e621 MCP Server",
            errorMessage: "Those credentials didn't work. Double-check your username and API key.",
            oauthReqInfo: state,
            stylesheetHref: stylesheetHref(url),
            username,
        });
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

        if ((url.pathname === "/authorize" || url.pathname === "/mcp/authorize") && request.method === "GET") {
            return handleAuthorizeGet(request, env, url);
        }
        if ((url.pathname === "/authorize" || url.pathname === "/mcp/authorize") && request.method === "POST") {
            return handleAuthorizePost(request, env, url);
        }
        if ((url.pathname === "/authorize.css" || url.pathname === "/mcp/application.css") && request.method === "GET") {
            return authorizeStylesheet();
        }
        // "/" and "/mcp" are both claimed by the MCP apiHandlers (see index.ts) — an
        // unauthenticated request there gets OAuthProvider's 401 challenge directly,
        // never reaching this defaultHandler.
        return new Response("Not found", { status: 404 });
    },
};
