import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json";

// Watchprint — the post-watch "what have I been watching?" companion to TL;DW.
// Local-only: it observes the videos you watch (no account, no servers) and
// reports per-channel time + engagement. Icons are TL;DW placeholders for now.
export default defineManifest({
  manifest_version: 3,
  name: "Watchprint",
  short_name: "Watchprint",
  version: pkg.version,
  description:
    "Analyze your YouTube usage — per-channel watch time and engagement, computed locally on the videos you watch. No account, no servers.",
  icons: {
    16: "icons/tl-dw-16.png",
    32: "icons/tl-dw-32.png",
    48: "icons/tl-dw-48.png",
    128: "icons/tl-dw-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Watchprint — your YouTube usage",
    default_icon: {
      16: "icons/tl-dw-16.png",
      32: "icons/tl-dw-32.png",
      48: "icons/tl-dw-48.png",
      128: "icons/tl-dw-128.png",
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
