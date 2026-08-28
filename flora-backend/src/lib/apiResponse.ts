/**
 * The one response shape every Flora endpoint returns. The mobile client branches on
 * `success` alone and never has to inspect HTTP status to know what it received.
 *
 * Kept free of Express types so both the error classes and the error middleware can
 * import it without a cycle.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    /** Stable, machine-readable identifier — the client switches on this, not on `message`. */
    code: string;
    /** Human-readable text, safe to surface. Never contains stack traces or SQL. */
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Convention: endpoints with no payload — logout, deletes — return `ok(null)`.
 * One empty form across every module, so the client never has to distinguish
 * `null` from `{}` from a missing key.
 */
export const ok = <T>(data: T): ApiSuccess<T> => ({
  success: true,
  data,
});

export const fail = (code: string, message: string): ApiFailure => ({
  success: false,
  error: { code, message },
});
