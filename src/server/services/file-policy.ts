import { gt, isNull, or } from "drizzle-orm";
import { files } from "@/db/schema";
import { HttpError } from "@/lib/http";

const MEBIBYTE = 1024 * 1024;

export const MAX_UPLOAD_BYTES = 10 * MEBIBYTE;
export const MAX_WORKSPACE_FILE_BYTES = 10000 * MEBIBYTE;
export const DEFAULT_FILE_RETENTION_DAYS = 0;
export const EXPORT_RETENTION_DAYS = 7;

export function fileExpiresAt(retentionDays = DEFAULT_FILE_RETENTION_DAYS, createdAt = new Date()) {
  if (retentionDays === 0) return null;
  return new Date(createdAt.getTime() + retentionDays * 86_400_000);
}

export function activeFileFilter(now = new Date()) {
  return or(isNull(files.expiresAt), gt(files.expiresAt, now));
}

export function fileLimitBytes(limitMb: number) {
  return limitMb * MEBIBYTE;
}

export function assertFileUploadAllowed(
  fileBytes: number,
  workspaceBytes = 0,
  limits: { maxUploadBytes?: number; maxWorkspaceFileBytes?: number } = {}
) {
  const maxUploadBytes = limits.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  const maxWorkspaceFileBytes = limits.maxWorkspaceFileBytes ?? MAX_WORKSPACE_FILE_BYTES;

  if (!Number.isSafeInteger(fileBytes) || fileBytes < 0) {
    throw new HttpError(400, "Invalid file size", "invalid_file_size");
  }
  if (fileBytes > maxUploadBytes) {
    throw new HttpError(413, `Files must be ${formatMebibytes(maxUploadBytes)} or smaller`, "file_too_large");
  }
  if (workspaceBytes + fileBytes > maxWorkspaceFileBytes) {
    throw new HttpError(413, `Workspace file storage is limited to ${formatMebibytes(maxWorkspaceFileBytes)}`, "workspace_storage_limit");
  }
}

function formatMebibytes(bytes: number) {
  return `${Math.floor(bytes / MEBIBYTE)}MB`;
}
