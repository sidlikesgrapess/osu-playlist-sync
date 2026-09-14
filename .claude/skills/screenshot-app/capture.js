const { chromium } = require('playwright');

const OUT = process.env.OUT_DIR || '.';
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

// Server-rendered markup exists before React attaches handlers; a click that
// lands in that window is silently dropped.
const HYDRATION_MS = 800;

async function load(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#playlist-url-input', { timeout: 20000 });
  await page.waitForTimeout(HYDRATION_MS);
}

const FLOWS = {
  song_search_results: async (page) => {
    await load(page);
    await page.click('#platform-dropdown-btn');
    await page.waitForTimeout(300);
    await page.click('text=Single Song Search');
    await page.fill('#playlist-url-input', 'YOASOBI - Idol');
    await page.press('#playlist-url-input', 'Enter');
    await page.waitForSelector('#select-all-header-checkbox', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
  },

  online_popup: async (page) => {
    await load(page);
    await page.getByRole('button', { name: /Online/ }).click();
    await page.waitForSelector('text=Got it!', { timeout: 10000 });
    await page.waitForTimeout(400);
  },

  mrekk_result: async (page) => {
    await load(page);
    await page.click('#preset-player-mrekk');
    // Search yields a fuzzy list; alt text is the exact username, so this
    // opens the real #1 player rather than "Mrekk 2" / "mrekk italiano" / ...
    await page.waitForSelector('text=PLAYERS FOUND', { timeout: 15000 });
    await page.waitForTimeout(500);
    await page.locator('img[alt="mrekk"]').first().click();
    await page.waitForTimeout(3000);
  },
};

(async () => {
  const only = process.argv.slice(2);
  const flows = only.length ? only : Object.keys(FLOWS);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`[${device} pageerror]`, e.message));

    for (const name of flows) {
      if (!FLOWS[name]) throw new Error(`unknown flow: ${name}`);
      await FLOWS[name](page);
      await page.screenshot({ path: `${OUT}/${device}_${name}.png` });
      console.log(`captured ${device}_${name}.png`);
    }

    await context.close();
  }

  await browser.close();
})().catch((err) => {
  console.error('CAPTURE FAILED', err);
  process.exit(1);
});
