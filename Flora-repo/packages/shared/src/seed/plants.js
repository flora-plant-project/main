/** Demo plants for the default flora_demo user, photos bundled in assets/demo/. */
export const seedPlants = [
  {
    id: 'p1',
    ownerId: 'u1',
    nickname: 'Basil Buddy',
    speciesId: 'sp1',
    photoKey: 'assets/demo/plant-1.jpg',
    createdAt: '2026-06-20T10:00:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
  {
    id: 'p2',
    ownerId: 'u1',
    nickname: 'Tommy',
    speciesId: 'sp2',
    photoKey: 'assets/demo/plant-2.jpg',
    createdAt: '2026-06-25T08:30:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
  {
    id: 'p3',
    ownerId: 'u1',
    nickname: 'Minty',
    speciesId: 'sp3',
    photoKey: 'assets/demo/plant-3.jpg',
    createdAt: '2026-07-02T16:45:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
  {
    id: 'p4',
    ownerId: 'u1',
    nickname: 'Monstie',
    speciesId: 'sp7',
    photoKey: 'assets/demo/plant-4.jpg',
    createdAt: '2026-07-10T12:00:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
  {
    id: 'p5',
    ownerId: 'u1',
    nickname: 'Spike',
    speciesId: 'sp8',
    photoKey: 'assets/demo/plant-5.jpg',
    createdAt: '2026-07-18T09:15:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
  {
    id: 'p6',
    ownerId: 'u1',
    nickname: 'Fig of the Fam',
    speciesId: 'sp5',
    photoKey: 'assets/demo/plant-6.jpg',
    createdAt: '2026-07-28T14:20:00.000Z',
    lastWateredAt: null,
    nextDueAt: null,
  },
];

/** Growth-log entries so the timeline has content out of the box. */
export const seedGrowthLogs = [
  {
    id: 'gl1',
    plantId: 'p1',
    photoKey: 'assets/demo/plant-1.jpg',
    note: 'First new leaf!',
    createdAt: '2026-07-25T09:00:00.000Z',
  },
  {
    id: 'gl2',
    plantId: 'p1',
    photoKey: null,
    note: 'Moved to a sunnier corner of the balcony.',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    id: 'gl3',
    plantId: 'p2',
    photoKey: 'assets/demo/plant-2.jpg',
    note: 'Flowers forming on the second truss.',
    createdAt: '2026-07-30T08:00:00.000Z',
  },
];

/** A few pre-configured care schedules. */
export const seedSchedules = [
  {
    id: 'sch1',
    plantId: 'p1',
    type: 'WATER',
    intervalDays: 2,
    createdAt: '2026-06-20T10:05:00.000Z',
  },
  {
    id: 'sch2',
    plantId: 'p2',
    type: 'FERTILIZE',
    intervalDays: 14,
    createdAt: '2026-06-25T08:35:00.000Z',
  },
  {
    id: 'sch3',
    plantId: 'p4',
    type: 'SEASONAL',
    intervalDays: null,
    createdAt: '2026-07-10T12:05:00.000Z',
  },
];
