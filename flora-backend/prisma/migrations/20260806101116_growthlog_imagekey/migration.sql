/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `GrowthLog` table. All the data in the column will be lost.
  - Added the required column `imageKey` to the `GrowthLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GrowthLog" RENAME COLUMN "imageUrl" TO "imageKey";