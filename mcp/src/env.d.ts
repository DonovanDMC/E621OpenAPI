interface Env {
    E621_API_BASE: string;
    E621_PROXY_BASE?: string;
    E621_PROXY_TOKEN?: string;
    E621_USER_AGENT: string;
    MCP_OBJECT: DurableObjectNamespace;
    OAUTH_KV: KVNamespace;
}

declare module "*.html" {
    const template: string;
    export default template;
}

declare module "*.css" {
    const stylesheet: string;
    export default stylesheet;
}
