ALTER TABLE "sidebar_sections" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "sidebar_section_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "sidebar_position" integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_sidebar_section_id_sidebar_sections_id_fk'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_sidebar_section_id_sidebar_sections_id_fk"
      FOREIGN KEY ("sidebar_section_id")
      REFERENCES "public"."sidebar_sections"("id")
      ON DELETE set null
      ON UPDATE no action;
  END IF;
END $$;

UPDATE "conversations"
SET
  "sidebar_section_id" = source."section_id",
  "sidebar_position" = source."position"
FROM (
  SELECT DISTINCT ON ("conversation_id")
    "conversation_id",
    "section_id",
    "position"
  FROM "conversation_members"
  WHERE "section_id" IS NOT NULL
  ORDER BY "conversation_id", "position" DESC
) AS source
WHERE "conversations"."id" = source."conversation_id"
  AND "conversations"."sidebar_section_id" IS NULL;
