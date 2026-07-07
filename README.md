# 🚀 LinkedIn Recruiter Automation & Gmail Campaigner

An automated toolkit to scrape recent contract job postings on LinkedIn and send personalized job application emails directly to hiring managers and recruiters via Gmail SMTP.

---

## 📁 Clean Project Structure

```text
LinkedIn Automation/
├── 📜 package.json           # NPM scripts & dependencies
├── 📜 README.md              # Documentation & usage guide
├── 🔐 .env                   # Secret credentials (LinkedIn & Gmail)
├── 🔐 .env.example           # Example credentials template
├── 🚫 .gitignore             # Excluded files (credentials, logs, screenshots)
│
├── 🔍 linkedin_search.js     # Step 1: Scrape recent LinkedIn posts & recruiter emails
├── 📧 send_emails.js         # Step 2: Send personalized application emails via Gmail
│
├── 📊 results.json           # Scraped post data & clean recruiter emails (JSON)
```

---

## 🛠️ How to Use

You can use standard **NPM commands** or direct **Node.js commands**:

### 1️⃣ Step 1: Scrape LinkedIn Postings
Scrapes LinkedIn for posts matching `JAVA DEVELOPER CONTRACT` within the last 24 hours that contain recruiter email IDs:
```bash
npm run scrape
# OR: node linkedin_search.js
```
*Outputs clean data to `results.json`.*

---

### 2️⃣ Step 2: Test Email Campaign (Dry-Run Preview)
Previews your customized email template, lists all target recruiter emails, and **sends 1 test preview email to your own Gmail inbox**:
```bash
npm run test-email
# OR: node send_emails.js --dry-run
```

---

### 3️⃣ Step 3: Launch Live Campaign
Once you verify the test preview in your inbox, launch the campaign to email recruiters (includes automatic deduplication & anti-spam rate limiting):
```bash
npm run send-email
# OR: node send_emails.js --send
```

---

## ⚙️ Configuration (`.env`)

Ensure your `/Users/asmit/LinkedIn Automation/.env` file is set up with your credentials:

```env
LINKEDIN_EMAIL=your_email@gmail.com
LINKEDIN_PASSWORD=your_password

# Gmail SMTP Configuration
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD="your_16_char_app_password"
SENDER_NAME="John Doe"
SENDER_PHONE="+91 9876543210"
RESUME_PATH="./resume.pdf"
```
*(💡 **Note**: You must use a **Gmail App Password** generated from Google Account Security settings, not your regular Gmail login password).*
