import { z } from "zod";
import { HttpError, json } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/permissions";
import { defineRoutes } from "../router";
import { isKlipyAssetUrl, searchGifs, trendingGifs } from "../services/klipy";
import { uploadFile } from "../services/files";

/**
 * GIF search stays server-side end to end: the Klipy app key never reaches the
 * browser, and the `customer_id` we send Klipy is the internal user id (never
 * the account email), matching how every other identifier crosses this API.
 */
export const gifRoutes = defineRoutes({
  "GET /workspaces/:workspaceId/gifs/search": async (ctx) => {
    const user = await ctx.user();
    const workspaceId = ctx.param("workspaceId");
    await requireWorkspaceMember(workspaceId, user.id);
    const query = ctx.query("q");
    if (!query?.trim()) throw new HttpError(400, "Missing q", "missing_query");
    const gifs = await searchGifs(query.trim(), user.id, ctx.queryInt("page", 1, 10));
    return { gifs };
  },

  "GET /workspaces/:workspaceId/gifs/trending": async (ctx) => {
    const user = await ctx.user();
    const workspaceId = ctx.param("workspaceId");
    await requireWorkspaceMember(workspaceId, user.id);
    const gifs = await trendingGifs(user.id, ctx.queryInt("page", 1, 10));
    return { gifs };
  },

  "POST /workspaces/:workspaceId/gifs/import": async (ctx) => {
    const user = await ctx.user();
    const workspaceId = ctx.param("workspaceId");
    await requireWorkspaceMember(workspaceId, user.id);
    const input = await ctx.input(
      z.object({
        url: z.string().url(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        conversationId: z.string().uuid().optional()
      })
    );
    // The client only ever echoes back a URL we handed it moments earlier from
    // a search/trending result, but treat it as attacker-controlled input
    // anyway: this is a server-side fetch of a client-supplied URL, so pinning
    // it to Klipy's own asset hosts is what keeps it from being an SSRF proxy.
    if (!isKlipyAssetUrl(input.url)) throw new HttpError(400, "Invalid GIF source", "invalid_gif_source");

    let response: Response;
    try {
      response = await fetch(input.url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new HttpError(502, "Could not fetch the GIF", "gif_fetch_failed");
    }
    if (!response.ok) throw new HttpError(502, "Could not fetch the GIF", "gif_fetch_failed");

    const buffer = Buffer.from(await response.arrayBuffer());
    const file = new File([buffer], "gif.gif", { type: response.headers.get("content-type") || "image/gif" });

    const uploaded = await uploadFile({
      workspaceId,
      uploader: user,
      conversationId: input.conversationId ?? null,
      file,
      dimensions: { width: input.width, height: input.height }
    });
    return json({ file: uploaded }, 201);
  }
});
