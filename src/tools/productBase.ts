/**
 * PRODUCT BASE admin — create / edit / delete phôi (products/<slug>/product.json) through the API.
 * Delete moves the folder to products/_trash and is refused while artworks / campaigns use the base.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText, stripUndefined } from "./common.js";

const printAreaSchema = z
  .object({
    key: z.string().describe("front / back / full …"),
    name: z.string().optional(),
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    dpi: z.number().int().positive(),
    bleedPx: z.number().int().min(0).optional(),
    safePx: z.number().int().min(0).optional(),
    template: z.string().optional().describe("Supplier template file under the base folder, e.g. assets/front.png"),
  })
  .passthrough();

const printSpecSchema = z
  .object({
    format: z.enum(["png", "jpg"]).optional(),
    transparent: z.boolean().optional(),
    background: z.string().optional(),
    fit: z.enum(["contain", "cover"]).optional(),
    fileName: z.string().optional().describe("Tokens {order} {sku} {size} {area} {artwork} {product}"),
    bleedPx: z.number().optional(),
    safePx: z.number().optional(),
  })
  .passthrough();

const fieldsSchema = {
  name: z.string().optional(),
  category: z.string().optional(),
  sku_family: z.string().optional(),
  supplier: z.string().optional(),
  source_url: z.string().optional(),
  material: z.string().optional(),
  print_method: z.string().optional(),
  base_color: z.string().optional(),
  price_usd: z.number().optional(),
  features: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  variants: z
    .array(z.record(z.unknown()))
    .optional()
    .describe("[{size, sku, baseCost, pieces, …}]; with options: size = 'Heart / 2PCS' and options: {Style: 'Heart', Pack: '2PCS'}"),
  options: z
    .array(z.object({ name: z.string(), values: z.array(z.string()) }))
    .optional()
    .describe("Variant options like Shopify (max 3), e.g. [{name:'Style',values:['Circle','Heart']},{name:'Pack',values:['1PC','2PCS']}]. Print layout per-size overrides keyed by one option value ('Heart') apply to every variant with it."),
  print_spec: printSpecSchema.optional(),
  print_areas: z.array(printAreaSchema).optional(),
  mockup_templates: z.array(z.record(z.unknown())).optional(),
  store_ids: z.array(z.string()).optional(),
  catalog_sku: z.string().optional(),
  size_specs: z
    .record(z.record(z.unknown()))
    .optional()
    .describe("{size: {widthIn, heightIn, widthCm, heightCm, dpi, aspect}} shown on the Product Base page"),
  fulfillment: z.record(z.unknown()).optional().describe("e.g. {productionDays, shippingUs, packaging}"),
  made_in: z.string().optional(),
  care: z.array(z.string()).optional(),
};

type Fields = { [K in keyof typeof fieldsSchema]?: unknown };

function toBody(a: Fields) {
  return stripUndefined({
    name: a.name,
    category: a.category,
    skuFamily: a.sku_family,
    supplier: a.supplier,
    sourceUrl: a.source_url,
    material: a.material,
    printMethod: a.print_method,
    baseColor: a.base_color,
    priceUsd: a.price_usd,
    features: a.features,
    sizes: a.sizes,
    variants: a.variants,
    options: a.options,
    printSpec: a.print_spec,
    printAreas: a.print_areas,
    mockupTemplates: a.mockup_templates,
    storeIds: a.store_ids,
    catalogSku: a.catalog_sku,
    sizeSpecs: a.size_specs,
    fulfillment: a.fulfillment,
    madeIn: a.made_in,
    care: a.care,
  });
}

export function registerProductBaseTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_create_product_base",
    "PRODUCT BASE: create a new phôi (folder from the product skeleton). slug is optional: leave it out and it is made from name (a-z 0-9 and dashes, unique). " +
      "Give print_areas (px/DPI) so print files and artworks work; then od_upload_product_base_preview.",
    { slug: z.string().optional().describe("leave empty to make it from name"), ...fieldsSchema },
    async ({ slug, ...rest }) =>
      jsonText(await api.post("/studio/product-bases", { slug: slug ?? "", data: toBody(rest as Fields) })),
  );

  server.tool(
    "od_update_product_base",
    "PRODUCT BASE: edit fields (replaces each given top-level field; others in product.json are kept).",
    { slug: z.string(), ...fieldsSchema },
    async ({ slug, ...rest }) => jsonText(await api.patch(`/studio/product-bases/${slug}`, toBody(rest as Fields))),
  );

  server.tool(
    "od_get_product_base_json",
    "PRODUCT BASE: raw product.json (for advanced edits with od_put_product_base_json).",
    { slug: z.string() },
    async ({ slug }) => jsonText(await api.get(`/studio/product-bases/${slug}/json`)),
  );

  server.tool(
    "od_put_product_base_json",
    "PRODUCT BASE: replace the whole product.json (advanced; slug cannot change).",
    { slug: z.string(), product: z.record(z.unknown()) },
    async ({ slug, product }) => jsonText(await api.put(`/studio/product-bases/${slug}/json`, { product })),
  );

  server.tool(
    "od_upload_product_base_preview",
    "PRODUCT BASE: upload the phôi photo (JPG/PNG/WebP) shown on the list and editor.",
    { slug: z.string(), file_path: z.string() },
    async ({ slug, file_path }) => jsonText(await api.uploadFile(`/studio/product-bases/${slug}/preview`, file_path)),
  );

  server.tool(
    "od_upload_product_base_file",
    "PRODUCT BASE: upload a supplier file from disk. kind: print (blank print template → 'File in (blank)' per size), " +
      "guide (template with bleed / die-cut / safe lines; with area = that print area's template, e.g. the 2-sided layout), " +
      "psd (template PSD), gallery (product photo shown on the base page), mask (die-cut silhouette PNG, white = product, shapes previews), " +
      "layout (just stored under assets/layout/ — returns uploaded.file to use in od_set_print_layouts as template / mask / image src). " +
      "sizes: limit print/guide to these sizes (default all).",
    {
      slug: z.string(),
      file_path: z.string(),
      kind: z.enum(["print", "guide", "psd", "gallery", "mask", "layout"]),
      sizes: z.array(z.string()).optional(),
      label: z.string().optional(),
      area: z.string().optional().describe("guide only: print area key whose template this is"),
    },
    async ({ slug, file_path, kind, sizes, label, area }) =>
      jsonText(
        await api.uploadFile(`/studio/product-bases/${slug}/files`, file_path, {
          kind,
          sizes: sizes?.join(","),
          label,
          area,
        }),
      ),
  );

  server.tool(
    "od_get_print_layouts",
    "PRINT LAYOUT: the print files a Product Base produces, as layers on a canvas (like an artwork). " +
      "declared=false means a draft derived from the legacy printAreas — save it with od_set_print_layouts to edit. " +
      "resolved = layouts for `size` with per-size overrides applied.",
    { slug: z.string(), size: z.string().optional() },
    async ({ slug, size }) => jsonText(await api.get(`/studio/product-bases/${slug}/print-layouts`, { size })),
  );

  server.tool(
    "od_set_print_layouts",
    "PRINT LAYOUT: replace the base's printLayouts = the print files of every order item. Each artwork gets one page per file, " +
      "same size, drawn 1:1 (the artwork shows exactly what prints). File: " +
      "{key, name, width, height, dpi, format png|jpg, colorMode rgb|cmyk, transparent, background, fileName ('{order}_{sku}_{layout}'), " +
      "side (fulfiller side, default key), template (assets/... guide at exact size), templateMode guide|print, " +
      "mask (assets/... PNG white=product, storefront shape), maskPrint (cut the file to it), fit cover|contain + align center|left|right|top|bottom " +
      "(used when a size's file differs from the page), layers[], sizes{<size>: {width, height, template, align, fileName…, layers: {<layerId>: patch}}}}. " +
      "Layers (marks on top): image {id, src, x, y, width, height}; text {id, text with {order} {sku} {size} {item} {layout} tokens, fontSize, fontFamily, fill, align}; code {id, userCode}. " +
      "Back side / cut shape are areas of the artwork page; layers printed only on TWO SIDES carry the condition __sides = 2.",
    { slug: z.string(), layouts: z.array(z.record(z.unknown())) },
    async ({ slug, layouts }) => jsonText(await api.put(`/studio/product-bases/${slug}/print-layouts`, { layouts })),
  );

  server.tool(
    "od_product_base_usage",
    "PRODUCT BASE: artworks / campaigns that still use this base (delete is refused while any do).",
    { slug: z.string() },
    async ({ slug }) => jsonText(await api.get(`/studio/product-bases/${slug}/usage`)),
  );

  server.tool(
    "od_duplicate_product_base",
    "PRODUCT BASE: copy a phôi (whole folder: print layouts, templates, mockups, images) under a new name; slug is made from the name, productCode is not copied.",
    { slug: z.string(), name: z.string().optional().describe("new name; empty = '<name> (bản sao)'"), store_id: z.string().optional() },
    async ({ slug, name, store_id }) =>
      jsonText(await api.post(`/studio/product-bases/${slug}/duplicate`, { name: name ?? "", storeId: store_id })),
  );

  server.tool(
    "od_delete_product_base",
    "PRODUCT BASE: delete (moves the folder to products/_trash — recoverable). force=true deletes even if in use.",
    { slug: z.string(), force: z.boolean().optional() },
    async ({ slug, force }) => jsonText(await api.delete(`/studio/product-bases/${slug}`, { force })),
  );
}
