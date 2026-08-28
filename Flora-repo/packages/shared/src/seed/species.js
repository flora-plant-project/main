/**
 * Species catalog. zoneMultipliers scale the base watering interval per Lebanese
 * climate zone: cool mountain air stretches the interval (>1), the hot dry Bekaa
 * shortens it (<1).
 */
export const seedSpecies = [
  {
    id: 'sp1',
    scientificName: 'Ocimum basilicum',
    commonNames: ['Basil', 'حبق'],
    care: { waterEveryDays: 2, sun: 'full sun', tempC: { min: 15, max: 30 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.4, BEKAA: 0.8, SOUTH: 0.9 },
  },
  {
    id: 'sp2',
    scientificName: 'Solanum lycopersicum',
    commonNames: ['Tomato', 'بندورة'],
    care: { waterEveryDays: 3, sun: 'full sun', tempC: { min: 15, max: 32 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.7, SOUTH: 0.85 },
  },
  {
    id: 'sp3',
    scientificName: 'Mentha spicata',
    commonNames: ['Mint', 'نعنع'],
    care: { waterEveryDays: 2, sun: 'partial shade', tempC: { min: 10, max: 28 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.3, BEKAA: 0.8, SOUTH: 0.9 },
  },
  {
    id: 'sp4',
    scientificName: 'Olea europaea',
    commonNames: ['Olive', 'زيتون'],
    care: { waterEveryDays: 14, sun: 'full sun', tempC: { min: 5, max: 38 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.2, BEKAA: 0.9, SOUTH: 0.95 },
  },
  {
    id: 'sp5',
    scientificName: 'Ficus carica',
    commonNames: ['Fig', 'تين'],
    care: { waterEveryDays: 7, sun: 'full sun', tempC: { min: 8, max: 35 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.25, BEKAA: 0.85, SOUTH: 0.9 },
  },
  {
    id: 'sp6',
    scientificName: 'Lavandula angustifolia',
    commonNames: ['Lavender', 'خزامى'],
    care: { waterEveryDays: 10, sun: 'full sun', tempC: { min: 5, max: 32 } },
    zoneMultipliers: { COASTAL: 0.9, MOUNTAIN: 1.3, BEKAA: 1, SOUTH: 0.95 },
  },
  {
    id: 'sp7',
    scientificName: 'Monstera deliciosa',
    commonNames: ['Swiss cheese plant', 'مونستيرا'],
    care: { waterEveryDays: 7, sun: 'bright indirect', tempC: { min: 16, max: 30 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.2, BEKAA: 0.9, SOUTH: 0.95 },
  },
  {
    id: 'sp8',
    scientificName: 'Aloe vera',
    commonNames: ['Aloe', 'صبار'],
    care: { waterEveryDays: 21, sun: 'full sun', tempC: { min: 10, max: 40 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.2, BEKAA: 0.8, SOUTH: 0.9 },
  },
  {
    id: 'sp9',
    scientificName: 'Salvia rosmarinus',
    commonNames: ['Rosemary', 'إكليل الجبل'],
    care: { waterEveryDays: 8, sun: 'full sun', tempC: { min: 5, max: 35 } },
    zoneMultipliers: { COASTAL: 0.95, MOUNTAIN: 1.25, BEKAA: 0.9, SOUTH: 0.9 },
  },
  {
    id: 'sp10',
    scientificName: 'Jasminum sambac',
    commonNames: ['Jasmine', 'ياسمين'],
    care: { waterEveryDays: 4, sun: 'partial sun', tempC: { min: 13, max: 32 } },
    zoneMultipliers: { COASTAL: 1, MOUNTAIN: 1.35, BEKAA: 0.8, SOUTH: 0.9 },
  },
];
