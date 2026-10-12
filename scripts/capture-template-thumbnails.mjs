// Screenshots each website template's home page (public/template-previews/<slug>/index.html)
// at desktop size into public/images/template-thumbnails/<slug>.png. The template cards show
// these images instead of framing the live page, which was slow to load.
// Re-run after `npm run templates:build` whenever a template's home page changes:
//   node scripts/capture-template-thumbnails.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const previews = join(root, "public", "template-previews");
const out = join(root, "public", "images", "template-thumbnails");
mkdirSync(out, { recursive: true });

const chrome = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome not found. Set CHROME_PATH.");

// Same size TemplateThumbnail used to render the live page at.
const WIDTH = 1440;
const HEIGHT = 900;

for (const slug of readdirSync(previews).filter((d) => statSync(join(previews, d)).isDirectory())) {
  const page = join(previews, slug, "index.html");
  if (!existsSync(page)) continue;
  const file = join(out, `${slug}.png`);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--virtual-time-budget=8000",
    `--screenshot=${file}`,
    pathToFileURL(page).href,
  ], { stdio: "ignore" });
  console.log(`${slug}: ${Math.round(statSync(file).size / 1024)} KB`);
}
