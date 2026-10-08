const puppeteer = require('puppeteer');
const path = require('path');

async function testTwoPartyVideo() {
  console.log('[Puppeteer] Launching browser with fake media devices...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  // 1. Open Candidate Page
  console.log('[Puppeteer] Opening Candidate Page...');
  const candPage = await browser.newPage();
  await candPage.setViewport({ width: 1280, height: 800 });
  await candPage.goto('http://localhost:3000/interview/demo-interview-token', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await candPage.waitForSelector('text/WissenCode Interview', { timeout: 15000 });

  // 2. Open Interviewer Page
  console.log('[Puppeteer] Opening Interviewer Page...');
  const intPage = await browser.newPage();
  await intPage.setViewport({ width: 1440, height: 900 });
  await intPage.goto('http://localhost:3000/interview/demo-interview-token/interviewer', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  await intPage.waitForSelector('text/Interviewer Portal', { timeout: 15000 });

  // Switch both to Direct Video mode
  console.log('[Puppeteer] Switching both to Direct Video Mode...');
  await candPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Switch to Direct Video'));
    if (b) b.click();
  });

  await intPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent && x.textContent.includes('Switch to Direct Video'));
    if (b) b.click();
  });

  // Wait 3s for WebRTC peer connection & media stream negotiation
  await new Promise((r) => setTimeout(r, 3000));

  // Take screenshot of interviewer seeing candidate
  const intShot = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/interviewer_seeing_candidate.png');
  await intPage.screenshot({ path: intShot, fullPage: true });
  console.log('[Puppeteer] Interviewer screenshot saved to', intShot);

  // Take screenshot of candidate seeing interviewer
  const candShot = path.resolve('C:/Users/Asus/.gemini/antigravity-ide/brain/e77c9cfd-2548-44c3-8eab-1010f3fc771e/candidate_seeing_interviewer.png');
  await candPage.screenshot({ path: candShot, fullPage: true });
  console.log('[Puppeteer] Candidate screenshot saved to', candShot);

  await browser.close();
  console.log('[Puppeteer] Two-party video test finished successfully!');
}

testTwoPartyVideo().catch((e) => {
  console.error('[Puppeteer] Failed:', e);
  process.exit(1);
});
