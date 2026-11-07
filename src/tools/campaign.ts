/**
 * CAMPAIGN tools — sellable listing = Artwork(s) × Product Base(s)
 * + variants/pricing + mockups + listing copy + personalization → publish (mock).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { errorText, jsonText, stripUndefined } from "./common.js";

type Dict = Record<string, unknown>;

const CHANNELS = ["shopify", "etsy", "tiktok", "facebook", "woocommerce", "amazon"] as const;

const pricingSchema = z
  .object({
    currency: z.string().optional(),
    markupMode: z.enum(["multiplier", "fixed"]).optional(),
    markupValue: z.number().optional().describe("multiplier: price=cost×value; fixed: cost+value"),
    roundTo: z.number().nullable().optional().describe("0.99 → x.99 endings; null = 2 decimals"),
    defaultPrice: z.number().optional().describe("When Product Base has no cost"),
    compareAtFactor: z.number().nullable().optional().describe("compareAt = price×factor; null=off"),
  })
  .describe("Pricing rule applied to Product Base variant cost");

const listingSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    productType: z.string().optional(),
    vendor: z.string().optional(),
    collections: z.array(z.string()).optional(),
    fbCaption: z.string().optional(),
  })
  .passthrough();

const personalizationSchema = z
  .object({
    enabled: z.boolean().optional(),
    previewRequired: z.boolean().optional(),
    showPreviewButton: z.boolean().optional(),
    buttonLabel: z.string().optional(),
  })
  .passthrough();

const variantEditSchema = z
  .object({
    id: z.string().optional(),
    sku: z.string().optional(),
    size: z.string().optional(),
    price: z.number().optional(),
    compareAtPrice: z.number().nullable().optional(),
    baseCost: z.number().optional(),
    enabled: z.boolean().optional(),
  })
  .describe("Match by id | sku | size");

/** Keep campaign responses compact (history tail only). */
function compactCampaign(c: unknown): unknown {
  if (!c || typeof c !== "object") return c;
  const o = { ...(c as Dict) };
  const h = (o.history as Dict[] | undefined) || [];
  o.history = h.slice(-5);
  return o;
}

export function registerCampaignTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_campaign_channels",
    "CAMPAIGN: supported channels, statuses and default pricing rule.",
    {},
    async () => jsonText(await api.get("/studio/campaigns/channels")),
  );

  server.tool(
    "od_list_campaigns",
    "CAMPAIGN: list campaigns (summary: products, price range, thumbnail). Filters: store_id, status, artwork_id, archived.",
    {
      store_id: z.string().optional(),
      status: z.enum(["draft", "ready", "published"]).optional(),
      artwork_id: z.string().optional(),
      archived: z.boolean().optional(),
    },
    async ({ store_id, status, artwork_id, archived }) =>
      jsonText(
        await api.get("/studio/campaigns", {
          store_id,
          status,
          artwork_id,
          archived: archived ?? false,
        }),
      ),
  );

  server.tool(
    "od_get_campaign",
    "CAMPAIGN: full campaign (products × variants, pricing, listing, mockups, launches).",
    { campaign_id: z.string() },
    async ({ campaign_id }) =>
      jsonText(compactCampaign(await api.get(`/studio/campaigns/${campaign_id}`))),
  );

  server.tool(
    "od_create_campaign",
    "CAMPAIGN: create. With artwork_id → adds that artwork on its Product Base (or product_slug), variants priced from base cost, " +
      "listing seeded from artwork meta + base specs, flat mockups generated.",
    {
      title: z.string().optional().describe("Default: artwork title"),
      artwork_id: z.string().optional(),
      product_slug: z.string().optional().describe("Override Product Base (default: artwork's)"),
      template_ids: z.array(z.string()).optional().describe("Limit to these artwork templates (default all)"),
      sizes: z.array(z.string()).optional().describe("Enable only these sizes, e.g. ['30X40']"),
      store_id: z.string().optional(),
      channel: z.enum(CHANNELS).optional(),
      pricing: pricingSchema.optional(),
      listing: listingSchema.optional(),
      generate_mockups: z.boolean().optional(),
    },
    async (a) =>
      jsonText(
        compactCampaign(
          await api.post(
            "/studio/campaigns",
            stripUndefined({
              title: a.title,
              artworkId: a.artwork_id,
              productSlug: a.product_slug,
              templateIds: a.template_ids,
              sizes: a.sizes,
              storeId: a.store_id,
              channel: a.channel,
              pricing: a.pricing,
              listing: a.listing,
              generateMockups: a.generate_mockups ?? true,
            }),
          ),
        ),
      ),
  );

  server.tool(
    "od_update_campaign",
    "CAMPAIGN: patch title/handle/productCode/store/channel/archived; merge listing, pricing, personalization. reprice_variants re-applies pricing.",
    {
      campaign_id: z.string(),
      title: z.string().optional(),
      handle: z.string().optional(),
      product_code: z.string().optional().describe("Shop product id shown on Orders, e.g. KCMT05092603"),
      store_id: z.string().optional(),
      channel: z.enum(CHANNELS).optional(),
      archived: z.boolean().optional(),
      listing: listingSchema.optional(),
      pricing: pricingSchema.optional(),
      personalization: personalizationSchema.optional(),
      page: z
        .object({
          width: z.number().optional(),
          blocks: z.array(
            z
              .object({
                id: z.string(),
                type: z.string().describe("gallery|thumbs|title|price|products|size|form|buttons|description|text|image|badge|button"),
                x: z.number(),
                y: z.number(),
                w: z.number(),
                h: z.number(),
                visible: z.boolean().optional(),
                props: z.record(z.unknown()).optional(),
              })
              .passthrough(),
          ),
        })
        .optional()
        .describe("Product page layout on a 1080px artboard (free canvas; array order = z-order)"),
      reprice_variants: z.boolean().optional(),
    },
    async ({ campaign_id, ...a }) =>
      jsonText(
        compactCampaign(
          await api.patch(
            `/studio/campaigns/${campaign_id}`,
            stripUndefined({
              title: a.title,
              handle: a.handle,
              productCode: a.product_code,
              storeId: a.store_id,
              channel: a.channel,
              archived: a.archived,
              listing: a.listing,
              pricing: a.pricing,
              personalization: a.personalization,
              page: a.page,
              repriceVariants: a.reprice_variants ?? false,
            }),
          ),
        ),
      ),
  );

  server.tool(
    "od_duplicate_campaign",
    "CAMPAIGN: duplicate as a new draft.",
    { campaign_id: z.string() },
    async ({ campaign_id }) =>
      jsonText(compactCampaign(await api.post(`/studio/campaigns/${campaign_id}/duplicate`))),
  );

  server.tool(
    "od_delete_campaign",
    "CAMPAIGN: delete permanently.",
    { campaign_id: z.string() },
    async ({ campaign_id }) => jsonText(await api.delete(`/studio/campaigns/${campaign_id}`)),
  );

  // ── products ──────────────────────────────────────────────

  server.tool(
    "od_campaign_add_product",
    "CAMPAIGN: add Artwork × Product Base (variants auto from base, priced by rule). First product = default.",
    {
      campaign_id: z.string(),
      artwork_id: z.string(),
      product_slug: z.string().optional(),
      template_ids: z.array(z.string()).optional(),
      sizes: z.array(z.string()).optional(),
      is_default: z.boolean().optional(),
      generate_mockups: z.boolean().optional(),
    },
    async ({ campaign_id, ...a }) =>
      jsonText(
        compactCampaign(
          await api.post(
            `/studio/campaigns/${campaign_id}/products`,
            stripUndefined({
              artworkId: a.artwork_id,
              productSlug: a.product_slug,
              templateIds: a.template_ids,
              sizes: a.sizes,
              isDefault: a.is_default ?? false,
              generateMockups: a.generate_mockups ?? true,
            }),
          ),
        ),
      ),
  );

  server.tool(
    "od_campaign_upload_preview_asset",
    "CAMPAIGN MOCKUP EDITOR: upload a local scene, product mask or overlay. Returns /uploads URL for od_campaign_update_product.preview. mask = white/alpha where artwork is visible; overlay is drawn above artwork.",
    {
      campaign_id: z.string(),
      file_path: z.string(),
      kind: z.enum(["scene", "mask", "overlay"]),
    },
    async ({ campaign_id, file_path, kind }) =>
      jsonText(
        await api.uploadFile(
          `/studio/campaigns/${campaign_id}/uploads?kind=${encodeURIComponent(kind)}`,
          file_path,
        ),
      ),
  );

  server.tool(
    "od_campaign_update_product",
    "CAMPAIGN: edit a product. preview is DISPLAY ONLY (never changes print file): flat mask, or scene + one ImageBox. Scene ImageBox supports sceneUrl/templateKey, quad corners TL/TR/BR/BL in scene pixels, mask/overlay, frame move/zoom/rotate/crop, light and fabric displacement.",
    {
      campaign_id: z.string(),
      product_id: z.string(),
      enabled: z.boolean().optional(),
      is_default: z.boolean().optional(),
      template_ids: z.array(z.string()).optional(),
      template_by_option: z.record(z.record(z.string())).optional(),
      sizes: z.array(z.string()).optional(),
      variants: z.array(variantEditSchema).optional(),
      preview: z
        .object({
          v: z.literal(2).optional(),
          mode: z.enum(["flat", "scene", "mockup"]).optional(),
          sceneUrl: z.string().nullable().optional(),
          templateKey: z.string().nullable().optional(),
          quad: z.array(z.tuple([z.number(), z.number()])).length(4).nullable().optional(),
          maskUrl: z.string().nullable().optional(),
          overlayUrl: z.string().nullable().optional(),
          backMaskUrl: z.string().nullable().optional(),
          backMask: z.enum(["flip", "same", "custom"]).optional(),
          invert: z.boolean().optional(),
          frame: z
            .object({
              x: z.number().min(-5).max(5),
              y: z.number().min(-5).max(5),
              scale: z.number().min(0.05).max(10),
              rotation: z.number().min(-360).max(360),
              crop: z.object({
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                w: z.number().min(0.01).max(1),
                h: z.number().min(0.01).max(1),
              }),
            })
            .optional(),
          scale: z.number().min(0.05).max(10).optional(),
          x: z.number().min(-5).max(5).optional(),
          y: z.number().min(-5).max(5).optional(),
          background: z.string().optional(),
          shadingStrength: z.number().min(0).max(2).optional(),
          displace: z.number().min(0).max(100).optional(),
        })
        .optional(),
    },
    async ({ campaign_id, product_id, ...a }) =>
      jsonText(
        compactCampaign(
          await api.patch(
            `/studio/campaigns/${campaign_id}/products/${product_id}`,
            stripUndefined({
              enabled: a.enabled,
              isDefault: a.is_default,
              templateIds: a.template_ids,
              templateByOption: a.template_by_option,
              sizes: a.sizes,
              variants: a.variants,
              preview: a.preview,
            }),
          ),
        ),
      ),
  );

  server.tool(
    "od_campaign_remove_product",
    "CAMPAIGN: remove a product (and its mockups).",
    { campaign_id: z.string(), product_id: z.string() },
    async ({ campaign_id, product_id }) =>
      jsonText(
        compactCampaign(
          await api.delete(`/studio/campaigns/${campaign_id}/products/${product_id}`),
        ),
      ),
  );

  server.tool(
    "od_campaign_reprice",
    "CAMPAIGN: (optionally update pricing rule and) recompute all variant prices. force=true also overwrites manual prices.",
    { campaign_id: z.string(), pricing: pricingSchema.optional(), force: z.boolean().optional() },
    async ({ campaign_id, pricing, force }) =>
      jsonText(
        compactCampaign(
          await api.post(`/studio/campaigns/${campaign_id}/reprice`, {
            pricing,
            force: force ?? false,
          }),
        ),
      ),
  );

  // ── mockups ───────────────────────────────────────────────

  server.tool(
    "od_campaign_generate_mockups",
    "CAMPAIGN: flat on-product mockups from each artwork template (replaces previous flat ones).",
    {
      campaign_id: z.string(),
      product_ids: z.array(z.string()).optional(),
      replace: z.boolean().optional(),
    },
    async ({ campaign_id, product_ids, replace }) => {
      const c = await api.post<Dict>(`/studio/campaigns/${campaign_id}/mockups/generate`, {
        productIds: product_ids,
        replace: replace ?? true,
      });
      return jsonText({
        mockups: c.mockups,
        errors: c.lastMockupErrors,
        status: c.status,
      });
    },
  );

  server.tool(
    "od_campaign_add_mockup",
    "CAMPAIGN: attach a scene/AI mockup — local file_path (uploaded to Assets) or url.",
    {
      campaign_id: z.string(),
      file_path: z.string().optional(),
      url: z.string().optional(),
      product_id: z.string().optional(),
      label: z.string().optional(),
      kind: z.string().optional().describe("scene | lifestyle | flat | video-cover…"),
      is_primary: z.boolean().optional(),
    },
    async ({ campaign_id, file_path, url, product_id, label, kind, is_primary }) => {
      let src = url;
      if (file_path) {
        const asset = await api.uploadFile<{ url: string }>("/studio/assets/upload", file_path, {
          name: label,
        });
        src = asset.url;
      }
      if (!src) return errorText("file_path or url required");
      const c = await api.post<Dict>(`/studio/campaigns/${campaign_id}/mockups`, {
        url: src,
        productId: product_id,
        label,
        kind: kind || "scene",
        isPrimary: is_primary ?? false,
      });
      return jsonText({ mockups: c.mockups });
    },
  );

  server.tool(
    "od_campaign_set_primary_mockup",
    "CAMPAIGN: choose the primary (hero) mockup.",
    { campaign_id: z.string(), mockup_id: z.string() },
    async ({ campaign_id, mockup_id }) => {
      const c = await api.post<Dict>(
        `/studio/campaigns/${campaign_id}/mockups/${mockup_id}/primary`,
      );
      return jsonText({ mockups: c.mockups });
    },
  );

  server.tool(
    "od_campaign_delete_mockup",
    "CAMPAIGN: remove a mockup.",
    { campaign_id: z.string(), mockup_id: z.string() },
    async ({ campaign_id, mockup_id }) => {
      const c = await api.delete<Dict>(`/studio/campaigns/${campaign_id}/mockups/${mockup_id}`);
      return jsonText({ mockups: c.mockups });
    },
  );

  // ── listing / form / validate / publish ───────────────────

  server.tool(
    "od_campaign_generate_listing",
    "CAMPAIGN: fill listing (title/description/bullets/tags/SEO) from default artwork meta + Product Base specs. overwrite=false keeps existing text. " +
      "For persuasive copy, write it yourself and send via od_update_campaign listing.",
    { campaign_id: z.string(), overwrite: z.boolean().optional() },
    async ({ campaign_id, overwrite }) => {
      const c = await api.post<Dict>(`/studio/campaigns/${campaign_id}/listing/generate`, {
        overwrite: overwrite ?? false,
      });
      return jsonText({ listing: c.listing, status: c.status });
    },
  );

  server.tool(
    "od_campaign_form_preview",
    "CAMPAIGN: storefront personalizer per product (fields, options, visibility for `values`, enabled variants & prices).",
    {
      campaign_id: z.string(),
      product_id: z.string().optional(),
      values: z.record(z.string()).optional(),
    },
    async ({ campaign_id, product_id, values }) =>
      jsonText(
        await api.post(`/studio/campaigns/${campaign_id}/form-preview`, {
          productId: product_id,
          values: values || {},
        }),
      ),
  );

  server.tool(
    "od_validate_campaign",
    "CAMPAIGN: pre-launch checks (listing, products, artworks valid/published, variants priced > cost, mockups).",
    { campaign_id: z.string() },
    async ({ campaign_id }) => jsonText(await api.post(`/studio/campaigns/${campaign_id}/validate`)),
  );

  server.tool(
    "od_publish_campaign",
    "CAMPAIGN: publish to channel. Shopify + connected shop → real product (variants, prices, mockups, listing); other channels → recorded launch only. Publishes linked artworks too.",
    {
      campaign_id: z.string(),
      channel: z.enum(CHANNELS).optional(),
      connection_id: z.string().optional().describe("Shopify connection (od_shopify_connections). Default: first shop"),
      store_id: z.string().optional().describe("Shared campaign: publish for this shop (one of its shops); default the owner shop"),
      force: z.boolean().optional(),
      publish_artworks: z.boolean().optional(),
    },
    async ({ campaign_id, channel, connection_id, store_id, force, publish_artworks }) => {
      try {
        const r = await api.post<Dict>(`/studio/campaigns/${campaign_id}/publish`, {
          channel,
          connectionId: connection_id,
          storeId: store_id,
          force: force ?? false,
          publishArtworks: publish_artworks ?? true,
        });
        return jsonText({ launch: r.launch, validation: r.validation, status: "published" });
      } catch (e) {
        return errorText(String((e as Error).message || e));
      }
    },
  );

  server.tool(
    "od_unpublish_campaign",
    "CAMPAIGN: unpublish (back to draft/ready).",
    { campaign_id: z.string() },
    async ({ campaign_id }) => {
      const c = await api.post<Dict>(`/studio/campaigns/${campaign_id}/unpublish`);
      return jsonText({ id: c.id, status: c.status, launches: c.launches });
    },
  );

  server.tool(
    "od_campaign_live_preview",
    "CAMPAIGN: render the product with sample customer values {layerId: value} (option id / text / /uploads image) → preview image URL.",
    {
      campaign_id: z.string(),
      product_id: z.string().optional(),
      values: z.record(z.string()).optional(),
    },
    async ({ campaign_id, product_id, values }) => {
      const r = await api.post<Dict>(`/studio/campaigns/${campaign_id}/live-preview`, {
        productId: product_id,
        values: values || {},
      });
      return jsonText({ ...r, fullUrl: `${api.apiBase}${r.url}` });
    },
  );

  server.tool(
    "od_campaign_shopify_snippet",
    "CAMPAIGN (legacy fallback): static per-campaign Liquid form, no live preview. Prefer the install-once personalizer (od_shopify_storefront_install).",
    { campaign_id: z.string(), product_id: z.string().optional() },
    async ({ campaign_id, product_id }) =>
      jsonText(
        await api.get(`/studio/campaigns/${campaign_id}/shopify-snippet`, { product_id }),
      ),
  );

  server.tool(
    "od_shopify_storefront_install",
    "INTEGRATIONS: install-once storefront personalizer (Shopify app embed steps + one Liquid include). Serves every campaign with a live canvas preview; public data at /public/personalizer/{campaign_product_id}.json.",
    {},
    async () => jsonText(await api.get(`/integrations/shopify/storefront`)),
  );

  server.tool(
    "od_shopify_connections",
    "INTEGRATIONS: connected Shopify shops (token never returned) + setup steps.",
    {},
    async () => jsonText(await api.get("/integrations")),
  );

  // ── one-shot ──────────────────────────────────────────────

  server.tool(
    "od_run_artwork_to_campaign",
    "One-shot: artwork → campaign (variants+pricing, mockups, listing) → validate → optional publish. Pass listing to use your own copy.",
    {
      artwork_id: z.string(),
      title: z.string().optional(),
      product_slug: z.string().optional(),
      sizes: z.array(z.string()).optional(),
      store_id: z.string().optional(),
      channel: z.enum(CHANNELS).optional(),
      pricing: pricingSchema.optional(),
      listing: listingSchema.optional(),
      publish: z.boolean().optional(),
    },
    async (a) => {
      const c = await api.post<Dict & { id: string }>(
        "/studio/campaigns",
        stripUndefined({
          title: a.title,
          artworkId: a.artwork_id,
          productSlug: a.product_slug,
          sizes: a.sizes,
          storeId: a.store_id,
          channel: a.channel,
          pricing: a.pricing,
          listing: a.listing,
          generateMockups: true,
        }),
      );
      const withListing = await api.post<Dict>(`/studio/campaigns/${c.id}/listing/generate`, {
        overwrite: false,
      });
      const validation = await api.post<{ ok: boolean; errors: string[]; warnings: string[] }>(
        `/studio/campaigns/${c.id}/validate`,
      );
      let launch: unknown = null;
      if (a.publish) {
        try {
          const r = await api.post<Dict>(`/studio/campaigns/${c.id}/publish`, {
            channel: a.channel,
          });
          launch = r.launch;
        } catch (e) {
          launch = { error: String((e as Error).message || e) };
        }
      }
      const final = await api.get<Dict>(`/studio/campaigns/${c.id}`);
      return jsonText({
        campaignId: c.id,
        status: final.status,
        products: final.products,
        listing: withListing.listing,
        mockups: final.mockups,
        validation,
        launch,
      });
    },
  );
}
