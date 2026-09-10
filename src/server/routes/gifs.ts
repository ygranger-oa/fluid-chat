import { HttpError } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/permissions";
import { defineRoutes } from "../router";
import { searchGifs, trendingGifs } from "../services/klipy";

/**
 * Search stays server-side so the Klipy app key never reaches the browser; the
 * `customer_id` we send Klipy is the internal user id, never the account email.
 * A picked GIF is never downloaded or stored here — the client turns the result
 * straight into a `![title](url)` link in the message body, the same format
 * Mattermost's own Giphy integration produced, so old imported messages render
 * the same way. That also means there is no import endpoint to keep in sync
 * with the composer: sending is just a normal text message.
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
  }
});
