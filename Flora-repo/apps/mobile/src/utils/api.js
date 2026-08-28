/**
 * Unwrap an ApiResponse envelope for use as a react-query queryFn result:
 * returns the data on ok, throws on failure so react-query surfaces the error.
 * @template T
 * @param {{ ok: true, data: T } | { ok: false, error: { code: string, message: string } }} res
 * @returns {T}
 */
export function unwrap(res) {
  if (res.ok) return res.data;
  throw new Error(res.error.message);
}
