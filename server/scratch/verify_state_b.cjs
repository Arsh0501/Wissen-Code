const puppeteer = require('puppeteer');
const path = require('path');

async function testStateB() {
  console.log('[Puppeteer] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('[Puppeteer] Navigating to http://localhost:3000/interview/demo-interview-token ...');
  await page.goto('http://localhost:3000/interview/demo-interview-token', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  // Wait for CodingWorkspace to appear (State B)
  console.log('[Puppeteer] Waiting for CodingWorkspace...');
  await page.waitForSelector('text/Two Sum', { timeout: 15000 });
  console.log('[Puppeteer] Found "Two Sum" problem description!');

  // Take screenshot 1: State B initial
  const shot1 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interview_state_b_initial.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 1 to', shot1);

  // Click "Run Code"
  console.log('[Puppeteer] Clicking "Run Code"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const runBtn = buttons.find(b => b.textContent && b.textContent.includes('Run Code'));
    if (runBtn) runBtn.click();
  });
  console.log('[Puppeteer] Clicked Run Code, waiting 6s for execution...');
  await new Promise((r) => setTimeout(r, 6000));

  // Click "Submit Code"
  console.log('[Puppeteer] Clicking "Submit Code"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const submitBtn = buttons.find(b => b.textContent && b.textContent.includes('Submit Code'));
    if (submitBtn) submitBtn.click();
  });
  console.log('[Puppeteer] Clicked Submit Code, waiting 2s...');
  await new Promise((r) => setTimeout(r, 2000));

  // Take screenshot 2: After Run & Submit
  const shot2 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interview_state_b_executed.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 2 to', shot2);

  // Open Chat Drawer to test drawer mode
  console.log('[Puppeteer] Opening chat drawer...');
  await page.evaluate(() => {
    const chatBtn = document.querySelector('button[title*="Chat"]');
    if (chatBtn) chatBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  const shot3 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interview_state_b_chat_drawer.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 3 to', shot3);

  await browser.close();
  console.log('[Puppeteer] Browser closed. All verifications complete!');
}

testStateB().catch((err) => {
  console.error('[Puppeteer Error]', err);
  process.exit(1);
});
