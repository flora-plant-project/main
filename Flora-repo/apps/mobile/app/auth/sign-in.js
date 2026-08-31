import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SignupSchema } from '@flora/shared';
import { Screen } from '../../src/components/Screen.js';
import { Card } from '../../src/components/Card.js';
import { Button } from '../../src/components/Button.js';
import { Field } from '../../src/components/Field.js';
import { useAuthStore } from '../../src/store/authStore.js';
import { fieldErrors } from '../../src/utils/forms.js';
import { colors, fonts, spacing, typeScale } from '../../src/theme.js';

export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const busy = useAuthStore((state) => state.busy);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const submit = async () => {
    setFormError(null);
    const parsed = SignupSchema.safeParse({ username, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    const res = await signIn(parsed.data);
    if (res.ok) router.replace('/auth/zone');
    else setFormError(res.error.message);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('auth.signInTitle')}</Text>
      <Card>
        <Field
          testID="auth-username"
          label={t('auth.username')}
          value={username}
          onChangeText={setUsername}
          error={errors.username}
        />
        <Field
          testID="auth-password"
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={errors.password}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button testID="auth-submit" label={t('auth.signIn')} onPress={submit} disabled={busy} />
        <Button
          testID="auth-go-sign-up"
          variant="ghost"
          label={t('auth.noAccount')}
          onPress={() => router.push('/auth/sign-up')}
          style={styles.switchButton}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.display,
    marginBottom: spacing.xl,
    marginTop: spacing.xxl,
  },
  formError: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: typeScale.caption,
    marginBottom: spacing.md,
  },
  switchButton: {
    marginTop: spacing.sm,
  },
});
