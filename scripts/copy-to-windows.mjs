/**
 * Copies the built dist/ to the Windows folder Chrome loads the extension from.
 * Run automatically via the "build" npm script after vite build.
 *
 * No-ops on environments without the Windows mount (e.g. CI / native Linux) so
 * a stray `npm run build` there can't hard-fail.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const WINDOWS_DEST = "/mnt/c/Users/natha/Projects/Tools/wdiw";

// Skip cleanly when not running under WSL with the C: drive mounted.
if (!fs.existsSync("/mnt/c")) {
  console.log("[wdiw] no /mnt/c — not on WSL; skipping Windows copy.");
  process.exit(0);
}

const src = path.resolve(import.meta.dirname, "../dist");

if (!fs.existsSync(src)) {
  console.error("[wdiw] dist/ not found — did the build succeed?");
  process.exit(1);
}

if (!fs.existsSync(WINDOWS_DEST)) {
  fs.mkdirSync(WINDOWS_DEST, { recursive: true });
}

try {
  // rsync is available in WSL and handles the 9p fs well
  execSync(`rsync -a --delete "${src}/" "${WINDOWS_DEST}/"`, {
    stdio: "inherit",
  });
  console.log(`[wdiw] Copied dist/ -> ${WINDOWS_DEST}`);
} catch {
  // rsync not available — fall back to cp
  execSync(`cp -r "${src}/." "${WINDOWS_DEST}/"`, { stdio: "inherit" });
  console.log(`[wdiw] Copied dist/ -> ${WINDOWS_DEST} (cp fallback)`);
}
