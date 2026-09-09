import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mattermostChannelName,
  mattermostDisplayName,
  mattermostPostKey,
  mattermostReactionEmoji,
  parseMattermostExport,
  previewMattermostFiles,
  type MattermostImportSummary
} from "@/server/services/mattermost-import";

describe("Mattermost import mapping", () => {
  it("imports Mattermost town-square into the existing general channel", () => {
    expect(mattermostChannelName("town-square")).toBe("general");
  });

  it("normalizes Mattermost channel names with the local channel rules", () => {
    expect(mattermostChannelName("Project Support")).toBe("project-support");
    expect(mattermostChannelName("R&D / Sales")).toBe("rd-sales");
  });

  it("uses the most readable available display name for imported users", () => {
    expect(mattermostDisplayName({ username: "ada", nickname: "Ada L." })).toBe("Ada L.");
    expect(mattermostDisplayName({ username: "grace", first_name: "Grace", last_name: "Hopper" })).toBe(
      "Grace Hopper"
    );
    expect(mattermostDisplayName({ username: "linus", email: "linus@example.com" })).toBe("linus");
  });

  it("generates a stable post key when Mattermost bulk export has no post id", () => {
    const post = {
      team: "acme",
      channel: "labo",
      user: "sgi",
      create_at: 1710000000000,
      message: "Imported without explicit id"
    };

    expect(mattermostPostKey(post)).toMatch(/^generated:[a-f0-9]{32}$/);
    expect(mattermostPostKey(post)).toBe(mattermostPostKey({ ...post }));
  });

  it("prefers explicit Mattermost post identifiers when available", () => {
    expect(mattermostPostKey({ id: "abc" })).toBe("abc");
    expect(mattermostPostKey({ post_id: "def" })).toBe("def");
  });

  it("maps known Mattermost reaction names to renderable emoji", () => {
    expect(mattermostReactionEmoji("+1")).toBe("👍");
    expect(mattermostReactionEmoji(":muscle:")).toBe("💪");
    expect(mattermostReactionEmoji("does_not_exist")).toBeNull();
  });

  it("parses Mattermost JSONL exports", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluid-mattermost-"));
    const exportPath = path.join(dir, "export.jsonl");
    await writeFile(
      exportPath,
      [
        JSON.stringify({ type: "team", team: { display_name: "Acme" } }),
        JSON.stringify({ type: "user", user: { username: "ada", email: "ada@example.com" } }),
        JSON.stringify({ type: "channel", channel: { name: "town-square" } }),
        JSON.stringify({ type: "post", post: { id: "p1", user: "ada", channel: "town-square", message: "Hello" } })
      ].join("\n")
    );

    try {
      const parsed = await parseMattermostExport(exportPath);

      expect(parsed.teams).toHaveLength(1);
      expect(parsed.users).toHaveLength(1);
      expect(parsed.channels).toHaveLength(1);
      expect(parsed.posts).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("previews attachment files found and missing in dry-run mode", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluid-mattermost-files-"));
    await mkdir(path.join(dir, "teams", "acme", "channels", "general"), { recursive: true });
    await writeFile(path.join(dir, "teams", "acme", "channels", "general", "report.pdf"), "pdf");

    try {
      const preview = await previewMattermostFiles(
        [
          {
            id: "p1",
            files: [
              { path: "teams/acme/channels/general/report.pdf", name: "report.pdf" },
              { path: "teams/acme/channels/general/missing.png", name: "missing.png" }
            ]
          }
        ],
        dir
      );

      expect(preview.filesFound).toBe(1);
      expect(preview.missingFilesCount).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads attachments from the real Mattermost bulk export shape (post.attachments, path only)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluid-mattermost-attachments-"));
    await mkdir(path.join(dir, "20250203", "teams", "noteam", "channels", "sxnr8u9ey3bp5xtbmyubq9tfxw"), {
      recursive: true
    });
    await writeFile(
      path.join(dir, "20250203", "teams", "noteam", "channels", "sxnr8u9ey3bp5xtbmyubq9tfxw", "image.png"),
      "png"
    );

    try {
      const preview = await previewMattermostFiles(
        [
          {
            id: "p1",
            attachments: [{ path: "20250203/teams/noteam/channels/sxnr8u9ey3bp5xtbmyubq9tfxw/image.png" }]
          }
        ],
        dir
      );

      expect(preview.filesFound).toBe(1);
      expect(preview.missingFilesCount).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("includes skipped message reasons in import summaries", () => {
    const summary: MattermostImportSummary = {
      workspaceName: "Acme",
      dryRun: true,
      usersCreated: 0,
      usersMatched: 0,
      channelsCreated: 0,
      channelsMatched: 0,
      membershipsCreated: 0,
      messagesCreated: 0,
      messagesSkipped: 0,
      reactionsCreated: 0,
      reactionsSkipped: 0,
      ignoredReactionEmoji: { custom_ok: 3 },
      filesCreated: 0,
      missingFilesCount: 0,
      messagesSkippedDetails: [{ postId: "p1", reason: "missing_user", channel: "general", user: "deleted-user" }]
    };

    expect(summary.messagesSkippedDetails).toEqual([
      { postId: "p1", reason: "missing_user", channel: "general", user: "deleted-user" }
    ]);
    expect(summary.ignoredReactionEmoji).toEqual({ custom_ok: 3 });
  });
});
