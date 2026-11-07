/**
 * PRINT tools — asset editing, Product Base print areas, print-file export,
 * slot groups (N customer entries → fixed print slots) and personalized orders.
 * Everything goes through the CreTip API (never writes backend data directly).
 */
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { compactArtwork, errorText, jsonText, stripUndefined } from "./common.js";

type Dict = Record<string, unknown>;
type Template = Dict & { id: string; slotGroups?: Dict[] };
type Artwork = Dict & { id: string; activeTemplateId?: string; templates?: Template[] };
type OrderItem = Dict & {
  id: string;
  printStatus?: string;
  printError?: string | null;
  printFileUrl?: string | null;
  previewUrl?: string | null;
  printPx?: unknown;
  printSpec?: unknown;
  warnings?: string[];
};
type Order = Dict & { id: string; number?: string; items?: OrderItem[] };

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const FONT_EXT = new Set([".ttf", ".otf", ".woff", ".woff2"]);

const cropSchema = z
  .object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() })
  .describe("ROI in source-image pixels");

const printFileArgs = {
  values: z
    .record(z.string())
    .optional()
    .describe("Customer answers {layerId: value}. Photos must be /uploads/... URLs (od_upload_asset → url)"),
  template_id: z.string().optional(),
  size: z.string().optional().describe("Product Base size, e.g. 30X40 (default: recommended)"),
  area: z.string().optional().describe("Print area key (front / back / full …); default: template's or first"),
  fit: z.enum(["contain", "cover"]).optional().describe("Override area fit: contain = centred, cover = fill + crop"),
};

function absUrl(api: WebtoolsClient, u?: string | null): string | null {
  if (!u) return null;
  return /^https?:\/\//.test(u) ? u : `${api.apiBase}${u}`;
}

/** Order summary focused on what fulfillment needs. */
function orderPrintSummary(api: WebtoolsClient, o: Order) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    storeId: o.storeId,
    items: (o.items || []).map((it) => ({
      id: it.id,
      title: it.title,
      size: it.size,
      sku: it.sku,
      qty: it.qty,
      printStatus: it.printStatus,
      printError: it.printError,
      printFileUrl: absUrl(api, it.printFileUrl),
      previewUrl: absUrl(api, it.previewUrl),
      printPx: it.printPx,
      printSpec: it.printSpec,
      warnings: it.warnings,
      fields: it.fields,
    })),
  };
}

export function registerPrintTools(server: McpServer, api: WebtoolsClient): void {
  // ── Assets: bulk upload + crop / remove background ─────────

  server.tool(
    "od_upload_assets_folder",
    "ASSETS: upload every image (or font) in a local folder. Returns [{file, id, url}] — use url in layer src / option value.",
    {
      folder_path: z.string(),
      kind: z.enum(["image", "font"]).optional().describe("default image"),
      category_id: z.string().optional(),
      name_prefix: z.string().optional().describe("Asset name = prefix + file stem"),
      match: z.string().optional().describe("Only files whose name contains this text"),
    },
    async ({ folder_path, kind, category_id, name_prefix, match }) => {
      const isFont = kind === "font";
      const exts = isFont ? FONT_EXT : IMAGE_EXT;
      const files = (await readdir(folder_path))
        .filter((f) => exts.has(extname(f).toLowerCase()) && (!match || f.includes(match)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const out: Dict[] = [];
      for (const f of files) {
        const stem = f.replace(/\.[^.]+$/, "");
        try {
          const r = await api.uploadFile<Dict>(
            isFont ? "/studio/fonts/upload" : "/studio/assets/upload",
            join(folder_path, f),
            { category_id, name: `${name_prefix || ""}${stem}` },
          );
          out.push({ file: f, id: r.id, url: r.url, family: r.family, width: r.width, height: r.height });
        } catch (e) {
          out.push({ file: f, error: String((e as Error).message || e) });
        }
      }
      return jsonText({ uploaded: out.filter((x) => !x.error).length, total: files.length, items: out });
    },
  );

  server.tool(
    "od_asset_edit_status",
    "ASSETS: is background removal (rembg) installed on the server + available models.",
    {},
    async () => jsonText(await api.get("/studio/assets/edit/status")),
  );

  server.tool(
    "od_asset_edit",
    "ASSETS: crop an uploaded asset to a ROI and/or remove its background (rembg). " +
      "mode=preview returns size/time only; replace overwrites the asset (same id); copy saves '<name>-edited'.",
    {
      asset_id: z.string(),
      crop: cropSchema.optional(),
      remove_bg: z.boolean().optional(),
      model: z
        .enum(["isnet-general-use", "birefnet-general-lite", "u2net", "u2netp", "silueta"])
        .optional()
        .describe("isnet-general-use = fast default; birefnet-general-lite = best on fur, ~1 min CPU"),
      trim: z.boolean().optional().describe("Crop tight to the subject after removing the background (default true)"),
      mode: z.enum(["preview", "replace", "copy"]).default("preview"),
    },
    async ({ asset_id, crop, remove_bg, model, trim, mode }) => {
      const r = await api.post<Dict>(
        `/studio/assets/${asset_id}/edit`,
        stripUndefined({ crop, removeBg: remove_bg, model, trim, mode }),
      );
      if (mode === "preview") {
        const { dataUrl: _d, ...rest } = r;
        return jsonText({ ...rest, note: "Preview OK — call again with mode=replace or copy to save" });
      }
      return jsonText({ ...r, url: absUrl(api, r.url as string) });
    },
  );

  // ── Print spec / print files ──────────────────────────────

  server.tool(
    "od_get_print_spec",
    "PRINT: print areas of a Product Base per size (px, DPI, inches, PNG/JPG, transparent, bleed/safe, fit, file-name pattern).",
    { product_slug: z.string() },
    async ({ product_slug }) => {
      const b = await api.get<Dict>(`/studio/product-bases/${product_slug}`);
      return jsonText({ slug: b.slug, name: b.name, printMethod: b.printMethod, printSpecs: b.printSpecs });
    },
  );

  server.tool(
    "od_artwork_print_file",
    "PRINT: render the print-ready file for an artwork with customer answers (no order needed). Returns url + spec + warnings (low DPI photos, aspect mismatch).",
    { artwork_id: z.string(), product_slug: z.string().optional(), ...printFileArgs },
    async ({ artwork_id, product_slug, values, template_id, size, area, fit }) => {
      const r = await api.post<Dict>(
        `/studio/artworks/${artwork_id}/print-file`,
        stripUndefined({ values: values || {}, templateId: template_id, productSlug: product_slug, size, area, fit }),
      );
      return jsonText({ ...r, url: absUrl(api, r.url as string) });
    },
  );

  server.tool(
    "od_campaign_print_file",
    "PRINT: render the print file a buyer's answers would produce for a campaign product (artwork + Product Base from the campaign).",
    { campaign_id: z.string(), product_id: z.string().optional(), ...printFileArgs },
    async ({ campaign_id, product_id, values, template_id, size, area, fit }) => {
      const r = await api.post<Dict>(
        `/studio/campaigns/${campaign_id}/print-file`,
        stripUndefined({ productId: product_id, values: values || {}, templateId: template_id, size, area, fit }),
      );
      return jsonText({ ...r, url: absUrl(api, r.url as string) });
    },
  );

  // ── Slot groups ───────────────────────────────────────────

  server.tool(
    "od_artwork_set_slot_group",
    "ARTWORK: spread N customer entries (photo + name) over fixed print slots. count_layer_id = option layer whose option value is N; " +
      "members = form inputs (formOnly photo-upload + text) in order; slots = printed layers (image with fit=contain + text). " +
      "Every entry gets ≥1 slot; fewer entries → extra slots repeat them in a seeded shuffle (same answers = same layout). " +
      "text_color_from = option layer whose selected option has `textColor` applied to slot names. Replaces a group with the same id.",
    {
      artwork_id: z.string(),
      template_id: z.string().optional(),
      group_id: z.string().default("entries"),
      count_layer_id: z.string(),
      members: z.array(z.object({ photo: z.string(), name: z.string().optional() })).min(1),
      slots: z.array(z.object({ photo: z.string(), name: z.string().optional() })).min(1),
      text_color_from: z.string().optional(),
      neighbor_distance: z.number().optional().describe("Doc px; slots closer than this avoid the same entry (default 1.8× slot width)"),
      mix: z
        .enum(["shuffle", "rows"])
        .optional()
        .describe("shuffle (default) = seeded random; rows = fixed zig-zag per row (1 2 3 4 / 3 2 1 / …), no equal neighbours"),
      remove: z.boolean().optional().describe("Delete the group instead"),
    },
    async (a) => {
      const art = await api.get<Artwork>(`/studio/artworks/${a.artwork_id}`);
      const tid = a.template_id || art.activeTemplateId;
      const templates = (art.templates || []).map((t) => ({ ...t }));
      const tpl = templates.find((t) => t.id === tid);
      if (!tpl) return errorText(`Template not found: ${tid}`);
      const groups = (tpl.slotGroups || []).filter((g) => g.id !== a.group_id);
      if (!a.remove) {
        groups.push(
          stripUndefined({
            id: a.group_id,
            countLayerId: a.count_layer_id,
            members: a.members,
            slots: a.slots,
            textColorFrom: a.text_color_from,
            neighborDistance: a.neighbor_distance,
            mix: a.mix === "rows" ? "rows" : undefined,
          }),
        );
      }
      tpl.slotGroups = groups;
      const saved = await api.patch<Artwork>(`/studio/artworks/${a.artwork_id}`, { templates });
      return jsonText({ templateId: tid, slotGroups: groups, artwork: compactArtwork(saved) });
    },
  );

  // ── Personalized orders → print files ─────────────────────

  server.tool(
    "od_create_personalized_order",
    "ORDERS: create an order whose items come from a campaign (or artwork) with the customer's answers; " +
      "render_now renders preview + print file per item (Product Base print spec). Returns print file urls + warnings.",
    {
      store_id: z.string().optional().default("garby"),
      number: z.string().optional().describe("Order number, e.g. #1001 (default: next)"),
      channel: z.string().optional().default("manual"),
      customer: z
        .object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() })
        .optional(),
      shipping_address: z.record(z.unknown()).optional(),
      note: z.string().optional(),
      items: z
        .array(
          z.object({
            campaign_id: z.string().optional(),
            campaign_product_id: z.string().optional(),
            artwork_id: z.string().optional().describe("Use instead of campaign_id (then set product_slug)"),
            product_slug: z.string().optional(),
            template_id: z.string().optional(),
            size: z.string().describe("Variant size, e.g. 30X40"),
            qty: z.number().int().min(1).optional(),
            price: z.number().optional(),
            print_area: z.string().optional(),
            values: z.record(z.string()).describe("Customer answers {layerId: value}; photos as /uploads/... URLs"),
          }),
        )
        .min(1),
      render_now: z.boolean().optional().default(true),
    },
    async (a) => {
      const o = await api.post<Order>(
        "/product/orders",
        stripUndefined({
          storeId: a.store_id,
          number: a.number,
          channel: a.channel,
          customer: a.customer,
          shippingAddress: a.shipping_address,
          note: a.note,
          renderNow: a.render_now,
          items: a.items.map((it) =>
            stripUndefined({
              campaignId: it.campaign_id,
              campaignProductId: it.campaign_product_id,
              artworkId: it.artwork_id,
              productSlug: it.product_slug,
              templateId: it.template_id,
              size: it.size,
              qty: it.qty,
              price: it.price,
              printArea: it.print_area,
              values: it.values,
            }),
          ),
        }),
      );
      return jsonText(orderPrintSummary(api, o));
    },
  );

  server.tool(
    "od_get_order",
    "ORDERS: one order with items, customer answers, print status and print file urls.",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(orderPrintSummary(api, await api.get<Order>(`/product/orders/${order_id}`))),
  );

  server.tool(
    "od_render_order_print",
    "ORDERS: (re)generate preview + print files for every personalized item of an order (or one item_id).",
    { order_id: z.string(), item_id: z.string().optional() },
    async ({ order_id, item_id }) =>
      jsonText(orderPrintSummary(api, await api.post<Order>(`/product/orders/${order_id}/render`, undefined, { item_id }))),
  );

  server.tool(
    "od_merchize_preview",
    "ORDERS/MERCHIZE: Check one order on Merchize. If Merchize already has it (by RX- code or our order number as external_number), syncs code / status / tracking onto the order; otherwise returns the /order/external/orders/catalog body Send would post plus the blocking problems (token, API URL, Merchize SKU, address, public print link). Read-only on Merchize.",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(await api.get(`/product/orders/${order_id}/merchize/preview`)),
  );

  server.tool(
    "od_merchize_send",
    "ORDERS/MERCHIZE: create a REAL (paid) order on Merchize via API and tick 'đã đặt hàng'. No dry run — check first with od_merchize_preview and get the merchant's OK. resend=true creates a new order with external number -R…. Needs the shop's Merchize API URL + Access token in Shop Settings and 'Đã kiểm tra file in'.",
    { order_id: z.string(), resend: z.boolean().optional() },
    async ({ order_id, resend }) =>
      jsonText(await api.post(`/product/orders/${order_id}/merchize`, undefined, resend ? { force: true } : undefined)),
  );

  server.tool(
    "od_merchize_refresh",
    "ORDERS/MERCHIZE: pull Merchize code (RX-…), status and tracking for an order already sent.",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(await api.post(`/product/orders/${order_id}/merchize/refresh`)),
  );

  server.tool(
    "od_onospod_preview",
    "ORDERS/ONOSPOD: the /order/create body that would be sent to Onospod's API for one order, plus the problems blocking it (missing token / SKU map / address / public print link).",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(await api.get(`/product/orders/${order_id}/onospod/preview`)),
  );

  server.tool(
    "od_onospod_send",
    "ORDERS/ONOSPOD: create a REAL order on Onospod via API and tick 'đã đặt hàng'. There is no dry run (Onospod's /order/create/test also places a real order) — check first with od_onospod_preview. Needs the shop's Onospod Access Token in Shop Settings and 'Đã kiểm tra file in'.",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(await api.post(`/product/orders/${order_id}/onospod`)),
  );

  server.tool(
    "od_onospod_refresh",
    "ORDERS/ONOSPOD: pull Onospod status + tracking for an order already sent via API.",
    { order_id: z.string() },
    async ({ order_id }) => jsonText(await api.post(`/product/orders/${order_id}/onospod/refresh`)),
  );

  server.tool(
    "od_onospod_export_preview",
    "ORDERS/ONOSPOD (CSV fallback): dry run of the Onospod import CSV for orders — rows + problems. For shops without an Access Token; the file download is the Xuất đơn Onospod button in the Orders tab.",
    { order_ids: z.array(z.string()).min(1).max(500).describe("CreTip order ids to preview") },
    async ({ order_ids }) => jsonText(await api.post(`/product/orders/onospod/preview`, { ids: order_ids })),
  );

  server.tool(
    "od_photo_font",
    "FONT: turn a photo of glitter lettering into a TTF. The silhouette is the glyph (Potrace); glitter is painted at print time. Block letters with vertical gaps become one glyph each — set alphabet=true to add the missing capitals at the same height (needs the letter I in the photo). A connected script such as Merry stays one word glyph on U+E000. Do not slice the swashes and do not substitute Great Vibes or Sniglet.",
    {
      image_path: z.string().describe("Local photo path"),
      text: z.string().describe("The word in the photo, e.g. GRINCHMAS or Merry"),
      kind: z.enum(["red", "gold"]).describe("red = GRINCHMAS band, gold = Merry band"),
      family: z.string().optional().describe("Font family. Default MerryPhoto or GrinchmasPhoto"),
      alphabet: z.boolean().optional().describe("Block letters only. Build the capitals the photo does not contain"),
      word: z.boolean().optional().describe("Force one silhouette for the whole word"),
    },
    async ({ image_path, text, kind, family, alphabet, word }) =>
      jsonText(
        await api.post(
          "/studio/fonts/from-photo",
          stripUndefined({
            image_path,
            text,
            kind,
            family,
            alphabet,
            word,
          }),
        ),
      ),
  );
}
