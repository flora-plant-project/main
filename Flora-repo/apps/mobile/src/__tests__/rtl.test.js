import { renderRouter, screen } from 'expo-router/testing-library';
import { I18nManager } from 'react-native';
import i18n, { setLocale } from '../i18n/index.js';

afterEach(async () => {
  await setLocale('en');
});

it('ar locale flips RTL and renders a translated string', async () => {
  const forceRTL = jest.spyOn(I18nManager, 'forceRTL');
  await setLocale('ar');
  expect(forceRTL).toHaveBeenCalledWith(true);
  await renderRouter('./app', { initialUrl: '/' });
  const arabicTab = i18n.t('tabs.garden');
  expect(arabicTab).not.toBe('Garden');
  expect(await screen.findByText(arabicTab)).toBeTruthy();
});
