import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radii, typeScale } from '../theme.js';

/**
 * "Today" task card (design 3a): a header with a live counter and tappable
 * task rows that check off in place.
 * @param {{ tasks: {id: string, title: string, subtitle?: string, meta?: string,
 *          done: boolean}[], onToggle: (id: string) => void }} props
 */
export function TodayCard({ tasks, onToggle }) {
  const { t } = useTranslation();
  const left = tasks.filter((task) => !task.done).length;

  return (
    <View testID="today-card" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('garden.today')}</Text>
        <Text testID="today-counter" style={styles.headerCounter}>
          {left === 0 ? t('garden.allDone') : t('garden.tasksLeft', { count: left })}
        </Text>
      </View>
      {tasks.map((task, index) => (
        <Pressable
          key={task.id}
          testID={`task-${task.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.done }}
          accessibilityLabel={task.title}
          onPress={() => onToggle(task.id)}
          style={[styles.row, index < tasks.length - 1 && styles.rowDivider]}
        >
          <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
            {task.done ? <Ionicons name="checkmark" size={12} color={colors.onPrimary} /> : null}
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, task.done && styles.rowTitleDone]} numberOfLines={1}>
              {task.title}
            </Text>
            {task.subtitle ? (
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {task.subtitle}
              </Text>
            ) : null}
          </View>
          {task.meta ? <Text style={styles.rowMeta}>{task.meta}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingBottom: 6,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  headerTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: typeScale.caption,
  },
  headerCounter: {
    color: colors.sage,
    fontFamily: fonts.bodySemi,
    fontSize: typeScale.meta,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    paddingVertical: 11,
  },
  rowDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.checkbox,
    borderRadius: radii.pill,
    borderWidth: 1.6,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.label,
  },
  rowTitleDone: {
    color: colors.sage,
    textDecorationLine: 'line-through',
  },
  rowSubtitle: {
    color: colors.sage,
    fontFamily: fonts.body,
    fontSize: typeScale.meta,
  },
  rowMeta: {
    color: colors.sage,
    fontFamily: fonts.bodyBold,
    fontSize: typeScale.micro,
  },
});
