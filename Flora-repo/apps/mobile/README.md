# Flora mobile

Expo app (JavaScript, expo-router). Runs entirely on the **mock client** by default —
real API client (a later phase).

## Expo Go quickstart

The fastest path for a demo on a physical phone:

```bash
pnpm i
pnpm -F mobile start
```

1. Install **Expo Go** from the App Store / Play Store on the phone.
2. Put the phone and laptop on the same Wi-Fi.
3. Scan the QR code from the terminal — iPhone: system Camera app; Android: the
   scanner inside Expo Go.
4. If the venue's Wi-Fi blocks device-to-device traffic, restart with a tunnel:
   `pnpm -F mobile start -- --tunnel`.

Demo login: the app starts signed in as `flora_demo`; if you sign out, use
`flora_demo` / `password123`.

## EAS dev build (fallback)

Prefer a development build over Expo Go when:

- you want to demo **watering reminders on Android** — local notifications do not
  fire inside Expo Go on Android;
- Expo Go's installed SDK doesn't match this app's SDK;
- anything else native creeps in that Expo Go's runtime doesn't ship.

```bash
npm i -g eas-cli        # once
eas login               # once
eas build --profile development --platform android   # or ios
```

The `development` profile in `eas.json` produces an internally distributed dev
client. When the build finishes, expo.dev shows an **install QR/link**. After
installing, run `pnpm -F mobile start` and open the project from the dev client.

## Installing on the mentor's phone

- **Expo Go path**: they install Expo Go, then scan your terminal QR (same
  Wi-Fi or `--tunnel`). Nothing else to set up.
- **Dev-build path**: send them the install link from the EAS build page (or let
  them scan its QR). Android installs the APK directly (allow "install unknown
  apps"). iOS internal distribution requires their device UDID to be registered
  on the Apple ad-hoc profile **before** the build — collect it a day early.

## Resetting demo data

The mock store persists to AsyncStorage **on the device** (key `flora-mock-v1`),
so it can only be cleared there: **Profile tab → "DEV · Reset demo data"**
(visible in mock mode only). That restores the seed garden, feed and session.

`pnpm demo:reset` at the repo root prints this reminder, plus how to clear
Metro's cache for a clean laptop start.

## Offline

Mock mode touches no network at all — the whole demo works in airplane mode
(worth saying out loud while demoing).
