import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json";

// WDIW (What Did I Watch?) — the post-watch "what have I been watching?" companion to TL;DW.
// Local-only: it observes the videos you watch (no account, no servers) and
// reports per-channel time + engagement.
export default defineManifest({
  manifest_version: 3,
  name: "WDIW — What Did I Watch?",
  short_name: "WDIW",
  version: pkg.version,
  // MV3 service worker + chrome.action badge + navigator.locks + Picture-in-Picture.
  minimum_chrome_version: "116",
  description:
    "WDIW (What Did I Watch?) — analyze your YouTube usage: per-channel watch time, engagement, and a Shorts / doom-scroll breakdown, computed locally. No account, no servers.",
  icons: {
    16: "icons/wdiw-16.png",
    32: "icons/wdiw-32.png",
    48: "icons/wdiw-48.png",
    128: "icons/wdiw-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "WDIW — What Did I Watch?",
    default_icon: {
      16: "icons/wdiw-16.png",
      32: "icons/wdiw-32.png",
      48: "icons/wdiw-48.png",
      128: "icons/wdiw-128.png",
    },
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  // Watch-time observer + channel scraper. Broadcasts WATCH_PROGRESS to the
  // background recorder. No "scripting" permission needed — declared content
  // scripts inject themselves on matching pages.
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*"],
      js: ["src/content/watchtime.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: ["storage"],
  host_permissions: ["https://www.youtube.com/*"],
});
