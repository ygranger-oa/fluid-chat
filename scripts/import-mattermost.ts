import { pool } from "@/db/client";
import { importMattermostExport } from "@/server/services/mattermost-import";

type CliOptions = {
  workspaceId?: string;
  workspaceSlug?: string;
  exportPath?: string;
  attachmentsDir?: string;
  dryRun?: boolean;
};

function parseArgs(argv: string[]) {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--workspace-id") {
      options.workspaceId = next;
      index += 1;
    } else if (arg === "--workspace-slug") {
      options.workspaceSlug = next;
      index += 1;
    } else if (arg === "--export") {
      options.exportPath = next;
      index += 1;
    } else if (arg === "--attachments-dir") {
      options.attachmentsDir = next;
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function usage(exitCode: number): never {
  console.log(`Usage:
  npm run import:mattermost -- --workspace-slug <slug> --export <mattermost.jsonl> [--attachments-dir <dir>] [--dry-run]
  npm run import:mattermost -- --workspace-id <uuid> --export <mattermost.jsonl> [--attachments-dir <dir>] [--dry-run]

Notes:
  - The Mattermost team display_name must match the existing workspace name.
  - Mattermost town-square is imported into the existing #general channel.
  - Attachments must be extracted on disk; pass the extracted root with --attachments-dir.
`);
  process.exit(exitCode);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.exportPath || (!options.workspaceId && !options.workspaceSlug)) usage(1);

  const summary = await importMattermostExport({
    workspaceId: options.workspaceId,
    workspaceSlug: options.workspaceSlug,
    exportPath: options.exportPath,
    attachmentsDir: options.attachmentsDir,
    dryRun: options.dryRun
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
