/**
 * LinkedIn Post Scraper
 * Finds posts with "JAVA DEVELOPER" + "CONTRACT" posted within 24h
 * that contain a recruiter email address.
 *
 * Usage:  node linkedin_search.js
 * Output: results.json + results.csv
 */

const { chromium } = require('playwright');
const fs = require('fs');
require('dotenv').config();

// ─── Config ───────────────────────────────────────────────────────────────────
const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL || '';
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD || '';
const SEARCH_KEYWORDS = 'JAVA DEVELOPER CONTRACT';
const MAX_HOURS = 24;
const MAX_SCROLL = 10;
const OUTPUT_JSON = 'results.json';
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseHoursAgo(text) {
  if (!text) return Infinity;
  const t = text.toLowerCase().trim();
  if (t.includes('just now') || t === 'now') return 0;
  const m = t.match(/(\d+)\s*([smhd])/);
  if (!m) return Infinity;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case 's': return n / 3600;
    case 'm': return n / 60;
    case 'h': return n;
    case 'd': return n * 24;
  }
  return Infinity;
}

function extractEmails(text) {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(
    matches
      .map(e => e.toLowerCase())
      // Clean trailing words from TLD (e.g. .complease -> .com, .inplease -> .in, .co.ukknow -> .co.uk)
      .map(e => e.replace(/(\.(?:com|co\.in|co\.uk|org|net|edu|gov|io|ai|tech|info|biz|in|uk|us|ca|de|eu|me|id))[a-z]*$/i, '$1'))
      .filter(e => !/\.(png|jpg|svg|gif|webp)$/.test(e) && /@[a-z0-9.\-]+\.[a-z]{2,}/.test(e))
  )];
}

function containsAll(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.every(k => lower.includes(k));
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login(page) {
  console.log('\n🔐  Logging in...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Wait for React to render the form (don't use state:'visible' —
  // one of the two form copies is CSS-hidden which makes that check fail)
  await page.waitForTimeout(3000);

  // Find the email input that actually has pixel dimensions (the visible copy)
  // and fill it using Playwright's fill() which properly triggers React events
  const emailInputs = page.locator('input[type="email"]');
  let emailLocator = null;
  const emailCount = await emailInputs.count();
  for (let i = 0; i < emailCount; i++) {
    const bb = await emailInputs.nth(i).boundingBox();
    if (bb && bb.width > 0 && bb.height > 0) { emailLocator = emailInputs.nth(i); break; }
  }
  if (!emailLocator) throw new Error('Could not find a rendered email input.');
  await emailLocator.fill(LINKEDIN_EMAIL);
  console.log('    ✓ Email filled.');
  await page.waitForTimeout(400);

  // Same approach for password
  const pwdInputs = page.locator('input[type="password"]');
  let pwdLocator = null;
  const pwdCount = await pwdInputs.count();
  for (let i = 0; i < pwdCount; i++) {
    const bb = await pwdInputs.nth(i).boundingBox();
    if (bb && bb.width > 0 && bb.height > 0) { pwdLocator = pwdInputs.nth(i); break; }
  }
  if (!pwdLocator) throw new Error('Could not find a rendered password input.');
  await pwdLocator.fill(LINKEDIN_PASSWORD);
  console.log('    ✓ Password filled.');
  await page.waitForTimeout(300);

  // Click the Sign In button
  await page.keyboard.press('Enter');
  console.log('    ✓ Submitted. Waiting for redirect...');

  // waitForURL defaults to 'load' which LinkedIn's feed never fully fires.
  // Use 'domcontentloaded' and fall back to checking page.url() on timeout.
  try {
    await page.waitForURL(
      url => url.href.includes('/feed') || url.href.includes('/checkpoint') || url.href.includes('/home'),
      { timeout: 60000, waitUntil: 'domcontentloaded' }
    );
  } catch (_) {
    const cur = page.url();
    if (!cur.includes('/feed') && !cur.includes('/home') && !cur.includes('/checkpoint'))
      throw new Error(`Login failed — unexpected URL: ${cur}`);
  }
  console.log('    ✅  Logged in:', page.url());
}

// ─── Scrape ───────────────────────────────────────────────────────────────────
async function scrapePosts(page) {
  const searchUrl =
    'https://www.linkedin.com/search/results/content/?' +
    `keywords=${encodeURIComponent(SEARCH_KEYWORDS)}` +
    '&datePosted=past-24h&sortBy=date_posted';

  console.log('\n🔍  Navigating to search results...');
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  await page.waitForSelector('[data-testid="expandable-text-box"]', { timeout: 20000 });
  console.log('    ✓ Post cards are visible.');

  const results = [];
  const seenKeys = new Set();

  for (let scroll = 0; scroll <= MAX_SCROLL; scroll++) {
    if (scroll > 0) {
      console.log(`    ↓  Scroll ${scroll}/${MAX_SCROLL} — ${results.length} matches so far`);
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(2500);
    }

    // ── Expand visible "See more" buttons to get full post text ─────────────
    const seeMoreBtns = page.locator('[data-testid="expandable-text-button"]');
    const btnCount = await seeMoreBtns.count();
    const btnStartIdx = Math.max(0, btnCount - 15);
    for (let b = btnStartIdx; b < btnCount; b++) {
      try {
        if (await seeMoreBtns.nth(b).isVisible({ timeout: 300 })) {
          await seeMoreBtns.nth(b).click({ timeout: 500 });
          await page.waitForTimeout(100);
        }
      } catch (_) { }
    }
    if (btnCount > 0) await page.waitForTimeout(300);

    // ── Extract text from each post ──────────────────────────────────────
    const textLocator = page.locator('[data-testid="expandable-text-box"]');
    const count = await textLocator.count();
    if (scroll === 0) console.log(`    📄  Found ${count} post box(es) on page.`);

    // Only process recent elements to avoid re-evaluating 150+ old DOM nodes over IPC
    const startIdx = Math.max(0, count - 30);
    for (let i = startIdx; i < count; i++) {
      let text = '';
      try {
        text = await textLocator.nth(i).evaluate(el => el.textContent || el.innerText || '');
        text = text.trim();
      } catch (_) { continue; }

      if (!text || text.length < 20) continue;
      const key = text.slice(0, 80);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      // Debug: show what we're seeing (only for first scroll to avoid noise)
      if (scroll === 0) {
        const hasKw = containsAll(text, ['java developer', 'contract']);
        const emails = extractEmails(text);
        console.log(`\n    [Post ${i + 1}] len=${text.length} | keywords=${hasKw} | emails=${emails.length > 0 ? emails.join(',') : 'none'}`);
        console.log(`              preview: ${text.slice(0, 120).replace(/\n/g, ' ')}`);
      }

      // ── Check keywords ──────────────────────────────────────────────────
      if (!containsAll(text, ['java developer', 'contract'])) continue;

      // ── Extract emails ──────────────────────────────────────────────────
      const emails = extractEmails(text);
      if (emails.length === 0) continue;


      // ── Get author + time by walking up from the text box ───────────────
      const meta = await textLocator.nth(i).evaluate(el => {
        let card = el;
        let timeText = '', author = '', profileUrl = '';

        for (let j = 0; j < 20; j++) {
          card = card.parentElement;
          if (!card) break;

          if (!timeText) {
            const allSpans = [...card.querySelectorAll('span')];
            for (const sp of allSpans) {
              const t = (sp.textContent || '').trim();
              if (/^\d+[smhd]$/.test(t)) { timeText = t; break; }
            }
            const timeEl = card.querySelector('time');
            if (timeEl) timeText = (timeEl.textContent || '').trim() || timeEl.getAttribute('datetime') || '';
          }

          if (!profileUrl) {
            const a = card.querySelector('a[href*="/in/"], a[href*="/company/"]');
            if (a) {
              profileUrl = a.href;
              const nameSpan = a.querySelector('span[aria-hidden="true"], span');
              author = nameSpan ? (nameSpan.textContent || '').trim() : (a.textContent || '').trim().slice(0, 60);
            }
          }

          if (timeText && profileUrl) break;
        }
        return { timeText, author, profileUrl };
      });

      // ── Time filter ─────────────────────────────────────────────────────
      const hoursAgo = parseHoursAgo(meta.timeText);
      // If time is unknown (empty), still include — we already filtered by LinkedIn's past-24h URL param
      if (isFinite(hoursAgo) && hoursAgo > MAX_HOURS) continue;

      const entry = {
        author: meta.author || 'Unknown',
        profileUrl: meta.profileUrl || '',
        timeText: meta.timeText || 'unknown',
        hoursAgo: isFinite(hoursAgo) ? Math.round(hoursAgo * 10) / 10 : '< 24h',
        emails,
        preview: text.slice(0, 300).replace(/\n/g, ' '),
        fullText: text,
      };
      results.push(entry);

      console.log(`\n  ✅  MATCH #${results.length}`);
      console.log(`      Author  : ${entry.author}`);
      console.log(`      Posted  : ${entry.timeText || '< 24h'}`);
      console.log(`      Emails  : ${emails.join(', ')}`);
      console.log(`      Preview : ${entry.preview.slice(0, 160)}...`);
    }
  }

  return results;
}

// ─── Save ─────────────────────────────────────────────────────────────────────
function save(results) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n💾  ${results.length} results saved to ${OUTPUT_JSON}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!LINKEDIN_EMAIL || !LINKEDIN_PASSWORD) {
    console.error('❌  Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env'); process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════');
  console.log('  LinkedIn Post Scraper');
  console.log(`  Keywords : ${SEARCH_KEYWORDS}`);
  console.log(`  Max age  : ${MAX_HOURS}h  |  Needs email in post`);
  console.log('═══════════════════════════════════════════════════');

  const browser = await chromium.launch({ headless: false, slowMo: 40, args: ['--start-maximized'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);
    const results = await scrapePosts(page);

    console.log('\n═══════════════════════════════════════════════════');
    if (results.length === 0) {
      console.log('⚠️   No posts found with all criteria met.');
      console.log('     Criteria: keywords + within 24h + contains email');
    } else {
      console.log(`\n🎯  ${results.length} matching post(s) found!\n`);
      console.table(results.map((r, i) => ({
        '#': i + 1,
        'Author': r.author.slice(0, 28),
        'Time': String(r.timeText),
        'Emails': r.emails.join(', '),
      })));
      save(results);
    }
    console.log('═══════════════════════════════════════════════════');

    console.log('\n⏸️   Keeping browser open for 15s...');
    await page.waitForTimeout(15000);
  } catch (err) {
    console.error('\n❌  Error:', err.message);
    await page.screenshot({ path: 'search_error.png' }).catch(() => { });
    console.error('📸  search_error.png saved');
  } finally {
    await browser.close();
  }
}

main();
