-- CreateEnum
CREATE TYPE "SpeciesSource" AS ENUM ('CATALOG', 'ADOPTED');

-- AlterTable
ALTER TABLE "Species" ADD COLUMN     "source" "SpeciesSource" NOT NULL DEFAULT 'CATALOG';
