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
| `app.js` | Core application logic, event listeners, modal handling, credit card calculations, utility bills tab rendering. |
| `spec-ui.js` | Midnight theme UI controller, navigation (`home`, `stats`, `history`, `settings`), settings toggles. |
| `insights.js` | Analytics calculations, utility bill cadence cycles (`computeUtilityBillStatus`, `getUtilityBillCurrentCycleKey`). |
| `sync.js` | 2-way sync engine for Google Sheets, local storage keys, data models (`UTILITY_BILLS_KEY`). |
| `google-apps-script.js` | Google Sheets backend handling `Expenses`, `Categories`, and `UtilityBills` sheets. |
| `native-bridge.js` | Android Kotlin/Capacitor bridge interface (haptics, widget snapshots, soft keyboard). |
| `android/.../MainActivity.kt` | Native Android activity, WebView config, widget bridge, asset loader. |
| `android/.../AndroidManifest.xml` | App manifest (permissions: `INTERNET`, `VIBRATE`). |

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

### C. Keyboard Auto-Popup Bug (Fixed)
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

## 6. Git Status & Active Constraints
- **Current Branch:** `main`
- **Latest Commit:** `9e276f3` (`fix: remove remote notification sync & fix aggressive touch keyboard popup bug`)
- **STRICT DIRECTIVE:** **DO NOT commit or push to git unless the user explicitly asks.**
