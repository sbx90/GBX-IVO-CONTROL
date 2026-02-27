/**
 * Settings → Team tab visual + functional test
 * Run: node tests/e2e/settings-team.test.js
 */
require('dotenv').config({ path: '.env.local' });
process.env.TEST_URL = 'http://localhost:3000';
const path = require('path');
const { launchBrowser, login, pass, fail, BASE_URL } = require('./helpers');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('\n🧪 Settings → Team tab\n');
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    // ── Login ────────────────────────────────────────────────────
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', process.env.TEST_EMAIL);
    await page.type('input[type="password"]', process.env.TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !window.location.href.includes('/login'), { timeout: 15000 });
    await sleep(2000); // wait for profile/role to load
    pass('Login');

    // ── Open Settings dialog ─────────────────────────────────────
    const settingsBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find((el) => el.textContent?.includes('Settings'));
    });
    if (!settingsBtn.asElement()) {
      fail('Settings button not found in sidebar (admin profile may not be loaded)');
      await browser.close();
      return;
    }
    await settingsBtn.asElement().click();
    await sleep(800);
    pass('Settings dialog opened');

    // ── Check dialog is visible ──────────────────────────────────
    const dialogVisible = await page.evaluate(() => {
      return !!document.querySelector('[role="dialog"]');
    });
    dialogVisible ? pass('Dialog rendered') : fail('Dialog not rendered');

    // ── Click Team tab ───────────────────────────────────────────
    const teamTab = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('[role="dialog"] button')];
      return buttons.find((el) => el.textContent?.trim() === 'Team');
    });
    if (!teamTab.asElement()) {
      fail('Team tab not found');
      await browser.close();
      return;
    }
    await teamTab.asElement().click();
    await sleep(3000); // wait for server action to load members
    pass('Team tab clicked');

    // ── Check team members loaded ────────────────────────────────
    const hasMembers = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.innerText?.includes('@gbxtechnology.net') ?? false;
    });
    hasMembers ? pass('Team members loaded') : fail('No team members visible');

    // ── Check Add Member button visible and not clipped ──────────
    const addMemberBtn = await page.evaluateHandle(() => {
      const buttons = [...document.querySelectorAll('[role="dialog"] button')];
      return buttons.find((el) => el.textContent?.includes('Add Member'));
    });
    if (addMemberBtn.asElement()) {
      const rect = await addMemberBtn.asElement().boundingBox();
      const dialogRect = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return d?.getBoundingClientRect();
      });
      const clipped = rect.x + rect.width > dialogRect.x + dialogRect.width + 2;
      clipped ? fail('Add Member button is clipped outside dialog') : pass('Add Member button fits within dialog');
    } else {
      fail('Add Member button not found');
    }

    // ── Screenshot ───────────────────────────────────────────────
    await page.screenshot({ path: path.join(__dirname, 'snap-settings-team.png') });
    pass('Screenshot saved → tests/e2e/snap-settings-team.png');

    // Keep browser open for visual inspection
    await sleep(15000);

  } catch (err) {
    fail(`Unexpected error: ${err.message}`);
    console.error(err);
    await sleep(10000);
  } finally {
    await browser.close();
  }

  console.log('\nDone.\n');
}

run();
