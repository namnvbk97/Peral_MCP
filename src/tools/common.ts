import { z } from "zod";

export function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorText(message: string, extra?: Record<string, unknown>) {
  return {
    isError: true,
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message, ...extra }, null, 2) },
    ],
  };
}

type Dict = Record<string, unknown>;

/** Drop heavy fields (version snapshots, long history) so tool output stays readable. */
export function compactArtwork(a: unknown): unknown {
  if (!a || typeof a !== "object") return a;
  const art = { ...(a as Dict) };
  const versions = (art.versions as Dict[] | undefined) || [];
  art.versions = versions.slice(-5).map((v) => {
    const { snapshot: _s, ...rest } = v;
    return rest;
  });
  art.versionCount = versions.length;
  const hist = (art.history as Dict[] | undefined) || [];
  art.history = hist.slice(-5);
  return art;
}

/** Compact for responses shaped {layer, templateId, artwork}. */
export function compactLayerResult(r: unknown): unknown {
  if (!r || typeof r !== "object") return r;
  const o = { ...(r as Dict) };
  if (o.artwork) o.artwork = compactArtwork(o.artwork);
  return o;
}

export function stripUndefined<T extends Dict>(o: T): Partial<T> {
  const out: Dict = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Zod shapes shared by artwork tools. */
export const layerOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string().optional().describe("Color hex (bindMode=fill) or image URL (bindMode=src)"),
  thumbnail: z.string().optional(),
  textColor: z.string().optional().describe("Slot-group name colour when this option is chosen (textColorFrom)"),
}).passthrough();

export const conditionSchema = z
  .object({
    action: z.enum(["show", "hide"]).optional().describe("hide = the layer hides when the rules match (default show)"),
    match_type: z.enum(["all", "any"]).optional(),
    show_by_default: z.boolean().optional(),
    dependencies: z
      .array(
        z.object({
          element: z
            .string()
            .describe('Controlling layer id, or the sold variant: "__v:<Product Base option>" (e.g. __v:Style), "__file" (print file key), "__sides" ("1"/"2")'),
          element_type: z.string().optional(),
          value: z.array(z.string()).describe("Option ids / variant values / file keys that match"),
        }),
      )
      .optional(),
  })
  .describe("Show this layer/field only when other field values match");

export const LAYER_TYPES = [
  "text",
  "paragraph",
  "curve-text",
  "text-other",
  "static-photo",
  "clipart-category",
  "photo-upload",
  "text-to-image",
  "dynamic-clipart",
  "static-vector",
  "vector-category",
  "vector-upload",
  "street-maps",
  "route-maps",
  "star-maps",
  "moon-phase",
  "scrabble",
  "word-search",
  "word-cloud",
  "song-search",
  "calendar",
  "qr-code",
  "clock",
  "toggle-switch",
  "additional-option",
  "addon-charge",
  "json-list",
  "font",
  "color",
  "blank",
] as const;

/**
 * Layer props accepted on add/update. Known keys are typed; any other
 * DesignLayer field passes through (passthrough).
 */
export const layerPropsSchema = z
  .object({
    id: z.string().optional().describe("Custom layer id (add only)"),
    name: z.string().optional(),
    type: z.enum(LAYER_TYPES).optional(),
    locked: z.boolean().optional(),
    visible: z.boolean().optional(),
    src: z.string().nullable().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    scaleX: z.number().optional(),
    scaleY: z.number().optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional().describe("Font family (uploaded fonts: od_list_studio_fonts → family)"),
    fill: z.string().optional().describe("Text color / solid fill hex"),
    glitter: z
      .enum(["red", "gold", "fire"])
      .optional()
      .describe("Print-time glitter text. fire = Laura front: tilted soft serif, orange glitter, yellow-to-red rim"),
    fontStyle: z.enum(["normal", "bold", "italic", "bold italic"]).optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    formLabel: z.string().optional().describe("Label shown to the customer in the form"),
    displayType: z
      .enum(["image", "radio", "dropdown", "color", "text", "combobox", "checkbox", "listbox"])
      .optional(),
    required: z.boolean().optional(),
    defaultValue: z.string().optional(),
    maxLength: z.number().int().optional(),
    options: z.array(layerOptionSchema).optional(),
    customizationType: z.enum(["normal", "no_customization"]).optional(),
    condition: conditionSchema.nullable().optional(),
    formOnly: z.boolean().optional(),
    bindTargetLayerId: z
      .string()
      .nullable()
      .optional()
      .describe("Form-only option → apply chosen option to this canvas layer"),
    bindMode: z.enum(["fill", "src"]).optional(),
    roi: z
      .object({
        type: z.enum(["rect", "rotated-rect", "circle", "ellipse", "polygon"]),
        angle: z.number().optional(),
        points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
      })
      .optional()
      .describe("Photo-upload clip shape"),
    clipartCategoryId: z.union([z.string(), z.number()]).optional(),
    formX: z.number().optional(),
    formY: z.number().optional(),
    formWidth: z.number().optional(),
    formHeight: z.number().optional(),
  })
  .passthrough();

export const imageSourceSchema = z
  .object({
    file_path: z.string().optional().describe("Local file path on this computer (uploaded)"),
    asset_id: z.string().optional().describe("Uploaded Assets id (od_list_assets)"),
    url: z.string().optional().describe("/uploads/... path or http(s) URL (backend downloads)"),
    fit_to_image: z.boolean().optional().describe("Shrink layer box to image aspect"),
  })
  .describe("Exactly one of file_path | asset_id | url");
