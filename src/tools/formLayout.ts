/**
 * Compact customer-form layout (Options ImageBox, 400 px wide): rows of controls, several small
 * controls side by side, option pickers sized by their real swatch / tile size. Replaces the
 * one-control-per-row auto layout when space matters (merchant pattern from TMBLG07102603).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { errorText, jsonText } from "./common.js";

type Layer = {
  id: string;
  type?: string;
  displayType?: string;
  options?: unknown[];
  formLabel?: string;
  customizationType?: string;
  visible?: boolean;
  [k: string]: unknown;
};
type Doc = { layers?: Layer[]; formFlow?: string; formViewHeight?: number; [k: string]: unknown };
type Artwork = { activeTemplateId?: string; templates?: Array<{ id: string; positions?: string[]; imageDoc?: Doc }> };

const W = 400;
const PAD = 16;
const GAP = 12;
const LABEL = 30; // label line + spacing above the control

/** Height a control needs at a given width (matches the live form: 28 px colour dots + 6 gap,
 * 64 px image tiles + 4 gap, 24 px pills, 96 px photo box, 46 px text / dropdown). */
export function controlHeight(L: Layer, width: number): number {
  const t = L.type || "";
  const n = (L.options || []).length;
  const dt = L.displayType || "";
  if (t === "photo-upload" || t === "vector-upload") return LABEL + 92;
  if (n && dt === "color") {
    const perRow = Math.max(1, Math.floor((width - 16 + 6) / 34));
    return LABEL + 12 + Math.ceil(n / perRow) * 34 + 6;
  }
  if (n && (dt === "image" || t === "clipart-category")) {
    const perRow = Math.max(1, Math.floor((width - 18 + 4) / 68));
    const cell = (width - 18 - 4 * (perRow - 1)) / perRow;
    return LABEL + 12 + Math.ceil(n / perRow) * Math.round(cell + 4);
  }
  if (n && dt === "radio") {
    const perRow = Math.max(1, Math.floor(width / 90));
    return LABEL + 12 + Math.ceil(n / perRow) * 30;
  }
  return LABEL + 42; // text input, dropdown
}

const isPicker = (L: Layer) => (L.options || []).length > 0 && ["color", "image", "radio"].includes(L.displayType || "");

/** Default rows: every option picker full width (form order), then the remaining inputs two per row. */
export function defaultRows(controls: Layer[]): string[][] {
  const rows: string[][] = [];
  const small: string[] = [];
  for (const L of controls) {
    if (isPicker(L)) rows.push([L.id]);
    else small.push(L.id);
  }
  for (let i = 0; i < small.length; i += 2) rows.push(small.slice(i, i + 2));
  return rows;
}

export function registerFormLayoutTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_artwork_form_grid",
    "ARTWORK FORM: compact customer-form layout in rows — small controls side by side (e.g. photo | name), option pickers " +
      "full width and sized by their real swatches (colour dots 28 px). Default rows: pickers first (form order), then the " +
      "other inputs two per row. Sets positions to the visual order, formFlow=stack and the form height. " +
      "Prefer this over od_artwork_auto_form_layout (one per row, colour pickers far too tall). dry_run shows the plan.",
    {
      artwork_id: z.string(),
      template_id: z.string().optional().describe("Default: active template"),
      rows: z.array(z.array(z.string())).optional().describe("Layer ids per row, top to bottom, e.g. [[\"layer-bg\"],[\"layer-textcolor\"],[\"layer-photo\",\"layer-name\"]]"),
      widths: z.record(z.array(z.number())).optional().describe("Optional column weights per row index, e.g. {\"2\": [1, 1]}"),
      dry_run: z.boolean().optional(),
    },
    async ({ artwork_id, template_id, rows, widths, dry_run }) => {
      const art = await api.get<Artwork>(`/studio/artworks/${artwork_id}`);
      const tid = template_id || art.activeTemplateId || art.templates?.[0]?.id;
      const tpl = art.templates?.find((t) => t.id === tid);
      if (!tpl?.imageDoc) return errorText(`Template not found: ${tid}`);
      const doc: Doc = JSON.parse(JSON.stringify(tpl.imageDoc));
      const byId = new Map((doc.layers || []).map((L) => [L.id, L]));
      const order = (tpl.positions || []).filter((id) => id !== "template-layer" && byId.has(id));
      const controls = order.map((id) => byId.get(id)!).filter((L) => L.visible !== false);
      const plan = rows && rows.length ? rows : defaultRows(controls);
      const missing = plan.flat().filter((id) => !byId.has(id));
      if (missing.length) return errorText(`Unknown layer ids: ${missing.join(", ")}`);
      const left = order.filter((id) => !plan.flat().includes(id));
      if (left.length) plan.push(...defaultRows(left.map((id) => byId.get(id)!)));

      let y = PAD;
      const placed: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
      plan.forEach((row, ri) => {
        const weights = widths?.[String(ri)] && widths[String(ri)].length === row.length ? widths[String(ri)] : row.map(() => 1);
        const total = weights.reduce((a, b) => a + b, 0);
        const inner = W - PAD * 2 - GAP * (row.length - 1);
        let x = PAD;
        let rowH = 0;
        const cells = row.map((id, ci) => {
          const w = Math.floor((inner * weights[ci]) / total);
          const h = controlHeight(byId.get(id)!, w);
          rowH = Math.max(rowH, h);
          const cell = { id, x, y, width: w, height: h };
          x += w + GAP;
          return cell;
        });
        // shorter controls (a name next to a photo) keep their height, centred in the row
        cells.forEach((c) => placed.push({ ...c, y: c.y + Math.floor((rowH - c.height) / 2) }));
        y += rowH + GAP;
      });
      const height = y - GAP + PAD;
      if (dry_run) return jsonText({ templateId: tid, rows: plan, formViewHeight: height, controls: placed });

      for (const p of placed) {
        const L = byId.get(p.id)!;
        L.formX = p.x;
        L.formY = p.y;
        L.formWidth = p.width;
        L.formHeight = p.height;
      }
      doc.formFlow = "stack";
      doc.formViewHeight = height;
      const positions = [...plan.flat(), "template-layer"];
      await api.patch(`/studio/artworks/${artwork_id}/templates/${tid}`, { imageDoc: doc, positions });
      return jsonText({ templateId: tid, rows: plan, formViewHeight: height, controls: placed });
    },
  );
}
