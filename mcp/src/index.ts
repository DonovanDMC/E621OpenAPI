import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

import { authHandler } from "./authHandler.js";
import { getOperation, searchOperations, type CatalogOperation } from "./catalog.js";
import { callE621, E621RequestError, type E621Credentials } from "./e621Client.js";

const DOCS_URL = "https://e621.wiki";
const MAX_RESPONSE_CHARS = 12_000;

// Extends Record<string, unknown> (rather than a bare object shape) so this satisfies
// McpAgent's Props generic constraint, which requires an index signature.
interface Props extends Record<string, unknown> {
    e621ApiKey: string;
    e621Username: string;
}
type State = Record<string, never>;

function credentialsFrom(props: Props | undefined): E621Credentials | undefined {
    if (!props?.e621Username || !props.e621ApiKey) return undefined;
    return { username: props.e621Username, apiKey: props.e621ApiKey };
}

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

function wrongToolForMethod(op: CatalogOperation, expectedReadOnly: boolean): ToolErrorResult {
    const rightTool = expectedReadOnly ? "e621_write" : "e621_get";
    return {
        isError: true,
        content: [{
            type: "text",
            text: `${op.operationId} is a ${op.method} operation; call it with ${rightTool} instead.`,
        }],
    };
}

// agents 0.21 deprecates the stateful McpAgent in favor of a stateless createMcpHandler;
// migrating would need reworking how OAuth props (the e621 credentials) reach tool
// handlers, which is out of scope here.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export class E621MCP extends McpAgent<Env, State, Props> {
    server = new McpServer(
        { name: "e621-mcp-server", version: "0.1.0" },
        {
            instructions:
                "Wraps the e621.net API (documented at https://e621.wiki). Call search_e621_operations first to find "
                + "the right operationId and its parameter/body schema, then call e621_get (read-only) or e621_write "
                + "(creates/modifies/deletes data) with that operationId.",
        },
    );

    async init(): Promise<void> {
        this.server.registerTool(
            "search_e621_operations",
            {
                title: "Search e621 API operations",
                description:
                    `Search the e621.net API catalog by keyword (e.g. "search posts by tag", "create favorite", `
                    + `"list pools", "get wiki page") to find the right operation before calling e621_get or e621_write. `
                    + `Matches against operation names, summaries, tags, and paths. Returns each match's operationId, `
                    + `HTTP method, path, and the parameter/request-body schema needed to call it. Full API reference: ${DOCS_URL}`,
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
                    `Call a read-only (GET) e621.net API operation by its operationId (find one via `
                    + `search_e621_operations first). Only works for GET operations — use e621_write for anything that `
                    + `creates, modifies, or deletes data. Full API reference: ${DOCS_URL}`,
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
                if (op.method !== "GET") return wrongToolForMethod(op, false);

                try {
                    const { status, json } = await callE621({
                        env: this.env,
                        operation: op,
                        credentials: credentialsFrom(this.props),
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

        this.server.registerTool(
            "e621_write",
            {
                title: "Call an e621 write endpoint",
                description:
                    `Call a mutating (POST/PUT/PATCH/DELETE) e621.net API operation by its operationId (find one via `
                    + `search_e621_operations first). This creates, modifies, or deletes real data on the connected e621 `
                    + `account (favorites, uploads, votes, flags, edits, etc.) — confirm with the user before calling. `
                    + `Use e621_get for read-only operations. Full API reference: ${DOCS_URL}`,
                inputSchema: {
                    operationId: z.string().describe("The operationId from search_e621_operations, e.g. \"favorites#create\"."),
                    pathParams: z.record(z.string(), z.union([z.string(), z.number()])).optional()
                        .describe("Values for any {placeholders} in the operation's path, e.g. { \"id\": 12345 }."),
                    queryParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
                        .describe("Query string parameters for the operation, if any."),
                    body: z.record(z.string(), z.unknown()).optional()
                        .describe("Request body fields per the operation's requestBody schema, e.g. { \"post_id\": 12345 }."),
                },
                annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
            },
            async ({ operationId, pathParams, queryParams, body }) => {
                const op = getOperation(operationId);
                if (!op) return operationNotFound(operationId);
                if (op.method === "GET") return wrongToolForMethod(op, true);

                try {
                    const { status, json } = await callE621({
                        env: this.env,
                        operation: op,
                        credentials: credentialsFrom(this.props),
                        pathParams,
                        queryParams,
                        body,
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

export default new OAuthProvider({
    // Registered at two exact paths so the same server answers both
    // https://mcp.e621.wiki (a dedicated subdomain, mounted at root) and
    // https://e621.wiki/mcp (a single path on the existing site).
    apiHandlers: {
        "/mcp": E621MCP.serve("/mcp"),
        "/": E621MCP.serve("/"),
    },
    defaultHandler: authHandler,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    clientIdMetadataDocumentEnabled: true,
});
