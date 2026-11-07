/**
 * MCP over HTTP on 127.0.0.1 only. FastAPI proxies https://peral.top/mcp here.
 * Each request uses the caller's token. No shared server key.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WebtoolsClient } from "./client.js";
import { createMcpServer } from "./server.js";
import { createAdminMcpServer } from "./admin-server.js";

const apiBase = (process.env.WEBTOOLS_API_URL || "http://127.0.0.1:8010").replace(/\/$/, "");
const port = Number(process.env.MCP_HTTP_PORT || 8011);
const host = "127.0.0.1";

function callerToken(req: IncomingMessage): string {
  const raw = req.headers["x-mcp-key"];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (header?.trim()) return header.trim();
  const auth = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)/i.exec(Array.isArray(auth) ? auth[0] : auth);
  return match?.[1]?.trim() || "";
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
}

const http = createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path !== "/mcp" && path !== "/mcp-admin") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Authorization, Content-Type, X-MCP-Key, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    });
    res.end();
    return;
  }
  const token = callerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "Missing MCP token. Send Authorization: Bearer <token>." });
    return;
  }

  const client = new WebtoolsClient(apiBase, token);
  const mcp = path === "/mcp-admin" ? createAdminMcpServer(client) : createMcpServer(client);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "MCP request failed" });
  }
});

http.listen(port, host, () => {
  console.error(`Peral MCP HTTP on http://${host}:${port}/mcp → ${apiBase}`);
});
