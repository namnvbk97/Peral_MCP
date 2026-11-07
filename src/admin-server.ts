#!/usr/bin/env node
/**
 * peral-admin MCP — website administration for Peral platform admins.
 * Separate from open-designer (shop work). Auth: Admin MCP token (adm_…) from /app/admin.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebtoolsClient } from "./client.js";
import { registerAdminTools } from "./tools/admin.js";
import { jsonText } from "./tools/common.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createAdminMcpServer(api: WebtoolsClient): McpServer {
  const server = new McpServer({ name: "peral-admin", version: "0.1.0" });

  server.tool(
    "od_admin_guide",
    "Read first: what the Peral admin MCP can do, and the rules (ask before deleting a shop or rotating tokens).",
    {},
    async () => ({
      content: [{ type: "text" as const, text: readFileSync(resolve(__dirname, "../AGENT-ADMIN.md"), "utf8") }],
    }),
  );

  server.tool(
    "od_admin_whoami",
    "Who this admin token acts as (must be a platform admin).",
    {},
    async () => jsonText(await api.get("/auth/user-info")),
  );

  registerAdminTools(server, api);
  return server;
}

function loadEnvFile(p: string): void {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env"));
  const baseUrl = (process.env.WEBTOOLS_API_URL || "http://127.0.0.1:8010").replace(/\/$/, "");
  const token = (process.env.PERAL_ADMIN_TOKEN || "").trim();
  if (!token) {
    console.error("Missing PERAL_ADMIN_TOKEN (Admin MCP token from /app/admin → Admin MCP).");
    process.exit(1);
  }
  const server = createAdminMcpServer(new WebtoolsClient(baseUrl, token));
  await server.connect(new StdioServerTransport());
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
