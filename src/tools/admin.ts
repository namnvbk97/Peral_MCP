/**
 * PLATFORM ADMIN tools — Peral operators (ADMIN_EMAILS / is_admin).
 * A platform admin works in every shop; every od_* tool also accepts any store_id for them.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText } from "./common.js";

const enc = encodeURIComponent;
const ROLE = z.enum(["owner", "admin", "designer", "ops", "support", "accountant", "editor"]);

export function registerAdminTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_admin_overview",
    "ADMIN: platform overview — users, shops, artworks/campaigns/orders totals, trial limits, ADMIN_EMAILS.",
    {},
    async () => jsonText(await api.get("/admin/overview")),
  );

  server.tool(
    "od_admin_list_users",
    "ADMIN: every account (email, is_admin, platformAdmin, shops they belong to, artwork/campaign counts, usedToday).",
    {},
    async () => jsonText(await api.get("/admin/users")),
  );

  server.tool(
    "od_admin_set_user_admin",
    "ADMIN: grant / remove platform admin (is_admin: access to every shop, no trial limits). Cannot demote yourself or an email in ADMIN_EMAILS.",
    { user_id: z.number().int(), is_admin: z.boolean() },
    async ({ user_id, is_admin }) => jsonText(await api.patch(`/admin/users/${user_id}`, { isAdmin: is_admin })),
  );

  server.tool(
    "od_admin_reset_usage",
    "ADMIN: clear today's trial counters (renders / bgRemove / aiScenes) of one account.",
    { user_id: z.number().int() },
    async ({ user_id }) => jsonText(await api.post(`/admin/users/${user_id}/reset-usage`, {})),
  );

  server.tool(
    "od_admin_set_limits",
    "ADMIN: override trial limits. Keys: artworks, campaigns, renders, bgRemove, aiScenes. -1 = unlimited, 0 = off, null = back to .env default.",
    { limits: z.record(z.number().int().nullable()) },
    async ({ limits }) => jsonText(await api.put("/admin/limits", { limits })),
  );

  server.tool(
    "od_admin_list_stores",
    "ADMIN: every shop with owner, member count, artwork/campaign/order counts, MCP token present.",
    {},
    async () => jsonText(await api.get("/admin/stores")),
  );

  server.tool(
    "od_admin_get_store",
    "ADMIN: one shop — members, pending invites, MCP token (full secret).",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get(`/admin/stores/${enc(store_id)}`)),
  );

  server.tool(
    "od_admin_update_store",
    "ADMIN: rename a shop or turn it on/off (inactive shops disappear from shop pickers).",
    { store_id: z.string(), name: z.string().optional(), active: z.boolean().optional() },
    async ({ store_id, name, active }) => jsonText(await api.patch(`/admin/stores/${enc(store_id)}`, { name, active })),
  );

  server.tool(
    "od_admin_add_member",
    "ADMIN: add an email to a shop with a role (joins now if the account exists, else a pending invite). role owner transfers ownership.",
    { store_id: z.string(), email: z.string().email(), role: ROLE.default("editor") },
    async ({ store_id, email, role }) =>
      jsonText(await api.post(`/admin/stores/${enc(store_id)}/members`, { email, role })),
  );

  server.tool(
    "od_admin_set_member_role",
    "ADMIN: change a member's role in a shop (member = userId or email). role owner transfers ownership.",
    { store_id: z.string(), member: z.string(), role: ROLE },
    async ({ store_id, member, role }) =>
      jsonText(await api.patch(`/admin/stores/${enc(store_id)}/members/${enc(member)}`, { role })),
  );

  server.tool(
    "od_admin_remove_member",
    "ADMIN: remove a member from a shop (not the owner — transfer ownership first).",
    { store_id: z.string(), member: z.string() },
    async ({ store_id, member }) =>
      jsonText(await api.delete(`/admin/stores/${enc(store_id)}/members/${enc(member)}`)),
  );

  server.tool(
    "od_admin_rotate_store_token",
    "ADMIN: create or replace a shop's only MCP token (the old one stops working).",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.post(`/admin/stores/${enc(store_id)}/mcp-token`, {})),
  );

  server.tool(
    "od_admin_revoke_store_token",
    "ADMIN: revoke a shop's MCP token.",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.delete(`/admin/stores/${enc(store_id)}/mcp-token`)),
  );

  server.tool(
    "od_admin_delete_store",
    "ADMIN: move a shop to data/_trash (restorable). Without confirm=DELETE it only returns the plan. Ask the user first.",
    { store_id: z.string(), confirm: z.string().optional() },
    async ({ store_id, confirm }) =>
      jsonText(
        confirm === "DELETE"
          ? await api.delete(`/admin/stores/${enc(store_id)}?confirm=DELETE`)
          : await api.get(`/admin/stores/${enc(store_id)}/delete-plan`),
      ),
  );

  server.tool(
    "od_admin_usage",
    "ADMIN: today's trial usage plus artwork & campaign totals per account.",
    {},
    async () => jsonText(await api.get("/admin/usage")),
  );

  server.tool(
    "od_admin_site_status",
    "WEBSITE: health of peral.top — API, database, public URLs / CORS, built web app (builtAt), remote MCP reachable, which API keys are set (no secrets), storage size.",
    {},
    async () => jsonText(await api.get("/admin/site")),
  );

  server.tool(
    "od_admin_recent_activity",
    "WEBSITE: latest changed artworks / campaigns / orders across every shop (newest first). Optional store_id filter.",
    { limit: z.number().int().min(1).max(200).optional(), store_id: z.string().optional() },
    async ({ limit, store_id }) => jsonText(await api.get("/admin/activity", { limit, store_id })),
  );

  server.tool(
    "od_admin_list_integrations",
    "WEBSITE: Shopify connections of every account (domain, shop, status, last order sync) — no secrets.",
    {},
    async () => jsonText(await api.get("/admin/integrations")),
  );

  server.tool(
    "od_admin_shop_campaigns",
    "SHOP DATA: campaigns of any shop (platform admin sees every shop).",
    { store_id: z.string(), status: z.enum(["draft", "ready", "published"]).optional() },
    async ({ store_id, status }) => jsonText(await api.get("/studio/campaigns", { store_id, status, archived: false })),
  );

  server.tool(
    "od_admin_shop_artworks",
    "SHOP DATA: artworks of any shop.",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get("/studio/artworks", { store_id, archived: false })),
  );

  server.tool(
    "od_admin_shop_orders",
    "SHOP DATA: orders of any shop (optional status).",
    { store_id: z.string(), status: z.string().optional() },
    async ({ store_id, status }) => jsonText(await api.get("/product/orders", { store_id, status })),
  );
}
