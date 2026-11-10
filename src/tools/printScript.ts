/**
 * Print scripts: per-artwork / per-campaign Python that runs on each finished print file.
 * Stored as data (an artwork user-code layer with stage "print", or a campaign product's
 * printScript) — a special product needs no backend / frontend deploy.
 */
import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText } from "./common.js";

type Dict = Record<string, unknown>;
type Layer = { id: string; type?: string; stage?: string; name?: string; userCode?: string; files?: string[] };
type Artwork = { id: string; activeTemplateId?: string; templates?: Array<{ id: string; imageDoc?: { layers?: Layer[] } }> };

export const PRINT_SCRIPT_GUIDE = `PRINT SCRIPT — Python (sandbox) that runs on each finished print file of ONE artwork or ONE campaign product.
Order on every file: artwork page -> Product Base marks/code -> artwork print scripts -> campaign product printScript.
Previews (live preview, order preview) run it too, smaller: api.scale() < 1, so write sizes as api.px(<print px>).

No import / open / eval / names starting with "_". Timeout 30 s. Images are integer handles; 0 = the print file.
  api.file_key()  api.scale()  api.px(v)  api.ctx()  api.log(...)
  api.values()  api.get_text(id)  api.get_src(id)  api.get_value(id)  api.layers()  api.find(name)
  api.img_open(url) img_layer(layer_id) img_new(w,h,color) img_copy(h) img_size(h) img_bbox(h)
  api.img_crop(h,x,y,w,hh) img_trim(h) img_resize(h,w,hh) img_fit(h,w,hh,"contain"|"cover",align)
  api.img_rotate(h,deg) img_flip(h,horizontal,vertical) img_paste(dst,src,x,y,opacity)
  api.img_fill(h,color,x,y,w,hh) img_clear(h,x,y,w,hh) img_mask(h,mask,invert) img_silhouette(h,pad,color)
  api.img_tint(h,color) img_adjust(h,brightness,contrast,saturation,sharpness) img_grayscale(h) img_blur(h,r)
  api.img_shadow(h,dx,dy,blur,color) img_warp(h,[[x,y]x4 TL TR BR BL],w,hh) img_arc(h,bend)
  api.img_text(h,text,x,y,w,hh,font=family,size=,fill=,align=,case=,autoscale=,rotation=)
  api.img_rembg(h) img_save(h)->url  api.set_canvas(h)  (canvas_png / set_canvas_png still work)
Check with od_artwork_print_file / od_campaign_print_file: script logs and errors come back in warnings.`;

async function codeFrom(code?: string, codeFile?: string): Promise<string> {
  if (codeFile) return await readFile(codeFile, "utf8");
  return code ?? "";
}

export function registerPrintScriptTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_print_script_guide",
    "PRINT SCRIPT: how per-artwork / per-campaign print scripts work and the full api.* list. Read before writing one.",
    {},
    async () => jsonText({ guide: PRINT_SCRIPT_GUIDE }),
  );

  server.tool(
    "od_artwork_set_print_script",
    "PRINT SCRIPT (artwork): add or replace a print script on an artwork — runs on each finished print file of this artwork " +
      "(every campaign using it). Stored as a user-code layer with stage 'print'. files = only these print-file keys. " +
      "Empty code removes it. Then check with od_artwork_print_file (logs/errors in warnings). " + "See od_print_script_guide.",
    {
      artwork_id: z.string(),
      code: z.string().optional().describe("Python source (sandbox)"),
      code_file: z.string().optional().describe("Read the source from this local file instead"),
      files: z.array(z.string()).optional().describe("Print-file keys to run on (default: every file)"),
      name: z.string().optional().describe("Script name (default 'Print script'); one script per name"),
      template_id: z.string().optional().describe("Default: active template"),
      enabled: z.boolean().optional(),
    },
    async ({ artwork_id, code, code_file, files, name, template_id, enabled }) => {
      const source = await codeFrom(code, code_file);
      const title = name || "Print script";
      const art = await api.get<Artwork>(`/studio/artworks/${artwork_id}`);
      const tid = template_id || art.activeTemplateId || art.templates?.[0]?.id;
      const tpl = art.templates?.find((t) => t.id === tid);
      const existing = (tpl?.imageDoc?.layers || []).find(
        (L) => L.type === "user-code" && L.stage === "print" && (L.name || "") === title,
      );
      if (!source.trim()) {
        if (!existing) return jsonText({ removed: false, note: "no print script with that name" });
        await api.delete(`/studio/artworks/${artwork_id}/layers/${existing.id}`, { template_id: tid });
        return jsonText({ removed: true, layerId: existing.id });
      }
      const props = {
        name: title,
        stage: "print",
        userCode: source,
        userCodeEnabled: enabled !== false,
        files: files || [],
        customizationType: "no_customization",
        formOnly: true,
      };
      if (existing) {
        await api.patch(`/studio/artworks/${artwork_id}/layers/${existing.id}`, { templateId: tid, props });
        return jsonText({ updated: true, layerId: existing.id, templateId: tid, lines: source.split("\n").length });
      }
      const r = await api.post<{ layer: { id: string } }>(`/studio/artworks/${artwork_id}/layers`, {
        type: "user-code",
        templateId: tid,
        props,
      });
      return jsonText({ added: true, layerId: r.layer.id, templateId: tid, lines: source.split("\n").length });
    },
  );

  server.tool(
    "od_campaign_set_print_script",
    "PRINT SCRIPT (campaign): set the print script of ONE campaign product — runs after the artwork's own print scripts, " +
      "only for orders / previews of this campaign product. Empty code clears it. Check with od_campaign_print_file. " +
      "See od_print_script_guide.",
    {
      campaign_id: z.string(),
      product_id: z.string().optional().describe("Default: the campaign's default product"),
      code: z.string().optional(),
      code_file: z.string().optional().describe("Read the source from this local file instead"),
      files: z.array(z.string()).optional().describe("Print-file keys to run on (default: every file)"),
      name: z.string().optional(),
      enabled: z.boolean().optional(),
    },
    async ({ campaign_id, product_id, code, code_file, files, name, enabled }) => {
      const source = await codeFrom(code, code_file);
      let pid = product_id;
      if (!pid) {
        const c = await api.get<{ products?: Array<{ id: string; isDefault?: boolean }> }>(`/studio/campaigns/${campaign_id}`);
        pid = (c.products || []).find((p) => p.isDefault)?.id || c.products?.[0]?.id;
      }
      if (!pid) throw new Error("Campaign has no product");
      const res = await api.patch<Dict>(`/studio/campaigns/${campaign_id}/products/${pid}`, {
        printScript: source.trim() ? { code: source, files: files || [], name: name || "", enabled: enabled !== false } : {},
      });
      const prod = ((res.products as Array<Dict>) || []).find((p) => p.id === pid) || {};
      return jsonText({ productId: pid, printScript: prod.printScript ? { ...(prod.printScript as Dict), code: `${source.split("\n").length} lines` } : null });
    },
  );
}
