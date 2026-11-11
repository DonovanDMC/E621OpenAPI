import type { CatalogOperation } from "./catalog.js";

export interface E621Env {
    E621_API_BASE: string;
    E621_PROXY_BASE?: string;
    E621_PROXY_TOKEN?: string;
    E621_USER_AGENT: string;
}

export class E621RequestError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export function e621BaseUrl(env: E621Env): string {
    return env.E621_PROXY_BASE ?? env.E621_API_BASE;
}

export function e621Headers(env: E621Env, headers: Record<string, string>): Record<string, string> {
    if (!env.E621_PROXY_BASE) return headers;
    if (!env.E621_PROXY_TOKEN) {
        throw new E621RequestError(500, "E621_PROXY_BASE is configured, but E621_PROXY_TOKEN is missing.");
    }
    return { ...headers, "X-E621-MCP-Proxy-Token": env.E621_PROXY_TOKEN };
}

function buildUrl(env: E621Env, operation: CatalogOperation, pathParams: Record<string, string | number>, queryParams: Record<string, string | number | boolean>): URL {
    let pathname = operation.path;
    for (const [key, value] of Object.entries(pathParams)) {
        pathname = pathname.replace(`{${key}}`, encodeURIComponent(String(value)));
    }
    if (pathname.includes("{")) {
        const missing = pathname.match(/\{[^}]+\}/g);
        throw new E621RequestError(400, `Missing required path parameter(s): ${missing?.join(", ")}`);
    }

    const url = new URL(pathname, e621BaseUrl(env));
    for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, String(value));
    }
    return url;
}

export interface CallE621Options {
    env: E621Env;
    operation: CatalogOperation;
    pathParams?: Record<string, string | number>;
    queryParams?: Record<string, string | number | boolean>;
}

export async function callE621({ env, operation, pathParams = {}, queryParams = {} }: CallE621Options): Promise<{ json: unknown; status: number }> {
    const url = buildUrl(env, operation, pathParams, queryParams);

    const headers: Record<string, string> = {
        "User-Agent": env.E621_USER_AGENT,
        "Accept": "application/json",
    };

    const response = await fetch(url, {
        method: operation.method,
        headers: e621Headers(env, headers),
    });

    const text = await response.text();
    let json: unknown = text;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        // Non-JSON response (rare on e621, e.g. custom_style.css) — surface as raw text.
    }

    return { json, status: response.status };
}
