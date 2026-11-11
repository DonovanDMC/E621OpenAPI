import { e621BaseUrl, e621Headers, type E621Env } from "./e621Client.js";

export interface E621OAuthEnv extends E621Env {
    E621_OAUTH_CLIENT_ID: string;
    E621_OAUTH_CLIENT_SECRET: string;
}

export interface E621Identity {
    id: number;
    name: string;
}

interface TokenResponse {
    access_token: string;
}

interface UserInfo {
    preferred_username?: string;
    sub?: string;
}

export class E621OAuthError extends Error {
    override name = "E621OAuthError";
}

// The browser goes to e621 directly; only server-side calls go through the proxy.
const AUTHORIZE_URL = "https://e621.net/oauth/authorize";
// Identity only. `full` would let the token act on the user's behalf through the API.
const SCOPE = "openid profile";

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function randomToken(): string {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function codeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
}

export async function authorizeUrl(env: E621OAuthEnv, { redirectUri, state, codeVerifier }: {
    codeVerifier: string;
    redirectUri: string;
    state: string;
}): Promise<string> {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", env.E621_OAUTH_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", await codeChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
}

// e621 only puts its claims in userinfo, not the id_token.
async function fetchIdentity(env: E621OAuthEnv, accessToken: string): Promise<E621Identity> {
    const response = await fetch(new URL("/oauth/userinfo", e621BaseUrl(env)), {
        headers: e621Headers(env, {
            "User-Agent": env.E621_USER_AGENT,
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
        }),
    });
    if (!response.ok) throw new E621OAuthError(`e621 userinfo request failed (${response.status}): ${await response.text()}`);

    const info = await response.json<UserInfo>();
    const id = Number(info.sub);
    if (!Number.isInteger(id) || !info.preferred_username) throw new E621OAuthError("e621 userinfo is missing the user's id or name");
    return { id, name: info.preferred_username };
}

export async function exchangeCode(env: E621OAuthEnv, { code, codeVerifier, redirectUri }: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<E621Identity> {
    const response = await fetch(new URL("/oauth/token", e621BaseUrl(env)), {
        method: "POST",
        headers: e621Headers(env, {
            "User-Agent": env.E621_USER_AGENT,
            "Accept": "application/json",
            "Authorization": `Basic ${btoa(`${env.E621_OAUTH_CLIENT_ID}:${env.E621_OAUTH_CLIENT_SECRET}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
        }),
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
        }).toString(),
    });
    if (!response.ok) throw new E621OAuthError(`e621 token request failed (${response.status}): ${await response.text()}`);

    const { access_token: accessToken } = await response.json<TokenResponse>();
    return fetchIdentity(env, accessToken);
}
