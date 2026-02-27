const { launchBrowser, login, BASE_URL } = require("./helpers");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await login(page);

  // Navigate to a ticket detail
  console.log("\n🎫 Ticket detail — full body text:");
  await page.goto(`${BASE_URL}/tickets`, { waitUntil: "networkidle2" });
  await sleep(600);
  // Click first ticket
  const ticketLink = await page.evaluate(() =>
    [...document.querySelectorAll("a")].find(a => a.href?.includes("/tickets/"))?.href
  );
  if (ticketLink) {
    await page.goto(ticketLink, { waitUntil: "networkidle2" });
    await sleep(1200);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 1000));
    console.log(text);

    // Component grid — what text/buttons are in stock kit detail?
    console.log("\n📦 Kit detail — component cards:");
    const stockLink = await page.evaluate(() =>
      [...document.querySelectorAll("a")].find(a => a.href?.includes("/stock/"))?.href
    );
    if (stockLink) {
      await page.goto(stockLink, { waitUntil: "networkidle2" });
      await sleep(1000);
      const componentBtns = await page.evaluate(() =>
        [...document.querySelectorAll("button")].map(b => b.textContent?.trim()).filter(Boolean)
      );
      console.log("Buttons in kit detail:", componentBtns);
    }
  }

  await browser.close();
}

run().catch(console.error);
