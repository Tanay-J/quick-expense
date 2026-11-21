# DropSpend — AI Agent Context Checkpoint

> **Quick Context Loader:** Read this single file to restore 100% project context with minimal token overhead.  
> **Last Updated:** 2026-11-21  
> **Rule:** NEVER commit or push to git unless explicitly requested by the user.

---

## 1. Project Overview & Architecture
- **Name:** DropSpend (`app.dropspend.tracker`)
- **Location:** `/Users/tanayjoshi/Projects/quick-expense`
- **Stack:** Local-first vanilla PWA + lightweight native Android APK (~2.2 MB) wrapping Android WebView with Kotlin bridge (`MainActivity.kt`).
- **Data Model:** `localStorage` for 0ms offline access + 2-way synchronization to Google Sheets via Google Apps Script webhook (`sync.js` & `google-apps-script.js`).
- **OTA Updates:** Web assets (`index.html`, `styles.css`, `app.js`, `spec-ui.js`, `sync.js`, `insights.js`) auto-sync silently from GitHub `main` via `WebViewAssetLoader` and GitHub Actions.

---

## 2. Key File Directory & Responsibilities
| File | Responsibility |
|------|----------------|
| `app.js` | Core application logic, event listeners, modal handling, credit card calculations, utility bills tab rendering, custom taxonomy CRUD modal (`#taxonomy-dialog`), launch/resume due-date notifications (`checkAndFireAllDueNotifications`). |
| `spec-ui.js` | Midnight theme UI controller (`home`, `stats`, `history`, `settings`), inline month switcher, combinable History category filter chips, bilingual (`English` \| `मराठी`) UI localization (`t()`, `getMonthFull()`, `getMonthShort()`). |
| `parser.js` | Offline natural-language parser (English + Marathi Devanagari + Roman Marathi "Minglish"), Devanagari digit normalization (`०`–`९`), custom taxonomy state (`qe_custom_taxonomy_v1`), split shorthand (`/3`, `split 3`), type-based credit card shorthand (`amazoncc`, `hdfccc`, etc.), `family_paid` mode (`💝 Paid by Family / Others`), localized display name helpers (`getCategoryDisplayName`, `getPaymentDisplayName`). |
| `insights.js` | Analytics calculations, utility bill cadence cycles (`computeUtilityBillStatus`, `getUtilityBillCurrentCycleKey`), Monthly Wrapped Recaps, 90-day patterns, question query evaluator. |
| `sync.js` | 2-way sync engine for Google Sheets, `localStorage` keys (`qe_expenses_v1`, `qe_settings_v1`, `qe_utility_bills_v1`), `isRentExpense()` (English + Marathi), `isFamilyPaidExpense()`. |
| `google-apps-script.js` | Google Sheets backend handling `Expenses`, `Categories`, `UtilityBills`, and `UsageStats` sheets. |
| `native-bridge.js` | Android Kotlin/Capacitor bridge interface (haptics, memoized widget snapshots, 7-day cooldown OTA update checks, soft keyboard). |
| `sw.js` | Service Worker (`dropspend-v35`) using stale-while-revalidate caching + `notificationclick` handler for due-date alerts. |
| `android/.../MainActivity.kt` | Native Android activity, WebView lifecycle (`onPause`/`pauseTimers` after 3s grace, `onResume`/`resumeTimers`, `onDestroy`), widget bridge, 7-day cooldown GitHub OTA sync. |
| `android/.../AndroidManifest.xml` | App manifest (permissions: `INTERNET`, `VIBRATE`, `POST_NOTIFICATIONS`). |

---

## 3. Recently Implemented & Tested Features

### A. Multi-Cadence Utility Bills Reminders Hub (Screen 2)
- **User Requirement:** Keep Home screen clean (no banners/clutter). Dedicated hub for utility bills with varied cadences (Monthly e.g. Electricity, Bi-Monthly e.g. Piped Gas, Yearly e.g. Property Tax).
- **Location:** Integrated as 3rd tab in `#recurring-dialog` (accessed via Settings → "Utility bills & credit cards" or direct modal call).
- **Features:** Summary metrics (due this month, annual total), cadence filter pills, paid/unpaid cycle tracking, inline "+ Add Utility Bill" form, and 2-way Google Sheets backup (`UtilityBills` sheet tab).

### B. Custom Categories & Payment Modes Manager + Exclude Rent on Home + OTA Due Notifications
- **Custom Taxonomy Manager (`#taxonomy-dialog`):** Users can add, edit, or delete Expense Categories, Income Categories, and Payment Modes (icon, full name, short pill label, chart color, and auto-detect keywords) from Settings → MONEY, Edit Entry sheet, or Cloud Sync modal. Saved in `qe_custom_taxonomy_v1`, synced with Google Sheets & JSON backup, and live-wired into the natural-language parser (`parser.js`).
- **Exclude Rent on Home (`excludeRentOnHome`):** Toggle in Settings → MONEY to exclude rent entries (`isRentExpense` in `sync.js`) from the Home hero total, budget ring %, Home category stacked bar, Home day cards, Receipt ledger, and Android widget, while showing a clean muted subtext line (`Excludes ₹20,000 rent`) under the budget line in the Hero card. History and Stats retain all entries.
- **0% Background Battery OTA Due-Date Notifications (`checkAndFireAllDueNotifications` in `app.js` & `sw.js`):** Fires once-per-day system notifications on app launch/resume for due/overdue Utility Bills, Credit Cards, and Monthly Recurring rules, with tap-to-open navigation straight to the corresponding tab in `#recurring-dialog` and a `Test 🔔` button in the Utility Bills tab.
- **Battery & Radio Optimizations (`MainActivity.kt`, `widget_info.xml`, `native-bridge.js`, `sw.js`, `app.js`):**
  1. `MainActivity.onPause()` pauses the WebView + freezes JS timers after a 3s sync grace period (0% background CPU).
  2. Widget `updatePeriodMillis` increased from 30m to 6h (92% fewer background wakeups).
  3. `syncWidgetSnapshot()` memoized by data signature so UI tab switches don't re-broadcast `ACTION_APPWIDGET_UPDATE`.
  4. Automatic GitHub OTA checks throttled to a 7-day cooldown (manual check in Settings remains instant).
  5. Service Worker (`dropspend-v34`) switched to stale-while-revalidate and `trackAppUsage` restricted to once per launch.
- **UX & Natural-Language Enhancements (`parser.js`, `spec-ui.js`, `sync.js`, `styles.css`):**
  1. **Split Expense Shorthand:** `"1200 dinner /3"` or `"900 cab split 2"` logs your share (`₹400` / `₹450`) and appends `(₹1,200 ÷ 3)` to the note.
  2. **Type-Based Specific Credit Card Shorthand:** Supports concatenated/spaced card names (`amazoncc`, `apaycc`, `hdfccc`, `icicicc`, `sbicc`, `axiscc`, `flipkartcc`, `kotakcc`, `onecard`, `amex`, or `<custom>cc`), displaying `💳 HDFC CC` in the live preview chip and attributing spend to that card's billing cycle.
  3. **`💝 Paid by Family / Others` Payment Mode (`family_paid`):** Auto-detected from `"paid by mom"`, `"by aai"`, `"by dad"`, `"sponsored"`, etc. Keeps the true item category (`Shopping`, `Food`, `Health`) while excluding the amount from the Home monthly spend ring, Home category bar, and Android widget (with quiet `Excludes ₹X paid by family` subtext on Home).
  4. **Home Hero Inline Month Switcher:** `‹ NOVEMBER ›` arrows + `Nov ↺` jump-to-today pill directly inside the Home Hero card.
  5. **History Combinable Category + Payment Mode Filter Chips:** Second scrollable category chip row in History that intersects with the payment mode chip row.

### C. Marathi Language Support — Level 1 (Parser) + Level 2 (Optional Bilingual UI Toggle) (`bb5bad0`)
- **0.00% Battery Impact & Zero Default Visual Change:** Default `settings.lang` is `'en'`. In English mode, the UI is 100% unchanged except for the `Language / भाषा` (`English` | `मराठी`) pill switch under **Settings → LOOK & LANGUAGE** (and in `#sync-dialog`).
- **Level 1 — Marathi Devanagari & Roman Marathi ("Minglish") Input Parser (`parser.js`, `sync.js`):**
  - Always active in both `English` and `मराठी` UI modes.
  - Normalizes Devanagari digits (`०१२३४५६७८९` → `0123456789`) via `normalizeDevanagariDigits()` before parsing amounts, splits, dates, or queries.
  - Supports Marathi & Minglish keywords across all Expense & Income categories (`भाजी`/`bhaji`, `चहा`/`chaha`, `नाश्ता`/`nashta`, `जेवण`/`jevan`, `वडापाव`/`vadapav`, `पोहे`/`pohe`, `मिसळ`/`misal`, `किराणा`/`kirana`, `दूध`/`dudh`, `फळे`/`phale`, `रिक्षा`/`riksha`, `पेट्रोल`, `गाडी`/`gadi`, `घरभाडे`/`भाडे`/`bhade`, `लाईट बिल`/`light bill`, `कामवाली`/`kamwali`, `औषध`/`aushadh`, `दवाखाना`/`davakhana`, `कपडे`/`kapde`, `पगार`/`pagar`, `बोनस`, `परतावा`/`partava`, `आहेर`/`aher`).
  - Supports Marathi dates (`आज`/`aaj`, `काल`/`kal`, `परवा`/`parva`, `N दिवसापूर्वी`) and payment modes (`रोख`/`rokh`, `कार्ड`/`क्रेडिट कार्ड`, `बँक`, `आईने दिले`/`aai ne dile`/`बाबांनी दिले`/`घरच्यांनी दिले` → `family_paid`).
  - `isRentExpense()` in `sync.js` recognizes Marathi house rent (`घरभाडे`, `भाडे`, `ghar bhade`, `bhade`) while excluding vehicle rentals (`गाडी भाडे`, `gadi bhade`).
- **Level 2 — Bilingual UI Toggle (`English` | `मराठी`) (`spec-ui.js`, `parser.js`, `sync.js`, `index.html`, `app.js`):**
  - Toggling `मराठी` translates bottom navigation (`मुख्य`, `इतिहास`, `आकडेवारी`, `सेटिंग्ज`), Home greeting (`नमस्कार <Name>`), Marathi month switcher (`नोव्हेंबर`), budget ring & subtexts (`₹३०,००० पैकी ₹११,५८० शिल्लक`, `₹२०,००० घरभाडे वगळून`), Add/Keypad overlay, History headers, Stats tabs, and Settings screen.
  - **Categories & Payment Modes stay in English (`Food`, `Groceries`, `Transport`, `Bills`, `UPI`, `Cash`, `Credit Card`, `Family`):** Both in stored data (`item.category` / `item.paymentMethod`) and on UI chips/charts/stats so analytics, charts, CSV exports, and Google Sheets data processing stay 100% consistent and compact.

### D. Keyboard Auto-Popup Bug (Fixed)
- **Bug:** Touching/tapping anywhere on the screen opened the mobile keyboard.
- **Root Cause:** Aggressive `handleQuickLogSurfaceTap` listener on `document.addEventListener('touchend')` in `app.js`, plus forced `showSoftInput` in `MainActivity.kt:onPageFinished`.
- **Fix:** Completely removed the global surface tap handler and background focus hooks. Keyboard now only opens when the user intentionally taps an input or "+ Add".

---

## 4. Shelved / Archived Feature: Remote Utility Notification Sync

- **What it is:** Android background `NotificationListenerService` to capture whitelisted utility app notifications and batch-upload them 4x daily to Google Sheets.
- **Why shelved:** Google Play Protect hard-blocks sideloaded APKs containing `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` signed with ephemeral CI keys.
- **Current Codebase State:**
  - `FEATURE_REMOTE_NOTIF_SYNC = false` in `sync.js`.
  - UI toggle completely hidden in `spec-ui.js`.
  - `BIND_NOTIFICATION_LISTENER_SERVICE` and `<service>` declaration removed from `AndroidManifest.xml`.
  - `MainActivity.kt` cleaned of worker scheduling and unused notification bridge methods.
- **Where Archived Code is Preserved:**
  - Directory: [`/Users/tanayjoshi/Projects/quick-expense/archive/remote-notification-sync/`](file:///Users/tanayjoshi/Projects/quick-expense/archive/remote-notification-sync/)
  - Files: `DropSpendNotificationService.kt`, `NotificationSyncWorker.kt`, and `README.md` (restoration guide).

---

## 5. Play Protect & APK Installation Context
- **Why the user saw "blocked":**
  1. GitHub Actions takes ~2–3 minutes to build and package the APK (`gradle assembleRelease` + R8 minification).
  2. If the user downloads before the CI job finishes, they receive the old APK from the previous release.
  3. If updating over an existing install, Android blocks due to keystore signature mismatch between ephemeral GitHub Actions runners (requires uninstalling old app first).
- **Permanent Solution when ready:** Add a permanent base64-encoded `debug.keystore` or `release.keystore` to GitHub Secrets so every build has the exact same signing certificate.

---

## 6. Technical Invariants & Gotchas for Future Edits
- **Home View Cache Signature (`lastHomeSignature` in `spec-ui.js`):** `spec-ui.js` caches the `#spec-view-home` DOM and only re-renders when `homeSig` changes. Any new setting or total that affects Home rendering (such as `settings.lang`, `settings.excludeRentOnHome`, `familyPaidTotal`, taxonomy edits) **must** be included in `homeSig`.
- **Devanagari Unicode Regexes in `parser.js`:**
  - Standard JS `\b` only matches ASCII `[a-zA-Z0-9_]`. Always use `(?:^|\s)` and `(?=\s|$)` boundaries for Devanagari tokens.
  - Devanagari vowel signs/matras (`ा`, `ि`, `ी`, `ु`, `ू`, `े`, `ै`, `ो`, `ौ`, `ं`, `्`) are Unicode Combining Marks (`\p{M}`), not `\p{L}`. Any regex stripping punctuation from words must preserve `\p{M}`: `/[^\p{L}\p{M}\p{N}\s&]/gu`.
- **Service Worker Cache Version (`sw.js`, `index.html`, `app.js`, `spec-ui.js`, `sync.js`):** Currently at `dropspend-v35` (`?v=35`). Bump when modifying static JS/CSS so OTA & PWA caches refresh cleanly.
- **Git in macOS Sandbox:** Invoke `/Library/Developer/CommandLineTools/usr/bin/git` directly (bare `git` hits an `xcode-select` sandbox symlink error) and stage explicit file names (`git add <file1> <file2>`) rather than `git add -A`.

---

## 7. Git Status & Active Constraints
- **Current Branch:** `main`
- **Latest Pushed Commit on `origin/main`:** `bb5bad0` (`feat: add Marathi & Minglish parser support and optional Marathi UI toggle`)
- **STRICT DIRECTIVE:** **DO NOT commit or push to git unless the user explicitly asks.**
