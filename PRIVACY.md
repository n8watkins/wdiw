# Privacy Policy — WDIW (What Did I Watch?)

**Effective date:** 2026-06-25

WDIW is a local-only Chrome extension that helps you understand your own YouTube
viewing. Your data stays on your device. This policy explains exactly what that means
in plain language.

## The short version

- WDIW processes the videos you watch on YouTube to compute your stats.
- Everything is stored **on your device** in your browser's local storage
  (`chrome.storage.local`).
- **Nothing is ever transmitted, sold, or shared.** There are no servers, no accounts,
  no analytics, no telemetry, no ads, and no third parties.
- You can delete all of it at any time.

## What data is processed

While you watch videos on YouTube, WDIW observes and records:

- the **video title**,
- the **channel** name,
- the **video URL**,
- **timestamps** (when you watched),
- **watch time** (how long you actually watched), and
- a **derived engagement rating** (Engaged / Skimmed / Skipped) that WDIW computes from
  your watch time.

WDIW only observes pages on `www.youtube.com`, and only while the extension is installed
and enabled. It does not read anything from other sites, and it does not use the YouTube
API or any Google login.

## Where your data is stored

All of the above is stored locally in `chrome.storage.local` — that is, in your own
browser profile, on your own device. WDIW does not have a backend, and it never uploads
your data anywhere.

## Data is never transmitted, sold, or shared

WDIW does not send your watch data off your device for any reason. Specifically:

- There are **no servers or cloud services** that receive your data.
- There is **no analytics or telemetry** collecting usage about you.
- Your watch data is **never sold, rented, or shared** with anyone.
- There are **no third-party services or trackers** involved.
- WDIW contains **no remotely loaded code**.

## Optional Google Takeout import

WDIW can import a Google Takeout `watch-history.json` file so you can include past
viewing history. This is entirely **local and user-initiated**: you export the file
from Google yourself, you choose the file in WDIW's Settings, and it is parsed on your
device. The file is never uploaded anywhere. (Takeout history does not include watch
durations, so imported videos do not receive an engagement rating.)

## Permissions and why they are needed

WDIW requests only what it needs to do its job:

- **`storage`** — to save your stats and settings locally on your device.
- **Host access to `https://www.youtube.com/*`** — to observe video playback on YouTube
  watch pages so WDIW can measure your watch time and engagement.

That's it. WDIW requests no other permissions.

## How to delete your data

You are in full control:

- **Settings → Clear all watch data** removes everything WDIW has stored.
- **Removing the extension** from `chrome://extensions` deletes its local storage along
  with it.

## Contact

Questions or concerns? Please open an issue at
<https://github.com/n8watkins/wdiw/issues>.
