/**
 * Placement (design × Product Base) and the Flow v2 checks: auto-fit by shapeFamily + ratio, lint,
 * test print matrix. A new campaign product gets an auto placement; an agent only touches it where
 * lint reports (P-FIT / P-SAFE / P-TINY / P-GAP / P-FMT).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText } from "./common.js";

type Dict = Record<string, unknown>;

const SHAPES = ["round", "rect-portrait", "rect-landscape", "wrap", "free"] as const;
const ALIGNS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

const override = z.object({
  fit: z.enum(["cover", "contain"]).optional(),
  align: z.enum(ALIGNS).optional(),
  zoom: z.number().min(0.2).max(5).optional().describe("1 = as fitted; 0.9 = 10% smaller"),
  offsetX: z.number().min(-1).max(1).optional().describe("fraction of the file width, + = right"),
  offsetY: z.number().min(-1).max(1).optional().describe("fraction of the file height, + = down"),
  files: z
    .record(
      z.object({
        fit: z.enum(["cover", "contain"]).optional(),
        align: z.enum(ALIGNS).optional(),
        zoom: z.number().optional(),
        offsetX: z.number().optional(),
        offsetY: z.number().optional(),
      }),
    )
    .optional()
    .describe("per print file key (front / back / sheet …)"),
});

export const PLACEMENT_GUIDE = `PLACEMENT = how one design sits on one Product Base's print files (stored on the campaign product).
New campaign products get an auto placement: each print file is fitted by the design format's shapeFamily
(round → contain · wrap → cover if ≤10% off else contain · rect / free → cover when the page has a full-bleed
background, else contain) when its ratio differs from the design page by > 2%. Same ratio = printed as designed.
Workflow: od_campaign_placement {action:"check"} → read issues P-* → only if lint reports, fix with
action "set" + overrides {"<size>" | "*": {fit, align, zoom, offsetX, offsetY, files:{<file>: {...}}}} → check again.
P-FMT (tier 4, >10% off) means the design needs its own format for that ratio, not an override.
Products created before placements existed have none (Product Base fit, print files unchanged); action "auto"
adds one — on a published campaign that needs confirm:true after looking at the test print.`;

export function registerPlacementTools(server: McpServer, api: WebtoolsClient) {
  server.tool(
    "od_campaign_check",
    "CAMPAIGN (Flow v2): placement tiers per variant (1 pinned · 2 same ratio · 3 near · 4 needs a format), fit / align chosen for each print file, and lint issues (P-FIT cut, P-SAFE, P-TINY, P-GAP, P-FMT, C-* prices). Read-only.",
    { campaign_id: z.string() },
    async ({ campaign_id }) => jsonText(await api.get<Dict>(`/studio/v2/campaigns/${campaign_id}`)),
  );

  server.tool(
    "od_render_matrix",
    "CAMPAIGN (Flow v2): export one test print per distinct (format × print file set × fit) of the enabled variants, with sample answers — the same export orders use. Returns file URLs, the fit of each file and its P-FIT problems. Slow (up to 12 renders).",
    { campaign_id: z.string(), product_id: z.string().optional(), all_variants: z.boolean().optional() },
    async ({ campaign_id, product_id, all_variants }) => {
      const r = await api.post<{ groups: Array<Dict & { files?: Array<Dict & { url: string }> }> }>(
        `/studio/v2/campaigns/${campaign_id}/print-matrix`,
        { productId: product_id, all: all_variants },
      );
      for (const g of r.groups || []) for (const f of g.files || []) f.fullUrl = `${api.apiBase}${f.url}`;
      return jsonText(r);
    },
  );

  server.tool(
    "od_campaign_placement",
    `CAMPAIGN: placement of one campaign product, then lint + a test print (render:false skips the print).
actions: check (no change) · auto (create if missing, auto-fit on) · set (shapeFamily / auto / overrides; an override value null removes it) · reset (drop overrides) · remove (back to the Product Base fit).
${PLACEMENT_GUIDE}`,
    {
      campaign_id: z.string(),
      product_id: z.string(),
      action: z.enum(["check", "auto", "set", "reset", "remove"]).default("check"),
      shape_family: z.enum(SHAPES).nullable().optional().describe("null = follow the design format"),
      auto: z.boolean().optional(),
      overrides: z.record(override.nullable()).optional().describe('size key or "*" (every size) → patch; null removes'),
      render: z.boolean().optional(),
      confirm: z.boolean().optional().describe("needed to add a placement to a product of a published campaign"),
    },
    async ({ campaign_id, product_id, action, shape_family, auto, overrides, render, confirm }) => {
      const body: Dict = { action, render: render ?? true, confirm };
      if (shape_family !== undefined) body.shapeFamily = shape_family;
      if (auto !== undefined) body.auto = auto;
      if (overrides) body.overrides = overrides;
      const r = await api.post<Dict & { groups?: Array<Dict & { files?: Array<Dict & { url: string }> }> }>(
        `/studio/v2/campaigns/${campaign_id}/products/${product_id}/placement`,
        body,
      );
      for (const g of r.groups || []) for (const f of g.files || []) f.fullUrl = `${api.apiBase}${f.url}`;
      return jsonText(r);
    },
  );

  server.tool(
    "od_design_format_shape",
    "ARTWORK: set format.shapeFamily of one template (round | rect-portrait | rect-landscape | wrap | free; null = infer from the page ratio). Every auto placement of this design fits by it.",
    { artwork_id: z.string(), template_id: z.string(), shape_family: z.enum(SHAPES).nullable() },
    async ({ artwork_id, template_id, shape_family }) =>
      jsonText(await api.patch(`/studio/v2/designs/${artwork_id}/formats/${template_id}`, { shapeFamily: shape_family })),
  );
}
