/**
 * Headless-browser QA screenshots.
 *
 * Boots a Chromium headless instance, navigates to the running dev
 * server, captures specific UI states, and writes PNGs to /tmp so
 * Claude (or you) can actually see what the app renders rather than
 * inferring from SSR HTML strings.
 *
 * Usage:
 *   npm run qa:screenshots                  # default flow: home + card 0 expanded
 *   npm run qa:screenshots -- card=2        # expand card 2 instead
 *   npm run qa:screenshots -- viewport=desktop
 *
 * Prereq: dev server running on http://localhost:3000.
 */

import fs from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright";

const argMap = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split("=");
  if (k && v) argMap.set(k, v);
}

const cardIndex = Number(argMap.get("card") ?? "0");
const viewport = argMap.get("viewport") ?? "mobile";
const baseUrl = argMap.get("url") ?? "http://localhost:3000";
const outDir = argMap.get("out") ?? "/tmp/podium-qa";

// iPhone 15 Pro logical viewport — what the design is tuned for.
const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 900, deviceScaleFactor: 1 },
} as const;

async function shoot(page: Page, name: string) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  saved  ${file}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  // Clean previous runs so old screenshots don't linger.
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".png")) fs.unlinkSync(path.join(outDir, f));
  }

  const vp = VIEWPORTS[viewport as keyof typeof VIEWPORTS] ?? VIEWPORTS.mobile;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // Surface console errors / warnings to the terminal so silent client-side
  // failures show up alongside the screenshots.
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`  [${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.log(`  [pageerror] ${err.message}`);
  });

  console.log(`Loading ${baseUrl} (${viewport} ${vp.width}×${vp.height})…`);
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await shoot(page, `01-home-${viewport}`);

  // Open the chosen card's sheet. Cards render as <article> elements
  // wrapped by Radix SheetTrigger. Click the Nth one.
  const articles = page.locator("article");
  const count = await articles.count();
  console.log(`Found ${count} cards in the grid.`);

  if (count === 0) {
    console.log("No cards to expand. Done.");
    await browser.close();
    return;
  }

  const target = articles.nth(Math.min(cardIndex, count - 1));
  const cardLabel = await target.getAttribute("aria-label");
  console.log(`Expanding card ${cardIndex}: "${cardLabel}"`);
  await target.click();

  // Sheet animates in — wait for the dialog to appear.
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  await page.waitForTimeout(400); // let the slide-in settle.

  await shoot(page, `02-expanded-card-${cardIndex}-${viewport}`);

  // Capture the feedback bar specifically (scroll to bottom of sheet body).
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const scroller = dialog?.querySelector('[data-slot="sheet-content"]')
      ?? dialog;
    if (scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: scroller.scrollHeight });
    }
  });
  await page.waitForTimeout(200);
  await shoot(page, `03-expanded-bottom-${cardIndex}-${viewport}`);

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
