/**
 * MEDIA tools — product mockups from an artwork and promo videos for a campaign.
 * Mockup templates live on the Product Base (product.json "mockupTemplates");
 * videos are slideshow ads (Ken Burns + cross-fades + outro + optional music) built with ffmpeg.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText, stripUndefined } from "./common.js";

type Dict = Record<string, unknown>;
type Campaign = Dict & {
  id: string;
  mockups?: Array<Dict & { id: string; url: string; kind?: string; label?: string; isPrimary?: boolean }>;
  videos?: Array<Dict & { id: string; url: string; posterUrl?: string }>;
};

function abs(api: WebtoolsClient, u?: unknown): string | null {
  const s = typeof u === "string" ? u : "";
  if (!s) return null;
  return /^https?:\/\//.test(s) ? s : `${api.apiBase}${s}`;
}

function media(api: WebtoolsClient, c: Campaign) {
  return {
    campaignId: c.id,
    mockups: (c.mockups || []).map((m) => ({
      id: m.id,
      kind: m.kind,
      label: m.label || m.mockupTemplate || m.templateName,
      isPrimary: !!m.isPrimary,
      productId: m.productId,
      url: abs(api, m.url),
    })),
    videos: (c.videos || []).map((v) => ({
      id: v.id,
      format: v.format,
      duration: v.duration,
      url: abs(api, v.url),
      posterUrl: abs(api, v.posterUrl),
      createdAt: v.createdAt,
    })),
  };
}

export function registerMediaTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_list_mockup_templates",
    "MOCKUP: templates of a Product Base (scene photo with print quad, studio, hanging, close-up detail…).",
    { product_slug: z.string() },
    async ({ product_slug }) => jsonText(await api.get(`/studio/product-bases/${product_slug}/mockup-templates`)),
  );

  server.tool(
    "od_list_mockup_scene_presets",
    "MOCKUP: preset room scenes for AI mockups (sofa, bed, wall, armchair, picnic, christmas, nursery).",
    { product_slug: z.string() },
    async ({ product_slug }) => jsonText(await api.get(`/studio/product-bases/${product_slug}/mockup-scenes/presets`)),
  );

  server.tool(
    "od_generate_mockup_scene",
    "MOCKUP: create a photoreal lifestyle scene for a Product Base with Google Gemini (needs GEMINI_API_KEY on the backend). " +
      "The AI only paints the room with a plain blank product; CreTip detects the product's mask + 4 corners and later warps " +
      "the real print onto it (faces/names stay exact). Adds a 'scene' mockup template. ~20–40 s.",
    {
      product_slug: z.string(),
      preset: z.string().optional().describe("od_list_mockup_scene_presets key (default sofa)"),
      prompt: z.string().optional().describe("Custom scene description instead of a preset ({product} = product name)"),
      name: z.string().optional(),
    },
    async ({ product_slug, preset, prompt, name }) =>
      jsonText(await api.post(`/studio/product-bases/${product_slug}/mockup-scenes/ai`, stripUndefined({ preset, prompt, name }))),
  );

  server.tool(
    "od_add_mockup_template",
    "MOCKUP: add a scene mockup template to a Product Base from local files — scene photo, optional product mask " +
      "(white/alpha = where the print shows) and optional overlay PNG drawn above the print, plus the 4 print corners.",
    {
      product_slug: z.string(),
      scene_path: z.string(),
      quad: z.array(z.tuple([z.number(), z.number()])).length(4).describe("TL, TR, BR, BL in scene px"),
      mask_path: z.string().optional(),
      overlay_path: z.string().optional(),
      key: z.string().optional(),
      name: z.string().optional(),
      shading_strength: z.number().optional().describe("0 (default) for photos whose print area is not a white blank"),
      displace: z.number().optional(),
      color_cast: z.boolean().optional(),
      source: z.record(z.unknown()).optional(),
    },
    async ({ product_slug, scene_path, quad, mask_path, overlay_path, key, name, shading_strength, displace, color_cast, source }) =>
      jsonText(
        await api.uploadFiles(
          `/studio/product-bases/${product_slug}/mockup-templates`,
          { scene: scene_path, mask: mask_path, overlay: overlay_path },
          {
            meta: JSON.stringify(
              stripUndefined({ key, name, quad, shadingStrength: shading_strength, displace, colorCast: color_cast, source }),
            ),
          },
        ),
      ),
  );

  server.tool(
    "od_update_mockup_template",
    "MOCKUP: adjust a scene template — rename, move the 4 print corners (quad: TL, TR, BR, BL in scene px), " +
      "shading_strength (0–1.5, fabric light/shadow) or displace (0–2, how much the print bends with folds).",
    {
      product_slug: z.string(),
      key: z.string(),
      name: z.string().optional(),
      quad: z.array(z.tuple([z.number(), z.number()])).length(4).optional(),
      shading_strength: z.number().optional(),
      displace: z.number().optional(),
    },
    async ({ product_slug, key, name, quad, shading_strength, displace }) =>
      jsonText(
        await api.patch(
          `/studio/product-bases/${product_slug}/mockup-templates/${key}`,
          stripUndefined({ name, quad, shadingStrength: shading_strength, displace }),
        ),
      ),
  );

  server.tool(
    "od_delete_mockup_template",
    "MOCKUP: remove a mockup template from a Product Base (scene files are kept on disk).",
    { product_slug: z.string(), key: z.string() },
    async ({ product_slug, key }) => jsonText(await api.delete(`/studio/product-bases/${product_slug}/mockup-templates/${key}`)),
  );

  server.tool(
    "od_preview_mockup_template",
    "MOCKUP: render one template with an artwork (default: your latest artwork on that base) to check corners/folds. Returns an image URL.",
    { product_slug: z.string(), key: z.string(), artwork_id: z.string().optional() },
    async ({ product_slug, key, artwork_id }) => {
      const r = await api.post<{ url: string; artworkId: string | null }>(
        `/studio/product-bases/${product_slug}/mockup-templates/${key}/preview`,
        stripUndefined({ artworkId: artwork_id }),
      );
      return jsonText({ ...r, url: abs(api, r.url) });
    },
  );

  server.tool(
    "od_render_mockups",
    "MOCKUP: render product photos for a campaign product from its artwork (+ optional customer answers) on the " +
      "Product Base mockup templates. Adds them to the campaign mockups (kind=scene). replace=true swaps earlier ones.",
    {
      campaign_id: z.string(),
      product_id: z.string().optional().describe("Default: the campaign's default product"),
      template_keys: z.array(z.string()).optional().describe("od_list_mockup_templates keys; default all"),
      values: z
        .record(z.string())
        .optional()
        .describe("Customer answers {layerId: value} to show (photos as /uploads/... URLs); default = artwork samples"),
      replace: z.boolean().optional().default(true),
    },
    async ({ campaign_id, product_id, template_keys, values, replace }) => {
      const c = await api.post<Campaign>(
        `/studio/campaigns/${campaign_id}/mockups/render`,
        stripUndefined({ productId: product_id, templateKeys: template_keys, values: values || {}, replace }),
      );
      return jsonText(media(api, c));
    },
  );

  server.tool(
    "od_campaign_media",
    "MOCKUP/VIDEO: list a campaign's mockups and promo videos (absolute URLs).",
    { campaign_id: z.string() },
    async ({ campaign_id }) => jsonText(media(api, await api.get<Campaign>(`/studio/campaigns/${campaign_id}`))),
  );

  server.tool(
    "od_upload_campaign_image",
    "CAMPAIGN: upload an image that belongs to this campaign only (kind=customer: a buyer's photo for form values; kind=page: image for a page block; " +
      "kind=mockup: a product photo) — NOT added to the Assets library. Returns {url} (/uploads/...).",
    {
      campaign_id: z.string(),
      file_path: z.string(),
      kind: z.enum(["customer", "mockup", "page"]).optional().default("customer"),
    },
    async ({ campaign_id, file_path, kind }) =>
      jsonText(await api.uploadFile(`/studio/campaigns/${campaign_id}/uploads?kind=${kind}`, file_path)),
  );

  server.tool(
    "od_upload_campaign_audio",
    "VIDEO: upload local music (mp3/m4a/wav/aac/ogg, or a video whose soundtrack is used) for promo videos → {url}.",
    { campaign_id: z.string(), file_path: z.string() },
    async ({ campaign_id, file_path }) =>
      jsonText(await api.uploadFile(`/studio/campaigns/${campaign_id}/audio`, file_path)),
  );

  server.tool(
    "od_create_promo_video",
    "VIDEO: build a promo video (mp4, H.264) from campaign mockups: Ken Burns zoom, cross-fades, captions per slide, " +
      "outro with title/price/CTA, optional music trimmed + faded. format 9:16 (TikTok/Reels), 1:1 (feed), 16:9 (YouTube). " +
      "Give audio_path (local file, uploaded first) or audio_url (from od_upload_campaign_audio).",
    {
      campaign_id: z.string(),
      format: z.enum(["9:16", "1:1", "16:9"]).optional().default("9:16"),
      seconds: z.number().min(1.5).max(8).optional().describe("Seconds per slide (default 3)"),
      mockup_ids: z.array(z.string()).optional().describe("Slides in order; default primary first, max 8"),
      captions: z.array(z.string()).optional().describe("One per slide; default listing bullets. [] = none"),
      title: z.string().optional().describe("Outro title (default listing title)"),
      price: z.string().optional().describe('Outro price, e.g. "$25.99" (default lowest variant price; "" = hide)'),
      cta: z.string().optional().describe('Outro button (default "Shop now"; "" = hide)'),
      audio_url: z.string().optional(),
      audio_path: z.string().optional(),
    },
    async (a) => {
      let audioUrl = a.audio_url;
      if (!audioUrl && a.audio_path) {
        const up = await api.uploadFile<{ url: string }>(`/studio/campaigns/${a.campaign_id}/audio`, a.audio_path);
        audioUrl = up.url;
      }
      const c = await api.post<Campaign>(
        `/studio/campaigns/${a.campaign_id}/videos`,
        stripUndefined({
          format: a.format,
          seconds: a.seconds,
          mockupIds: a.mockup_ids,
          captions: a.captions,
          title: a.title,
          price: a.price,
          cta: a.cta,
          audioUrl,
        }),
      );
      const m = media(api, c);
      return jsonText({ video: m.videos[m.videos.length - 1], videos: m.videos.length });
    },
  );

  server.tool(
    "od_delete_promo_video",
    "VIDEO: remove a promo video from a campaign.",
    { campaign_id: z.string(), video_id: z.string() },
    async ({ campaign_id, video_id }) =>
      jsonText(media(api, await api.delete<Campaign>(`/studio/campaigns/${campaign_id}/videos/${video_id}`))),
  );
}
