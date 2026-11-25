#!/usr/bin/env node
/**
 * Re-shoot the README's card screenshots (docs/img/card-light.png, card-dark.png,
 * card-identity.png) from the regenerated docs/card-{light,dark}.html. They show the
 * version and the agent id, so every release that changes either needs them again.
 * card-context.png and card-memory.png show neither and stay as they are.
 *
 *   npm run card                                   # regenerate the HTML first
 *   npm i --no-save playwright@1.49.1 && npx playwright install chromium
 *   node scripts/screenshot-cards.mjs              # then: pngquant (below)
 *
 * Playwright's own Chromium, not a system browser, at 2x: each image is the card plus a
 * 22 px margin (44 px at 2x), as the README's images are. Afterwards compress each PNG, as the release runbook asks:
 *   pngquant --quality=75-95 --speed 1 --strip --force --ext .png docs/img/card-{light,dark,identity}.png
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import("playwright");
const browser = await chromium.launch();
try {
  // A tall viewport so the whole card fits; each shot is clipped to the card plus a margin.
  const page = await browser.newPage({ viewport: { width: 802, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  const shot = async (html, out, flip = false) => {
    await page.goto(pathToFileURL(join(root, "docs", html)).href);
    if (flip) {
      await page.locator('label[for="flip"]').first().click();
      await page.waitForTimeout(1200); // the flip is a CSS transition
    }
    // The page's view buttons and caption sit just outside the card: keep them out of the frame.
    await page.addStyleTag({ content: ".views, .hint { visibility: hidden !important; }" });
    const box = await page.locator(".faces").boundingBox();
    if (!box) throw new Error(`${html}: no .faces element`);
    const m = 22; // the margin the README images use (44 px at 2x)
    await page.screenshot({
      path: join(root, "docs/img", out),
      clip: { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m },
    });
    console.log(`docs/img/${out}`);
  };
  await shot("card-light.html", "card-light.png");
  await shot("card-dark.html", "card-dark.png");
  await shot("card-light.html", "card-identity.png", true);
} finally {
  await browser.close();
}
