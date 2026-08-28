/**
 * Demo dataset, shared by the mobile mock client and the API's Prisma seed.
 *
 * Both must serve byte-identical data: client.contract.test.js is one suite run
 * against both clients and asserts exact ids (sp1–sp10, u1–u3, p1–p6, post1–post12)
 * and counts. A drift here shows up as a contract failure, which is the point.
 */

export { seedUsers, seedSession } from './users.js';
export { seedSpecies } from './species.js';
export { seedPlants, seedGrowthLogs, seedSchedules } from './plants.js';
export { seedPosts, seedComments, seedLikes, seedFollows } from './posts.js';
export { diagnosisFixtures, fixtureNames, seedDiagnoses } from './diagnoses.js';
