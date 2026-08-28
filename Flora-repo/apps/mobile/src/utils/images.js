import plant1 from '../../assets/demo/plant-1.jpg';
import plant2 from '../../assets/demo/plant-2.jpg';
import plant3 from '../../assets/demo/plant-3.jpg';
import plant4 from '../../assets/demo/plant-4.jpg';
import plant5 from '../../assets/demo/plant-5.jpg';
import plant6 from '../../assets/demo/plant-6.jpg';
import sp1 from '../../assets/species/sp1.jpg';
import sp2 from '../../assets/species/sp2.jpg';
import sp3 from '../../assets/species/sp3.jpg';
import sp4 from '../../assets/species/sp4.jpg';
import sp5 from '../../assets/species/sp5.jpg';
import sp6 from '../../assets/species/sp6.jpg';
import sp7 from '../../assets/species/sp7.jpg';
import sp8 from '../../assets/species/sp8.jpg';
import sp9 from '../../assets/species/sp9.jpg';
import sp10 from '../../assets/species/sp10.jpg';

/** Bundled demo photos keyed by the photoKey strings used in the mock data. */
export const demoImages = {
  'assets/demo/plant-1.jpg': plant1,
  'assets/demo/plant-2.jpg': plant2,
  'assets/demo/plant-3.jpg': plant3,
  'assets/demo/plant-4.jpg': plant4,
  'assets/demo/plant-5.jpg': plant5,
  'assets/demo/plant-6.jpg': plant6,
};

/** Bundled catalog photos keyed by species id (see assets/species/SOURCES.md). */
export const speciesImages = {
  sp1,
  sp2,
  sp3,
  sp4,
  sp5,
  sp6,
  sp7,
  sp8,
  sp9,
  sp10,
};

/**
 * Resolve a mock photoKey to a bundled asset (null when unknown).
 * @param {string|null} photoKey
 */
export function imageForKey(photoKey) {
  return (photoKey && demoImages[photoKey]) || null;
}

/**
 * Resolve a species id to its bundled catalog photo (null when unknown).
 * @param {string|null} speciesId
 */
export function imageForSpecies(speciesId) {
  return (speciesId && speciesImages[speciesId]) || null;
}
