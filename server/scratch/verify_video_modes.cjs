const puppeteer = require('puppeteer');
const path = require('path');

async function testVideoModes() {
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

  console.log('[Puppeteer] Navigating to http://localhost:3000/interview/demo-interview-token/interviewer ...');
  await page.goto('http://localhost:3000/interview/demo-interview-token/interviewer', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });

  await page.waitForSelector('text/Interviewer Portal', { timeout: 15000 });
  console.log('[Puppeteer] Found Interviewer Portal!');

  await new Promise((r) => setTimeout(r, 1500));

  // Take screenshot 1: Interviewer room with Video toolbar
  const shot1 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/video_jitsi_view.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 1 to', shot1);

  // Click "Switch to Direct Video"
  console.log('[Puppeteer] Clicking "Switch to Direct Video"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const directBtn = buttons.find(b => b.textContent && b.textContent.includes('Switch to Direct Video'));
    if (directBtn) directBtn.click();
  });

  await new Promise((r) => setTimeout(r, 1500));

  // Take screenshot 2: Direct Video Mode active
  const shot2 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/video_direct_view.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 2 to', shot2);

  await browser.close();
  console.log('[Puppeteer] Video modes test completed successfully!');
}

testVideoModes().catch((err) => {
  console.error('[Puppeteer] Error:', err);
  process.exit(1);
});
