/**
 * Row -> wire shape.
 *
 * Every view here is written out property by property rather than spread. Two
 * reasons: a spread would ship whatever a later migration adds (User.passwordHash
 * is the cautionary one), and the mock client returns these exact shapes — the
 * contract suite runs against both, so an extra field is a real difference.
 *
 * Dates go out as ISO strings. JSON.stringify would do that anyway over HTTP,
 * but being explicit means the service's own tests see the same values the
 * client does.
 */

/**
 * @param {Date|string|null|undefined} value
 * @returns {string|null}
 */
export const iso = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Default image mapper: rows that hold a bundled demo path are already on the
 * wire shape. Views take one so services can pass the storage-backed mapper
 * (src/lib/media.js) without every unit test having to know about storage.
 */
const passthrough = (value) => value ?? null;

/**
 * @param {{id: string, username: string, displayName: string, climateZone: string}} user
 */
export const authorView = ({ id, username, displayName, climateZone }) => ({
  id,
  username,
  displayName,
  climateZone,
});

/**
 * @param {object} plant
 * @param {(value: string|null) => string|null} [mapImage]
 */
export const plantView = (plant, mapImage = passthrough) => ({
  id: plant.id,
  ownerId: plant.ownerId,
  nickname: plant.nickname,
  speciesId: plant.speciesId,
  photoKey: mapImage(plant.photoKey),
  createdAt: iso(plant.createdAt),
  lastWateredAt: iso(plant.lastWateredAt),
  nextDueAt: iso(plant.nextDueAt),
});

/** @param {object} schedule */
export const scheduleView = (schedule) => ({
  id: schedule.id,
  plantId: schedule.plantId,
  type: schedule.type,
  intervalDays: schedule.intervalDays,
  createdAt: iso(schedule.createdAt),
});

/**
 * @param {object} log
 * @param {(value: string|null) => string|null} [mapImage]
 */
export const growthLogView = (log, mapImage = passthrough) => ({
  id: log.id,
  plantId: log.plantId,
  photoKey: mapImage(log.photoKey),
  note: log.note,
  createdAt: iso(log.createdAt),
});

/** @param {object} comment */
export const commentView = (comment) => ({
  id: comment.id,
  postId: comment.postId,
  authorId: comment.authorId,
  body: comment.body,
  createdAt: iso(comment.createdAt),
  ...(comment.author ? { author: authorView(comment.author) } : {}),
});

/**
 * @param {object} post row with `author`, `_count.likes`, `_count.comments`
 * @param {{id: string}|null} viewer decides `likedByMe`
 * @param {(value: string|null) => string|null} [mapImage]
 */
export const postView = (post, viewer, mapImage = passthrough) => ({
  id: post.id,
  authorId: post.authorId,
  type: post.type,
  body: post.body,
  images: (post.images ?? []).map(mapImage),
  attachment: post.attachment
    ? { ...post.attachment, imageUri: mapImage(post.attachment.imageUri) }
    : null,
  status: post.status,
  createdAt: iso(post.createdAt),
  author: authorView(post.author),
  likeCount: post._count?.likes ?? 0,
  commentCount: post._count?.comments ?? 0,
  // `likes` is selected pre-filtered to the viewer, so a non-empty array means
  // they liked it. Avoids a second query per post.
  likedByMe: viewer ? (post.likes?.length ?? 0) > 0 : false,
});

/**
 * @param {object} diagnosis
 * @param {(value: string|null) => string|null} [mapImage]
 */
export const diagnosisView = (diagnosis, mapImage = passthrough) => ({
  id: diagnosis.id,
  plantId: diagnosis.plantId,
  imageUri: mapImage(diagnosis.imageKey),
  status: diagnosis.status,
  result: diagnosis.result ?? null,
  lowConfidence: diagnosis.lowConfidence ?? null,
  error: diagnosis.error ?? null,
});
