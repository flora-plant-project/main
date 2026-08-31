import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme.js';

/**
 * Empty-state illustration tile (design 3b): three leaves over a pot
 * silhouette in a 132px rounded tile. Placeholder for real brand artwork —
 * keep the tile footprint, radius and tint when it lands.
 */
export function EmptyGardenArt() {
  return (
    <View testID="empty-garden-art" style={styles.tile}>
      <View style={styles.leaves}>
        <Ionicons name="leaf" size={38} color={colors.greenMid} style={styles.leafLeft} />
        <Ionicons name="leaf" size={52} color={colors.primary} style={styles.leafCenter} />
        <Ionicons name="leaf" size={38} color={colors.greenLight} style={styles.leafRight} />
      </View>
      <View style={styles.pot} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    backgroundColor: colors.greenTintSoft,
    borderRadius: radii.tile,
    height: 132,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 132,
  },
  leaves: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    height: 60,
    justifyContent: 'center',
  },
  leafLeft: {
    marginRight: -14,
    transform: [{ rotate: '250deg' }],
  },
  leafCenter: {
    transform: [{ rotate: '-45deg' }],
    zIndex: 1,
  },
  leafRight: {
    marginLeft: -14,
    transform: [{ rotate: '-70deg' }],
  },
  pot: {
    backgroundColor: colors.potSilhouette,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    height: 18,
    marginTop: 4,
    width: 54,
  },
});
