import type { CatalogOperation } from "./catalog.js";

export interface E621Credentials {
    apiKey: string;
    username: string;
}

export interface E621Env {
    E621_API_BASE: string;
    E621_USER_AGENT: string;
}

export class E621RequestError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

function basicAuthHeader(credentials: E621Credentials): string {
    return `Basic ${btoa(`${credentials.username}:${credentials.apiKey}`)}`;
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

    const url = new URL(pathname, env.E621_API_BASE);
    for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, String(value));
    }
    return url;
}

export interface CallE621Options {
    body?: Record<string, unknown>;
    credentials?: E621Credentials;
    env: E621Env;
    operation: CatalogOperation;
    pathParams?: Record<string, string | number>;
    queryParams?: Record<string, string | number | boolean>;
}

export async function callE621({ env, operation, credentials, pathParams = {}, queryParams = {}, body }: CallE621Options): Promise<{ json: unknown; status: number }> {
    const url = buildUrl(env, operation, pathParams, queryParams);

    const headers: Record<string, string> = {
        "User-Agent": env.E621_USER_AGENT,
        "Accept": "application/json",
    };
    if (operation.requiresAuth) {
        if (!credentials) {
            throw new E621RequestError(401, `${operation.operationId} requires authentication, but no e621 credentials are available for this session. Reconnect the connector and sign in.`);
        }
        headers.Authorization = basicAuthHeader(credentials);
    }

    let requestBody: string | undefined;
    if (body && Object.keys(body).length > 0) {
        const contentType = operation.requestBody?.contentType ?? "application/x-www-form-urlencoded";
        headers["Content-Type"] = contentType;
        if (contentType === "application/x-www-form-urlencoded") {
            const form = new URLSearchParams();
            for (const [key, value] of Object.entries(body)) {
                if (value === undefined || value === null) continue;
                if (typeof value === "object") {
                    form.set(key, JSON.stringify(value));
                } else {
                    // typeof already excludes plain objects/arrays (the only values that would
                    // stringify as the unhelpful default "[object Object]") — safe to call String().
                    // eslint-disable-next-line @typescript-eslint/no-base-to-string
                    form.set(key, String(value));
                }
            }
            requestBody = form.toString();
        } else {
            requestBody = JSON.stringify(body);
        }
    }

    const response = await fetch(url, {
        method: operation.method,
        headers,
        body: requestBody,
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

interface AvatarMenuResponse {
    id?: number;
    name?: string;
}

export async function verifyE621Credentials(env: E621Env, credentials: E621Credentials): Promise<{ id: number; name: string } | null> {
    const url = new URL("/users/avatar_menu.json", env.E621_API_BASE);
    const response = await fetch(url, {
        headers: {
            "User-Agent": env.E621_USER_AGENT,
            "Accept": "application/json",
            "Authorization": basicAuthHeader(credentials),
        },
    });
    if (!response.ok) return null;
    const data = await response.json<AvatarMenuResponse>();
    if (!data.name) return null;
    return { id: data.id ?? 0, name: data.name };
}
