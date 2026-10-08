const puppeteer = require('puppeteer');
const path = require('path');

async function testInterviewerRoom() {
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

  console.log('[Puppeteer] Waiting for interviewer header...');
  await page.waitForSelector('text/Interviewer Portal', { timeout: 15000 });
  console.log('[Puppeteer] Found Interviewer Portal!');

  // Wait 2s for Jitsi to initialize and reveal
  await new Promise((r) => setTimeout(r, 2000));

  // Take screenshot 1: New layout with Question Dispatcher on the right and Video Call on the left
  const shot1 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interviewer_layout_fixed.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 1 to', shot1);

  // Click "Browse Bank" button to test the new Question Bank Modal
  console.log('[Puppeteer] Clicking "Browse Bank"...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const bankBtn = buttons.find(b => b.textContent && b.textContent.includes('Browse Bank'));
    if (bankBtn) bankBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Take screenshot 2: Question Bank Modal open
  const shot2 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interviewer_bank_modal.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 2 to', shot2);

  // Click "Select" on a question in the modal
  console.log('[Puppeteer] Selecting Question from modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const selectBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Select');
    if (selectBtn) selectBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Take screenshot 3: After question selected, ready to push
  const shot3 = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interviewer_question_ready.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log('[Puppeteer] Saved screenshot 3 to', shot3);

  await browser.close();
  console.log('[Puppeteer] Browser closed. All verifications complete!');
}

testInterviewerRoom().catch((err) => {
  console.error('[Puppeteer Error]', err);
  process.exit(1);
});
