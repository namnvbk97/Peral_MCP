/**
 * CLI: call an MCP tool through the real server (stdio), using the env from ~/.cursor/mcp.json.
 *   npx tsx scripts/call.ts <open-designer|peral-admin> <tool> '<json args>'
 *   npx tsx scripts/call.ts open-designer --list
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [server, tool, rawArgs] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(join(homedir(), ".cursor", "mcp.json"), "utf8")).mcpServers[server];
if (!cfg) throw new Error(`no server ${server} in ~/.cursor/mcp.json`);
const script = cfg.args[cfg.args.length - 1];
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", script],
  cwd: cfg.cwd,
  env: { ...(process.env as Record<string, string>), ...cfg.env },
  stderr: "ignore",
});
const client = new Client({ name: "cli", version: "0" });
await client.connect(transport);
if (tool === "--list") {
  const { tools } = await client.listTools();
  for (const t of tools) console.log(t.name, "-", (t.description ?? "").split("\n")[0].slice(0, 110));
} else {
  // '@path/to/args.json' reads the arguments from a file (long option lists overflow the Windows command line)
  const argText = rawArgs?.startsWith("@") ? readFileSync(rawArgs.slice(1), "utf8") : rawArgs;
  const res = await client.callTool({ name: tool, arguments: argText ? JSON.parse(argText) : {} }, undefined, { timeout: 600000 });
  for (const c of res.content as any[]) console.log(c.type === "text" ? c.text : `[${c.type}]`);
}
await client.close();
