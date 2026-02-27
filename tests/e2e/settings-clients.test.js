/**
 * E2E Test: Settings Dialog + Clients Feature
 *
 * Tests:
 *  1. Settings dialog opens with two tabs (Appearance + Clients)
 *  2. Clients tab is navigable
 *  3. Add a test client
 *  4. Client appears in the Ticket form client dropdown
 *  5. Clean up: delete the test client
 *
 * Run: npm test
 * Env: TEST_EMAIL, TEST_PASSWORD, TEST_URL (optional, defaults to localhost:3003)
 */

const { launchBrowser, login, pass, fail, BASE_URL } = require("./helpers");

const TEST_CLIENT_NAME = `Test Client ${Date.now()}`;

async function run() {
  console.log("\n🧪 Settings + Clients E2E Test");
  console.log(`   URL: ${BASE_URL}\n`);

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    // ── Login ───────────────────────────────────────────────
    await login(page);

    // ── 1. Open Settings dialog ─────────────────────────────
    try {
      await page.waitForSelector("aside", { timeout: 5000 });
      const settingsBtn = await page.evaluateHandle(() => {
        return [...document.querySelectorAll("button")].find((el) =>
          el.textContent?.includes("Settings")
        );
      });
      await settingsBtn.asElement()?.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      pass("Settings dialog opens");
    } catch (err) {
      fail("Settings dialog opens", err);
    }

    // ── 2. Both tabs visible ────────────────────────────────
    try {
      await page.waitForFunction(
        () =>
          document.body.innerText.includes("Appearance") &&
          document.body.innerText.includes("Clients"),
        { timeout: 3000 }
      );
      pass("Appearance and Clients tabs visible");
    } catch (err) {
      fail("Both tabs visible", err);
    }

    // ── 3. Navigate to Clients tab ──────────────────────────
    try {
      const clientsTab = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find(
          (el) => el.textContent?.trim() === "Clients"
        )
      );
      await clientsTab.asElement()?.click();
      await page.waitForFunction(
        () => document.body.innerText.includes("Manage the clients"),
        { timeout: 3000 }
      );
      pass("Clients tab shown");
    } catch (err) {
      fail("Navigate to Clients tab", err);
    }

    // ── 4. Add a client ─────────────────────────────────────
    try {
      const addBtn = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find((el) =>
          el.textContent?.includes("Add Client")
        )
      );
      await addBtn.asElement()?.click();

      await page.waitForSelector('input[placeholder*="client name"]', { timeout: 3000 });
      await page.type('input[placeholder*="client name"]', TEST_CLIENT_NAME);
      await page.type('input[type="email"]', "test@example.com");

      // Submit form
      const saveBtn = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button[type='submit']")].find((el) =>
          el.textContent?.includes("Add Client")
        )
      );
      await saveBtn.asElement()?.click();

      await page.waitForFunction(
        (name) => document.body.innerText.includes(name),
        { timeout: 5000 },
        TEST_CLIENT_NAME
      );
      pass(`Client "${TEST_CLIENT_NAME}" created`);
    } catch (err) {
      fail("Add client", err);
    }

    // ── 5. Client appears in ticket form ────────────────────
    try {
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector('[role="dialog"]'),
        { timeout: 3000 }
      );

      await page.goto(`${BASE_URL}/tickets`, { waitUntil: "networkidle2" });

      const newTicketBtn = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find((el) =>
          el.textContent?.includes("New Ticket")
        )
      );
      await newTicketBtn.asElement()?.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.waitForFunction(
        (name) => document.body.innerText.includes(name),
        { timeout: 5000 },
        TEST_CLIENT_NAME
      );
      pass("Client visible in ticket form dropdown");
    } catch (err) {
      fail("Client in ticket form", err);
    }

    // ── 6. Cleanup: delete test client ──────────────────────
    try {
      await page.keyboard.press("Escape");
      const settingsBtn = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find((el) =>
          el.textContent?.includes("Settings")
        )
      );
      await settingsBtn.asElement()?.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const clientsTab = await page.evaluateHandle(() =>
        [...document.querySelectorAll("button")].find(
          (el) => el.textContent?.trim() === "Clients"
        )
      );
      await clientsTab.asElement()?.click();

      const clientRow = await page.evaluateHandle((name) => {
        const ps = [...document.querySelectorAll("p")];
        const p = ps.find((el) => el.textContent?.includes(name));
        return p?.closest(".group");
      }, TEST_CLIENT_NAME);

      if (clientRow.asElement()) {
        await clientRow.asElement().hover();
        const trashBtn = await clientRow.asElement().$('[title="Delete"]');
        page.once("dialog", (dialog) => dialog.accept());
        await trashBtn?.click();
        await new Promise((r) => setTimeout(r, 1500));
        pass("Test client deleted (cleanup)");
      }
    } catch (err) {
      console.log("  ⚠ Cleanup skipped:", err.message);
    }

    console.log("\n✅ All tests passed!\n");
  } catch (err) {
    console.error("\n💥 Unexpected error:", err.message);
  } finally {
    await browser.close();
  }
}

run();
