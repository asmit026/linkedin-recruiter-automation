/**
 * Automated LinkedIn Recruiter Email Sender via Gmail SMTP
 * 
 * Features:
 *  - Supports Dry-Run Mode (--dry-run) to test email formatting & receive a test email to yourself
 *  - Supports Live Mode (--send) to send emails to all scraped recruiters
 *  - Smart Recruiter Greeting (extracts first name or defaults cleanly to 'Hiring Team')
 *  - Automatic deduplication via sent_emails.json to never spam a recruiter twice
 *  - Anti-spam randomized delays (3-6 seconds) between emails
 *  - Optional Resume attachment support (defaults to ./resume.pdf)
 * 
 * Usage:
 *   node send_emails.js --dry-run    (Test mode: preview emails & send 1 test email to yourself)
 *   node send_emails.js --send       (Live mode: send emails to recruiters in results.json)
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

// ─── Configuration ────────────────────────────────────────────────────────────
const RESULTS_FILE     = path.join(__dirname, 'results.json');
const SENT_LOG_FILE    = path.join(__dirname, 'sent_emails.json');
const GMAIL_USER       = process.env.GMAIL_USER || process.env.LINKEDIN_EMAIL;
const GMAIL_PASS       = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || '';
const SENDER_NAME      = process.env.SENDER_NAME || 'Java Developer';
const SENDER_PHONE     = process.env.SENDER_PHONE || '';
const RESUME_PATH      = process.env.RESUME_PATH || path.join(__dirname, 'resume.pdf');

// Check CLI flags
const isLiveMode = process.argv.includes('--send') || process.argv.includes('--live');
const isDryRun   = !isLiveMode;

// ─── Email Template ───────────────────────────────────────────────────────────
const SUBJECT_TEMPLATE = 'Application for Java Developer Contract Role — Immediate Joiner';

function getEmailBody(greetingName) {
  return `Hi ${greetingName},

I saw your LinkedIn posting for a Contract Java Developer and wanted to reach out directly.

I am a Senior Java Developer with strong hands-on experience in Java (8/17/21), Spring Boot, Microservices, and Apache Kafka. I am immediately available for contract / C2C / C2H roles and can join without any notice period.

${fs.existsSync(RESUME_PATH) ? 'I have attached my resume for your review. ' : ''}I would love to connect for a quick 5-minute chat to discuss how my skillset aligns with your current requirements.

Best regards,
${SENDER_NAME}${SENDER_PHONE ? `\n${SENDER_PHONE}` : ''}
${GMAIL_USER || ''}`.trim();
}

// ─── Helper: Clean Recruiter Greeting ──────────────────────────────────────────
function getGreetingName(author) {
  if (!author || author.toLowerCase() === 'unknown') return 'Hiring Team';
  const lower = author.toLowerCase();
  // Check if it's a company name rather than a person
  if (
    lower.includes('tech') || lower.includes('solutions') || lower.includes('innovations') ||
    lower.includes('growth') || lower.includes('inc') || lower.includes('llc') ||
    lower.includes('consulting') || lower.includes('services') || lower.includes('partner') ||
    lower.includes('software') || lower.includes('infosoft')
  ) {
    return `${author} Team`;
  }
  // Extract first name for individuals
  const firstName = author.split(' ')[0];
  return firstName.length > 1 ? firstName : 'Hiring Team';
}

// ─── Helper: Sleep/Delay ───────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomDelay = (min = 3000, max = 6000) => Math.floor(Math.random() * (max - min + 1)) + min;

// ─── Main Execution ───────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  📧  LinkedIn Recruiter Email Sender (via Gmail SMTP)');
  console.log(`  Mode       : ${isLiveMode ? '🚨 LIVE MODE (Sending to Recruiters)' : '🧪 DRY-RUN / TEST MODE'}`);
  console.log(`  Sender     : ${GMAIL_USER || '❌ Not set in .env'}`);
  console.log(`  Resume     : ${fs.existsSync(RESUME_PATH) ? `✅ Attached (${RESUME_PATH})` : '⚠️ No resume.pdf found (will send without attachment)'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!GMAIL_USER || !GMAIL_PASS) {
    console.error('❌  ERROR: Missing Gmail credentials in .env file!');
    console.error('    Please add the following lines to your .env file:');
    console.error('      GMAIL_USER=your_email@gmail.com');
    console.error('      GMAIL_APP_PASSWORD=your_16_char_app_password\n');
    console.error('    👉 To generate a Gmail App Password:');
    console.error('       1. Go to Google Account Management → Security');
    console.error('       2. Enable 2-Step Verification');
    console.error('       3. Go to App Passwords and generate a password for "Mail"');
    process.exit(1);
  }

  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`❌  ERROR: Could not find ${RESULTS_FILE}. Run linkedin_search.js first!`);
    process.exit(1);
  }

  // Load results
  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  console.log(`📋  Loaded ${results.length} posts from ${RESULTS_FILE}.\n`);

  // Load sent log for deduplication
  let sentLog = {};
  if (fs.existsSync(SENT_LOG_FILE)) {
    try { sentLog = JSON.parse(fs.readFileSync(SENT_LOG_FILE, 'utf8')); }
    catch (_) { sentLog = {}; }
  }

  // Setup Gmail SMTP Transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS
    }
  });

  // Verify connection
  process.stdout.write('🔐  Verifying Gmail SMTP authentication... ');
  try {
    await transporter.verify();
    console.log('✅ Success!\n');
  } catch (err) {
    console.log('❌ Failed!');
    console.error(`\n❌  Authentication Error: ${err.message}`);
    console.error('    👉 Ensure you are using a 16-character Gmail APP PASSWORD, not your regular login password!');
    process.exit(1);
  }

  // Prepare attachments array if resume exists
  const attachments = fs.existsSync(RESUME_PATH)
    ? [{ filename: path.basename(RESUME_PATH), path: RESUME_PATH }]
    : [];

  if (isDryRun) {
    console.log('🧪  DRY-RUN MODE: Previewing email template and targets...');
    console.log('───────────────────────────────────────────────────────────────────');
    const sampleAuthor = results[0]?.author || 'John Doe';
    const sampleGreeting = getGreetingName(sampleAuthor);
    console.log(`Subject: ${SUBJECT_TEMPLATE}`);
    console.log(`To:      [Recruiter Email]`);
    console.log(`\n${getEmailBody(sampleGreeting)}`);
    console.log('───────────────────────────────────────────────────────────────────\n');

    console.log('🎯  Target Recruiters ready to be contacted:');
    let totalTargetEmails = 0;
    results.forEach((r, idx) => {
      const greeting = getGreetingName(r.author);
      r.emails.forEach(email => {
        const isSent = !!sentLog[email];
        console.log(`   ${String(idx + 1).padStart(2, ' ')}. ${email.padEnd(38)} | Greeting: "Hi ${greeting}," | Status: ${isSent ? '⏭️  ALREADY SENT' : '📝 READY'}`);
        if (!isSent) totalTargetEmails++;
      });
    });

    console.log(`\n📨  Total unique unsent recruiter emails: ${totalTargetEmails}`);
    console.log(`\n🚀  Sending 1 TEST email to your own inbox (${GMAIL_USER}) so you can inspect formatting...`);
    
    try {
      await transporter.sendMail({
        from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
        to: GMAIL_USER,
        subject: `[TEST PREVIEW] ${SUBJECT_TEMPLATE}`,
        text: getEmailBody('Asmit (Test Preview)'),
        attachments
      });
      console.log(`✅  TEST EMAIL SENT SUCCESSFULLY to ${GMAIL_USER}! Check your inbox!`);
      console.log(`\n💡  When you are satisfied with the email template and ready to send to real recruiters, run:`);
      console.log(`    node send_emails.js --send\n`);
    } catch (err) {
      console.error(`❌  Failed to send test email: ${err.message}`);
    }
    return;
  }

  // ─── Live Mode Execution ────────────────────────────────────────────────────
  console.log('🚨  LIVE MODE INITIATED: Sending emails to real recruiters...\n');
  let sentCount = 0;
  let skippedCount = 0;
  let failCount = 0;

  for (let i = 0; i < results.length; i++) {
    const post = results[i];
    const greetingName = getGreetingName(post.author);

    for (const email of post.emails) {
      if (sentLog[email]) {
        console.log(`⏭️  [Post ${i + 1}] Skipping ${email} — already emailed on ${sentLog[email]}`);
        skippedCount++;
        continue;
      }

      console.log(`📨  [Post ${i + 1}] Sending email to ${email} (Greeting: "Hi ${greetingName},")...`);
      try {
        await transporter.sendMail({
          from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
          to: email,
          subject: SUBJECT_TEMPLATE,
          text: getEmailBody(greetingName),
          attachments
        });

        const timeNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
        sentLog[email] = timeNow;
        fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(sentLog, null, 2), 'utf8');
        console.log(`    ✅ Success! Emailed ${email}`);
        sentCount++;

        // Randomized anti-spam delay between emails
        const delayMs = getRandomDelay(3000, 6000);
        console.log(`    ⏳ Waiting ${(delayMs / 1000).toFixed(1)}s before next email to protect Gmail sender reputation...`);
        await sleep(delayMs);

      } catch (err) {
        console.error(`    ❌ Failed to email ${email}: ${err.message}`);
        failCount++;
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  🎉  Email Campaign Summary:');
  console.log(`      ✅ Sent Successfully : ${sentCount}`);
  console.log(`      ⏭️  Skipped (Duplicate) : ${skippedCount}`);
  console.log(`      ❌ Failed            : ${failCount}`);
  console.log(`  💾  Log saved to         : ${SENT_LOG_FILE}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
