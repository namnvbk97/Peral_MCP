/** Thin HTTP client for Webtools API (MCP auth via X-MCP-Key). */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export type QueryValue = string | number | boolean | undefined | null;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export function withQuery(path: string, params?: Record<string, QueryValue>): string {
  if (!params) return path;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

export class WebtoolsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly mcpKey: string,
  ) {}

  get apiBase(): string {
    return this.baseUrl.replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.apiBase}${path}`;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "X-MCP-Key": this.mcpKey,
      Accept: "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    };
    const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (init?.body && !isForm && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(this.url(path), { ...init, headers });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  get<T>(path: string, params?: Record<string, QueryValue>) {
    return this.request<T>(withQuery(path, params));
  }

  post<T>(path: string, body?: unknown, params?: Record<string, QueryValue>) {
    return this.request<T>(withQuery(path, params), {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  delete<T>(path: string, params?: Record<string, QueryValue>) {
    return this.request<T>(withQuery(path, params), { method: "DELETE" });
  }

  /** POST a JSON body and get a file back (xlsx, csv, zip…): bytes + response headers. */
  async download(path: string, body: unknown): Promise<{ bytes: Uint8Array; headers: Headers }> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { "X-MCP-Key": this.mcpKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
    }
    return { bytes: new Uint8Array(await res.arrayBuffer()), headers: res.headers };
  }

  /** Multipart upload of a local file (path on the machine running the MCP). */
  async uploadFile<T>(
    path: string,
    filePath: string,
    fields: Record<string, string | undefined> = {},
    fileField = "file",
  ): Promise<T> {
    const raw = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const blob = new Blob([raw], { type: MIME[ext] || "application/octet-stream" });
    const fd = new FormData();
    fd.append(fileField, blob, basename(filePath));
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== "") fd.append(k, v);
    }
    return this.request<T>(path, { method: "POST", body: fd });
  }

  /** Multipart POST with several files ({field: localPath}) + text fields. */
  async uploadFiles<T>(
    path: string,
    files: Record<string, string | undefined>,
    fields: Record<string, string | undefined> = {},
  ): Promise<T> {
    const fd = new FormData();
    for (const [field, filePath] of Object.entries(files)) {
      if (!filePath) continue;
      const raw = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      fd.append(field, new Blob([raw], { type: MIME[ext] || "application/octet-stream" }), basename(filePath));
    }
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== "") fd.append(k, v);
    }
    return this.request<T>(path, { method: "POST", body: fd });
  }
}
