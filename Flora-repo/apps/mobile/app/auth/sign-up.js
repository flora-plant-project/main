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

export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);
  const busy = useAuthStore((state) => state.busy);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const displayFont = i18n.language === 'ar' ? fonts.displayArabic : fonts.display;

  const submit = async () => {
    setFormError(null);
    const parsed = SignupSchema.safeParse({ username, password });
    const nextErrors = parsed.success ? {} : fieldErrors(parsed.error);
    if (confirm !== password) nextErrors.confirm = t('auth.passwordsMismatch');
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    const res = await signUp(parsed.data);
    if (res.ok) router.replace('/auth/zone');
    else setFormError(res.error.message);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Text style={[styles.title, { fontFamily: displayFont }]}>{t('auth.signUpTitle')}</Text>
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
        <Field
          testID="auth-confirm"
          label={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={errors.confirm}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        <Button testID="auth-submit" label={t('auth.signUp')} onPress={submit} disabled={busy} />
        <Button
          testID="auth-go-sign-in"
          variant="ghost"
          label={t('auth.haveAccount')}
          onPress={() => router.replace('/auth/sign-in')}
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
