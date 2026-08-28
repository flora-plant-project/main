/**
 * Turning a photo on the phone into bytes an upload URL will accept.
 *
 * Two sources, because the app has two: the camera hands back base64 (it is
 * already decoding the frame), and the image picker hands back a `file://` URI.
 * Both end up as something `fetch` can PUT.
 */

/** URI schemes that name a file on this device rather than somewhere anyone can reach. */
const LOCAL_URI = /^(?:file|content|ph|assets-library):/i;

/** @param {unknown} value */
export const isLocalUri = (value) => typeof value === 'string' && LOCAL_URI.test(value);

/**
 * Decode base64 to bytes.
 *
 * `atob` exists in Hermes and in Node; Buffer is the fallback for anything
 * running these clients outside both.
 *
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function bytesFromBase64(base64) {
  const clean = base64.replace(/^data:[^;,]*;base64,/, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(clean, 'base64'));
}

/**
 * Read a photo into a body, its type and its size.
 *
 * The size is needed BEFORE the upload starts: the API signs an upload URL for
 * an exact byte count, which is what stops a signed URL being reused to push
 * something else.
 *
 * @param {{base64?: string, uri?: string, contentType?: string}} source
 * @returns {Promise<{body: unknown, contentType: string, byteLength: number}>}
 */
export async function readImage({ base64, uri, contentType }) {
  if (base64) {
    const bytes = bytesFromBase64(base64);
    return { body: bytes, contentType: contentType ?? 'image/jpeg', byteLength: bytes.byteLength };
  }
  if (!uri) throw new Error('nothing to upload: pass base64 or uri');

  // fetch() reads file:// and content:// on React Native, which keeps the
  // whole picked-photo path free of an extra filesystem dependency.
  const blob = await (await fetch(uri)).blob();
  return {
    body: blob,
    contentType: contentType ?? blob.type ?? 'image/jpeg',
    byteLength: blob.size,
  };
}
