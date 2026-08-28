-- Curator's order for the species catalog.
--
-- The live API must list species in the same order the mobile mock client does:
-- one contract suite runs against both, so an implicit (or alphabetical) order
-- would diverge from the seed and only surface as a confusing assertion failure.
ALTER TABLE "Species" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
