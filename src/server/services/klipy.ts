import { HttpError } from "@/lib/http";

/**
 * Klipy (klipy.com) GIF search, server-side only — the app key must never reach
 * the browser. A picked result is never fetched or stored server-side: the
 * client turns it straight into a `![title](url)` link in the message body
 * (see the composer's GIF picker and `src/shared/markdown.ts`), so this module
 * only ever proxies the search/trending listing.
 */

const KLIPY_BASE_URL = "https://api.klipy.com/api/v1";

export function klipyConfigured() {
  return Boolean(process.env.KLIPY_API_KEY);
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
