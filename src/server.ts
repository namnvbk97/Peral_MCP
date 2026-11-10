#!/usr/bin/env node
/**
 * CreTip MCP (open-designer) — Cursor chat drives Webtools product lifecycle
 * (Idea → Artwork → Mockup → Campaign → Video), multi-store prompt env.
 *
 * Web UI = canvas/library preview. Chat = Cursor only.
 *
 * Toolsets: src/tools/artwork.ts (od_*artwork*, layers, assets, fonts)
 *           src/tools/campaign.ts (od_*campaign*, products, mockups, publish)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebtoolsClient } from "./client.js";
import { registerArtworkTools } from "./tools/artwork.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerPrintTools } from "./tools/print.js";
import { registerMediaTools } from "./tools/media.js";
import { registerProductBaseTools } from "./tools/productBase.js";
import { registerTeamTools } from "./tools/team.js";
import { registerResearchTools } from "./tools/research.js";
import { registerShopSettingsTools } from "./tools/shopSettings.js";
import { registerPrintScriptTools } from "./tools/printScript.js";
import { registerFormLayoutTools } from "./tools/formLayout.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { jsonText } from "./tools/common.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../backend/.env"),
    resolve(__dirname, "../.env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

/** One MCP server bound to a single API token. HTTP mode builds a new one per request. */
export function createMcpServer(api: WebtoolsClient): McpServer {
  const server = new McpServer({
    name: "open-designer",
    version: "0.4.0",
  });

  server.tool(
    "od_health",
    "Check CreTip API health (must be running on WEBTOOLS_API_URL).",
    {},
    async () => jsonText(await api.get("/health")),
  );

  server.tool(
    "od_agent_guide",
    "Read this before creating a Product Base, artwork, or campaign. Then od_knowledge_list (skills + recipes of product types already built — read the matching ones) and od_get_product_base_guide for the phôi you are designing: that is how its print file is made.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: readFileSync(resolve(__dirname, "../AGENT-POD.md"), "utf8") }],
    }),
  );

  server.tool(
    "od_product_modes",
    "CreTip Product modes: create (đăng bán) vs orders (quản lý đơn).",
    {},
    async () => jsonText(await api.get("/product/modes")),
  );

  server.tool(
    "od_list_orders",
    "List product orders (optional store_id / status filter).",
    {
      store_id: z.string().optional(),
      status: z.string().optional(),
    },
    async ({ store_id, status }) => {
      const q = new URLSearchParams();
      if (store_id) q.set("store_id", store_id);
      if (status) q.set("status", status);
      q.set("seed", "true");
      const qs = q.toString();
      return jsonText(await api.get(`/product/orders${qs ? `?${qs}` : ""}`));
    },
  );

  server.tool(
    "od_create_order",
    "Create a product order under a store.",
    {
      store_id: z.string().optional().default("garby"),
      customer_name: z.string(),
      product_name: z.string(),
      variant: z.string().optional(),
      personalization: z.string().optional(),
      total: z.number().optional(),
      channel: z.string().optional(),
      status: z.string().optional(),
    },
    async (args) =>
      jsonText(
        await api.post("/product/orders", {
          storeId: args.store_id || "garby",
          customerName: args.customer_name,
          productName: args.product_name,
          variant: args.variant || "",
          personalization: args.personalization || "",
          total: args.total ?? 0,
          channel: args.channel || "facebook",
          status: args.status || "new",
        }),
      ),
  );

  server.tool(
    "od_patch_order",
    "Update order fields / status (new|confirmed|printing|shipping|done|cancelled).",
    {
      order_id: z.string(),
      status: z.string().optional(),
      note: z.string().optional(),
      variant: z.string().optional(),
    },
    async ({ order_id, status, note, variant }) =>
      jsonText(
        await api.patch(`/product/orders/${order_id}`, {
          status,
          note,
          variant,
        }),
      ),
  );

  server.tool(
    "od_list_stores",
    "List the CreTip shops the MCP user is a member of (with role, niche, buying habits, products, prompt env id).",
    {},
    async () => jsonText(await api.get("/stores")),
  );

  server.tool(
    "od_get_store",
    "Get full store profile + prompt-env stages.",
    { store_id: z.string() },
    async ({ store_id }) => jsonText(await api.get(`/stores/${store_id}`)),
  );

  server.tool(
    "od_compose_prompt",
    "Compose a prompt from store prompt-env template (stage + template_key + variables).",
    {
      store_id: z.string().optional(),
      env_id: z.string().optional(),
      stage: z.string().optional().default("idea"),
      template_key: z.string().default("artPrompt"),
      variables: z.record(z.string()).optional(),
    },
    async ({ store_id, env_id, stage, template_key, variables }) =>
      jsonText(
        await api.post("/prompt-env/compose", {
          store_id,
          env_id,
          stage: stage || "idea",
          template_key,
          variables: variables || {},
        }),
      ),
  );

  server.tool(
    "od_list_projects",
    "List product projects (Idea→Artwork→Campaign lifecycle).",
    {},
    async () => jsonText(await api.get("/studio/projects")),
  );

  server.tool(
    "od_create_project",
    "Create a CreTip product: product_code (Id/mã) + name (tên) + optional store_id.",
    {
      name: z.string().describe("Tên sản phẩm"),
      product_code: z.string().describe("Id / mã sản phẩm, e.g. GARBY-MILO-01"),
      niche: z.string().optional(),
      store_id: z.string().optional().describe("e.g. garby, office-gifts"),
    },
    async ({ name, product_code, niche, store_id }) =>
      jsonText(
        await api.post("/studio/projects", {
          name,
          product_code,
          niche: niche || name,
          store_id: store_id || undefined,
        }),
      ),
  );

  server.tool(
    "od_get_project",
    "Get full project: concepts, product artwork/campaign, library refs. Web canvas mirrors this.",
    { project_id: z.string() },
    async ({ project_id }) =>
      jsonText(await api.get(`/studio/projects/${project_id}`)),
  );

  server.tool(
    "od_delete_project",
    "Delete a CreTip product project permanently.",
    { project_id: z.string() },
    async ({ project_id }) =>
      jsonText(await api.delete(`/studio/projects/${project_id}`)),
  );

  server.tool(
    "od_expand_ideas",
    "IDEA stage: expand niche into concepts using the store prompt-env (writes to project; refresh /app).",
    {
      niche: z.string().describe("Niche keyword, e.g. cat dad jokes"),
      project_id: z.string().optional(),
      store_id: z.string().optional().describe("CreTip store id, e.g. garby"),
      count: z.number().int().min(1).max(8).optional(),
      product_slug: z.string().optional(),
    },
    async ({ niche, project_id, store_id, count, product_slug }) =>
      jsonText(
        await api.post("/studio/ideas/expand", {
          niche,
          project_id,
          store_id,
          count: count ?? 4,
          product_slug,
        }),
      ),
  );

  server.tool(
    "od_select_concept",
    "Select a concept on a project (sets active product base).",
    {
      project_id: z.string(),
      concept_id: z.string(),
    },
    async ({ project_id, concept_id }) =>
      jsonText(
        await api.post(`/studio/projects/${project_id}/select-concept`, {
          concept_id,
        }),
      ),
  );

  server.tool(
    "od_idea_set_image_doc",
    "IDEA layers: save imageDoc (blank locked / artwork editable). Prefer editing artwork layer only when blank is locked.",
    {
      project_id: z.string(),
      concept_id: z.string(),
      imageDoc: z.record(z.unknown()),
    },
    async ({ project_id, concept_id, imageDoc }) =>
      jsonText(
        await api.patch(
          `/studio/projects/${project_id}/concepts/${concept_id}`,
          { imageDoc },
        ),
      ),
  );

  server.tool(
    "od_idea_composite",
    "IDEA layers: flatten visible layers → concept.imageUrl preview.",
    {
      project_id: z.string(),
      concept_id: z.string(),
    },
    async ({ project_id, concept_id }) =>
      jsonText(
        await api.post(
          `/studio/projects/${project_id}/concepts/${concept_id}/composite`,
        ),
      ),
  );

  server.tool(
    "od_idea_extract_artwork",
    "IDEA layers: rembg cutout → unlocked artwork PNG (never writes locked blank/phôi). Source defaults to artwork then blank then imageUrl. Requires pip install -r webtools/backend/requirements-ml.txt.",
    {
      project_id: z.string(),
      concept_id: z.string(),
      source_layer_id: z
        .string()
        .optional()
        .describe("Layer to cut from (e.g. layer-artwork or layer-blank)"),
      target_layer_id: z
        .string()
        .optional()
        .describe("Default layer-artwork"),
      model: z
        .string()
        .optional()
        .describe("u2net | u2netp | isnet-general-use | …"),
      alpha_matting: z.boolean().optional(),
    },
    async ({
      project_id,
      concept_id,
      source_layer_id,
      target_layer_id,
      model,
      alpha_matting,
    }) =>
      jsonText(
        await api.post(
          `/studio/projects/${project_id}/concepts/${concept_id}/extract-artwork`,
          {
            source_layer_id,
            target_layer_id: target_layer_id || "layer-artwork",
            model: model || "u2net",
            alpha_matting: alpha_matting ?? false,
            engine: "rembg",
          },
        ),
      ),
  );

  server.tool(
    "od_upsert_idea",
    "IDEA stage (psychology-first): create/update concept + dual-write Postgres design_concepts. Optional personaId, emotionBriefId, insight, designDirection, score. For images use layered imageDoc (blank locked) — do not regenerate locked phôi.",
    {
      project_id: z.string(),
      concept_id: z
        .string()
        .optional()
        .describe("Omit to create a new concept slot"),
      title: z.string().optional(),
      psychology: z
        .string()
        .optional()
        .describe("Niche psychology insight — before design"),
      productFit: z
        .string()
        .optional()
        .describe("Why this blank/product matches the psychology"),
      hook: z.string().optional(),
      audience: z.string().optional(),
      style: z.string().optional(),
      productSlug: z.string().optional(),
      artPrompt: z.string().optional(),
      visualizePrompt: z.string().optional(),
      fbCaption: z.string().optional().describe("Ready-to-post Facebook caption"),
      listing: z
        .object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          description: z.string().optional(),
          bullets: z.array(z.string()).optional(),
          tags: z.array(z.string()).optional(),
          priceHint: z.string().optional(),
          channel: z.string().optional(),
        })
        .optional(),
      personaId: z.string().optional(),
      emotionBriefId: z.string().optional(),
      productPromise: z.string().optional(),
      insight: z
        .object({
          statement: z.string().optional(),
          evidenceGrade: z
            .enum(["observed", "supported", "hypothesis", "unknown"])
            .optional(),
          sources: z.array(z.string()).optional(),
        })
        .optional(),
      designDirection: z
        .object({
          message: z.string().optional(),
          visualMetaphor: z.string().optional(),
          composition: z.string().optional(),
          style: z.string().optional(),
          palette: z.array(z.string()).optional(),
          typography: z.string().optional(),
          personalization: z.array(z.string()).optional(),
        })
        .optional(),
      emotionalMotivation: z.array(z.string()).optional(),
      occasion: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      score: z.record(z.number().int().min(1).max(5)).optional(),
    },
    async (args) => {
      const {
        project_id,
        concept_id,
        listing,
        ...fields
      } = args;
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) body[k] = v;
      }
      if (listing) body.listing = listing;

      if (!concept_id) {
        const created = await api.post<Record<string, unknown>>(
          `/studio/projects/${project_id}/concepts`,
          {
            title: (fields.title as string) || "Idea mới",
            artPrompt: (fields.artPrompt as string) || "",
            visualizePrompt: (fields.visualizePrompt as string) || "",
            productSlug: (fields.productSlug as string) || "fleece-blanket-light",
            psychology: (fields.psychology as string) || "",
            productFit: (fields.productFit as string) || "",
            hook: (fields.hook as string) || "",
            audience: (fields.audience as string) || "",
            fbCaption: (fields.fbCaption as string) || "",
          },
        );
        const cid = created.selectedConceptId as string;
        if (Object.keys(body).length) {
          return jsonText(
            await api.patch(
              `/studio/projects/${project_id}/concepts/${cid}`,
              body,
            ),
          );
        }
        return jsonText(created);
      }

      return jsonText(
        await api.patch(
          `/studio/projects/${project_id}/concepts/${concept_id}`,
          body,
        ),
      );
    },
  );

  server.tool(
    "od_upsert_persona",
    "Design DB: create/update buyer persona + evidence (Postgres). Use before emotion brief / idea.",
    {
      id: z.string().optional(),
      storeId: z.string().optional(),
      segmentName: z.string(),
      marketLanguage: z.string().optional(),
      buyerContext: z.string().optional(),
      trigger: z.array(z.string()).optional(),
      jobs: z
        .object({
          functional: z.array(z.string()).optional(),
          emotional: z.array(z.string()).optional(),
          social: z.array(z.string()).optional(),
        })
        .optional(),
      desiredOutcome: z.array(z.string()).optional(),
      purchaseCriteria: z.array(z.string()).optional(),
      barriers: z.array(z.string()).optional(),
      alternatives: z.array(z.string()).optional(),
      evidence: z
        .array(
          z.object({
            sourceUrl: z.string(),
            dateCollected: z.string().optional(),
            observation: z.string(),
            interpretation: z.string().optional(),
            evidenceGrade: z
              .enum(["observed", "supported", "hypothesis", "unknown"])
              .optional(),
          }),
        )
        .optional(),
      evidenceGrade: z
        .enum(["observed", "supported", "hypothesis", "unknown"])
        .optional(),
      confidence: z.enum(["low", "medium", "high"]).optional(),
      unknowns: z.array(z.string()).optional(),
    },
    async (args) => {
      if (args.id) {
        return jsonText(
          await api.patch(`/design/personas/${args.id}`, args),
        );
      }
      return jsonText(await api.post("/design/personas", args));
    },
  );

  server.tool(
    "od_upsert_emotion_brief",
    "Design DB: pain→desired emotion, JTBD jobs, gift stage, motivation family (Postgres).",
    {
      id: z.string().optional(),
      personaId: z.string().optional(),
      projectId: z.string().optional(),
      motivationFamily: z.string().optional(),
      painEmotion: z.string().optional(),
      desiredEmotion: z.string().optional(),
      emotionalJob: z.string().optional(),
      socialJob: z.string().optional(),
      functionalJob: z.string().optional(),
      giftStage: z
        .enum(["gestation", "prestation", "reformulation", "self-buy"])
        .optional(),
      trigger: z
        .enum(["aesthetic", "behavioural", "symbolic"])
        .optional(),
      circumstance: z.string().optional(),
      insight1liner: z.string().optional(),
      evidenceGrade: z
        .enum(["observed", "supported", "hypothesis", "unknown"])
        .optional(),
      avoid: z.array(z.string()).optional(),
      psychologyProse: z.string().optional(),
      psychology: z.string().optional(),
    },
    async (args) => {
      if (args.id) {
        return jsonText(
          await api.patch(`/design/emotion-briefs/${args.id}`, args),
        );
      }
      return jsonText(await api.post("/design/emotion-briefs", args));
    },
  );

  server.tool(
    "od_design_context",
    "One-shot: concept + persona + emotion brief + experiments + blanks from Postgres.",
    {
      project_id: z.string().optional(),
      concept_id: z.string().optional(),
    },
    async ({ project_id, concept_id }) => {
      const q = new URLSearchParams();
      if (project_id) q.set("project_id", project_id);
      if (concept_id) q.set("concept_id", concept_id);
      const qs = q.toString();
      return jsonText(
        await api.get(`/design/context${qs ? `?${qs}` : ""}`),
      );
    },
  );

  server.tool(
    "od_upsert_experiment",
    "Design DB: log concept experiment (keep|revise|retest|stop|inconclusive).",
    {
      id: z.string().optional(),
      conceptId: z.string(),
      hypothesis: z.string(),
      audienceChannel: z.string().optional(),
      variableChanged: z.string().optional(),
      control: z.string().optional(),
      variant: z.string().optional(),
      primaryMetric: z.string().optional(),
      guardrailMetrics: z.array(z.string()).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sampleSize: z.number().int().optional(),
      results: z.record(z.unknown()).optional(),
      confounders: z.array(z.string()).optional(),
      decision: z
        .enum(["keep", "revise", "retest", "stop", "inconclusive"])
        .optional(),
      confidence: z.enum(["low", "medium", "high"]).optional(),
      nextTest: z.string().optional(),
    },
    async (args) => {
      if (args.id) {
        return jsonText(
          await api.patch(`/design/experiments/${args.id}`, args),
        );
      }
      return jsonText(await api.post("/design/experiments", args));
    },
  );

  server.tool(
    "od_set_stage",
    "Set product lifecycle stage: idea | artwork | mockup | campaign | video",
    {
      project_id: z.string(),
      stage: z.enum(["idea", "artwork", "mockup", "campaign", "video"]),
    },
    async ({ project_id, stage }) =>
      jsonText(
        await api.post(`/studio/projects/${project_id}/stage`, { stage }),
      ),
  );

  server.tool(
    "od_list_cliparts",
    "LIBRARY: list shared cliparts (reusable across products).",
    { q: z.string().optional() },
    async ({ q }) =>
      jsonText(
        await api.get(
          q ? `/library/cliparts?q=${encodeURIComponent(q)}` : "/library/cliparts",
        ),
      ),
  );

  server.tool(
    "od_list_fonts",
    "LIBRARY: list shared fonts.",
    { q: z.string().optional() },
    async ({ q }) =>
      jsonText(
        await api.get(
          q ? `/library/fonts?q=${encodeURIComponent(q)}` : "/library/fonts",
        ),
      ),
  );

  server.tool(
    "od_attach_library",
    "ARTWORK: attach clipart or font from Library into product Artwork (+ form field).",
    {
      project_id: z.string(),
      kind: z.enum(["clipart", "font"]),
      library_id: z.string(),
      sample_text: z.string().optional(),
    },
    async ({ project_id, kind, library_id, sample_text }) =>
      jsonText(
        await api.post(`/studio/projects/${project_id}/attach-library`, {
          kind,
          library_id,
          sample_text,
        }),
      ),
  );

  server.tool(
    "od_mock_stage",
    "Advance artwork|mockup|campaign|video (mock engines until OpenMerch/Teeinblue wired).",
    {
      project_id: z.string(),
      kind: z.enum(["artwork", "mockup", "campaign", "video"]),
      concept_id: z.string().optional(),
    },
    async ({ project_id, kind, concept_id }) =>
      jsonText(
        await api.post(`/studio/projects/${project_id}/mock-artifact`, {
          kind,
          concept_id,
        }),
      ),
  );

  server.tool(
    "od_build_campaign",
    "LEGACY project lifecycle: mark project campaign from project Artwork. For real campaigns use od_create_campaign / od_run_artwork_to_campaign.",
    { project_id: z.string() },
    async ({ project_id }) =>
      jsonText(await api.post(`/studio/projects/${project_id}/build-campaign`)),
  );

  server.tool(
    "od_run_idea_to_campaign",
    "One-shot: create/expand ideas → select first concept → seed artwork from library → campaign.",
    {
      niche: z.string(),
      product_slug: z.string().optional(),
    },
    async ({ niche, product_slug }) => {
      const project = await api.post<{
        id: string;
        concepts: Array<{ id: string }>;
      }>("/studio/ideas/expand", {
        niche,
        count: 4,
        product_slug,
      });
      const conceptId = project.concepts?.[0]?.id;
      if (conceptId) {
        await api.post(`/studio/projects/${project.id}/select-concept`, {
          concept_id: conceptId,
        });
      }
      await api.post(`/studio/projects/${project.id}/mock-artifact`, {
        kind: "artwork",
        concept_id: conceptId,
      });
      const final = await api.post(
        `/studio/projects/${project.id}/build-campaign`,
      );
      return jsonText({
        hint: "Refresh http://127.0.0.1:5173/app to see product canvas",
        project: final,
      });
    },
  );

  // Artwork (design tool) + Campaign (listing/launch) — full toolsets
  registerArtworkTools(server, api);
  registerCampaignTools(server, api);
  registerPrintTools(server, api);
  registerMediaTools(server, api);
  registerProductBaseTools(server, api);
  registerTeamTools(server, api);
  registerResearchTools(server, api);
  registerShopSettingsTools(server, api);
  registerPrintScriptTools(server, api);
  registerFormLayoutTools(server, api);
  registerKnowledgeTools(server, api);
  return server;
}

async function main(): Promise<void> {
  loadEnvFiles();

  const baseUrl = (
    process.env.WEBTOOLS_API_URL ||
    process.env.OPEN_DESIGNER_API_URL ||
    "http://127.0.0.1:8010"
  ).replace(/\/$/, "");
  const mcpKey = (
    process.env.MCP_API_KEY ||
    process.env.OPEN_DESIGNER_MCP_KEY ||
    ""
  ).trim();

  if (!mcpKey) {
    console.error(
      "Missing MCP_API_KEY. Set in webtools/backend/.env and Cursor mcp.json env.",
    );
    process.exit(1);
  }

  const server = createMcpServer(new WebtoolsClient(baseUrl, mcpKey));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
