import { Pressable, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { WaterChip } from './WaterChip.js';
import { WaterRing } from './WaterRing.js';
import { imageForKey } from '../utils/images.js';
import { needsWaterToday, waterProgress } from '../utils/watering.js';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/** Generic leafy blurhash shown while a plant photo loads. */
const BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

/** Outer diameter of the ring; the photo sits inside it. */
const RING_SIZE = 116;
const PHOTO_SIZE = RING_SIZE - 14;

/**
 * Grid card per design 1a: photo, nickname, species common name, watering pill.
 *
 * The photo wears its watering ring, so the grid reads at a glance — a nearly
 * full terracotta arc means that plant wants water now. The chip underneath
 * still carries the exact wording; the ring is the ambient version of it.
 */
export function PlantCard({ plant, speciesName, onPress }) {
  const due = needsWaterToday(plant.nextDueAt);

  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      accessibilityRole="button"
      accessibilityLabel={plant.nickname}
      onPress={onPress}
      style={styles.card}
    >
      <WaterRing
        progress={waterProgress(plant.lastWateredAt, plant.nextDueAt)}
        due={due}
        size={RING_SIZE}
        testID={`plant-ring-${plant.id}`}
      >
        <Image
          // A bundled demo photo in mock mode; a storage URL from the live API.
          source={imageForKey(plant.photoKey) ?? (plant.photoKey ? { uri: plant.photoKey } : null)}
          placeholder={{ blurhash: BLURHASH }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
        />
      </WaterRing>
      <Text style={styles.nickname}>{plant.nickname}</Text>
      {speciesName ? <Text style={styles.species}>{speciesName}</Text> : null}
      <WaterChip nextDueAt={plant.nextDueAt} testID={`plant-chip-${plant.id}`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderColor: colors.hairline,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  photo: {
    borderRadius: radii.pill,
    height: PHOTO_SIZE,
    width: PHOTO_SIZE,
  },
  nickname: {
    color: colors.ink,
    fontFamily: fonts.displaySemi,
    fontSize: typeScale.body,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  species: {
    color: colors.mutedText,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    textAlign: 'center',
  },
  // chip gets a hair of breathing room inside the card
});
