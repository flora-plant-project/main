/**
 * In-memory diagnosis store.
 *
 * The interface is deliberately narrow (insert / find / update) so swapping in
 * a Prisma-backed implementation touches this file only.
 */

/** Create an isolated store. Tests get their own; the app gets one. */
export function createDiagnosisStore() {
  /** @type {Map<string, object>} */
  const rows = new Map();
  let counter = 0;
  // Per-process suffix so a server id can never collide with an id minted by
  // the mobile mock store, which uses the same `dg_<n>` shape. The two coexist
  // while only scanning runs live.
  const runId = Math.random().toString(36).slice(2, 7);

  
  return {
    /**
     * @param {object} row
     * @returns {object} the stored row
     */
    insert(row) {
      const id = `dg_${runId}${++counter}`;
      const stored = { ...row, id };
      rows.set(id, stored);
      return stored;
    },

    /**
     * @param {string} id
     * @returns {object|null}
     */
    find(id) {
      return rows.get(id) ?? null;
    },

    /**
     * Patch a row in place. No-op if the id is unknown.
     * @param {string} id
     * @param {object} patch
     * @returns {object|null} the updated row
     */
    update(id, patch) {
      const existing = rows.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      rows.set(id, updated);
      return updated;
    },

    /** @returns {object[]} every row, insertion-ordered. */
    all() {
      return [...rows.values()];
    },
  };
}
