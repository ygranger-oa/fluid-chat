import { HttpError } from "@/lib/http";

/**
 * Klipy (klipy.com) GIF search, server-side only — the app key must never reach
 * the browser. Search/trending calls return lightweight metadata the client
 * renders as a picker grid; the chosen GIF is copied into our own storage by
 * `/workspaces/:id/gifs/import` (see routes/gifs.ts) rather than being linked
 * to directly, so a message's media survives Klipy being unreachable or the
 * key being revoked later, exactly like every other file attachment.
 */

const KLIPY_BASE_URL = "https://api.klipy.com/api/v1";

// Domains Klipy documents for API and asset delivery. `/gifs/import` refuses
// to fetch anything else, which is what keeps that route from being an open
// SSRF proxy for a client-supplied URL.
const KLIPY_ASSET_HOSTS = new Set(["api.klipy.com", "static.klipy.com", "static1.klipy.com", "static2.klipy.com"]);

export function klipyConfigured() {
  return Boolean(process.env.KLIPY_API_KEY);
}

export function isKlipyAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && KLIPY_ASSET_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export type KlipyGif = {
  id: string;
  title: string | null;
  previewUrl: string;
  url: string;
  width: number;
  height: number;
};

type KlipyFileVariant = { url: string; width: number; height: number; size: number };
type KlipyFileTier = { gif?: KlipyFileVariant };
type KlipyGifRecord = {
  id: string | number;
  title?: string | null;
  file?: { hd?: KlipyFileTier; md?: KlipyFileTier; sm?: KlipyFileTier; xs?: KlipyFileTier };
};
type KlipyResponse = { result?: boolean; data?: { data?: KlipyGifRecord[] } };

async function klipyRequest(path: string, params: Record<string, string | undefined>): Promise<KlipyGif[]> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) throw new HttpError(503, "GIF search is not configured", "gifs_disabled");

  const url = new URL(`${KLIPY_BASE_URL}/${apiKey}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new HttpError(502, "GIF search is unavailable", "gifs_unreachable");
  }
  if (!response.ok) throw new HttpError(502, "GIF search is unavailable", "gifs_unreachable");

  const body = (await response.json().catch(() => null)) as KlipyResponse | null;
  if (!body?.result || !Array.isArray(body.data?.data)) return [];
  const gifs: KlipyGif[] = [];
  for (const record of body.data.data) {
    const gif = toKlipyGif(record);
    if (gif) gifs.push(gif);
  }
  return gifs;
}

function toKlipyGif(record: KlipyGifRecord): KlipyGif | null {
  const file = record.file;
  if (!file) return null;
  // "md" is the best size/quality trade-off to actually send; "xs" keeps the
  // picker grid light while still animating.
  const send = file.md?.gif ?? file.sm?.gif ?? file.hd?.gif ?? file.xs?.gif;
  const preview = file.xs?.gif ?? file.sm?.gif ?? send;
  if (!send || !preview) return null;
  return {
    id: String(record.id),
    title: record.title ?? null,
    previewUrl: preview.url,
    url: send.url,
    width: send.width,
    height: send.height
  };
}

const PAGE_SIZE = "24";

export function searchGifs(query: string, customerId: string, page: number) {
  return klipyRequest("gifs/search", {
    q: query,
    customer_id: customerId,
    page: String(page),
    per_page: PAGE_SIZE,
    content_filter: "medium"
  });
}

export function trendingGifs(customerId: string, page: number) {
  return klipyRequest("gifs/trending", {
    customer_id: customerId,
    page: String(page),
    per_page: PAGE_SIZE,
    content_filter: "medium"
  });
}
