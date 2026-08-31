import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { WaterChip } from './WaterChip.js';
import { imageForKey } from '../utils/images.js';
import { colors, fonts, radii, spacing, typeScale } from '../theme.js';

/** Generic leafy blurhash shown while a plant photo loads. */
const BLURHASH = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4';

/**
 * Grid card per design 3a: photo flush to the card's top edge, nickname,
 * species common name, status chip.
 */
export function PlantCard({ plant, speciesName, onPress }) {
  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      accessibilityRole="button"
      accessibilityLabel={plant.nickname}
      onPress={onPress}
      style={styles.card}
    >
      <Image
        // A bundled demo photo in mock mode; a storage URL from the live API.
        source={imageForKey(plant.photoKey) ?? (plant.photoKey ? { uri: plant.photoKey } : null)}
        placeholder={{ blurhash: BLURHASH }}
        style={styles.photo}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.body}>
        <Text style={styles.nickname} numberOfLines={1}>
          {plant.nickname}
        </Text>
        {speciesName ? (
          <Text style={styles.species} numberOfLines={1}>
            {speciesName}
          </Text>
        ) : null}
        <View style={styles.chipWrap}>
          <WaterChip nextDueAt={plant.nextDueAt} testID={`plant-chip-${plant.id}`} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flex: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  photo: {
    backgroundColor: colors.chipFill,
    height: 104,
    width: '100%',
  },
  body: {
    paddingBottom: 11,
    paddingHorizontal: 10,
    paddingTop: 9,
  },
  nickname: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.body,
  },
  species: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.micro,
    marginTop: 1,
  },
  chipWrap: {
    marginTop: spacing.sm,
  },
});
