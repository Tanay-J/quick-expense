# DropSpend — Zero-Friction Chat Expense Tracker (100% Free Forever)

A minimalist, local-first Progressive Web App (PWA) where you log expenses by simply dropping a natural message like `"200 fuel bike"` or `"450 dinner with friends yesterday"`, backed by **2-way Google Sheets Cloud Sync** in your own Google Drive.

---

## 1. Architecture & Why We Chose This Approach

### The Core Problem
Traditional expense trackers require too many taps (open app → tap `+` → type amount → pick category dropdown → choose date → save). The lowest-friction interface is a **single message bar** that parses natural text automatically.

### Options Evaluated
1. **Local-First PWA + Google Sheets Cloud Sync (Selected — Option A)**
   - **Speed**: 0ms instant load & offline logging via `localStorage` + Service Worker (`sw.js`).
   - **Cloud Backup & Multi-Device Restore**: Syncs automatically in the background to a Google Sheet in your personal Google Drive via a free Google Apps Script Web App.
   - **Zero Cost Forever**: $0/month, no paid AI APIs required, no database pausing (unlike Supabase free tier), and full ownership of raw spreadsheet data even 10+ years from now.
2. **Telegram / WhatsApp Bot + Cloudflare Workers + D1 SQLite**
   - Great if you want to message inside Telegram, with 100k free requests/day and 5GB free D1 SQLite storage.
3. **PWA + Firebase Firestore / Private GitHub Gist**
   - Good alternative cloud databases with generous free tiers.

---

## 2. How the Zero-Cost Smart Parser Works (`parser.js`)

Instead of paying for an LLM API on every message, `parser.js` uses a deterministic + self-learning natural language parser that runs in `<1ms` completely offline:

### Supported Input Patterns
- **Simple expense messages**: `"200 fuel bike"` → `{ type: "expense", amount: 200, category: "transport", paymentMethod: "upi", note: "Fuel bike", date: "Today" }`
- **Payment Mode / Way of Expense (auto-detected from message text or editable inline)**:
  - **UPI (`📱 UPI`)**: `"200 fuel bike upi"`, `"150 coffee gpay"`, `"phonepe"`, `"paytm"`
  - **Credit Card (`💳 Credit Card`)**: `"1500 shoes myntra cc"`, `"credit card"`, `"amex"`
  - **Cash (`💵 Cash`)**: `"80 auto cash"`
  - **From Cashback / Wallet (`🎁 Cashback / Wallet`)**: `"250 coffee from cashback"`, `"300 movie via wallet"`, `"paid using reward points"` (smartly distinguishes *spending from cashback* vs *receiving cashback as income*)
  - **Debit Card (`🏧 Debit Card`)**: `"500 groceries dc"`, `"debit card"`
  - **Bank Transfer (`🏦 Bank Transfer`)**: `"15000 rent neft"`, `"imps"`, `"rtgs"`
- **Income messages (auto-detected via `+` prefix, verbs, or keywords)**:
  - `"+50000 salary"` or `"salary 85k yesterday"` → `{ type: "income", amount: 50000, category: "salary" }`
  - `"received 450 cashback"` or `"1200 refund amazon"` → `{ type: "income", category: "refunds" }`
  - `"15k freelance"`, `"dividend 1,250 15 oct"`, `"+2500 splitwise"`
- **Amount anywhere & shorthand**: `"fuel bike 200"`, `"₹250.50 coffee"`, `"1.5k shoes myntra"` (`₹1,500`), `"1,200 groceries"`, inline math `"120+80 lunch"` (`₹200`)
- **Batch logging (comma or newline separated, including mixed expense + income)**:
  - `"150 coffee upi, +2500 splitwise, 1,200 groceries cc"` → Logs 2 expenses and 1 income at once with their respective payment modes.
- **Relative & explicit dates**:
  - `"yesterday"` / `"last night"` / `"kal"` → Yesterday
  - `"day before yesterday"` / `"parso"` → 2 days ago
  - `"3 days ago"` → Subtract 3 days
  - `"last friday"` → Previous Friday
  - `"15 oct"` / `"oct 15"` / `"1st oct"` → Explicit date

### Self-Learning Category Engine & Payment Breakdown
- Comes preloaded with **9 Expense Categories** (`Food & Dining`, `Groceries`, `Transport & Fuel`, `Bills & Utilities`, `Shopping`, `Health & Fitness`, `Entertainment`, `Personal & Home`, `Other Expense`), **6 Income Categories** (`Salary & Paycheck`, `Freelance & Business`, `Investments & Returns`, `Refunds & Cashback`, `Gifts & Splitwise`, `Other Income`), and **6 Payment Modes** (`UPI`, `Credit Card`, `Cash`, `Cashback / Wallet`, `Debit Card`, `Bank Transfer`).
- **Auto-learning**: Whenever you edit an entry or change its category in the live preview, `learnFromNote()` saves the keywords in that note (`localStorage` key `qe_learned_keywords_v1`) so future messages containing those words are categorized automatically.

---

## 3. Zero-Cost Active Users & Usage Tracker (For Deployment)

When you deploy DropSpend publicly (e.g., on GitHub Pages, Cloudflare Pages, or Vercel), it includes a **100% free, privacy-first Active Users & Sessions Tracker**:
1. **Zero-Config Public Counter (`CounterAPI`)**: Automatically counts unique devices (`unique_users`, incremented once per browser/device via `localStorage` flag) and app launches (`total_sessions`, incremented once per browser session) keyed to your deployment hostname—displaying a live **`👥 X users`** pill in the top header and a detailed telemetry card inside the Cloud & Settings modal.
2. **Google Sheets `UsageStats` Tab (`google-apps-script.js`)**: When a Google Apps Script Web App URL is connected (or if you set `DEFAULT_TELEMETRY_WEBHOOK_URL` in `sync.js` before deploying), every device anonymously logs its `deviceId`, `firstSeen`, `lastSeen`, `sessions`, `txCount`, `platform`, and `timezone` to a dedicated **`UsageStats`** tab in your Google Sheet—**without ever sending private transaction amounts or notes**.

---

## 3. Project Structure & Dual UI/UX Architecture

```text
/Users/tanayjoshi/Projects/quick-expense/
├── index.html              # App shell for both 1:1 Spec UI (#spec-app-root) and Classic/Zen UIs
├── styles.css              # Design tokens & styles for Classic/Zen UIs + 1:1 Spec UI (.spec-*)
├── spec-ui.js              # 1:1 Mockup Spec UI controller (Pages 0–7: 1A–1D, 3A–3D, 4A–4D, 5A–5D, 6A–6D)
├── app.js                  # Classic / Two-Tab Zen / Spotlight / Chat / Pocket UI controller & state bridge
├── parser.js               # Natural language expense parser + 2.4 Question Grammar engine + self-learning
├── insights.js             # Deterministic analytics engine (Pace, Running Total, Calendar, Explore, Compare, Fun Facts, Recaps)
├── sync.js                 # Offline-first queue, 2-way Google Sheets sync, CSV & JSON backup
├── google-apps-script.js   # Ready-to-paste Google Apps Script for your Google Sheet
├── manifest.json           # PWA install manifest for iOS / Android / Desktop
└── sw.js                   # Offline Service Worker cache (dropspend-v17)
```

### Switching Between UI Experiences (Saved in Settings `qe_settings_v1.uiDesign`)
DropSpend preserves **all UI/UX paradigms** on top of the exact same local transaction store (`sync.js`), parser (`parser.js`), and analytics engine (`insights.js`). You can switch anytime in **Settings (`⚙`) → App Layout / UI Experience**:

1. **`spec` — ✨ Mockup Spec UI (Pages 0–7, Default)** (`spec-ui.js`):
   - **`1A · Home`**: Date header, circular Stats (`◔`), History (`🔍`), and Settings (`⚙`) actions, big month-to-date hero (`₹21,609`), **Pace card** (`₹left`, `₹/day · N days`, blue progress meter with black vertical tick at `budget × elapsedFraction`, fixed-order category stacked bar + legend), Today/Yesterday cards, and sticky dark bottom pill **`"What did you spend on? [+]"`**.
   - **`1B, 1C, 1D, 3A · Full-Screen Add / Ask Palette`**:
     - `1B` Empty state: `YOUR USUALS · TAP TO ADD` 2×3 grid (1-tap logs with `[Undo]` toast; `✎` pre-fills input).
     - `1C` Typing state: Live `₹` preview, note, interactive chips (`[ • Category ⌄ ]`, `[ UPI default ⌄ ]`, `[ Today ⌄ ]` with `"will remember"` learning) + `FROM YOUR HISTORY` prefix autocomplete.
     - `1D` Question state: Typing without an amount (`food this month`, `swiggy`, `upi last week`, `#goa`) shows a live Answer Card with total, entries, avg, same-elapsed-span `Δ%`, top 4 item bars, and `Open in Stats → Explore ›`.
     - `3A` Keypad mode: 3×4 numeric keypad, horizontal usuals strip, `UPI | Cash | Card | Bank` selector, and `⌨ Switch to typing` toggle.
   - **`3B · Edit Sheet` & `3C · History` & `3D · Settings`**: Bottom-sheet editor with `#tags` and `"Always file '<note>' as <Category>"` rule toggle; natural-language filterable History screen; iOS-style grouped Settings with UI switcher, `Clean | Receipt | Dark` theme toggle, and 1-tap sample data loader.
   - **`4A–4D · Stats Overview, Category Drill-Down, All Fun Facts & Table View`**: `Week | Month | Year` switch, same-elapsed-span hero KPI, SVG Running Total chart (solid blue vs gray dashed previous period), Category drill-down (`4B`: Last 5 months, Top items, Which day), All Fun Facts (`4C`), and `⊞ Table` toggle (`4D`) on every chart card.
   - **`5A–5D · Calendar Heatmap, Patterns, Explore & Compare`**: Monday-first 5-step blue heatmap (`#cde2fb..#0d366b`) with `🌱` no-spend days, Patterns (`5B`: weekday, hourly 6am–10pm, streaks, habits), Explore (`5C`: group by Category/Item/Mode/Weekday/Tag), and Compare (`5D`: diverging bars + `💬 What changed`).
   - **`6A–6D · Monthly Recaps, Full-Screen Story & Receipt Theme`**: Home recap banner (`6A`), Recaps tab (`6B`), multi-slide Story modal (`6C`), and serrated thermal Receipt ledger theme (`6D`).

2. **Earlier Classic & Zen UI/UX Modes (`app.js` + `index.html`)**:
   - **`zen` — Two-Tab Zen (Home + Insights)**: Dark-slate & emerald mobile-first view with sticky bottom composer (`"200 fuel bike upi"`), interactive staging preview bar, recurring & credit card cycle pill (`💳 Recurring & CC`), and 4-tab Insights Hub (`Overview`, `Calendar`, `Explore`, `Recaps`).
   - **`spotlight` — Spotlight Command Palette**: Top command bar with instant history search and compact summary strip.
   - **`chat` — WhatsApp / Chat Stream**: Conversational bubble stream with bottom message bar.
   - **`pocket` — Apple Card / Pocket Cards**: Elevated summary card with inline visual breakdown.
   - **`classic` — Classic Dashboard**: Full multi-card KPI dashboard with 14-day daily bar chart and category breakdown always visible.

---

## 4. Running Locally & Free Hosting

### Run Locally
```bash
python3 -m http.server 8090 --directory /Users/tanayjoshi/Projects/quick-expense
```
Then open **http://localhost:8090**.

### Host for Free Forever (For Mobile Home Screen Install)
Because this app has zero build step and zero backend server dependencies, you can host it for free on:
- **GitHub Pages**: Push this folder to a GitHub repo → Settings → Pages → Deploy from branch.
- **Cloudflare Pages** or **Vercel / Netlify**: Drag-and-drop the `/Users/tanayjoshi/Projects/quick-expense` folder.
- Once opened on your phone over HTTPS, tap **"Add to Home Screen"** in Safari (iOS) or Chrome (Android) to install it as a standalone full-screen app.

---

## 5. Setting Up 2-Way Google Sheets Cloud Backup (90 Seconds)

1. Open [sheets.new](https://sheets.new) to create a new Google Sheet in your Google Drive.
2. Click **Extensions → Apps Script** in the top menu.
3. Copy the entire contents of [`google-apps-script.js`](./google-apps-script.js) (or click **"Copy Google Apps Script Code"** inside the app's Cloud Backup dialog) and paste it into the Apps Script editor.
4. Click **Deploy → New deployment** (top right):
   - **Select type**: `Web app`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Click **Deploy**, authorize access with your Google account, and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).
6. In DropSpend, click **Backup: Set up Google Sheet** in the top bar, paste the URL, and click **Save & Sync Now**.

### How Recovery Works (If Phone Is Lost or Switched)
- Every expense is stored in the `Expenses` tab of your Google Sheet with a unique `id` and `updatedAt` timestamp.
- On any new phone or laptop, open your PWA, paste the same Google Apps Script URL, and click **Force Full Sync / Restore**—all your historical expenses will immediately populate into the app.

---

## 6. Project Status & Audit (Updated November 1, 2026)

### ✅ Completed (v1.1)
- [x] **Zero-Friction Chat Composer & Interactive "Going to be Saved" Preview (`index.html`, `app.js`, `styles.css`)**:
  - Sticky bottom message bar with live inline-editable staging controls (**Amount**, **Category `<select>`**, **Description/Note**, **Date `<input type="date">`**) so you can inspect and tweak any parsed value before saving.
  - Changing a category in the preview automatically teaches the parser (`learnFromNote`) upon saving.
  - Actionable post-save toast with **`✎ Edit`** and **`↩ Undo & Edit in Bar`** buttons.
  - IME-safe `Enter` handling across the message bar and all inline preview inputs.
- [x] **Offline Natural Language Parser (`parser.js`)**:
  - Single & batch message parsing (comma or newline separated) + draft preview even before an amount is typed.
  - Amount formats: plain numbers (`200`), commas (`1,200`), decimals (`250.50`), `k` shorthand (`1.5k`), inline addition (`120+80 lunch`), currency prefixes/suffixes (`₹`, `rs`, `inr`, `/-`).
  - Relative & explicit dates (`today`/`aaj`, `yesterday`/`kal`/`last night`, `day before yesterday`/`parso`, `N days ago`, `last <weekday>`, `15 oct`, `oct 15`).
  - 9 default categories with keyword matching + self-learning keyword storage (`qe_learned_keywords_v1`).
- [x] **Interactive Analytics Dashboard (`app.js`, `styles.css`)**:
  - Time period selector (`Month` with month navigation, `Last 7D`, `All Time`).
  - KPI summary cards: Total Spent, optional Monthly Budget progress bar, Daily Average + Month Pace projection, and Top Category.
  - Visual category breakdown (stacked progress bar + click-to-filter category rows) and 14-day daily spending bar chart.
  - Instant search/filter across notes, raw text, categories, and amounts, plus native `<dialog>` edit/delete modals.
- [x] **Local-First PWA + 2-Way Google Sheets Sync (`sync.js`, `google-apps-script.js`, `sw.js`, `manifest.json`)**:
  - `localStorage` persistence + Service Worker (`dropspend-v2`) for offline load and logging.
  - CORS-friendly (`text/plain;charset=utf-8`) 2-way Google Apps Script sync with lock protection (`LockService`), cross-device deletion reconciliation, CSV export, and full JSON backup/restore (including learned keywords and settings).
