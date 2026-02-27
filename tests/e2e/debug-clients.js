/**
 * Quick debug: checks if the clients table is accessible via the app
 */
const { launchBrowser, login, BASE_URL } = require("./helpers");

async function run() {
  console.log("\n🔍 Debug: Clients table check\n");
  const browser = await launchBrowser();
  const page = await browser.newPage();

  // Capture browser console messages
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [browser error]", msg.text());
  });

  // Capture network responses
  page.on("response", async (res) => {
    if (res.url().includes("supabase") && res.url().includes("clients")) {
      const status = res.status();
      let body = "";
      try { body = JSON.stringify(await res.json()); } catch {}
      console.log(`  [supabase /clients] ${status} ${body}`);
    }
  });

  await login(page);

  // Open Settings → Clients tab
  const settingsBtn = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((el) => el.textContent?.includes("Settings"))
  );
  await settingsBtn.asElement()?.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  const clientsTab = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Clients")
  );
  await clientsTab.asElement()?.click();
  await new Promise(r => setTimeout(r, 2000));

  // Check what's visible
  const bodyText = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText);
  console.log("\n  Dialog text:\n", bodyText);

  await browser.close();
}

run().catch(console.error);
