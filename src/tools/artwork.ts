/**
 * ARTWORK tools — Teeinblue-parity design tool.
 * Artwork = Product Base canvas + templates; each template = imageDoc.layers.
 * Interactive layers ARE the customer form (order = template.positions).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import {
  LAYER_TYPES,
  compactArtwork,
  compactLayerResult,
  errorText,
  imageSourceSchema,
  jsonText,
  layerPropsSchema,
  stripUndefined,
} from "./common.js";

type Dict = Record<string, unknown>;
type Artwork = Dict & {
  id: string;
  activeTemplateId?: string;
  templates?: Array<Dict & { id: string; imageDoc?: { layers?: Array<Dict & { id: string; src?: string }> } }>;
};

export async function setLayerImage(
  api: WebtoolsClient,
  artworkId: string,
  layerId: string,
  templateId: string | undefined,
  img: { file_path?: string; asset_id?: string; url?: string; fit_to_image?: boolean },
): Promise<unknown> {
  const given = [img.file_path, img.asset_id, img.url].filter(Boolean).length;
  if (given !== 1) throw new Error("Provide exactly one of file_path | asset_id | url");
  if (img.file_path) {
    const art = await api.uploadFile<Artwork>(
      `/studio/artworks/${artworkId}/layers/upload`,
      img.file_path,
      { layer_id: layerId, template_id: templateId },
    );
    if (!img.fit_to_image) return compactArtwork(art);
    const tid = templateId || art.activeTemplateId;
    const tpl = art.templates?.find((t) => t.id === tid);
    const src = tpl?.imageDoc?.layers?.find((l) => l.id === layerId)?.src;
    if (!src) return compactArtwork(art);
    return compactLayerResult(
      await api.post(`/studio/artworks/${artworkId}/layers/${layerId}/src`, {
        templateId,
        url: src,
        fitToImage: true,
      }),
    );
  }
  return compactLayerResult(
    await api.post(`/studio/artworks/${artworkId}/layers/${layerId}/src`, {
      templateId,
      assetId: img.asset_id,
      url: img.url,
      fitToImage: img.fit_to_image ?? false,
    }),
  );
}

const layerSpecSchema = z.object({
  type: z.enum(LAYER_TYPES),
  props: layerPropsSchema.optional(),
  image: imageSourceSchema.optional().describe("Optional image for photo/static/clipart/blank layers"),
});

export function registerArtworkTools(server: McpServer, api: WebtoolsClient): void {
  // ── discovery ─────────────────────────────────────────────

  server.tool(
    "od_list_product_bases",
    "ARTWORK: list Product Bases (phôi) from webtools/products/*/product.json — slug, sizes, variants, print size.",
    {},
    async () => jsonText(await api.get("/studio/product-bases")),
  );

  server.tool(
    "od_get_product_base",
    "ARTWORK: full Product Base detail — per-size print px/DPI, phôi preview URL, print file + PSD download links, costs, features. Call od_get_product_base_guide first to read how this phôi's print file is made.",
    { slug: z.string() },
    async ({ slug }) => jsonText(await api.get(`/studio/product-bases/${encodeURIComponent(slug)}`)),
  );

  server.tool(
    "od_list_layer_types",
    "ARTWORK: catalog of layer types (Teeinblue 'Select a layer type') + rules for form/condition/binding.",
    {},
    async () => jsonText(await api.get("/studio/layer-types")),
  );

  // ── CRUD ──────────────────────────────────────────────────

  server.tool(
    "od_list_artworks",
    "ARTWORK: list artworks (summary). Filters: store_id, product_slug, archived.",
    {
      store_id: z.string().optional(),
      product_slug: z.string().optional(),
      archived: z.boolean().optional(),
    },
    async ({ store_id, product_slug, archived }) =>
      jsonText(
        await api.get("/studio/artworks", {
          store_id,
          product_slug,
          archived: archived ?? false,
        }),
      ),
  );

  server.tool(
    "od_get_artwork",
    "ARTWORK: full artwork (templates → imageDoc.layers, positions, meta). Version snapshots trimmed unless full=true.",
    { artwork_id: z.string(), full: z.boolean().optional() },
    async ({ artwork_id, full }) => {
      const art = await api.get(`/studio/artworks/${artwork_id}`);
      return jsonText(full ? art : compactArtwork(art));
    },
  );

  server.tool(
    "od_create_artwork",
    "ARTWORK: create a blank artwork on a Product Base (one template with Product Base layer 'layer-blank'). Then add layers with od_artwork_add_layer.",
    {
      title: z.string(),
      product_slug: z.string().describe("od_list_product_bases → slug"),
      size: z.string().optional().describe("Product Base size, e.g. 30X40 (default: recommended). Sets phôi image + print spec"),
      store_id: z.string().optional(),
      meta: z
        .object({
          psychology: z.string().optional(),
          productFit: z.string().optional(),
          artPrompt: z.string().optional(),
          visualizePrompt: z.string().optional(),
          fbCaption: z.string().optional(),
          listing: z.record(z.unknown()).optional(),
          templateSettings: z
            .object({
              label: z.string().optional(),
              displayType: z.string().optional(),
              showInCart: z.boolean().optional(),
            })
            .optional(),
        })
        .passthrough()
        .optional()
        .describe("Brief carried to Campaign listing"),
    },
    async ({ title, product_slug, size, store_id, meta }) => {
      let art = await api.post<Artwork>("/studio/artworks", {
        title,
        productSlug: product_slug,
        size,
        storeId: store_id,
      });
      if (meta) art = await api.patch<Artwork>(`/studio/artworks/${art.id}`, { meta });
      return jsonText(compactArtwork(art));
    },
  );

  server.tool(
    "od_upsert_artwork",
    "ARTWORK: create (no artwork_id; needs product_slug) or patch title/status/meta/templates/active_template_id/archived.",
    {
      artwork_id: z.string().optional(),
      title: z.string().optional(),
      product_slug: z.string().optional(),
      store_id: z.string().optional(),
      templates: z.array(z.record(z.unknown())).optional(),
      active_template_id: z.string().optional(),
      meta: z.record(z.unknown()).optional(),
      status: z.enum(["unpublished", "published"]).optional(),
      archived: z.boolean().optional(),
    },
    async (args) => {
      if (!args.artwork_id) {
        if (!args.product_slug) return errorText("product_slug required to create");
        let art = await api.post<Artwork>("/studio/artworks", {
          title: args.title || "Untitled artwork",
          productSlug: args.product_slug,
          storeId: args.store_id,
        });
        const patch = stripUndefined({
          templates: args.templates,
          activeTemplateId: args.active_template_id,
          meta: args.meta,
          status: args.status,
        });
        if (Object.keys(patch).length) {
          art = await api.patch<Artwork>(`/studio/artworks/${art.id}`, patch);
        }
        return jsonText(compactArtwork(art));
      }
      return jsonText(
        compactArtwork(
          await api.patch(
            `/studio/artworks/${args.artwork_id}`,
            stripUndefined({
              title: args.title,
              templates: args.templates,
              activeTemplateId: args.active_template_id,
              meta: args.meta,
              status: args.status,
              archived: args.archived,
              storeId: args.store_id,
            }),
          ),
        ),
      );
    },
  );

  server.tool(
    "od_import_artwork",
    "ARTWORK: create artwork from a ready imageDoc ({width,height,layers:[...]}) — positions auto-derived.",
    {
      title: z.string(),
      product_slug: z.string(),
      store_id: z.string().optional(),
      imageDoc: z.record(z.unknown()),
    },
    async ({ title, product_slug, store_id, imageDoc }) =>
      jsonText(
        compactArtwork(
          await api.post("/studio/artworks/import", {
            title,
            productSlug: product_slug,
            storeId: store_id,
            imageDoc,
          }),
        ),
      ),
  );

  server.tool(
    "od_duplicate_artwork",
    "ARTWORK: duplicate an artwork (new id, unpublished).",
    { artwork_id: z.string() },
    async ({ artwork_id }) =>
      jsonText(compactArtwork(await api.post(`/studio/artworks/${artwork_id}/duplicate`))),
  );

  server.tool(
    "od_copy_to_shop",
    "SHOP: copy Product Bases, Artworks and/or Campaigns into another shop (source shop unchanged). A campaign brings its artworks and Product Bases; an artwork brings its Product Base. Copying again reuses earlier copies. all_from_store_id copies everything of that shop. Needs edit rights in both shops.",
    {
      to_store_id: z.string(),
      product_bases: z.array(z.string()).optional(),
      artworks: z.array(z.string()).optional(),
      campaigns: z.array(z.string()).optional(),
      all_from_store_id: z.string().optional(),
    },
    async (a) =>
      jsonText(
        await api.post(`/studio/copy-to-shop`, {
          toStoreId: a.to_store_id,
          productBases: a.product_bases || [],
          artworks: a.artworks || [],
          campaigns: a.campaigns || [],
          allFromStoreId: a.all_from_store_id,
        }),
      ),
  );

  server.tool(
    "od_share_to_shop",
    "SHOP: share Product Bases, Artworks and/or Campaigns with another shop instead of copying (\"dùng chung\"): ONE item and one set of files used by both shops — no storage used, edits show in every shop. A campaign shares its artworks and Product Bases; an artwork shares its Product Base. A shared campaign keeps one price list / currency; publish it per shop with od_publish_campaign store_id. Prefer this over od_copy_to_shop unless the other shop must change the item on its own.",
    {
      to_store_id: z.string(),
      product_bases: z.array(z.string()).optional(),
      artworks: z.array(z.string()).optional(),
      campaigns: z.array(z.string()).optional(),
      all_from_store_id: z.string().optional(),
      permission: z.enum(["viewer", "editor"]).optional().describe("viewer (default): the other shop uses it but can't edit; editor: it can edit too"),
    },
    async (a) =>
      jsonText(
        await api.post(`/studio/share-to-shop`, {
          toStoreId: a.to_store_id,
          productBases: a.product_bases || [],
          artworks: a.artworks || [],
          campaigns: a.campaigns || [],
          allFromStoreId: a.all_from_store_id,
          permission: a.permission,
        }),
      ),
  );

  server.tool(
    "od_rebind_to_master_shop",
    "SHOP: make store_id use master_id's Product Bases and Artworks instead of its own copies: shares them (viewer/editor), repoints store_id's campaigns and orders by product code, and moves its unused copies to trash. Campaigns stay the shop's own. dry_run=true returns the plan only.",
    {
      store_id: z.string(),
      master_id: z.string(),
      permission: z.enum(["viewer", "editor"]).optional(),
      delete_old: z.boolean().optional(),
      dry_run: z.boolean().optional(),
    },
    async (a) =>
      jsonText(
        a.dry_run
          ? await api.get(`/studio/rebind-plan`, { store_id: a.store_id, master_id: a.master_id })
          : await api.post(`/studio/rebind`, {
              storeId: a.store_id,
              masterId: a.master_id,
              permission: a.permission || "viewer",
              deleteOld: a.delete_old ?? true,
            }),
      ),
  );

  server.tool(
    "od_unshare_from_shop",
    "SHOP: stop sharing items with a shop (the owner shop keeps them; nothing is deleted). A Product Base keeps at least one shop.",
    {
      store_id: z.string(),
      product_bases: z.array(z.string()).optional(),
      artworks: z.array(z.string()).optional(),
      campaigns: z.array(z.string()).optional(),
    },
    async (a) =>
      jsonText(
        await api.post(`/studio/unshare-from-shop`, {
          storeId: a.store_id,
          productBases: a.product_bases || [],
          artworks: a.artworks || [],
          campaigns: a.campaigns || [],
        }),
      ),
  );

  server.tool(
    "od_artwork_move_to_base",
    "ARTWORK: move an artwork onto another Product Base of the shop (templates and layers kept), e.g. after merging bases into one with variant options.",
    { artwork_id: z.string(), product_slug: z.string() },
    async ({ artwork_id, product_slug }) =>
      jsonText(compactArtwork(await api.patch(`/studio/artworks/${artwork_id}`, { productSlug: product_slug }))),
  );

  server.tool(
    "od_archive_artwork",
    "ARTWORK: archive (archived=true, default) or restore (archived=false).",
    { artwork_id: z.string(), archived: z.boolean().optional() },
    async ({ artwork_id, archived }) =>
      jsonText(
        compactArtwork(
          archived === false
            ? await api.patch(`/studio/artworks/${artwork_id}`, { archived: false })
            : await api.post(`/studio/artworks/${artwork_id}/archive`),
        ),
      ),
  );

  server.tool(
    "od_publish_artwork",
    "ARTWORK: set status published (default) / unpublished. Validates first unless force=true.",
    {
      artwork_id: z.string(),
      published: z.boolean().optional(),
      force: z.boolean().optional(),
    },
    async ({ artwork_id, published, force }) => {
      const pub = published ?? true;
      if (pub && !force) {
        const v = await api.post<{ ok: boolean; errors: string[] }>(
          `/studio/artworks/${artwork_id}/validate`,
        );
        if (!v.ok) return errorText("Artwork invalid — fix or pass force=true", v as Dict);
      }
      return jsonText(
        compactArtwork(
          await api.patch(`/studio/artworks/${artwork_id}`, {
            status: pub ? "published" : "unpublished",
          }),
        ),
      );
    },
  );

  server.tool(
    "od_delete_artwork",
    "ARTWORK: delete permanently (campaigns using it will fail validation).",
    { artwork_id: z.string() },
    async ({ artwork_id }) => jsonText(await api.delete(`/studio/artworks/${artwork_id}`)),
  );

  // ── templates ─────────────────────────────────────────────

  server.tool(
    "od_artwork_add_template",
    "ARTWORK: add template variant (clone active by default; clone_from_active=false → blank). Becomes active.",
    {
      artwork_id: z.string(),
      name: z.string().optional(),
      clone_from_active: z.boolean().optional(),
    },
    async ({ artwork_id, name, clone_from_active }) =>
      jsonText(
        compactArtwork(
          await api.post(`/studio/artworks/${artwork_id}/templates`, {
            name: name || "Template",
            cloneFromActive: clone_from_active ?? true,
          }),
        ),
      ),
  );

  server.tool(
    "od_artwork_update_template",
    "ARTWORK: rename a template, replace its imageDoc / positions, or set the customer form (Options ImageBox) height.",
    {
      artwork_id: z.string(),
      template_id: z.string(),
      name: z.string().optional(),
      imageDoc: z.record(z.unknown()).optional(),
      positions: z.array(z.string()).optional(),
      form_view_height: z
        .number()
        .int()
        .min(240)
        .max(6000)
        .optional()
        .describe("Options ImageBox height in form px (width is 400). Never shorter than the lowest control."),
    },
    async ({ artwork_id, template_id, name, imageDoc, positions, form_view_height }) => {
      let doc = imageDoc;
      if (form_view_height !== undefined) {
        if (!doc) {
          const art = await api.get<Artwork>(`/studio/artworks/${artwork_id}`);
          const tpl = art.templates?.find((t) => t.id === template_id);
          if (!tpl?.imageDoc) return errorText(`Template not found: ${template_id}`);
          doc = tpl.imageDoc as Record<string, unknown>;
        }
        doc = { ...doc, formViewHeight: form_view_height };
      }
      return jsonText(
        compactArtwork(
          await api.patch(
            `/studio/artworks/${artwork_id}/templates/${template_id}`,
            stripUndefined({ name, imageDoc: doc, positions }),
          ),
        ),
      );
    },
  );

  server.tool(
    "od_artwork_duplicate_template",
    "ARTWORK: deep-copy a template variant.",
    { artwork_id: z.string(), template_id: z.string() },
    async ({ artwork_id, template_id }) =>
      jsonText(
        compactArtwork(
          await api.post(`/studio/artworks/${artwork_id}/templates/${template_id}/duplicate`),
        ),
      ),
  );

  server.tool(
    "od_artwork_delete_template",
    "ARTWORK: delete a template variant (keeps at least one).",
    { artwork_id: z.string(), template_id: z.string() },
    async ({ artwork_id, template_id }) =>
      jsonText(
        compactArtwork(await api.delete(`/studio/artworks/${artwork_id}/templates/${template_id}`)),
      ),
  );

  server.tool(
    "od_artwork_set_layers",
    "ARTWORK (bulk): replace ALL templates. Prefer od_artwork_add_layer / update_layer for edits.",
    {
      artwork_id: z.string(),
      templates: z.array(z.record(z.unknown())),
      active_template_id: z.string().optional(),
    },
    async ({ artwork_id, templates, active_template_id }) =>
      jsonText(
        compactArtwork(
          await api.patch(`/studio/artworks/${artwork_id}`, {
            templates,
            activeTemplateId: active_template_id,
          }),
        ),
      ),
  );

  // ── layers ────────────────────────────────────────────────

  server.tool(
    "od_artwork_add_layer",
    "ARTWORK: add a layer by type with editor defaults (text, photo-upload, clipart-category, additional-option, color, static-photo, blank…). " +
      "props override defaults (x/y/width/height, text, fontFamily, formLabel, options, condition, bindTargetLayerId…). " +
      "Interactive layers auto-join form positions. Optional image sets src.",
    {
      artwork_id: z.string(),
      type: z.enum(LAYER_TYPES),
      template_id: z.string().optional().describe("Default: active template"),
      props: layerPropsSchema.optional(),
      index: z.number().int().optional().describe("z-index in layers (0=bottom). Default top"),
      position_index: z.number().int().optional().describe("Form order index. Default last"),
      image: imageSourceSchema.optional(),
    },
    async ({ artwork_id, type, template_id, props, index, position_index, image }) => {
      const res = await api.post<{ layer: { id: string }; templateId: string; artwork: unknown }>(
        `/studio/artworks/${artwork_id}/layers`,
        { type, templateId: template_id, props: props || {}, index, positionIndex: position_index },
      );
      if (image) {
        const withImg = await setLayerImage(api, artwork_id, res.layer.id, res.templateId, image);
        return jsonText({ addedLayerId: res.layer.id, templateId: res.templateId, result: withImg });
      }
      return jsonText(compactLayerResult(res));
    },
  );

  server.tool(
    "od_artwork_update_layer",
    "ARTWORK: patch one layer (merge props). Locked layers refuse geometry changes unless props.locked=false.",
    {
      artwork_id: z.string(),
      layer_id: z.string(),
      template_id: z.string().optional(),
      props: layerPropsSchema,
    },
    async ({ artwork_id, layer_id, template_id, props }) =>
      jsonText(
        compactLayerResult(
          await api.patch(`/studio/artworks/${artwork_id}/layers/${layer_id}`, {
            templateId: template_id,
            props,
          }),
        ),
      ),
  );

  server.tool(
    "od_artwork_delete_layer",
    "ARTWORK: delete a layer (also clears bindings/conditions pointing at it).",
    { artwork_id: z.string(), layer_id: z.string(), template_id: z.string().optional() },
    async ({ artwork_id, layer_id, template_id }) =>
      jsonText(
        compactArtwork(
          await api.delete(`/studio/artworks/${artwork_id}/layers/${layer_id}`, {
            template_id,
          }),
        ),
      ),
  );

  server.tool(
    "od_artwork_reorder_layers",
    "ARTWORK: z-order (bottom → top). Partial list re-orders only those layers among their slots.",
    {
      artwork_id: z.string(),
      layer_ids: z.array(z.string()),
      template_id: z.string().optional(),
    },
    async ({ artwork_id, layer_ids, template_id }) =>
      jsonText(
        compactArtwork(
          await api.post(`/studio/artworks/${artwork_id}/layers/reorder`, {
            templateId: template_id,
            layerIds: layer_ids,
          }),
        ),
      ),
  );

  server.tool(
    "od_artwork_set_positions",
    "ARTWORK: customer form field order (interactive layer ids). 'template-layer' sentinel kept automatically.",
    {
      artwork_id: z.string(),
      positions: z.array(z.string()),
      template_id: z.string().optional(),
    },
    async ({ artwork_id, positions, template_id }) => {
      const r = await api.put<Dict>(`/studio/artworks/${artwork_id}/positions`, {
        templateId: template_id,
        positions,
      });
      return jsonText({ templateId: r.templateId, positions: r.positions });
    },
  );

  server.tool(
    "od_artwork_set_layer_image",
    "ARTWORK: set a layer's image from a local file, an Uploaded Asset, or a URL. Product Base (blank) accepts image even when locked.",
    {
      artwork_id: z.string(),
      layer_id: z.string(),
      template_id: z.string().optional(),
      file_path: z.string().optional(),
      asset_id: z.string().optional(),
      url: z.string().optional(),
      fit_to_image: z.boolean().optional(),
    },
    async ({ artwork_id, layer_id, template_id, ...img }) =>
      jsonText(await setLayerImage(api, artwork_id, layer_id, template_id, img)),
  );

  server.tool(
    "od_artwork_composite",
    "ARTWORK: re-render thumbnail (flatten print layers at Product Base size).",
    { artwork_id: z.string(), template_id: z.string().optional() },
    async ({ artwork_id, template_id }) => {
      const art = await api.post<Dict>(`/studio/artworks/${artwork_id}/composite`, undefined, {
        template_id,
      });
      return jsonText({
        thumbnailUrl: art.thumbnailUrl,
        fullUrl: art.thumbnailUrl ? `${api.apiBase}${art.thumbnailUrl}` : null,
      });
    },
  );

  // ── form / validate ───────────────────────────────────────

  server.tool(
    "od_artwork_form_preview",
    "ARTWORK: customer form projection (fields in positions order, visibility under `values`).",
    { artwork_id: z.string(), values: z.record(z.string()).optional() },
    async ({ artwork_id, values }) =>
      jsonText(
        await api.post(`/studio/artworks/${artwork_id}/form-preview`, { values: values || {} }),
      ),
  );

  server.tool(
    "od_artwork_auto_form_layout",
    "ARTWORK: re-flow the customer form (Options ImageBox) — one control per row in form order (positions), " +
      "height by kind/option count; controls hidden by conditions collapse (formFlow=stack). Default: all templates.",
    { artwork_id: z.string(), template_id: z.string().optional() },
    async ({ artwork_id, template_id }) =>
      jsonText(compactArtwork(await api.post(`/studio/artworks/${artwork_id}/form-layout/auto`, stripUndefined({ templateId: template_id })))),
  );

  server.tool(
    "od_validate_artwork",
    "ARTWORK: validate positions / dependencies before publish.",
    { artwork_id: z.string() },
    async ({ artwork_id }) => jsonText(await api.post(`/studio/artworks/${artwork_id}/validate`)),
  );

  // ── history ───────────────────────────────────────────────

  server.tool(
    "od_artwork_history",
    "ARTWORK: versions (restorable) + activity log, newest first.",
    { artwork_id: z.string() },
    async ({ artwork_id }) => {
      const h = await api.get<{ versions: Dict[]; activity: Dict[] }>(
        `/studio/artworks/${artwork_id}/history`,
      );
      return jsonText({
        versions: (h.versions || []).map(({ snapshot: _s, ...v }) => v),
        activity: (h.activity || []).slice(0, 30),
      });
    },
  );

  server.tool(
    "od_artwork_save_version",
    "ARTWORK: snapshot current state as a restorable version.",
    { artwork_id: z.string(), note: z.string().optional() },
    async ({ artwork_id, note }) =>
      jsonText(
        await api.post(`/studio/artworks/${artwork_id}/versions`, { note: note || "Saved version" }),
      ),
  );

  server.tool(
    "od_artwork_restore_version",
    "ARTWORK: restore a version (current state is saved first).",
    { artwork_id: z.string(), version_id: z.string() },
    async ({ artwork_id, version_id }) =>
      jsonText(
        compactArtwork(
          await api.post(`/studio/artworks/${artwork_id}/versions/${version_id}/restore`),
        ),
      ),
  );

  server.tool(
    "od_migrate_project_to_artworks",
    "ARTWORK: one-shot convert a lifecycle project's concepts → artworks (keeps psychology/listing in meta).",
    { project_id: z.string() },
    async ({ project_id }) =>
      jsonText(await api.post(`/studio/artworks/migrate-from-project/${project_id}`)),
  );

  // ── Uploaded Assets / Fonts (artwork libraries) ───────────

  server.tool(
    "od_list_asset_categories",
    "ASSETS: list Uploaded Assets categories.",
    {},
    async () => jsonText(await api.get("/studio/assets/categories")),
  );

  server.tool(
    "od_create_asset_category",
    "ASSETS: create an asset category.",
    { name: z.string() },
    async ({ name }) => jsonText(await api.post("/studio/assets/categories", { name })),
  );

  server.tool(
    "od_rename_asset_category",
    "ASSETS: rename an asset category (not 'all').",
    { category_id: z.string(), name: z.string() },
    async ({ category_id, name }) =>
      jsonText(await api.patch(`/studio/assets/categories/${category_id}`, { name })),
  );

  server.tool(
    "od_delete_asset_category",
    "ASSETS: delete an asset category; its assets are kept (uncategorised, listed under All).",
    { category_id: z.string() },
    async ({ category_id }) => jsonText(await api.delete(`/studio/assets/categories/${category_id}`)),
  );

  server.tool(
    "od_list_font_categories",
    "FONTS: list font categories (built-in sans/serif/display/script/handwriting + custom).",
    {},
    async () => jsonText(await api.get("/studio/fonts/categories")),
  );

  server.tool(
    "od_create_font_category",
    "FONTS: create a font category.",
    { name: z.string() },
    async ({ name }) => jsonText(await api.post("/studio/fonts/categories", { name })),
  );

  server.tool(
    "od_rename_font_category",
    "FONTS: rename a font category (built-in ones too, not 'all').",
    { category_id: z.string(), name: z.string() },
    async ({ category_id, name }) =>
      jsonText(await api.patch(`/studio/fonts/categories/${category_id}`, { name })),
  );

  server.tool(
    "od_delete_font_category",
    "FONTS: delete a custom font category (built-in ones can't be deleted); its fonts move to Sans.",
    { category_id: z.string() },
    async ({ category_id }) => jsonText(await api.delete(`/studio/fonts/categories/${category_id}`)),
  );

  server.tool(
    "od_list_assets",
    "ASSETS: list Uploaded Assets (images for Static Image / Photo Upload / clipart options). " +
      "page + page_size paginate (returns total); each asset has url (original) and thumbUrl (small WebP).",
    {
      category_id: z.string().optional(),
      q: z.string().optional(),
      page: z.number().int().min(1).optional(),
      page_size: z.number().int().min(1).max(200).optional(),
    },
    async ({ category_id, q, page, page_size }) =>
      jsonText(await api.get("/studio/assets", { category_id, q, page, page_size })),
  );

  server.tool(
    "od_upload_asset",
    "ASSETS: upload a local image file into Uploaded Assets → returns {id, url}.",
    {
      file_path: z.string(),
      category_id: z.string().optional(),
      name: z.string().optional(),
    },
    async ({ file_path, category_id, name }) =>
      jsonText(
        await api.uploadFile("/studio/assets/upload", file_path, { category_id, name }),
      ),
  );

  server.tool(
    "od_delete_asset",
    "ASSETS: delete an uploaded asset.",
    { asset_id: z.string() },
    async ({ asset_id }) => jsonText(await api.delete(`/studio/assets/${asset_id}`)),
  );

  server.tool(
    "od_list_studio_fonts",
    "FONTS: list artwork fonts (uploaded TTF/OTF + categories). Use `family` as layer fontFamily.",
    { category_id: z.string().optional(), q: z.string().optional() },
    async ({ category_id, q }) => jsonText(await api.get("/studio/fonts", { category_id, q })),
  );

  server.tool(
    "od_upload_font",
    "FONTS: upload a local TTF/OTF/WOFF font for artwork text layers.",
    {
      file_path: z.string(),
      category_id: z.string().optional(),
      name: z.string().optional(),
    },
    async ({ file_path, category_id, name }) =>
      jsonText(await api.uploadFile("/studio/fonts/upload", file_path, { category_id, name })),
  );

  // ── one-shot builder ──────────────────────────────────────

  server.tool(
    "od_artwork_build",
    "ARTWORK one-shot: create artwork on a Product Base + add layers in order (+images) + composite + validate. " +
      "Use `ref` in a layer's props.id to reference it from later layers (condition.dependencies[].element / bindTargetLayerId). " +
      "base_image sets the Product Base (phôi) layer image.",
    {
      title: z.string(),
      product_slug: z.string(),
      size: z.string().optional().describe("Product Base size, e.g. 30X40"),
      store_id: z.string().optional(),
      meta: z.record(z.unknown()).optional(),
      base_image: imageSourceSchema.optional().describe("Override the Product Base phôi image (default: base preview for size)"),
      layers: z.array(layerSpecSchema).describe("Bottom → top"),
      publish: z.boolean().optional(),
    },
    async ({ title, product_slug, size, store_id, meta, base_image, layers, publish }) => {
      let art = await api.post<Artwork>("/studio/artworks", {
        title,
        productSlug: product_slug,
        size,
        storeId: store_id,
      });
      const aid = art.id;
      if (meta) art = await api.patch<Artwork>(`/studio/artworks/${aid}`, { meta });
      const tid = art.activeTemplateId;
      const steps: Dict[] = [];
      if (base_image) {
        await setLayerImage(api, aid, "layer-blank", tid, base_image);
        steps.push({ layerId: "layer-blank", image: true });
      }
      for (const spec of layers) {
        const r = await api.post<{ layer: { id: string; name?: string } }>(
          `/studio/artworks/${aid}/layers`,
          { type: spec.type, templateId: tid, props: spec.props || {} },
        );
        if (spec.image) await setLayerImage(api, aid, r.layer.id, tid, spec.image);
        steps.push({ layerId: r.layer.id, type: spec.type, name: r.layer.name, image: !!spec.image });
      }
      const comp = await api.post<Dict>(`/studio/artworks/${aid}/composite`);
      const validation = await api.post<{ ok: boolean }>(`/studio/artworks/${aid}/validate`);
      const form = await api.post(`/studio/artworks/${aid}/form-preview`, { values: {} });
      if (publish && validation.ok) {
        await api.patch(`/studio/artworks/${aid}`, { status: "published" });
      }
      return jsonText({
        artworkId: aid,
        templateId: tid,
        layers: steps,
        thumbnailUrl: comp.thumbnailUrl,
        validation,
        form,
        published: Boolean(publish && validation.ok),
        hint: "Open /app/artworks/" + aid + " in CreTip web to see the canvas",
      });
    },
  );
}
