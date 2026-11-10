/**
 * Knowledge for agents: skills (how to do a job) and recipes (how a product type was built for
 * real) shipped with this MCP in ../knowledge, plus a tool that turns a live artwork into a
 * recipe draft — so any MCP client builds Product Bases / artworks / campaigns the proven way.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { errorText, jsonText } from "./common.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../knowledge");

type Entry = { id: string; kind: "skill" | "recipe"; name: string; description: string; products: string[]; example?: string; path: string };

function frontmatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].replace(/^>-?\s*$/, "").trim();
    } else if (key && line.trim()) {
      out[key] = `${out[key]} ${line.trim()}`.trim();
    }
  }
  return out;
}

function list(arr?: string): string[] {
  if (!arr) return [];
  return arr.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function knowledgeEntries(): Entry[] {
  const out: Entry[] = [];
  const skills = join(ROOT, "skills");
  if (existsSync(skills)) {
    for (const d of readdirSync(skills)) {
      const p = join(skills, d, "SKILL.md");
      if (!existsSync(p)) continue;
      const fm = frontmatter(readFileSync(p, "utf8"));
      out.push({ id: `skill:${d}`, kind: "skill", name: fm.name || d, description: fm.description || "", products: [], path: p });
    }
  }
  const recipes = join(ROOT, "recipes");
  if (existsSync(recipes)) {
    for (const f of readdirSync(recipes).filter((f) => f.endsWith(".md"))) {
      const p = join(recipes, f);
      const fm = frontmatter(readFileSync(p, "utf8"));
      const name = f.replace(/\.md$/, "");
      out.push({ id: `recipe:${name}`, kind: "recipe", name: fm.name || name, description: fm.description || "",
                 products: list(fm.products), example: fm.example, path: p });
    }
  }
  return out;
}

function find(id: string): Entry | undefined {
  const all = knowledgeEntries();
  const key = id.trim().toLowerCase();
  return all.find((e) => e.id.toLowerCase() === key) || all.find((e) => e.name.toLowerCase() === key || e.id.split(":")[1] === key);
}

type Layer = Record<string, unknown> & { id: string; type?: string };
type Tpl = { id: string; name?: string; positions?: string[]; imageDoc?: { width?: number; height?: number; pages?: unknown[]; layers?: Layer[]; formViewHeight?: number } };
type Artwork = { id: string; title?: string; productSlug?: string; productCode?: string; size?: string; templates?: Tpl[]; activeTemplateId?: string };

const n = (v: unknown) => (typeof v === "number" ? Math.round(v) : v);

function layerLine(L: Layer): string {
  const bits: string[] = [];
  const box = ["x", "y", "width", "height"].map((k) => n(L[k])).join(",");
  bits.push(`box ${box}`);
  for (const k of ["side", "rotation", "fit", "fitAlign", "trim", "removeBackground", "cloneOf", "fontFamily", "fontSize",
                   "fill", "textCase", "autoscale", "maxLength", "displayType", "required", "defaultValue", "bindTargetLayerId",
                   "bindMode", "flipH", "cutPaddingPx", "stage", "customizationType"]) {
    const v = L[k];
    if (v === undefined || v === null || v === "" || v === false) continue;
    bits.push(`${k} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  const opts = (L.options as unknown[]) || [];
  if (opts.length) bits.push(`options ${opts.length}`);
  if (L.condition) bits.push(`condition ${JSON.stringify(L.condition)}`);
  if (L.formX !== undefined) bits.push(`form ${[L.formX, L.formY, L.formWidth, L.formHeight].map(n).join(",")}`);
  return `| ${L.id} | ${L.type || ""} | ${String(L.name || L.formLabel || "").replace(/\|/g, "/")} | ${bits.join(" · ")} |`;
}

export function registerKnowledgeTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_knowledge_list",
    "KNOWLEDGE: skills (how to do a job: product base, print canvas, customer options, campaign…) and recipes (how a product " +
      "type was really built: print size, layers, form, mockup, lessons, example ids). Read the matching ones BEFORE building. " +
      "Filter by kind or text (product code like TMB / CCV / SX, slug, or words).",
    { kind: z.enum(["skill", "recipe"]).optional(), query: z.string().optional() },
    async ({ kind, query }) => {
      const q = (query || "").toLowerCase();
      const rows = knowledgeEntries()
        .filter((e) => !kind || e.kind === kind)
        .filter((e) => !q || `${e.id} ${e.description} ${e.products.join(" ")} ${e.example || ""}`.toLowerCase().includes(q))
        .map(({ path: _p, ...e }) => e);
      return jsonText({ count: rows.length, entries: rows, next: "od_knowledge_get(id) for the full text" });
    },
  );

  server.tool(
    "od_knowledge_get",
    "KNOWLEDGE: full text of a skill or recipe by id from od_knowledge_list (e.g. 'skill:peral-artwork-customer-options', " +
      "'recipe:skinny-tumbler-wrap'). A skill folder's extra files are listed and can be read as '<id>/<file>'.",
    { id: z.string() },
    async ({ id }) => {
      const [base, extra] = id.split("/", 2);
      const e = find(base);
      if (!e) return errorText(`Unknown knowledge id: ${id}. Call od_knowledge_list.`);
      if (extra) {
        const p = join(dirname(e.path), extra);
        if (!p.startsWith(dirname(e.path)) || !existsSync(p)) return errorText(`No file ${extra} in ${e.id}`);
        return { content: [{ type: "text" as const, text: readFileSync(p, "utf8") }] };
      }
      const files = e.kind === "skill" ? readdirSync(dirname(e.path)).filter((f) => f !== "SKILL.md") : [];
      const text = readFileSync(e.path, "utf8") + (files.length ? `\n\n---\nFiles: ${files.map((f) => `${e.id}/${f}`).join(", ")}` : "");
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "od_artwork_recipe",
    "KNOWLEDGE: turn a live artwork into a recipe draft (Product Base + print files, every layer with box and key settings, " +
      "customer form layout, print scripts, campaigns using it). Use a good existing artwork as the model for a similar product; " +
      "save_as writes knowledge/recipes/<name>.md when this MCP runs from the repo (then edit the lessons and commit).",
    {
      artwork_id: z.string(),
      template_id: z.string().optional(),
      save_as: z.string().optional().describe("Recipe file name (a-z, 0-9, dashes) to write into knowledge/recipes"),
    },
    async ({ artwork_id, template_id, save_as }) => {
      const art = await api.get<Artwork>(`/studio/artworks/${artwork_id}`);
      const tpl = (art.templates || []).find((t) => t.id === (template_id || art.activeTemplateId)) || art.templates?.[0];
      if (!tpl) return errorText("Artwork has no template");
      const slug = art.productSlug || "";
      const layouts = slug
        ? await api.get<{ layouts?: Array<Record<string, unknown>> }>(`/studio/product-bases/${slug}/print-layouts`).catch(() => ({ layouts: [] }))
        : { layouts: [] };
      const camps = await api
        .get<{ campaigns?: Array<Record<string, unknown>> }>(`/studio/campaigns`, { artwork_id })
        .catch(() => ({ campaigns: [] }));
      const doc = tpl.imageDoc || {};
      const layers = (doc.layers || []).filter((L) => L.type !== "blank");
      const scripts = layers.filter((L) => L.type === "user-code");
      // the shop code leads the title (SXMT25052603 …); productCode can be an internal AW… id
      const code = /^[A-Z]{2,}[A-Z0-9]{4,}/.exec(art.title || "")?.[0] || art.productCode || art.title || art.id;
      const md = [
        "---",
        `name: ${save_as || code}`,
        `description: ${art.title || code} — ${slug}`,
        `products: [${slug}]`,
        `example: ${code} — artwork ${art.id}${(camps.campaigns || []).length ? `, campaign ${(camps.campaigns || [])[0].id}` : ""}`,
        "---",
        "",
        `# Recipe · ${art.title || code}`,
        "",
        "## File in",
        ...(layouts.layouts || []).map((l) => `- \`${l.key}\` ${l.width}×${l.height} @${l.dpi || "?"}dpi ${l.side ? `(side ${l.side})` : ""} ${l.template ? `template ${l.template}` : ""}`),
        `- Canvas ${doc.width}×${doc.height}${doc.pages ? `, ${(doc.pages as unknown[]).length} page(s)` : ""}`,
        "",
        "## Layer (dưới → trên)",
        "| id | loại | tên | cài đặt |",
        "| --- | --- | --- | --- |",
        ...layers.map(layerLine),
        "",
        "## Form",
        `Thứ tự: ${(tpl.positions || []).filter((p) => p !== "template-layer").join(" → ")} · cao ${doc.formViewHeight ?? "?"}px`,
        "",
        ...(scripts.length ? ["## Script", ...scripts.map((s) => `- ${s.name} (${s.stage || "pre-render"}): ${String(s.userCode || "").split("\n").length} dòng`), ""] : []),
        "## Campaign",
        ...((camps.campaigns || []).slice(0, 5).map((c) => `- ${c.productCode || ""} ${c.title} · ${c.status} · ${JSON.stringify(c.priceRange)} · ${c.mockupCount} mockup`)),
        "",
        "## Bài học",
        "- (agent / merchant ghi: vì sao làm thế này, lỗi đã gặp)",
      ].join("\n");
      if (save_as) {
        if (!/^[a-z0-9-]+$/.test(save_as)) return errorText("save_as: a-z, 0-9 and dashes only");
        const dir = join(ROOT, "recipes");
        if (!existsSync(dir)) return errorText("knowledge/recipes not found next to this MCP");
        writeFileSync(join(dir, `${save_as}.md`), md + "\n", "utf8");
      }
      return { content: [{ type: "text" as const, text: md + (save_as ? `\n\n(saved knowledge/recipes/${save_as}.md)` : "") }] };
    },
  );

  // Also as MCP resources, for clients that browse resources instead of calling tools.
  for (const e of knowledgeEntries()) {
    const uri = `peral://knowledge/${e.kind}/${e.id.split(":")[1]}`;
    server.resource(e.id, uri, { mimeType: "text/markdown", description: e.description.slice(0, 300) }, async () => ({
      contents: [{ uri, mimeType: "text/markdown", text: readFileSync(e.path, "utf8") }],
    }));
  }
}
