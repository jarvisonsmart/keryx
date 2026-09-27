/** Real Firefox first-install and same-page service-worker update regression. */
const { firefox } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const worker = path.join(__dirname, 'app/dist/sw.js');
  const original = fs.readFileSync(worker);
  const browser = await firefox.launch();
  try {
    const page = await browser.newPage();
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
    await page.goto(process.env.APP ?? 'http://localhost:4173/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    if (navigations !== 1) throw new Error('First installation unexpectedly reloaded');
    for (let update = 1; update <= 2; update++) {
      fs.writeFileSync(worker, Buffer.concat([original, Buffer.from(`\n// update probe ${Date.now()}-${update}`)]));
      await Promise.all([
        page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame()),
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration.update();
        }),
      ]);
      await page.waitForTimeout(1500);
      if (navigations !== update + 1) throw new Error(`Update ${update}: expected one reload, saw ${navigations - update}`);
    }
    console.log('PASS: first install has no reload; two successive updates each reload once, without a manual reload');
  } finally {
    fs.writeFileSync(worker, original);
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
