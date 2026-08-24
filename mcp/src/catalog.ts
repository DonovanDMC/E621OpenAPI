import operations from "./operations.json";

export interface CatalogParameter {
    description?: string;
    in: string;
    name: string;
    required: boolean;
    schema?: Record<string, unknown>;
}

export interface CatalogRequestBodyField {
    default?: unknown;
    description?: string;
    enum?: Array<unknown>;
    name: string;
    required: boolean;
    type?: string;
}

export interface CatalogRequestBody {
    contentType: string;
    fields?: Array<CatalogRequestBodyField>;
    required: boolean;
}

export interface CatalogOperation {
    description?: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    operationId: string;
    parameters?: Array<CatalogParameter>;
    path: string;
    requestBody?: CatalogRequestBody;
    requiresAuth: boolean;
    summary?: string;
    tags: Array<string>;
}

const CATALOG = operations as Array<CatalogOperation>;
const BY_ID = new Map(CATALOG.map(op => [op.operationId, op]));

export function getOperation(operationId: string): CatalogOperation | undefined {
    return BY_ID.get(operationId);
}

export function listOperations(): Array<CatalogOperation> {
    return CATALOG;
}

function haystack(op: CatalogOperation): string {
    return [op.operationId, op.summary, op.description, op.path, ...op.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

/**
 * Small scored keyword search: every query token must appear somewhere in the
 * operation's searchable text; results are ranked by how many tokens hit the
 * high-value fields (operationId/summary/tags) vs. the low-value description.
 */
export function searchOperations(query: string, limit = 8): Array<CatalogOperation> {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return CATALOG.slice(0, limit);

    const scored: Array<{ op: CatalogOperation; score: number }> = [];
    for (const op of CATALOG) {
        const full = haystack(op);
        const strong = [op.operationId, op.summary ?? "", op.path, ...op.tags].join(" ").toLowerCase();
        let score = 0;
        let allMatched = true;
        for (const token of tokens) {
            if (strong.includes(token)) score += 2;
            else if (full.includes(token)) score += 1;
            else allMatched = false;
        }
        if (allMatched) scored.push({ op, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.op);
}
