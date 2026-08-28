import { renderRouter, screen } from 'expo-router/testing-library';
import { fireEvent, waitFor } from '@testing-library/react-native';

describe('app shell', () => {
  it('renders the tab bar: Garden · Explore · [camera] · Community · Profile', async () => {
    await renderRouter('./app', { initialUrl: '/' });
    expect(await screen.findByText('Garden')).toBeTruthy();
    expect(screen.getByText('Explore')).toBeTruthy();
    expect(screen.getByText('Community')).toBeTruthy();
    expect(screen.getByText('Profile')).toBeTruthy();
    expect(screen.getByTestId('camera-tab-button')).toBeTruthy();
  });

  it('opens the /camera modal from the raised center button', async () => {
    // Keep the renderRouter return value intact: awaiting it directly would
    // unwrap the promise-like render result and lose the router helpers
    // (getPathname etc.) that toHavePathname needs.
    const app = renderRouter('./app', { initialUrl: '/' });
    await app;
    fireEvent.press(await screen.findByTestId('camera-tab-button'));
    await waitFor(() => expect(screen.getByTestId('diagnose-capture')).toBeTruthy());
    expect(app).toHavePathname('/camera');
  });
});
