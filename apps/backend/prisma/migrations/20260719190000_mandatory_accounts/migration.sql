-- Accounts become mandatory: drop the anonymous sessionId identity entirely.
-- All game data from the guest era is wiped (dev-only data); users are kept.

-- Wipe anonymous-era game data (FK dependency order)
DELETE FROM "Round";
DELETE FROM "GamePlayer";
DELETE FROM "Game";
DELETE FROM "Player";
DELETE FROM "Lobby";

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_userId_fkey";

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "sessionId",
ALTER COLUMN "userId" SET NOT NULL;

-- User.nickname: add nullable, backfill existing dev accounts from the email
-- local part (+ id suffix for uniqueness), then enforce NOT NULL.
ALTER TABLE "User" ADD COLUMN     "nickname" VARCHAR(32);
UPDATE "User" SET "nickname" = left(split_part("email", '@', 1), 25) || '_' || left("id"::text, 6);
ALTER TABLE "User" ALTER COLUMN "nickname" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
