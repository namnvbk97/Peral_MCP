/**
 * RESEARCH — trending / best-selling products and brands → POD opportunities.
 * Candidates (product | brand) + signals over time. Two signal kinds, never mixed:
 *   trending = interest (search, views, mentions)   selling = buyers ordered (rank, reviews, sold)
 * A TikTok view count is trending, not proof of sales.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { WebtoolsClient } from "../client.js";
import { jsonText, stripUndefined } from "./common.js";

const enc = encodeURIComponent;

const signalSchema = z.object({
  source: z.string().default("manual").describe("google_trends | amazon_bestsellers | etsy | tiktok_creative_center | tiktok_shop | reddit | shopify | manual"),
  metric: z.string().describe("See od_research_sources → metrics (e.g. search_interest, views, bestseller_rank, review_count, sold_count, listing_count, price)"),
  value: z.number(),
  observedAt: z.string().optional().describe("ISO date/time; default now. One value per source+metric+day"),
  url: z.string().optional(),
  note: z.string().optional(),
});

const candidateFields = {
  type: z.enum(["product", "brand"]).optional(),
  name: z.string().optional(),
  keywords: z.array(z.string()).optional().describe("Search terms matched against trending feeds"),
  category: z.string().optional(),
  brand: z.string().optional(),
  parent_id: z.string().optional().describe("Brand candidate id this product belongs to (hero product)"),
  urls: z.record(z.string()).optional().describe("source → listing / shop URL"),
  pod_fit: z.number().int().min(0).max(5).optional().describe("How well it fits personalized POD (0–5)"),
  competition: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["watching", "picked", "rejected", "archived"]).optional(),
  notes: z.string().optional(),
};

function candidateBody(a: Record<string, unknown>) {
  return stripUndefined({
    type: a.type,
    name: a.name,
    keywords: a.keywords,
    category: a.category,
    brand: a.brand,
    parentId: a.parent_id,
    urls: a.urls,
    podFit: a.pod_fit,
    competition: a.competition,
    status: a.status,
    notes: a.notes,
  });
}

export function registerResearchTools(server: McpServer, api: WebtoolsClient): void {
  server.tool(
    "od_research_sources",
    "List research source adapters (live vs stub, and how to feed stubs) and the metric catalog with kind trending | selling | market.",
    {},
    async () => jsonText(await api.get("/research/sources")),
  );

  server.tool(
    "od_research_list_candidates",
    "List watched products / brands of a shop with their opportunity score (no signal history).",
    {
      store_id: z.string(),
      type: z.enum(["product", "brand"]).optional(),
      status: z.enum(["watching", "picked", "rejected", "archived"]).optional(),
      q: z.string().optional(),
    },
    async (a) => jsonText(await api.get("/research/candidates", stripUndefined(a))),
  );

  server.tool(
    "od_research_get_candidate",
    "Get one candidate with full signal history and score breakdown.",
    { candidate_id: z.string() },
    async ({ candidate_id }) => jsonText(await api.get(`/research/candidates/${enc(candidate_id)}`)),
  );

  server.tool(
    "od_research_upsert_candidate",
    "Create a product/brand candidate (store_id + name), or update one (candidate_id). Optionally add signals in the same call.",
    {
      store_id: z.string().optional().describe("Required when creating"),
      candidate_id: z.string().optional().describe("Update this candidate instead of creating"),
      ...candidateFields,
      signals: z.array(signalSchema).optional(),
    },
    async (a) => {
      const body = candidateBody(a);
      let cand: { id: string };
      if (a.candidate_id) {
        cand = await api.patch(`/research/candidates/${enc(a.candidate_id)}`, body);
      } else {
        if (!a.store_id || !a.name) throw new Error("store_id and name are required to create");
        cand = await api.post("/research/candidates", { ...body, storeId: a.store_id });
      }
      if (a.signals?.length) {
        return jsonText(await api.post(`/research/candidates/${enc(cand.id)}/signals`, { signals: a.signals }));
      }
      return jsonText(cand);
    },
  );

  server.tool(
    "od_research_add_signals",
    "Record signals on a candidate. trending: search_interest, search_traffic_approx, views, hashtag_posts, social_mentions, favorites. selling: bestseller_rank, review_count, sold_count, sales_estimate, own_orders. market: listing_count, price, rating.",
    { candidate_id: z.string(), signals: z.array(signalSchema).min(1) },
    async ({ candidate_id, signals }) =>
      jsonText(await api.post(`/research/candidates/${enc(candidate_id)}/signals`, { signals })),
  );

  server.tool(
    "od_research_import_csv",
    "Import candidates + signals from CSV (columns: name, metric, value, type, keywords a|b, brand, category, source, observedAt, url, note) or a Google Trends 'Interest over time' export as-is. Pass csv text or a local file_path.",
    {
      store_id: z.string(),
      csv: z.string().optional(),
      file_path: z.string().optional(),
      source: z.string().optional().describe("Default source for rows without one"),
    },
    async ({ store_id, csv, file_path, source }) => {
      const text = csv ?? (file_path ? await readFile(file_path, "utf8") : "");
      if (!text) throw new Error("csv or file_path is required");
      return jsonText(await api.post("/research/import", stripUndefined({ storeId: store_id, csv: text, source })));
    },
  );

  server.tool(
    "od_research_scan",
    "Run live source adapters (now: Google Trends 'Trending now' RSS) for a shop: saves today's trending feed, adds matching signals to candidates, rebuilds today's report.",
    {
      store_id: z.string(),
      sources: z.array(z.string()).optional().describe("Default: all live adapters"),
      geo: z.string().optional().describe("Country code, default US"),
    },
    async ({ store_id, sources, geo }) =>
      jsonText(await api.post("/research/scan", stripUndefined({ storeId: store_id, sources, geo }))),
  );

  server.tool(
    "od_research_report",
    "Daily opportunity report: candidates ranked by score (growth, selling evidence, competition, POD fit) with reasons + flags, emerging items, brands, today's trending searches.",
    {
      store_id: z.string(),
      date: z.string().optional().describe("YYYY-MM-DD; default today"),
      refresh: z.boolean().optional().describe("Rebuild today's report"),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (a) => jsonText(await api.get("/research/report", stripUndefined(a))),
  );

  server.tool(
    "od_research_delete_candidate",
    "Delete a candidate and its signal history (creator or shop admin). Prefer status=rejected to keep history.",
    { candidate_id: z.string() },
    async ({ candidate_id }) => jsonText(await api.delete(`/research/candidates/${enc(candidate_id)}`)),
  );
}
