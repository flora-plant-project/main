-- Diagnoses now store the storage KEY of the scanned photo, not a client-local
-- capture URI. Renamed rather than dropped and re-added: the seeded rows carry
-- bundled demo asset paths that the app still resolves.
ALTER TABLE "Diagnosis" RENAME COLUMN "imageUri" TO "imageKey";
