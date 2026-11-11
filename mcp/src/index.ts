import { GrantType, OAuthError, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

import { authHandler } from "./authHandler.js";
import { getOperation, searchOperations } from "./catalog.js";
import { callE621, E621RequestError } from "./e621Client.js";

const DOCS_URL = "https://e621.wiki";
const MAX_RESPONSE_CHARS = 12_000;

// Extends Record<string, unknown> (rather than a bare object shape) so this satisfies
// McpAgent's Props generic constraint, which requires an index signature.
interface Props extends Record<string, unknown> {
    e621UserId: number;
    e621Username: string;
}
type State = Record<string, never>;

function truncatedJson(value: unknown): string {
    const text = JSON.stringify(value, null, 2);
    if (text.length <= MAX_RESPONSE_CHARS) return text;
    return `${text.slice(0, MAX_RESPONSE_CHARS)}\n… truncated (${text.length} chars total). Narrow your query (e.g. smaller "limit", more specific "tags") to see everything.`;
}

// Extends Record<string, unknown> to match the MCP SDK's CallToolResult shape, which
// carries an index signature for forward-compatible fields.
interface ToolErrorResult extends Record<string, unknown> {
    content: Array<{ text: string; type: "text" }>;
    isError: true;
}

function operationNotFound(operationId: string): ToolErrorResult {
    return {
        isError: true,
        content: [{
            type: "text",
            text: `No e621 API operation with id "${operationId}". Use search_e621_operations to find a valid operationId.`,
        }],
    };
}

// agents 0.21 deprecates the stateful McpAgent in favor of a stateless createMcpHandler;
// not migrated yet.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export class E621MCP extends McpAgent<Env, State, Props> {
    server = new McpServer(
        { name: "e621-mcp-server", version: "0.1.0" },
        {
            instructions:
                "Wraps the public, read-only parts of the e621.net API (documented at https://e621.wiki). Calls are made "
                + "anonymously. Call search_e621_operations first to find the right operationId and its parameters, "
                + "then call e621_get with that operationId.",
        },
    );

    async init(): Promise<void> {
        this.server.registerTool(
            "search_e621_operations",
            {
                title: "Search e621 API operations",
                description:
                    `Search the e621.net API catalog by keyword (e.g. "search posts by tag", "create favorite", `
                    + `"list pools", "get wiki page") to find the right operation before calling e621_get. Only public read-only operations are available. `
                    + `Matches against operation names, summaries, tags, and paths. Returns each match's operationId, `
                    + `path, and the parameters needed to call it. Full API reference: ${DOCS_URL}`,
                inputSchema: {
                    query: z.string().describe("Keywords describing the action you want to perform."),
                    limit: z.number().int().min(1).max(20).default(8).describe("Maximum number of matches to return."),
                },
                annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
            },
            async ({ query, limit }) => {
                const results = searchOperations(query, limit);
                if (results.length === 0) {
                    return {
                        content: [{
                            type: "text",
                            text: `No operations matched "${query}". Try broader or different keywords, or browse ${DOCS_URL} directly.`,
                        }],
                    };
                }
                return { content: [{ type: "text", text: truncatedJson(results) }] };
            },
        );

        this.server.registerTool(
            "e621_get",
            {
                title: "Call an e621 GET endpoint",
                description:
                    `Call a public, read-only e621.net API operation by its operationId (find one via `
                    + `search_e621_operations first). Calls are made anonymously. Full API reference: ${DOCS_URL}`,
                inputSchema: {
                    operationId: z.string().describe("The operationId from search_e621_operations, e.g. \"posts#index\"."),
                    pathParams: z.record(z.string(), z.union([z.string(), z.number()])).optional()
                        .describe("Values for any {placeholders} in the operation's path, e.g. { \"id\": 12345 }."),
                    queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
                        .describe("Query string parameters for the operation, e.g. { \"tags\": \"rating:safe\", \"limit\": 20 }."),
                },
                annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
            },
            async ({ operationId, pathParams, queryParams }) => {
                const op = getOperation(operationId);
                if (!op) return operationNotFound(operationId);

                try {
                    const { status, json } = await callE621({
                        env: this.env,
                        operation: op,
                        pathParams,
                        queryParams,
                    });
                    if (status >= 400) {
                        return { isError: true, content: [{ type: "text", text: `e621 responded ${status}: ${truncatedJson(json)}` }] };
                    }
                    return { content: [{ type: "text", text: truncatedJson(json) }] };
                } catch (error) {
                    if (error instanceof E621RequestError) {
                        return { isError: true, content: [{ type: "text", text: error.message }] };
                    }
                    throw error;
                }
            },
        );
    }
}

// The only host that serves the OAuth endpoints. e621.wiki/mcp points clients here
// instead of claiming /authorize, /token, etc. on the docs site.
const AUTHORIZATION_SERVER = "https://mcp.e621.wiki";

const provider = new OAuthProvider({
    // The same server answers both https://mcp.e621.wiki (a dedicated subdomain,
    // mounted at root) and https://e621.wiki/mcp (a single path on the existing site).
    apiHandlers: {
        "/mcp": E621MCP.serve("/mcp"),
        "/": E621MCP.serve("/"),
    },
    defaultHandler: authHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    clientIdMetadataDocumentEnabled: true,
    // Grants from the old API key login still hold the key; make those clients reconnect.
    tokenExchangeCallback({ grantType, props }: { grantType: GrantType; props: Partial<Props> }): undefined {
        if (grantType === GrantType.REFRESH_TOKEN && props.e621UserId === undefined) {
            throw new OAuthError("invalid_grant", { description: "Reconnect the connector to sign in with e621." });
        }
        return undefined;
    },
});

export default {
    async fetch(request: Request, env: Parameters<typeof provider.fetch>[1], ctx: ExecutionContext): Promise<Response> {
        const response = await provider.fetch(request, env, ctx);
        const url = new URL(request.url);
        if (url.hostname !== "e621.wiki" || !url.pathname.startsWith("/.well-known/oauth-protected-resource") || !response.ok) {
            return response;
        }

        // The provider would advertise https://e621.wiki as the issuer, which only routes /mcp* here.
        const metadata = await response.json<Record<string, unknown>>();
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(JSON.stringify({ ...metadata, authorization_servers: [AUTHORIZATION_SERVER] }), { status: response.status, headers });
    },
};
