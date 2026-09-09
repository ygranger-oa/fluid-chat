# Mattermost Import

Fluid Chat imports Mattermost bulk exports from a server-side CLI. This keeps the operation out of
the web UI because exports and attachment archives can be large, long-running and operationally
sensitive.

```bash
npm run import:mattermost -- --workspace-slug <slug> --export ./mattermost-export.jsonl --dry-run
npm run import:mattermost -- --workspace-slug <slug> --export ./mattermost-export.jsonl --attachments-dir ./data
```

You can use `--workspace-id` instead of `--workspace-slug`.

## Behaviour

- The Mattermost team `display_name` must match the existing Fluid Chat workspace `name`.
- The workspace is never recreated.
- Mattermost `town-square` is imported into the existing `general` channel.
- Public and private channels are created when missing, with their Mattermost members.
- Missing users are created from their Mattermost email, username and profile fields, then added to
  the workspace.
- Messages are idempotent through `clientMessageId = mattermost:<post_id>`, so rerunning the import
  skips messages already imported for the same sender.
- Reactions and files attached to newly imported messages are imported when present in the export.
- Attachments must be extracted before import. Pass the extracted root with `--attachments-dir`; file
  paths are resolved only under that root.

## Requirements

The command uses the same environment as the app:

- `DATABASE_URL`
- S3-compatible storage variables documented in [Environment variables](env.md)

Run `--dry-run` first on production data and take a database plus object-storage backup before the
real import.
