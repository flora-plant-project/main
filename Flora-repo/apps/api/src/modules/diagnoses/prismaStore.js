/**
 * Prisma-backed diagnosis store.
 *
 * Same narrow insert / find / update surface as the in-memory store, which is
 * what store.js promised: swapping persistence touches this layer only, and the
 * service is unchanged apart from awaiting.
 *
 * The in-memory store in store.js is kept for unit tests — they exercise the
 * job lifecycle, which has nothing to do with Postgres and should not need it.
 *
 * @param {{prisma: import('@prisma/client').PrismaClient}} deps
 */
export function createPrismaDiagnosisStore({ prisma }) {
  return {
    /**
     * @param {object} row
     * @returns {Promise<object>}
     */
    insert(row) {
      return prisma.diagnosis.create({ data: row });
    },

    /**
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    find(id) {
      return prisma.diagnosis.findUnique({ where: { id } });
    },

    /**
     * Patch a row. Resolves to null if the id is unknown, matching the
     * in-memory store — a diagnosis deleted mid-recognition must not turn the
     * background worker's write into an unhandled rejection.
     *
     * @param {string} id
     * @param {object} patch
     * @returns {Promise<object|null>}
     */
    async update(id, patch) {
      try {
        return await prisma.diagnosis.update({ where: { id }, data: patch });
      } catch (error) {
        // P2025: no row matched. Anything else is a real fault worth raising.
        if (error?.code === 'P2025') return null;
        throw error;
      }
    },
  };
}
