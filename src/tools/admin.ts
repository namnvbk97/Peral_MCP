/**
 * PLATFORM ADMIN tools — Peral operators (ADMIN_EMAILS / is_admin).
 * A platform admin works in every shop; every od_* tool also accepts any store_id for them.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { compactArtwork, errorText, jsonText, stripUndefined } from "./common.js";

const enc = encodeURIComponent;
const ROLE = z.enum(["owner", "admin", "designer", "ops", "support", "accountant", "editor"]);

type Dict = Record<string, unknown>;
type OrderItem = Dict & {
  id?: string;
  printStatus?: string;
  printError?: string | null;
  printFileUrl?: string | null;
  printFiles?: Array<{ url?: string; fileName?: string; side?: string; area?: string }>;
  previewUrl?: string | null;
  fields?: unknown;
  title?: string;
  size?: string;
  sku?: string;
  qty?: number;
  printPx?: unknown;
  printSpec?: unknown;
  warnings?: string[];
};
type Order = Dict & { id: string; number?: string; storeId?: string; status?: string; items?: OrderItem[] };

function absUrl(api: WebtoolsClient, u?: string | null): string | null {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `${api.apiBase}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** Fulfillment-focused order view (print URLs absolute for support / download). */
function orderSupportView(api: WebtoolsClient, o: Order) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    storeId: o.storeId,
    customer: o.customer,
    shippingAddress: o.shippingAddress,
    note: o.note,
    tracking: o.tracking,
    ops: o.ops,
    items: (o.items || []).map((it) => {
      const files = (it.printFiles || [])
        .map((f) => ({
          ...f,
          url: absUrl(api, f.url || null),
        }))
        .filter((f) => f.url);
      const printFileUrl = absUrl(api, it.printFileUrl);
      return {
        id: it.id,
        title: it.title,
        size: it.size,
        sku: it.sku,
        qty: it.qty,
        printStatus: it.printStatus,
        printError: it.printError,
        printFileUrl,
        printFiles: files.length ? files : printFileUrl ? [{ url: printFileUrl }] : [],
        previewUrl: absUrl(api, it.previewUrl),
        printPx: it.printPx,
        printSpec: it.printSpec,
        warnings: it.warnings,
        fields: it.fields,
      };
    }),
  };
}

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
    "od_admin_list_shop_requests",
    "ADMIN: shop-open requests. A shop is created only after approve. status: pending (default), approved, rejected, all.",
    { status: z.enum(["pending", "approved", "rejected", "all"]).optional() },
    async ({ status }) => jsonText(await api.get("/admin/shop-requests", { status: status || "pending" })),
  );

  server.tool(
    "od_admin_approve_shop_request",
    "ADMIN: approve a shop-open request — creates the shop and makes the requester the owner.",
    { request_id: z.string() },
    async ({ request_id }) => jsonText(await api.post(`/admin/shop-requests/${enc(request_id)}/approve`, {})),
  );

  server.tool(
    "od_admin_reject_shop_request",
    "ADMIN: reject a shop-open request. The shop is not created. Optional note is shown to the requester.",
    { request_id: z.string(), note: z.string().optional() },
    async ({ request_id, note }) =>
      jsonText(await api.post(`/admin/shop-requests/${enc(request_id)}/reject`, { note: note || "" })),
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

  // ── Seller support: orders / print files / catalog ───────────

  server.tool(
    "od_admin_get_order",
    "SUPPORT: one order from any shop — customer answers, print status, absolute print/preview URLs (for download or send to seller).",
    { order_id: z.string() },
    async ({ order_id }) =>
      jsonText(orderSupportView(api, await api.get<Order>(`/product/orders/${enc(order_id)}`))),
  );

  server.tool(
    "od_admin_patch_order",
    "SUPPORT: update an order (status, note, tracking fields, or move to another shop via store_id). Platform admin can touch any shop.",
    {
      order_id: z.string(),
      status: z.string().optional(),
      note: z.string().optional(),
      store_id: z.string().optional().describe("Move order to this shop id"),
      tracking_number: z.string().optional(),
      tracking_company: z.string().optional(),
    },
    async ({ order_id, status, note, store_id, tracking_number, tracking_company }) => {
      const body: Dict = stripUndefined({ status, note, storeId: store_id });
      if (tracking_number !== undefined || tracking_company !== undefined) {
        body.tracking = stripUndefined({
          number: tracking_number,
          company: tracking_company,
        });
      }
      return jsonText(orderSupportView(api, await api.patch<Order>(`/product/orders/${enc(order_id)}`, body)));
    },
  );

  server.tool(
    "od_admin_move_order",
    "SUPPORT: move one order to another shop (changes storeId). Ask the seller which target shop first. Does not copy — the order leaves the source shop.",
    {
      order_id: z.string(),
      to_store_id: z.string(),
      note: z.string().optional().describe("Optional note appended on the order"),
    },
    async ({ order_id, to_store_id, note }) => {
      const cur = await api.get<Order>(`/product/orders/${enc(order_id)}`);
      const from = String(cur.storeId || "");
      if (from === to_store_id) {
        return errorText("Order already in that shop", { order_id, store_id: from });
      }
      const body: Dict = { storeId: to_store_id };
      if (note) body.note = note;
      else body.note = `Admin moved from shop ${from} → ${to_store_id}`;
      const o = await api.patch<Order>(`/product/orders/${enc(order_id)}`, body);
      return jsonText({
        ok: true,
        from_store_id: from,
        to_store_id: o.storeId,
        order: orderSupportView(api, o),
      });
    },
  );

  server.tool(
    "od_admin_delete_orders",
    "SUPPORT: delete orders from CreTip (not Shopify). confirm must be DELETE. Returns deleted count + skipped reasons. Ask the seller first.",
    {
      order_ids: z.array(z.string()).min(1).max(40),
      confirm: z.string().describe('Must be the string "DELETE"'),
    },
    async ({ order_ids, confirm }) => {
      if (confirm !== "DELETE") {
        return jsonText({
          ok: false,
          plan: { wouldDelete: order_ids, hint: 'Re-call with confirm="DELETE" after the seller agrees.' },
        });
      }
      return jsonText(await api.post("/product/orders/bulk-delete", { ids: order_ids }));
    },
  );

  server.tool(
    "od_admin_render_order_print",
    "SUPPORT: (re)generate preview + print files for an order (optional item_id). Use when seller says file in lỗi / thiếu.",
    { order_id: z.string(), item_id: z.string().optional() },
    async ({ order_id, item_id }) =>
      jsonText(
        orderSupportView(
          api,
          await api.post<Order>(`/product/orders/${enc(order_id)}/render`, undefined, item_id ? { item_id } : undefined),
        ),
      ),
  );

  server.tool(
    "od_admin_order_print_urls",
    "SUPPORT: list absolute print-file + preview URLs for one order (no download). Seller can open links; or use od_admin_download_order_prints.",
    { order_id: z.string() },
    async ({ order_id }) => {
      const view = orderSupportView(api, await api.get<Order>(`/product/orders/${enc(order_id)}`));
      const files: Array<{ orderId: string; number?: string; itemId?: string; kind: string; url: string; fileName?: string }> =
        [];
      for (const it of view.items || []) {
        for (const f of it.printFiles || []) {
          if (f.url) {
            files.push({
              orderId: view.id,
              number: view.number as string | undefined,
              itemId: it.id,
              kind: "print",
              url: String(f.url),
              fileName: f.fileName,
            });
          }
        }
        if (it.previewUrl) {
          files.push({
            orderId: view.id,
            number: view.number as string | undefined,
            itemId: it.id,
            kind: "preview",
            url: String(it.previewUrl),
          });
        }
      }
      return jsonText({ order_id: view.id, number: view.number, storeId: view.storeId, files });
    },
  );

  server.tool(
    "od_admin_download_order_prints",
    "SUPPORT: download all print files of the given orders as one zip onto the machine running MCP (save_path). Returns bytes written + warnings.",
    {
      order_ids: z.array(z.string()).min(1).max(40),
      save_path: z.string().describe("Absolute path for the .zip on the MCP host, e.g. C:/tmp/prints.zip"),
    },
    async ({ order_ids, save_path }) => {
      const { bytes, headers } = await api.download("/product/orders/print-files.zip", { ids: order_ids });
      await mkdir(dirname(save_path), { recursive: true });
      await writeFile(save_path, bytes);
      return jsonText({
        ok: true,
        save_path,
        bytes: bytes.byteLength,
        exported: headers.get("X-Exported"),
        warnings: headers.get("X-Warnings"),
      });
    },
  );

  server.tool(
    "od_admin_get_artwork",
    "SUPPORT: full artwork of any shop (templates/layers compacted). Check personalization form / print layout issues.",
    { artwork_id: z.string() },
    async ({ artwork_id }) =>
      jsonText(compactArtwork(await api.get(`/studio/artworks/${enc(artwork_id)}`))),
  );

  server.tool(
    "od_admin_shop_product_bases",
    "SUPPORT: Product Bases (phôi) visible to a shop — sizes, supplier, usage counts.",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get("/studio/product-bases", { store_id })),
  );

  server.tool(
    "od_admin_get_product_base",
    "SUPPORT: one Product Base detail (print areas, sizes, SKU). Pass store_id of the seller shop when checking ownership.",
    { slug: z.string(), store_id: z.string().optional() },
    async ({ slug, store_id }) =>
      jsonText(await api.get(`/studio/product-bases/${enc(slug)}`, store_id ? { store_id } : undefined)),
  );

  server.tool(
    "od_admin_get_campaign",
    "SUPPORT: one campaign of any shop (products, prices, mockups summary).",
    { campaign_id: z.string() },
    async ({ campaign_id }) => jsonText(await api.get(`/studio/campaigns/${enc(campaign_id)}`)),
  );
}
