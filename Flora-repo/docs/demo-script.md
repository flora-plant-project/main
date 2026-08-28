# Flora — M1 mentor demo script

> Note: the task referenced "the 6-step script from the plan verbatim", but no plan
> document with that script exists in this repo (same as the earlier F0 paste gap).
> The six steps below were written against the implemented flows — replace any
> wording here if the original script surfaces.

## Pre-flight checklist

- [ ] Demo phone **charged** (and a charged backup device).
- [ ] **Notifications permission pre-granted on the backup device** — open it once,
      set a watering schedule, accept the prompt.
- [ ] App installed: Expo Go (or the EAS dev build on Android — reminders don't fire
      in Expo Go there). See `apps/mobile/README.md`.
- [ ] Fresh data: Profile tab → **DEV · Reset demo data** (`pnpm demo:reset` prints
      this path). Do it the evening before AND right before going on.
- [ ] Metro running (`pnpm -F mobile start`), QR tested from the actual demo phone.
- [ ] **Airplane-mode note**: mock mode works fully offline — actually flip airplane
      mode on during the demo and _say so out loud_. It's the safest wow moment in
      the room and immunizes the demo against venue Wi-Fi.
- [ ] DEV fixture chip on the camera screen cycles the canned results — remember the
      order: healthy-basil → diseased-tomato → blurry.

## The 6 steps

**1 · Onboarding (60s).** Sign out from Profile, then sign up fresh
(`mentor_demo` / any 8+ char password). Pick the **Bekaa** climate-zone card —
mention that every watering interval in the app is adjusted by this zone.

**2 · Virtual garden (60s).** The dashboard: six seeded plants, watering chips
("Water now" in terracotta, "Today", "in Nd"), the "N plants need water today"
greeting line. Pull to refresh. Arabic moment: Profile → العربية — the whole app
flips RTL with Arabic plant names (switch back).

**3 · Add a plant by photo (90s).** Garden FAB → **By photo** → pick a plant photo
from the gallery. Set the DEV chip to _healthy-basil_ first so the suggestion is
clean. Progress copy → suggestions → confirm step: nickname, care preview,
"Set watering schedule automatically" ON → save. The new card appears in the
garden and a local reminder is now scheduled at its next due date.

**4 · Plant detail (60s).** Open Basil Buddy: care row (point at the water card —
"that number is Bekaa-adjusted"), tap **Watered today ✓** — the chip flips
optimistically. Nudge the interval stepper. Scroll the timeline (logs + the seeded
diagnosis on the tomato), add a quick "+ Log" note.

**5 · Diagnose (90s).** Center camera button → **Diagnose** mode. DEV chip →
_diseased-tomato_. Snap/pick a photo → rotating progress copy → result card:
amber "Needs a little care", probability bars, numbered treatment plan, the
zone-adjusted watering line. Tap **Ask the community** — Flora turns the diagnosis
into a HELP post.

**6 · Community + reminders finale (90s).** Community tab: the HELP post sits on
top with its diagnosis context card (photo, top issue, confidence bar). Like a
post (heart fills instantly), open it, drop a comment. Composer: attach the
DEV-flagged image → the "Being reviewed — only you can see this" banner shows the
moderation story. Close: Profile → Watering reminders → **DEV · Remind me in
2 minutes** — keep talking; the local notification interrupts you on cue; tap it
and Flora deep-links straight into the plant. End.

## If something goes sideways

- Venue Wi-Fi flaky → you're already offline-safe (airplane mode); Metro hiccup →
  the backup device with the dev build doesn't need the laptop at all.
- Wrong fixture appears → cycle the DEV chip and re-run; the flow is 15 seconds.
- State looks stale mid-demo → Profile → DEV · Reset demo data restores the seeds
  in one tap (you'll be signed back in as flora_demo).
