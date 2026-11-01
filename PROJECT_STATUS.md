# DropSpend (Quick Expense & Income Tracker) — Project Context & Status

**Project Path:** `/Users/tanayjoshi/Projects/quick-expense`  
**Last Updated:** November 1, 2026  
**Version:** v1.2 (Git repo initialized on `main`)  
**Architecture:** Local-First Progressive Web App (PWA) + 2-Way Google Sheets Cloud Sync (100% Free Forever)

---

## 1. Project Overview & Goals
- **Core Idea:** Log daily expenses and income with zero friction by dropping a single chat-like message (e.g., `"200 fuel bike"`, `"+50000 salary"`, `"received 450 cashback"`, or `"150 coffee, +2500 splitwise, 1,200 groceries"`).
- **Zero Cost Forever ($0/month):**
  - Uses a fast (`<1ms`), offline deterministic + self-learning natural language parser (`parser.js`) instead of paid LLM API calls.
  - Uses `localStorage` + Service Worker (`sw.js`) for instant 0ms startup and offline logging.
  - Uses a personal **Google Sheet** + free **Google Apps Script Web App** (`google-apps-script.js`) as a 2-way cloud database and multi-device backup/restore layer.

---

## 2. File-by-File Architecture

| File | Size / Lines | Responsibility |
| :--- | :--- | :--- |
| `index.html` | 328 lines | Semantic HTML5 app shell, period navigation bar, 4 KPI summary cards (Total Spent, Total Income, Net Cashflow, Top Category), category (`Expenses`/`Income`) & 14-day trend panels, transaction type filter (`All`/`Expenses`/`Income`) + `<search>`, sticky chat input dock with `− Expense` / `+ Income` toggle & interactive parse preview, and native `<dialog>` modals. |
| `styles.css` | 1,306 lines | Mobile-first dark-slate & emerald theme (`#0b1120` / `#10b981`), income card & net cashflow indicators, interactive `.parse-preview` & `.preview-type-toggle` controls, accessible focus rings, `48px`–`52px` coarse-pointer tap targets, stacked category bar, CSS bar chart, and interactive action toasts. |
| `app.js` | 1,411 lines | Main UI controller, state management (`expenses`, `settings`, `draftItems`, `composerType`, `catBreakdownType`, `feedFilterType`), interactive "Going to be saved" preview with inline Type/Amount/Category/Note/Date editing, post-save `✎ Edit` / `↩ Undo & Edit in Bar` toast actions, KPI cashflow calculations, IME-safe `Enter` submission, CSV/JSON export & import, and background sync triggers. |
| `parser.js` | 520 lines | Offline natural language parser (`parseDraftMessage` + `parseExpenseMessage`), auto-detects **Expense** vs **Income** (`+` prefix, `received`/`credited`/`income` verbs, or income keywords like `salary`, `freelance`, `dividend`, `refund`, `cashback`, `splitwise`), extracts amounts (`200`, `1,200`, `250.50`, `1.5k`, inline addition `120+80`), relative/explicit dates, 9 expense categories + 6 income categories, and self-learning keywords (`qe_learned_keywords_v1`). |
| `sync.js` | 367 lines | `localStorage` helpers (`qe_expenses_v1`, `qe_tombstones_v1`, `qe_settings_v1`), `normalizeEntryType`, 2-way Google Sheets sync (`syncWithGoogleSheets`) with `type` persistence and remote deletion reconciliation, embedded `GOOGLE_APPS_SCRIPT_CODE`, and `exportToCSV`. |
| `google-apps-script.js` | 132 lines | Standalone Google Apps Script (`doGet` and `doPost` with `LockService`) that manages the `Expenses` sheet tab (`id, date, amount, category, note, raw, updatedAt, deleted, type`). |
| `manifest.json` | 18 lines | Standalone PWA Web App Manifest with embedded SVG `₹` icon. |
| `sw.js` | 51 lines | Offline-first Service Worker (`dropspend-v3`) caching static assets while bypassing `script.google.com` / `googleusercontent.com` API requests. |
| `README.md` | 130 lines | User guide, architecture rationale, local server instructions, Google Sheets setup steps, and status summary. |

---

## 3. What Is Completed & Working (v1.2)
1. **Chat-Style Expense & Income Input + Interactive "Going to be Saved" Preview:**
   - Auto-detects **Income** from `+` prefix (`"+50000 salary"`, `"+500 from rahul"`), income verbs (`"received 450 cashback"`, `"credited 5000"`), or income keywords (`"salary 85k"`, `"1200 refund amazon"`, `"15k freelance"`, `"dividend 1,250"`).
   - Includes a 1-tap **`− Expense` / `+ Income`** mode toggle button in the bottom composer bar AND a per-item **`− Expense` / `+ Income`** toggle button inside the interactive **"Going to be saved"** preview row.
   - Each parsed item displays inline-editable controls for **Type** (`Expense`/`Income`), **Amount** (`₹`), **Category** (`<select>` filtered to 9 expense or 6 income categories), **Description / Note** (`<input>`), and **Date** (`<input type="date">`), plus batch item removal (`✕`) and **Reset edits**.
   - Changing a category right inside the preview or Edit modal automatically calls `learnFromNote()` upon saving so DropSpend learns that keyword for future messages.
   - Post-save toast includes instant **`✎ Edit`** (opens the edit modal) and **`↩ Undo & Edit in Bar`** (reverts the save and restores the draft right back into the composer bar).
2. **Self-Learning Category Engine (Expenses & Income):**
   - **9 Expense Categories:** `Food & Dining`, `Groceries`, `Transport & Fuel`, `Bills & Utilities`, `Shopping`, `Health & Fitness`, `Entertainment`, `Personal & Home`, `Other Expense`.
   - **6 Income Categories:** `Salary & Paycheck`, `Freelance & Business`, `Investments & Returns`, `Refunds & Cashback`, `Gifts & Splitwise`, `Other Income`.
3. **Analytics Dashboard & Cashflow Filtering:**
   - Filter by **Month** (with previous/next month buttons), **Last 7D**, or **All Time**.
   - **4 KPI Cards:**
     - **Total Spent:** With optional Monthly Budget progress bar and daily average (`₹/day`).
     - **Total Income:** Total income (`+₹...`) and income entry count.
     - **Net Cashflow:** `Income − Expenses` (`+₹...` in emerald when positive, `−₹...` in red when negative) + automatic **Savings Rate (`Saved X% of income`)** or Month Pace projection.
     - **Top Category:** Highest category share.
   - **Interactive Category Breakdown:** Toggle between **`Expenses`** and **`Income`** breakdowns, with stacked distribution bar + clickable category rows to filter the feed.
   - **Transactions Feed Filter & Search:** Filter by **`All`**, **`Expenses`**, or **`Income`**, plus instant text search and native `<dialog>` Edit modal (with Type switcher).
4. **Offline Persistence & Cloud Backup:**
   - Saves immediately to `localStorage` and queues background sync (`triggerBackgroundSync`).
   - 2-way Google Sheets sync stores `type` (`expense` / `income`) and remains 100% backwards-compatible with existing 8-column sheets.
   - 1-click CSV export (with `Type` column) and JSON backup/restore.

---

## 4. Technical Audit — Resolved Issues (November 1, 2026)

- [x] **Interactive Parse Preview & Quick Edit (`app.js`, `parser.js`, `styles.css`, `index.html`)**: Replaced static preview pills with an inline-editable **"Going to be saved"** staging bar (Amount, Category dropdown, Description, Date picker, batch item removal, and post-save `✎ Edit` / `↩ Undo & Edit in Bar` toast actions).
- [x] **Month-First Explicit Date Format (`"oct 15"`) (`parser.js`)**: Added `<month> <day>` regex support in `extractDate()` so inputs like `"oct 15 200 dinner"` properly resolve the date as `15 Oct` and amount as `₹200`.
- [x] **Cross-Device Deletion Sync (`sync.js`)**: Reconciled previously synced local items against `remoteActiveIds` so items deleted on another device or in Google Sheets are evicted locally on sync.
- [x] **Food Keyword Whitespace Typo (`parser.js`)**: Trimmed `' canteen'` to `'canteen'` in `DEFAULT_KEYWORDS.food`.
- [x] **Full JSON Backup & Restore (`app.js`, `parser.js`)**: Included `learnedKeywords` (`qe_learned_keywords_v1`) and `settings` (`currency`, `monthlyBudget`) in JSON export/import.

- [x] **Inline Addition Expressions (`parser.js`)**: Added support for inline math like `"120+80 lunch"` → `₹200`.
- [x] **Service Worker Cache Invalidation (`sw.js`)**: Bumped cache version to `dropspend-v2`.

---

## 5. Next Steps Checklist
- [x] Fix the 4 code audit items (`parser.js`, `sync.js`, `app.js`).
- [x] Add interactive "Going to be saved" parse output preview with inline quick-editing and post-save Undo/Edit.
- [x] Support inline addition expressions (`"120+80 lunch"`) and bump Service Worker cache (`dropspend-v2`).
- [x] Initialize Git repository (`git init`) and create initial commit on `main`.
- [ ] Push to a remote repository and deploy static files to **GitHub Pages** or **Cloudflare Pages** for HTTPS mobile home-screen installation.
- [ ] Set up the Google Sheet + Apps Script deployment and connect the Web App URL in DropSpend settings.
