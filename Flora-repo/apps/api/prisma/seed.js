/**
 * Seed the database with the shared demo dataset.
 *
 * The data comes from @flora/shared/seed — the same constants the mobile mock
 * client loads — so both clients answer client.contract.test.js identically.
 * That suite asserts exact ids and counts, which is what turns a drift between
 * the two into a test failure instead of a demo-day surprise.
 *
 * Destructive and idempotent: every run truncates the demo tables and rewrites
 * them, so a reseed is a reset. Safe because nothing here is user data.
 */
import { PrismaClient } from '@prisma/client';
import {
  seedComments,
  seedDiagnoses,
  seedFollows,
  seedGrowthLogs,
  seedLikes,
  seedPlants,
  seedPosts,
  seedSchedules,
  seedSpecies,
  seedUsers,
} from '@flora/shared';
import { hashPassword } from '../src/lib/password.js';

const prisma = new PrismaClient();

/** Wipe in FK-dependency order — children before the rows they point at. */
async function clear() {
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.device.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.growthLog.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.plant.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.species.deleteMany();
}

async function main() {
  await clear();

  // Hashed in parallel: scrypt is deliberately slow, and doing three in
  // sequence is the slowest step in the whole seed.
  const users = await Promise.all(
    seedUsers.map(async (user) => ({
      id: user.id,
      username: user.username,
      passwordHash: await hashPassword(user.password),
      displayName: user.displayName,
      climateZone: user.climateZone,
    })),
  );
  await prisma.user.createMany({ data: users });

  await prisma.species.createMany({
    data: seedSpecies.map((species, index) => ({
      id: species.id,
      sortOrder: index,
      scientificName: species.scientificName,
      commonNames: species.commonNames,
      care: species.care,
      zoneMultipliers: species.zoneMultipliers,
    })),
  });

  await prisma.plant.createMany({
    data: seedPlants.map((plant) => ({
      id: plant.id,
      ownerId: plant.ownerId,
      nickname: plant.nickname,
      speciesId: plant.speciesId,
      photoKey: plant.photoKey,
      lastWateredAt: plant.lastWateredAt,
      nextDueAt: plant.nextDueAt,
      createdAt: new Date(plant.createdAt),
    })),
  });

  await prisma.schedule.createMany({
    data: seedSchedules.map((schedule) => ({
      id: schedule.id,
      plantId: schedule.plantId,
      type: schedule.type,
      intervalDays: schedule.intervalDays,
      createdAt: new Date(schedule.createdAt),
    })),
  });

  await prisma.growthLog.createMany({
    data: seedGrowthLogs.map((log) => ({
      id: log.id,
      plantId: log.plantId,
      photoKey: log.photoKey,
      note: log.note,
      createdAt: new Date(log.createdAt),
    })),
  });

  await prisma.diagnosis.createMany({
    // createdAt is an epoch millisecond number in the seed, because the mock
    // compares it against Date.now() to fake an async job.
    data: seedDiagnoses.map((diagnosis) => ({
      id: diagnosis.id,
      userId: diagnosis.userId,
      plantId: diagnosis.plantId,
      imageKey: diagnosis.imageUri,
      mode: diagnosis.mode,
      status: diagnosis.status,
      result: diagnosis.result,
      lowConfidence: diagnosis.lowConfidence,
      createdAt: new Date(diagnosis.createdAt),
      completedAt: new Date(diagnosis.createdAt),
    })),
  });

  await prisma.post.createMany({
    data: seedPosts.map((post) => ({
      id: post.id,
      authorId: post.authorId,
      type: post.type,
      body: post.body,
      images: post.images,
      attachment: post.attachment ?? undefined,
      status: post.status ?? 'PUBLISHED',
      createdAt: new Date(post.createdAt),
    })),
  });

  await prisma.comment.createMany({
    data: seedComments.map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorId,
      body: comment.body,
      createdAt: new Date(comment.createdAt),
    })),
  });

  await prisma.like.createMany({ data: seedLikes });
  await prisma.follow.createMany({ data: seedFollows });

  console.log(
    `[seed] ${users.length} users, ${seedSpecies.length} species, ${seedPlants.length} plants, ` +
      `${seedPosts.length} posts, ${seedComments.length} comments, ${seedDiagnoses.length} diagnoses`,
  );
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
