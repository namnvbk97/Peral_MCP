/**
 * TEAM — shop members (owner / admin / editor) and Gmail invites.
 * Acts as the MCP user: only shops that user belongs to; invite / change / remove needs owner or admin.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText } from "./common.js";

const enc = encodeURIComponent;

export function registerTeamTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_list_members",
    "List members (email, role) and pending invites of a shop. Roles: owner > admin (Quản lý: everything + members) > designer (catalog + print check) · ops (orders, fulfilment, shipping, Shop Settings) · support (order content + print check) · accountant (read-only) · editor (old all-round member).",
    { store_id: z.string().describe("Shop id, e.g. garby (see od_list_stores)") },
    async ({ store_id }) => jsonText(await api.get(`/stores/${enc(store_id)}/members`)),
  );

  server.tool(
    "od_invite_member",
    "Invite a Gmail address to a shop. If that email already has a CreTip account it joins right away; otherwise it joins on first Google sign-in. Returns an invite link to share.",
    {
      store_id: z.string(),
      email: z.string().email(),
      role: z.enum(["admin", "designer", "ops", "support", "accountant", "editor"]).default("editor"),
    },
    async ({ store_id, email, role }) =>
      jsonText(await api.post(`/stores/${enc(store_id)}/members/invite`, { email, role })),
  );

  server.tool(
    "od_update_member",
    "Change a member's role. member = userId or email. role owner transfers ownership (owner only; old owner becomes admin).",
    {
      store_id: z.string(),
      member: z.string().describe("userId or email"),
      role: z.enum(["owner", "admin", "designer", "ops", "support", "accountant", "editor"]),
    },
    async ({ store_id, member, role }) =>
      jsonText(await api.patch(`/stores/${enc(store_id)}/members/${enc(member)}`, { role })),
  );

  server.tool(
    "od_remove_member",
    "Remove a member from a shop (admin/owner), leave it (member = yourself), or revoke a pending invite (pass invite_id instead).",
    {
      store_id: z.string(),
      member: z.string().optional().describe("userId or email"),
      invite_id: z.string().optional().describe("Pending invite id (inv-…) to revoke"),
    },
    async ({ store_id, member, invite_id }) => {
      if (invite_id) {
        return jsonText(await api.delete(`/stores/${enc(store_id)}/members/invites/${enc(invite_id)}`));
      }
      if (!member) throw new Error("member or invite_id is required");
      return jsonText(await api.delete(`/stores/${enc(store_id)}/members/${enc(member)}`));
    },
  );
}
