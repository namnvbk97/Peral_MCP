/**
 * SHOP SETTINGS — per shop: fulfilment flow + fulfilment / carrier accounts (Teeinblue-style).
 * Flow: dropship = the fulfiller ships to the buyer (Shopify / Etsy shops);
 *       warehouse = goods come to the shop, then carrier draft + marketplace (Garby).
 * Tokens are write-only: listings show only a hint.
 */
import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText, stripUndefined } from "./common.js";

const enc = encodeURIComponent;

const connectionFields = {
  name: z.string().optional().describe("Display name, e.g. 'Printway — main account'"),
  note: z.string().optional(),
  enabled: z.boolean().optional(),
  token: z.string().optional().describe("API token (Printway / Viettel Post). Empty = keep the saved one"),
  ship_to: z.enum(["shop", "customer"]).optional().describe("Printway: ship to the shop warehouse or the buyer (dropship shops always ship to the buyer)"),
  method: z.string().optional().describe("Printway shipping method number; empty = standard"),
  ship_address: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address1: z.string().optional(),
      address2: z.string().optional(),
      city: z.string().optional(),
      province: z.string().optional(),
      province_code: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().optional(),
      country_code: z.string().optional(),
    })
    .optional()
    .describe("Printway: the shop warehouse address (used when ship_to = shop)"),
};

function connectionBody(a: Record<string, unknown>) {
  const ad = (a.ship_address || {}) as Record<string, string | undefined>;
  return stripUndefined({
    name: a.name,
    note: a.note,
    enabled: a.enabled,
    token: a.token,
    shipTo: a.ship_to,
    method: a.method,
    shipName: ad.name,
    shipPhone: ad.phone,
    shipEmail: ad.email,
    shipAddress1: ad.address1,
    shipAddress2: ad.address2,
    shipCity: ad.city,
    shipProvince: ad.province,
    shipProvinceCode: ad.province_code,
    shipZip: ad.zip,
    shipCountry: ad.country,
    shipCountryCode: ad.country_code,
  });
}

export function registerShopSettingsTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_shop_settings",
    "A shop's fulfilment flow (dropship | warehouse), its connected fulfilment / carrier accounts, and every provider it can add.",
    { store_id: z.string().describe("Shop id, e.g. garby (see od_list_stores)") },
    async ({ store_id }) => jsonText(await api.get(`/integrations/partners/${enc(store_id)}`)),
  );

  server.tool(
    "od_set_store_default_campaign",
    "SHOP: set (or clear with null) which Store → Campaign template is the default. Templates are shopTemplate campaigns (hidden from Campaigns list). New sell campaigns copy that template's page + form once. Prefer an artwork or free template via templateKind.",
    { store_id: z.string(), campaign_id: z.string().nullable() },
    async ({ store_id, campaign_id }) =>
      jsonText(await api.patch(`/stores/${enc(store_id)}/default-campaign`, { campaignId: campaign_id })),
  );

  server.tool(
    "od_set_shop_flow",
    "Set how the shop gets goods to buyers. dropship: print check → order fulfiller → fulfiller ships to the buyer's address. warehouse: print check → order fulfiller (ships to a shop address, default or picked per order) → goods received → shop ships to the buyer. marketplace: print check → enter the TikTok/Shopee label (tracking + label URL) → order fulfiller with the label → fulfiller ships to the buyer.",
    { store_id: z.string(), flow: z.enum(["dropship", "warehouse", "marketplace"]) },
    async ({ store_id, flow }) => jsonText(await api.put(`/integrations/partners/${enc(store_id)}/flow`, { flow })),
  );

  const addressShape = {
    label: z.string().optional().describe("short name, e.g. Kho Gia Lâm"),
    name: z.string().optional().describe("receiver name"),
    phone: z.string().optional(),
    email: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    provinceCode: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
    countryCode: z.string().optional().describe("ISO-2, e.g. VN"),
    isDefault: z.boolean().optional().describe("the address fulfillers ship to unless an order picks another"),
  };

  server.tool(
    "od_shop_addresses",
    "List a shop's addresses (where fulfillers ship in the warehouse flow). One is the default.",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get(`/integrations/partners/${enc(store_id)}/addresses`)),
  );

  server.tool(
    "od_add_shop_address",
    "Add a shop address. Needs at least address1 + city. The first one becomes the default.",
    { store_id: z.string(), ...addressShape },
    async ({ store_id, ...a }) => jsonText(await api.post(`/integrations/partners/${enc(store_id)}/addresses`, stripUndefined(a))),
  );

  server.tool(
    "od_update_shop_address",
    "Edit a shop address; isDefault=true makes it the default.",
    { store_id: z.string(), address_id: z.string(), ...addressShape },
    async ({ store_id, address_id, ...a }) =>
      jsonText(await api.put(`/integrations/partners/${enc(store_id)}/addresses/${enc(address_id)}`, stripUndefined(a))),
  );

  server.tool(
    "od_remove_shop_address",
    "Delete a shop address (another one becomes default if needed).",
    { store_id: z.string(), address_id: z.string() },
    async ({ store_id, address_id }) => jsonText(await api.delete(`/integrations/partners/${enc(store_id)}/addresses/${enc(address_id)}`)),
  );

  server.tool(
    "od_carrier_export",
    "LEG 2 (shop → customer) for carriers without a self-serve API: fill SPX's or Viettel Post's own mass-order template ('tạo đơn hàng loạt') with the given orders and save the .xlsx to out_path. SPX: province + ward are matched to SPX's 2-level lists (unmatched cells are reported in warnings, fix them before upload; upload the sheet 'Tạo đơn (địa chỉ mới)'). Weight comes from Product Base package.weightGram, else default_weight_gram per item. The pickup address is chosen in the carrier portal.",
    {
      order_ids: z.array(z.string()).min(1).max(500),
      carrier: z.enum(["spx", "viettelpost"]),
      default_weight_gram: z.number().int().min(1).describe("per item, used when the Product Base has no weight"),
      out_path: z.string().describe("local .xlsx path to write"),
      payer: z.enum(["Người gửi trả", "Người nhận trả"]).optional(),
      allow_view: z.boolean().optional().describe("SPX: cho xem hàng, không cho thử (default true)"),
      vtp_service: z.string().optional().describe("Viettel Post service, e.g. 'LCOD - TMĐT tiết kiệm thỏa thuận'"),
    },
    async (a) => {
      const { bytes, headers } = await api.download("/product/orders/carrier-export.xlsx", {
        ids: a.order_ids,
        carrier: a.carrier,
        defaultWeightGram: a.default_weight_gram,
        payer: a.payer ?? "Người gửi trả",
        allowView: a.allow_view ?? true,
        allowTry: false,
        vtpService: a.vtp_service ?? "",
      });
      await writeFile(a.out_path, bytes);
      let warnings: unknown = [];
      try {
        warnings = JSON.parse(headers.get("x-warnings") || "[]");
      } catch {
        /* header cut */
      }
      return jsonText({ path: a.out_path, bytes: bytes.length, exported: Number(headers.get("x-exported") || 0), warnings });
    },
  );

  server.tool(
    "od_parse_address",
    "ORDERS: turn a pasted customer message (Messenger / Zalo / SPX text, Vietnamese or US address) into name, phone, email, address1, address2, city, province, province_code, zip, country, country_code — rule based; 'notes' lists what was not found. Feed the result to od_update_order_shipping(customer_address=…) after checking it.",
    { text: z.string().min(1).max(4000) },
    async ({ text }) => jsonText(await api.post("/product/orders/parse-address", { text })),
  );

  server.tool(
    "od_update_order_shipping",
    "Shipping data of one order. ship_from = shop address id the fulfiller ships to (warehouse flow; '' = default). ship_sender = shop address leg 2 leaves from ('' = same as ship_from). customer_address = the buyer's address (name, phone, address1, address2, city, province, province_code, zip, country, country_code). market_label = the marketplace label {platform, trackingNumber, carrier, labelUrl} (marketplace flow; complete label ticks 'Đã có nhãn'). flow = this order's own flow ('' = back to the shop's flow). currency + total = the order value in USD or VND.",
    {
      order_id: z.string(),
      ship_from: z.string().optional(),
      ship_sender: z.string().optional(),
      flow: z.enum(["", "dropship", "warehouse", "marketplace"]).optional(),
      currency: z.enum(["USD", "VND"]).optional(),
      total: z.number().min(0).optional(),
      customer_address: z.record(z.string()).optional(),
      market_label: z
        .object({ platform: z.string().optional(), trackingNumber: z.string().optional(), carrier: z.string().optional(), labelUrl: z.string().optional() })
        .optional(),
    },
    async ({ order_id, ship_from, ship_sender, flow, currency, total, customer_address, market_label }) =>
      jsonText(
        await api.patch(
          `/product/orders/${enc(order_id)}`,
          stripUndefined({ shipFrom: ship_from, shipSender: ship_sender, flow, currency, total, shippingAddress: customer_address, marketLabel: market_label }),
        ),
      ),
  );

  server.tool(
    "od_add_shop_connection",
    "Connect a fulfilment or carrier account to a shop. provider ids: see od_shop_settings → providers (printway / viettelpost have an API; others are manual; 'other' needs a name).",
    {
      store_id: z.string(),
      kind: z.enum(["fulfiller", "carrier"]),
      provider: z.string(),
      ...connectionFields,
    },
    async (a) =>
      jsonText(
        await api.post(`/integrations/partners/${enc(a.store_id)}/connections`, {
          kind: a.kind,
          provider: a.provider,
          fields: connectionBody(a),
        }),
      ),
  );

  server.tool(
    "od_update_shop_connection",
    "Edit one connected account (name, token, Printway warehouse address, enable / disable).",
    { store_id: z.string(), connection_id: z.string(), ...connectionFields },
    async (a) =>
      jsonText(await api.put(`/integrations/partners/${enc(a.store_id)}/connections/${enc(a.connection_id)}`, connectionBody(a))),
  );

  server.tool(
    "od_shop_routing",
    "Order routing rules of a shop (top first) and the values each condition can take (suppliers, the shop's Product Bases, channels).",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get(`/integrations/partners/${enc(store_id)}/routing`)),
  );

  server.tool(
    "od_set_shop_routing",
    "Replace a shop's order routing rules (order = priority). Each rule: field supplier | productBase | channel | country (ISO-2), its value, and fulfiller = a connection id from od_shop_settings. No match → the account of the Product Base's supplier.",
    {
      store_id: z.string(),
      rules: z.array(
        z.object({
          field: z.enum(["supplier", "productBase", "channel", "country"]),
          value: z.string(),
          fulfiller: z.string().describe("connection id"),
        }),
      ),
    },
    async ({ store_id, rules }) => jsonText(await api.put(`/integrations/partners/${enc(store_id)}/routing`, { rules })),
  );

  server.tool(
    "od_shop_sku_map",
    "SKU map of one fulfil account: one row per Product Base variant (key slug|size, the base SKU, the account's SKU). all_bases = include bases of other suppliers.",
    { store_id: z.string(), connection_id: z.string(), all_bases: z.boolean().default(false) },
    async ({ store_id, connection_id, all_bases }) =>
      jsonText(await api.get(`/integrations/partners/${enc(store_id)}/connections/${enc(connection_id)}/sku-map`, { all_bases })),
  );

  server.tool(
    "od_set_shop_sku_map",
    "Set the fulfiller's SKU for Product Base variants of one account. map: { 'slug|size': 'SKU' } — merged; an empty SKU removes the line.",
    { store_id: z.string(), connection_id: z.string(), map: z.record(z.string()) },
    async ({ store_id, connection_id, map }) =>
      jsonText(await api.put(`/integrations/partners/${enc(store_id)}/connections/${enc(connection_id)}/sku-map`, { map })),
  );

  server.tool(
    "od_printway_order",
    "PRINTWAY: look up one order on a shop's Printway account (API v3) by PW… id, order name, or a carrier tracking number it carries. Returns the status (carrier status such as In Transit first), tracking number/url and items.",
    { store_id: z.string(), connection_id: z.string().describe("the Printway connection id (od_shop_settings)"), code: z.string() },
    async ({ store_id, connection_id, code }) =>
      jsonText(await api.get(`/integrations/partners/${enc(store_id)}/connections/${enc(connection_id)}/printway/order`, { code })),
  );

  server.tool(
    "od_printway_sku_search",
    "PRINTWAY: search the account's catalogue (~120k variant SKUs) by words in product name / code / SKU, e.g. 'ornament heart' or 'CRORM'. Use the SKU with od_set_shop_sku_map.",
    { store_id: z.string(), connection_id: z.string(), q: z.string().min(2) },
    async ({ store_id, connection_id, q }) =>
      jsonText(await api.get(`/integrations/partners/${enc(store_id)}/connections/${enc(connection_id)}/printway/products`, { q })),
  );

  server.tool(
    "od_remove_shop_connection",
    "Remove a connected fulfilment / carrier account from a shop.",
    { store_id: z.string(), connection_id: z.string() },
    async ({ store_id, connection_id }) =>
      jsonText(await api.delete(`/integrations/partners/${enc(store_id)}/connections/${enc(connection_id)}`)),
  );
}
