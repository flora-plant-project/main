/**
 * demo:reset — the mock data lives in AsyncStorage ON THE DEVICE, so a laptop
 * script cannot clear it. The reliable reset is the in-app dev action; this
 * script documents that path so it is one command away during demo prep.
 */
console.log(`
Flora demo reset
================
Demo data (plants, posts, session) is persisted in AsyncStorage on the phone
itself (key 'flora-mock-v1'), so it can only be cleared on the device:

  1. Open Flora on the demo phone (mock mode).
  2. Go to the Profile tab.
  3. Tap "DEV · Reset demo data".

That wipes 'flora-mock-v1' and restores the seed garden, community feed and
session (flora_demo / password123).

Fresh start on the laptop too? Clear Metro's cache with:

  pnpm -F mobile exec expo start --clear
`);
