import { apiFetch } from './http.js';
import { setToken } from './session.js';
import { isLocalUri, readImage } from './uploads.js';

/**
 * Live HTTP client — the same interface as mockClient, backed by the Express API.
 *
 * Every method resolves to an ApiResponse envelope and never throws: apiFetch
 * converts transport failures into `{ ok: false, error }` too, so a screen
 * handles one outcome type whether the failure was the network or the server.
 *
 * The shared behavioural suite in __contract__/client.contract.test.js runs
 * against this client and the mock, which is what keeps the two honest.
 */

/**
 * Adopt the token the API issued and hand back only what the mock returns.
 *
 * The token is a transport detail: the mock has no equivalent, and no screen
 * should ever read one. Stripping it here keeps the two clients' payloads
 * identical.
 *
 * @param {import('@flora/shared/src/types.js').ApiResponse<any>} response
 */
function adoptSession(response) {
  if (!response.ok) return response;
  const { token, ...rest } = response.data ?? {};
  if (token) setToken(token);
  return { ok: true, data: rest };
}

/**
 * A photoKey the server can serve later.
 *
 * Screens hand over whatever the picker gave them, which for a fresh photo is a
 * path on this device. Storing that would put an address in the database that
 * only one phone can open — the same mistake that used to leave escalated HELP
 * posts pictureless — so it is uploaded first and the key replaces it.
 *
 * @param {string|undefined} photoKey
 * @returns {Promise<{key: string|null, error?: undefined}
 *   | {error: import('@flora/shared/src/types.js').ApiResponse<never>}>}
 */
async function storedPhotoKey(photoKey) {
  if (!isLocalUri(photoKey)) return { key: photoKey ?? null };
  const uploaded = await liveClient.uploads.upload({ uri: photoKey });
  return uploaded.ok ? { key: uploaded.data.key } : { error: uploaded };
}

export const liveClient = {
  auth: {
    /** @param {{username: string, password: string}} input */
    async signup(input) {
      return adoptSession(await apiFetch('/auth/signup', { method: 'POST', body: input }));
    },

    /** @param {{username: string, password: string}} input */
    async login(input) {
      return adoptSession(await apiFetch('/auth/login', { method: 'POST', body: input }));
    },

    async logout() {
      const response = await apiFetch('/auth/logout', { method: 'POST' });
      // Clear locally even if the server call failed. The user asked to be
      // logged out; leaving a token behind because the network was down would
      // be the wrong side to err on.
      setToken(null);
      return response;
    },

    async me() {
      return apiFetch('/auth/me');
    },
  },

  me: {
    /** @param {{climateZone: string}} input */
    async update(input) {
      return apiFetch('/me', { method: 'PATCH', body: input });
    },
  },

  species: {
    async list() {
      return apiFetch('/species');
    },

    /** @param {string} query */
    async search(query) {
      // Sent even when blank: the API answers a blank search with VALIDATION,
      // which is the contract. Coerced because `?q=` with an absent value would
      // read as a browse.
      return apiFetch('/species', { query: { q: query ?? '' } });
    },

    /** @param {string} id */
    async get(id) {
      return apiFetch(`/species/${encodeURIComponent(id)}`);
    },
  },

  plants: {
    async list() {
      return apiFetch('/plants');
    },

    /** @param {string} id */
    async get(id) {
      return apiFetch(`/plants/${encodeURIComponent(id)}`);
    },

    /**
     * Add a plant, uploading its photo if it is still only on this device.
     *
     * @param {{nickname: string, speciesId?: string, photoKey?: string}} input
     */
    async create(input) {
      const photo = await storedPhotoKey(input?.photoKey);
      if (photo.error) return photo.error;
      return apiFetch('/plants', {
        method: 'POST',
        body: { ...input, ...(photo.key && { photoKey: photo.key }) },
      });
    },

    /** @param {string} plantId */
    async markWatered(plantId) {
      return apiFetch(`/plants/${encodeURIComponent(plantId)}/water`, { method: 'POST' });
    },

    logs: {
      /**
       * Append a growth log, uploading its photo the same way a new plant's is.
       *
       * @param {string} plantId
       * @param {{photoKey?: string, note?: string}} input
       */
      async create(plantId, input) {
        const photo = await storedPhotoKey(input?.photoKey);
        if (photo.error) return photo.error;
        return apiFetch(`/plants/${encodeURIComponent(plantId)}/logs`, {
          method: 'POST',
          body: { ...input, ...(photo.key && { photoKey: photo.key }) },
        });
      },
    },

    /**
     * @param {string} plantId
     * @param {{cursor?: string, limit?: number}} [options]
     */
    async timeline(plantId, options = {}) {
      return apiFetch(`/plants/${encodeURIComponent(plantId)}/timeline`, { query: options });
    },
  },

  schedules: {
    /** @param {string} plantId */
    async list(plantId) {
      return apiFetch(`/plants/${encodeURIComponent(plantId)}/schedules`);
    },

    /**
     * @param {string} plantId
     * @param {{type: string, intervalDays?: number}} input
     */
    async create(plantId, input) {
      return apiFetch(`/plants/${encodeURIComponent(plantId)}/schedules`, {
        method: 'POST',
        body: input,
      });
    },
  },

  uploads: {
    /**
     * Put one photo in storage and get back the key it lives under.
     *
     * Two calls: the API signs an upload URL for the exact size and type
     * declared here, and the bytes then go straight to that URL — S3 in a
     * deployed environment, the API's own /uploads route in local development.
     * Either way they do not travel as base64 through a JSON body.
     *
     * `url` comes back alongside the key because it is what a screen renders
     * while the rest of the flow catches up.
     *
     * @param {{base64?: string, uri?: string, contentType?: string}} source
     */
    async upload(source = {}) {
      let image;
      try {
        image = await readImage(source);
      } catch {
        return {
          ok: false,
          error: { code: 'VALIDATION', message: 'No image data to upload.' },
        };
      }

      const signed = await apiFetch('/uploads', {
        method: 'POST',
        body: { contentType: image.contentType, byteLength: image.byteLength },
      });
      if (!signed.ok) return signed;

      try {
        const response = await fetch(signed.data.uploadUrl, {
          method: signed.data.method,
          headers: signed.data.headers,
          body: image.body,
        });
        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: 'PROVIDER_ERROR',
              message: `The image upload was rejected (${response.status}).`,
            },
          };
        }
      } catch {
        return {
          ok: false,
          error: { code: 'INTERNAL', message: 'Could not upload the image. Check the connection.' },
        };
      }

      return { ok: true, data: { key: signed.data.key, url: signed.data.url } };
    },
  },

  diagnoses: {
    /**
     * Start a diagnosis.
     *
     * The photo goes to storage first and only its key is posted here. That is
     * what lets the result outlive the device that took it: a `file://` path
     * would be meaningless to everyone else, which used to leave an escalated
     * HELP post with no picture of the plant it was asking about.
     *
     * If the upload fails but the caller held base64, the scan still goes ahead
     * with the bytes inline — a lost photo is a worse answer, not no answer.
     *
     * @param {{imageBase64?: string, imageUri?: string, mode?: string, plantId?: string}} input
     */
    async create({ imageBase64, imageUri, mode, plantId } = {}) {
      if (!imageBase64 && !isLocalUri(imageUri)) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'No image data — the photo was captured without base64.',
          },
        };
      }

      const rest = { ...(mode && { mode }), ...(plantId && { plantId }) };
      const uploaded = await liveClient.uploads.upload({ base64: imageBase64, uri: imageUri });

      if (uploaded.ok) {
        return apiFetch('/diagnoses', {
          method: 'POST',
          body: { imageKey: uploaded.data.key, ...rest },
        });
      }
      if (!imageBase64) return uploaded;

      return apiFetch('/diagnoses', { method: 'POST', body: { imageBase64, ...rest } });
    },

    /** @param {string} id */
    async get(id) {
      return apiFetch(`/diagnoses/${encodeURIComponent(id)}`);
    },

    /**
     * @param {string} id
     * @param {string} plantId
     */
    async attach(id, plantId) {
      return apiFetch(`/diagnoses/${encodeURIComponent(id)}/plant`, {
        method: 'PUT',
        body: { plantId },
      });
    },

    /** @param {string} id */
    async escalate(id) {
      return apiFetch(`/diagnoses/${encodeURIComponent(id)}/escalate`, { method: 'POST' });
    },
  },

  feed: {
    /** @param {{cursor?: string, limit?: number}} [options] */
    async list(options = {}) {
      return apiFetch('/feed', { query: options });
    },
  },

  users: {
    /** @param {string} userId */
    async get(userId) {
      return apiFetch(`/users/${encodeURIComponent(userId)}`);
    },

    /** @param {string} userId */
    async posts(userId) {
      return apiFetch(`/users/${encodeURIComponent(userId)}/posts`);
    },
  },

  posts: {
    /**
     * Draft a post body from a diagnosis, a plant, or both.
     *
     * Plant details travel inline rather than as a plantId: the plants API does
     * not exist yet, and the client already holds everything the draft needs.
     * Nothing is created — the text comes back for the composer to prefill.
     * @param {{diagnosis?: object|null, plant?: object|null}} input
     */
    async draft(input = {}) {
      return apiFetch('/drafts/post', { method: 'POST', body: input });
    },

    /** @param {{type?: string}} [filter] */
    async list(filter = {}) {
      return apiFetch('/posts', { query: filter });
    },

    /** @param {string} id */
    async get(id) {
      return apiFetch(`/posts/${encodeURIComponent(id)}`);
    },

    /**
     * Publish a post, uploading any photo that is still only on this device.
     *
     * The composer hands over picker URIs (`file://…`). Posting those verbatim
     * would publish an address only the author's phone can open, so each one is
     * uploaded first and the post carries the key instead. Anything already
     * addressable — a bundled demo asset, an image uploaded earlier — is left
     * exactly as it came in.
     *
     * @param {{body?: string, images?: string[]}} input
     */
    async create(input) {
      const images = [];
      for (const image of input?.images ?? []) {
        if (!isLocalUri(image)) {
          images.push(image);
          continue;
        }
        const uploaded = await liveClient.uploads.upload({ uri: image });
        if (!uploaded.ok) return uploaded;
        images.push(uploaded.data.key);
      }

      return apiFetch('/posts', {
        method: 'POST',
        body: { ...input, ...(images.length > 0 && { images }) },
      });
    },

    /**
     * @param {string} postId
     * @param {{cursor?: string, limit?: number}} [options]
     */
    async comments(postId, options = {}) {
      return apiFetch(`/posts/${encodeURIComponent(postId)}/comments`, { query: options });
    },

    /**
     * @param {string} postId
     * @param {string} body
     */
    async comment(postId, body) {
      return apiFetch(`/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        body: { body },
      });
    },

    /** @param {string} id */
    async like(id) {
      return apiFetch(`/posts/${encodeURIComponent(id)}/like`, { method: 'PUT' });
    },

    /** @param {string} id */
    async unlike(id) {
      return apiFetch(`/posts/${encodeURIComponent(id)}/like`, { method: 'DELETE' });
    },
  },

  social: {
    /** @param {string} userId */
    async follow(userId) {
      return apiFetch(`/users/${encodeURIComponent(userId)}/follow`, { method: 'PUT' });
    },

    /** @param {string} userId */
    async unfollow(userId) {
      return apiFetch(`/users/${encodeURIComponent(userId)}/follow`, { method: 'DELETE' });
    },
  },

  devices: {
    /** @param {{pushToken: string, platform: 'android'|'ios'}} input */
    async register(input) {
      return apiFetch('/devices', { method: 'POST', body: input });
    },
  },
};
