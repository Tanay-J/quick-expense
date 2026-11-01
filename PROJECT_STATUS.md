# DropSpend (Quick Expense Tracker) — Project Context & Status

**Project Path:** `/Users/tanayjoshi/Projects/quick-expense`  
**Last Updated:** November 1, 2026  
**Version:** v1.1 (Git repo initialized on `main`)  
**Architecture:** Local-First Progressive Web App (PWA) + 2-Way Google Sheets Cloud Sync (100% Free Forever)

---

## 1. Project Overview & Goals
- **Core Idea:** Log daily expenses with zero friction by dropping a single chat-like message (e.g., `"200 fuel bike"`, `"450 dinner with friends yesterday"`, or `"150 coffee, 80 auto, 1,200 groceries"`).
- **Zero Cost Forever ($0/month):**
  - Uses a fast (`<1ms`), offline deterministic + self-learning natural language parser (`parser.js`) instead of paid LLM API calls.
  - Uses `localStorage` + Service Worker (`sw.js`) for instant 0ms startup and offline logging.
  - Uses a personal **Google Sheet** + free **Google Apps Script Web App** (`google-apps-script.js`) as a 2-way cloud database and multi-device backup/restore layer.

---

## 2. File-by-File Architecture

| File | Size / Lines | Responsibility |
| :--- | :--- | :--- |
| `index.html` | 293 lines | Semantic HTML5 app shell, period navigation bar, KPI summary cards, category & 14-day trend panels, `<search>` filter, sticky chat input dock with interactive parse preview region, and native `<dialog>` modals for Cloud Sync/Settings and Edit Expense. |
| `styles.css` | 1,226 lines | Mobile-first dark-slate & emerald theme (`#0b1120` / `#10b981`), interactive `.parse-preview` & `.preview-edit-row` controls, accessible focus rings, `48px`–`52px` coarse-pointer tap targets, stacked category bar, CSS bar chart, and interactive action toasts. |
| `app.js` | 1,229 lines | Main UI controller, state management (`expenses`, `settings`, `draftItems`, `lastSavedIds`), interactive "Going to be saved" preview with inline editing & `Reset edits`, post-save `✎ Edit` / `↩ Undo & Edit in Bar` toast actions, KPI calculations, IME-safe `Enter` submission, CSV/JSON export & import, and background sync triggers. |
| `parser.js` | 402 lines | Offline natural language parser: `parseDraftMessage` + `parseExpenseMessage`, extracts amounts (`200`, `1,200`, `250.50`, `1.5k`, inline addition `120+80`, `₹200`, `rs 200`, `200/-`), relative/explicit dates (`today`/`aaj`, `yesterday`/`kal`, `parso`, `N days ago`, `last <weekday>`, `15 oct`, `oct 15`), infers categories across 9 categories, and learns custom keywords (`qe_learned_keywords_v1`). |
| `sync.js` | 334 lines | `localStorage` helpers (`qe_expenses_v1`, `qe_tombstones_v1`, `qe_settings_v1`), 2-way Google Sheets sync (`syncWithGoogleSheets`) with remote deletion reconciliation, embedded `GOOGLE_APPS_SCRIPT_CODE` for 1-click copy, and `exportToCSV`. |
| `google-apps-script.js` | 127 lines | Standalone Google Apps Script (`doGet` and `doPost` with `LockService`) that manages the `Expenses` sheet tab (`id, date, amount, category, note, raw, updatedAt, deleted`). |
| `manifest.json` | 18 lines | Standalone PWA Web App Manifest with embedded SVG `₹` icon. |
| `sw.js` | 51 lines | Offline-first Service Worker (`dropspend-v2`) caching static assets while bypassing `script.google.com` / `googleusercontent.com` API requests. |
| `README.md` | 116 lines | User guide, architecture rationale, local server instructions, Google Sheets setup steps, and status summary. |

---

## 3. What Is Completed & Working (v1.1)
1. **Chat-Style Expense Input & Interactive "Going to be Saved" Parse Preview:**
   - Typing in `#expense-input` immediately renders an interactive **"Going to be saved"** preview panel (`#parse-preview`) above the input bar.
   - Each parsed item displays inline-editable controls for **Amount** (`₹`), **Category** (`<select>` across all 9 categories), **Description / Note** (`<input>`), and **Date** (`<input type="date">` + readable day badge), plus a remove (`✕`) button for batch entries and a **Reset edits** button if customized.
   - Even if a message is typed without an amount (e.g. `"coffee starbucks yesterday"`), the preview shows the inferred category, cleaned note, and resolved date with a highlighted amount box ready to fill in.
   - Changing a category right inside the preview automatically calls `learnFromNote()` upon saving so DropSpend learns that keyword for future messages.
   - Post-save toast includes instant **`✎ Edit`** (opens the edit modal) and **`↩ Undo & Edit in Bar`** (reverts the save and restores the draft right back into the composer bar).
   - Supports batch entry in a single message via commas or newlines (while preserving commas inside numbers like `1,200`) and IME-safe `Enter` key handling across both the main input and inline preview fields.
2. **Self-Learning Category Engine:**
   - 9 built-in categories: `Food & Dining`, `Groceries`, `Transport & Fuel`, `Bills & Utilities`, `Shopping`, `Health & Fitness`, `Entertainment`, `Personal & Home`, `Other`.
   - Editing any expense's category calls `learnFromNote(newNote, newCategory)`, saving the note's words into `localStorage` (`qe_learned_keywords_v1`) so future expenses with those words are categorized automatically.
3. **Analytics Dashboard & Filtering:**
   - Filter by **Month** (with previous/next month buttons), **Last 7D**, or **All Time**.
   - **KPI Cards:** Total Spent, optional Monthly Budget progress bar (changes hue at >75% and >90%), Daily Average + Month Pace projection, and Top Category.
   - **Interactive Category Breakdown:** Stacked distribution bar + clickable category rows to filter the expense list.
   - **14-Day Daily Activity Chart:** Bar chart anchored to today (or the end of the selected past month).
   - **Search & Edit:** Instant text search across notes, raw input, category names, and amounts; native `<dialog>` modal to edit or delete entries.
4. **Offline Persistence & Cloud Backup:**
   - Saves immediately to `localStorage` and queues background sync (`triggerBackgroundSync`).
   - Automatically retries sync when the browser fires the `online` event.
   - 1-click CSV export and JSON backup/restore.

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
