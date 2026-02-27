const puppeteer = require("puppeteer-core");

const BASE_URL = process.env.TEST_URL || "http://localhost:3003";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

async function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    defaultViewport: { width: 1280, height: 800 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

async function login(page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Set TEST_EMAIL and TEST_PASSWORD env vars (e.g. in .env.local)");
  }
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2" });
  console.log("  ✓ Logged in");
}

function pass(label) {
  console.log(`  ✅ PASS: ${label}`);
}

function fail(label, err) {
  console.error(`  ❌ FAIL: ${label}`);
  console.error(`     ${err?.message ?? err}`);
}

module.exports = { BASE_URL, launchBrowser, login, pass, fail };
