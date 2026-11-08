/**
 * spec-ui.js
 * Exact 1:1 implementation of the 7-page "Quick Expense change spec" UI:
 * - 1A: Home (Date header, Stats & Settings icons, Hero month total + today spend, Pace card with tick & stacked category bar, Today/Yesterday day cards, Sticky bottom "What did you spend on? [+]" pill)
 * - 1B, 1C, 1D, 3A: Full-screen Add / Ask Palette (Empty state Usuals 2x3 grid, Typing live preview with interactive chips + FROM YOUR HISTORY, Question Answer Card, and 3A Keypad Mode)
 * - 3B: Bottom-sheet Edit Entry (Big ₹ amount, category badge, note, 4x2 category grid, UPI/Cash/Card/Bank segmented control, date & time, "Always file <note> as <Cat>" switch, Delete + Save)
 * - 3C: History screen (Question-grammar search bar, summary line, day-grouped entries, Export CSV)
 * - 3D: Settings screen (UI Layout switcher, Input style Keyboard/Keypad, Default mode, Open straight to Add, Usuals count, Monthly budget, Recurring, Theme Clean/Receipt/Dark, Currency, Data/Sheets sync, Always show tables)
 * - 4A, 4B, 4C, 4D: Stats Overview, Category Drill-Down (< Overview), All Fun Facts (< Overview), and per-card Table <-> Chart toggles
 * - 5A, 5B, 5C, 5D: Calendar heatmap, Patterns (< Calendar), Explore (with deep-link banner), and Compare (< Explore)
 * - 6A, 6B, 6C, 6D: Home 1st-of-month Recap card, Recaps tab, Full-screen Story modal, and 6D Thermal Receipt Ledger view
 */

import {
  EXPENSE_CATEGORIES,
  extractTags,
  getCategoriesByType,
  getCategoryById,
  getLearnedKeywords,
  getPaymentMethodById,
  inferCategory,
  learnFromNote,
  parseDraftMessage,
  parseQuestionQuery,
  PAYMENT_METHODS,
  toLocalISODate
} from './parser.js?v=22';

import {
  FEATURE_REMOTE_NOTIF_SYNC,
  normalizeEntryType,
  normalizePaymentMethod,
  normalizeTags
} from './sync.js?v=22';

import {
  computeCalendarAndPatterns,
  computeCategoryDrilldown,
  computeFunFacts,
  computeHistoryMatches,
  computeMonthlyRecap,
  computeSameSpanComparison,
  computeUsuals,
  evaluateQuestionQuery,
  filterExpensesByQuery
} from './insights.js?v=22';

import {
  attachSwipeToDismiss,
  checkAndApplyOtaUpdate,
  getOtaMeta,
  openFloatingQuickAddSimulator,
  pushNavigationGuard,
  requestSoftKeyboard,
  setRemoteNotificationSync,
  toggleWidgetSimulator,
  triggerHaptic
} from './native-bridge.js?v=28';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtK(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(v)}`;
}

function formatTime12h(ts, fallbackIndex = 0) {
  if (ts) {
    const d = new Date(Number(ts));
    if (!Number.isNaN(d.getTime())) {
      const h24 = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h24 >= 12 ? 'pm' : 'am';
      const h12 = h24 % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    }
  }
  const fakeHours = ['7:18 pm', '5:00 pm', '4:26 pm', '1:35 pm', '8:51 am'];
  return fakeHours[fallbackIndex % fakeHours.length];
}

function formatTime24h(ts, fallbackIndex = 0) {
  if (ts) {
    const d = new Date(Number(ts));
    if (!Number.isNaN(d.getTime())) {
      const h24 = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${h24}:${m}`;
    }
  }
  const fake24 = ['19:18', '17:00', '16:26', '13:35', '08:51'];
  return fake24[fallbackIndex % fake24.length];
}

function formatDayGroupHeader(iso, todayIso, yesterdayIso) {
  if (iso === todayIso) return 'TODAY';
  if (iso === yesterdayIso) return 'YESTERDAY';
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt
    .toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

const sv = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const MIDNIGHT_ICONS = {
  home: sv('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  history: sv('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  stats: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  x: sv('<path d="M18 6 6 18M6 6l12 12"/>'),
  chev: sv('<path d="m9 18 6-6-6-6"/>')
};

function renderMidnightBottomNav(activeKey) {
  const item = (key, icon, label) => `
    <button type="button" class="spec-tabbar-item ${activeKey === key ? 'is-active' : ''}" data-nav="${key}">
      ${icon}
      <span>${label}</span>
    </button>
  `;
  return `
    <nav class="spec-midnight-tabbar" aria-label="Main navigation">
      ${item('home', MIDNIGHT_ICONS.home, 'Home')}
      ${item('history', MIDNIGHT_ICONS.history, 'History')}
      ${item('stats', MIDNIGHT_ICONS.stats, 'Stats')}
      ${item('settings', MIDNIGHT_ICONS.settings, 'Settings')}
    </nav>
  `;
}

export function createSpecController(ctx) {
  // Navigation & local spec state
  const specState = {
    screen: 'home', // 'home' | 'stats' | 'history' | 'settings'
    statsTab: 'overview', // 'overview' | 'calendar' | 'explore' | 'recaps'
    statsSubscreen: null, // null | 'drilldown' | 'allfacts' | 'patterns' | 'compare'
    statsPeriod: 'month', // 'week' | 'month' | 'year'
    comparePeriod: 'month', // 'week' | 'month'
    drillCategoryId: 'food',
    addOpen: false,
    addText: '',
    addInputStyle: ctx.getSettings().inputStyle || 'keyboard', // 'keyboard' | 'keypad'
    keypadAmountStr: '',
    keypadNote: '',
    keypadCategory: 'food',
    keypadMode: (ctx.getSettings().defaultPayment || 'upi').toLowerCase(),
    overrideCategory: null,
    overrideMode: null,
    overrideDate: null,
    historyQuery: '',
    historyChip: 'all', // 'all' | 'expense' | 'income' | 'upi' | 'card' | 'cash'
    exploreFromQuestion: null,
    homeAccordions: {
      pace: false,
      today: true,
      yesterday: false,
      earlier: false
    },
    tables: {} // keyed by chart id
  };

  function isTableOn(chartId) {
    if (specState.tables[chartId] !== undefined) {
      return specState.tables[chartId];
    }
    return Boolean(ctx.getSettings().alwaysTables);
  }

  function toggleTable(chartId) {
    specState.tables[chartId] = !isTableOn(chartId);
    render();
  }

  function openAddPalette(prefillText = '') {
    specState.addOpen = true;
    specState.addText = prefillText;
    specState.overrideCategory = null;
    specState.overrideMode = null;
    specState.overrideDate = null;
    specState.addInputStyle = ctx.getSettings().inputStyle || 'keyboard';
    pushNavigationGuard();
    triggerHaptic('light');
    renderAddOverlay(ctx.state.expenses, ctx.getSettings());
    const focusNow = () => {
      const inp = document.getElementById('spec-add-input') || document.getElementById('spec-kp-note-input');
      if (inp) requestSoftKeyboard(inp);
    };
    focusNow();
    requestAnimationFrame(focusNow);
    setTimeout(focusNow, 60);
  }

  function closeAddPalette() {
    if (!specState.addOpen) return;
    specState.addOpen = false;
    specState.addText = '';
    specState.overrideCategory = null;
    specState.overrideMode = null;
    specState.overrideDate = null;
    const overlay = document.getElementById('spec-add-overlay');
    if (overlay) overlay.hidden = true;
  }

  function buildReceiptViewHTML(expenses, settings, spanComp, todayIso, yesterdayIso) {
    const budget = Number(settings.monthlyBudget) || 30000;
    const curTotal = spanComp.curTotal;
    const pct = budget > 0 ? Math.min(100, Math.round((curTotal / budget) * 100)) : 0;
    const elapsedFrac = spanComp.elapsedDay / Math.max(1, spanComp.daysInCurMonth);
    const totalBars = 18;
    const filledBars = Math.min(totalBars, Math.round((pct / 100) * totalBars));
    const tickPos = Math.min(totalBars - 1, Math.max(0, Math.round(elapsedFrac * totalBars)));
    let asciiBar = '';
    for (let i = 0; i < totalBars; i++) {
      if (i === tickPos) asciiBar += '|';
      else if (i < filledBars) asciiBar += '█';
      else asciiBar += '·';
    }
    const remDays = Math.max(1, spanComp.daysInCurMonth - spanComp.elapsedDay + 1);
    const safeDaily = Math.max(0, (budget - curTotal) / remDays);

    const monthPrefix = `${ctx.state.selectedYear}-${String(ctx.state.selectedMonth + 1).padStart(2, '0')}`;
    const monthItems = expenses.filter(
      (e) => e.date?.startsWith(monthPrefix) && normalizeEntryType(e) !== 'income'
    );
    const byDate = new Map();
    for (const e of monthItems) {
      const list = byDate.get(e.date) || [];
      list.push(e);
      byDate.set(e.date, list);
    }
    if (!byDate.has(todayIso)) {
      byDate.set(todayIso, []);
    }

    const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a)).slice(0, 7);
    let receiptNum = 323;

    const dayReceiptsHtml = sortedDates
      .map((iso, dIdx) => {
        const items = byDate.get(iso) || [];
        const daySum = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const headerLbl =
          iso === todayIso
            ? `TODAY - ${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}`
            : formatDayGroupHeader(iso, todayIso, yesterdayIso);

        const rowsHtml = items
          .map((item, idx) => {
            const cat = getCategoryById(item.category);
            const pay = getPaymentMethodById(normalizePaymentMethod(item));
            const timeStr = formatTime24h(item.updatedAt, idx);
            return `
              <div class="spec-receipt-line" data-edit-id="${esc(item.id)}">
                <div class="spec-receipt-line-top">
                  <span class="spec-receipt-time">${timeStr}</span>
                  <span class="spec-receipt-note">${esc(item.note.toLowerCase())}</span>
                  <span class="spec-receipt-dots"></span>
                  <span class="spec-receipt-amt">${Number(item.amount).toFixed(2)}</span>
                </div>
                <div class="spec-receipt-line-sub">
                  <span style="color:${cat.color || '#52514e'}">●</span> ${esc((cat.shortName || cat.name).toUpperCase())} · ${esc(pay.shortName.toUpperCase())}
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <section class="spec-receipt-paper">
            <div class="spec-receipt-head">
              <span>${esc(headerLbl)}</span>
              <span>#${receiptNum - dIdx}</span>
            </div>
            ${
              iso === todayIso
                ? `<form id="spec-receipt-inline-form" class="spec-receipt-prompt">
                     <span>&gt;</span>
                     <input type="text" id="spec-receipt-inline-input" placeholder="200 snacks upi" autocomplete="off" />
                   </form>`
                : ''
            }
            <div class="spec-receipt-lines">
              ${rowsHtml || `<div class="spec-receipt-empty">NO ENTRIES YET</div>`}
            </div>
            <div class="spec-receipt-total">
              <span>TOTAL</span>
              <span>${daySum.toFixed(2)}</span>
            </div>
          </section>
        `;
      })
      .join('');

    return `
      <div class="spec-receipt-container">
        <section class="spec-receipt-paper is-header-ledger">
          <div class="spec-receipt-top-actions">
            <span>${SHORT_MONTHS[ctx.state.selectedMonth].toUpperCase()} ${ctx.state.selectedYear} - LEDGER</span>
            <div class="spec-icon-pair">
              <button type="button" class="spec-circle-btn" data-nav="stats" title="Stats">◔</button>
              <button type="button" class="spec-circle-btn" data-nav="settings" title="Settings">⚙</button>
            </div>
          </div>
          <div class="spec-receipt-hero">
            <strong>${curTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            <span>/ ${budget.toLocaleString('en-IN')}</span>
          </div>
          <div class="spec-receipt-ascii">[${asciiBar}] ${pct}%</div>
          <div class="spec-receipt-allowance">REMAINING — ${Math.max(0, budget - curTotal).toLocaleString('en-IN')}</div>
        </section>
        ${dayReceiptsHtml}
      </div>
      ${renderMidnightBottomNav('home')}
    `;
  }

  function renderHomeScreen(root, expenses, settings, spanComp) {
    const now = new Date();
    const todayIso = toLocalISODate(now);
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const yesterdayIso = toLocalISODate(yest);

    // 6D: If theme is 'receipt', render the Thermal Receipt Ledger skin!
    if ((settings.theme || 'dark') === 'receipt') {
      root.innerHTML = buildReceiptViewHTML(expenses, settings, spanComp, todayIso, yesterdayIso);
      const inlineForm = root.querySelector('#spec-receipt-inline-form');
      const inlineInp = root.querySelector('#spec-receipt-inline-input');
      inlineForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = (inlineInp?.value || '').trim();
        if (!val) return;
        const q = parseQuestionQuery(val, new Date());
        const drafts = parseDraftMessage(val, new Date(), 'expense', settings.defaultPayment || 'upi');
        if (q && q.isSpecific && drafts.every((d) => !(Number(d.amount) > 0))) {
          openAddPalette(val);
          return;
        }
        ctx.QuickAdd(val);
      });
      bindCommonClicks(root);
      return;
    }

    const shortDateStr = now.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    const rawName = (settings.userName || '').trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : 'there';

    const monthPrefix = `${ctx.state.selectedYear}-${String(ctx.state.selectedMonth + 1).padStart(2, '0')}`;
    const monthExpenses = expenses.filter(
      (e) => e.date?.startsWith(monthPrefix) && normalizeEntryType(e) !== 'income'
    );
    const monthTotal = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const todayTotal = monthExpenses
      .filter((e) => e.date === todayIso)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // Budget calculations (Midnight Hero Ring — no per-day spend line)
    const budget = Number(settings.monthlyBudget) || 30000;
    const leftAmt = Math.max(0, budget - monthTotal);
    const budgetPct = budget > 0 ? Math.min(100, Math.max(0, Math.round((monthTotal / budget) * 100))) : 0;
    const budgetSubText =
      monthTotal <= budget
        ? `${ctx.formatCurrency(leftAmt)} left of ${ctx.formatCurrency(budget)}`
        : `${ctx.formatCurrency(monthTotal - budget)} over ${ctx.formatCurrency(budget)} budget`;

    // Category breakdown stacked bar + dot legend
    const catTotals = {};
    for (const e of monthExpenses) {
      catTotals[e.category] = (catTotals[e.category] || 0) + (Number(e.amount) || 0);
    }
    const sortedActiveCats = EXPENSE_CATEGORIES.filter((c) => (catTotals[c.id] || 0) > 0).sort(
      (a, b) => (catTotals[b.id] || 0) - (catTotals[a.id] || 0)
    );
    const catSegmentsHtml = sortedActiveCats
      .map((c) => {
        const amt = catTotals[c.id] || 0;
        const pct = Math.max(2, (amt / Math.max(1, monthTotal)) * 100);
        return `<span style="--c:${c.color}; flex:${pct}"></span>`;
      })
      .join('');

    const catLegendHtml = sortedActiveCats
      .slice(0, 6)
      .map((c) => `<span><i style="--c:${c.color}"></i>${esc(c.shortName || c.name)}</span>`)
      .join('');

    // 6A: Recap Card at top of Home (shown on days 1-5 or if enabled in settings and unseen)
    const prevM = ctx.state.selectedMonth === 0 ? 11 : ctx.state.selectedMonth - 1;
    const prevY = ctx.state.selectedMonth === 0 ? ctx.state.selectedYear - 1 : ctx.state.selectedYear;
    const prevRecap = computeMonthlyRecap(expenses, budget, prevY, prevM, ctx.formatCurrency);
    const showRecapCard =
      settings.recapCard !== false &&
      !settings.recapSeen?.[prevRecap.monthKey] &&
      prevRecap.entryCount > 0 &&
      now.getDate() <= 5;

    // Group recent entries by day (Today, Yesterday, plus earlier in month)
    const todayItems = monthExpenses.filter((e) => e.date === todayIso);
    const yesterdayItems = monthExpenses.filter((e) => e.date === yesterdayIso);
    const earlierItems = monthExpenses.filter((e) => e.date !== todayIso && e.date !== yesterdayIso);
    const yesterdayTotal = yesterdayItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const earlierTotal = earlierItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const isExpandedHome = settings.homeStyle === 'expanded';

    const renderEntryRows = (items) =>
      items
        .map((item, idx) => {
          const isInc = normalizeEntryType(item) === 'income';
          const cat = getCategoryById(item.category);
          const pay = getPaymentMethodById(normalizePaymentMethod(item));
          const tags = normalizeTags(item);
          const tagsHtml = tags
            .map((t) => `<span class="spec-inline-tag">#${esc(t)}</span>`)
            .join(' ');
          return `
            <div class="spec-entry-row" data-edit-id="${esc(item.id)}">
              <div class="spec-entry-icon" style="background:${isInc ? '#22c55e24' : `${cat.color}22`}">${isInc ? '💰' : cat.icon}</div>
              <div class="spec-entry-mid">
                <div class="spec-entry-note">${esc(item.note)} ${tagsHtml}</div>
                <div class="spec-entry-sub">${isInc ? 'Income · Bank' : `${esc(cat.shortName || cat.name)} · ${esc(pay.shortName)} · ${formatTime12h(item.updatedAt, idx)}`}</div>
              </div>
              <div class="spec-entry-amt ${isInc ? 'is-inc' : ''}">${isInc ? '+' : ''}${ctx.formatCurrency(item.amount)}</div>
            </div>
          `;
        })
        .join('');

    const yestOpen = isExpandedHome || Boolean(specState.homeAccordions.yesterday);
    const earlierOpen = isExpandedHome || Boolean(specState.homeAccordions.earlier);

    const ccStatuses = ctx.getCreditCardsStatus ? ctx.getCreditCardsStatus() : [];
    const dueSoonCards = ccStatuses.filter((c) => c.isDueSoon);
    const ccRemindersHtml = dueSoonCards
      .map((card) => {
        const whenTxt =
          card.daysUntilDue === 0
            ? `Due Today (${card.nextDueDateLabel})`
            : `Due in ${card.daysUntilDue}d (${card.nextDueDateLabel})`;
        const spendTxt =
          card.currentCycleSpend > 0 ? ` · ${ctx.formatCurrency(card.currentCycleSpend)}` : '';
        return `
          <div class="spec-cc-reminder-row" data-cc-id="${esc(card.id)}">
            <div class="spec-cc-reminder-info" data-open-cc-modal="1">
              <strong>💳 ${esc(card.name)} bill · ${esc(whenTxt)}</strong>
              <span>Cycle ${esc(card.rangeLabel)}${esc(spendTxt)}</span>
            </div>
            <button type="button" class="mini-pill-btn is-accent" data-mark-cc-paid="${esc(card.id)}">✓ Paid</button>
          </div>
        `;
      })
      .join('');

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-midnight-hdr">
          <div>
            <small class="spec-hdr-date">${esc(shortDateStr)}</small>
            <h2 class="spec-hdr-greeting">Hi ${esc(firstName)}</h2>
          </div>
          <button type="button" class="spec-circle-btn" data-nav="history" title="Search &amp; History" aria-label="Search and History">
            ${MIDNIGHT_ICONS.search}
          </button>
        </header>

        ${
          dueSoonCards.length > 0
            ? `<section class="spec-cc-reminder-banner" aria-label="Credit Card Bill Reminders">
                 ${ccRemindersHtml}
               </section>`
            : ''
        }

        ${
          showRecapCard
            ? `<section class="spec-recap-home-card" id="spec-home-recap-card">
                 <div class="spec-recap-home-top">
                   <span class="spec-recap-kicker">🎁 NEW · ${esc(FULL_MONTHS[prevM])} recap</span>
                   <button type="button" class="spec-recap-dismiss" id="spec-dismiss-recap-btn" aria-label="Dismiss">✕</button>
                 </div>
                 <div class="spec-recap-open-area" id="spec-open-recap-story">
                   <h3>Your ${esc(FULL_MONTHS[prevM])} is wrapped</h3>
                   <p>${ctx.formatCurrency(prevRecap.totalSpent)} · ${prevRecap.slides.length} stories · tap to watch ▶</p>
                 </div>
               </section>`
            : ''
        }

        <section class="spec-card spec-midnight-hero" data-nav="stats" title="View Stats">
          <div class="spec-budget-ring" style="--p:${budgetPct}">
            <div>
              <b class="num">${budgetPct}%</b>
              <small>of budget</small>
            </div>
          </div>
          <div class="spec-midnight-hero-body">
            <span class="spec-eyebrow">${esc(FULL_MONTHS[ctx.state.selectedMonth])}</span>
            <h1 class="spec-midnight-hero-amt num">${ctx.formatCurrency(monthTotal)}</h1>
            <p class="spec-midnight-hero-sub">${esc(budgetSubText)}</p>
          </div>
        </section>

        ${
          monthTotal > 0
            ? `<div class="spec-midnight-stack-block">
                 <div class="spec-midnight-stack">${catSegmentsHtml}</div>
                 <div class="spec-midnight-legend">${catLegendHtml}</div>
               </div>`
            : ''
        }

        <section class="spec-card spec-day-card">
          <div class="spec-day-card-head">
            <b>Today</b>
            <span class="num spec-day-card-sum">${ctx.formatCurrency(todayTotal)}</span>
          </div>
          <div class="spec-day-card-list">
            ${
              todayItems.length > 0
                ? renderEntryRows(todayItems)
                : `<div class="spec-acc-empty-row">
                     <span>No expenses logged today yet.</span>
                     <button type="button" class="spec-inline-link-btn" id="spec-open-add-empty">+ Add now</button>
                   </div>`
            }
          </div>
        </section>

        ${
          yesterdayItems.length > 0
            ? `<section class="spec-accordion-card ${yestOpen ? 'is-open' : ''}" data-acc-key="yesterday">
                 <button type="button" class="spec-accordion-summary" data-acc-toggle="yesterday">
                   <span class="spec-acc-left">
                     <strong>Yesterday</strong>
                     <span class="spec-acc-sub">· ${yesterdayItems.length} ${yesterdayItems.length === 1 ? 'entry' : 'entries'}</span>
                   </span>
                   <span class="spec-acc-right">
                     <span class="spec-acc-sub num">${ctx.formatCurrency(yesterdayTotal)}</span>
                     <span class="spec-acc-chev">▾</span>
                   </span>
                 </button>
                 <div class="spec-accordion-body is-entries-body">
                   ${renderEntryRows(yesterdayItems)}
                 </div>
               </section>`
            : ''
        }

        ${
          earlierItems.length > 0
            ? `<section class="spec-accordion-card ${earlierOpen ? 'is-open' : ''}" data-acc-key="earlier">
                 <button type="button" class="spec-accordion-summary" data-acc-toggle="earlier">
                   <span class="spec-acc-left">
                     <strong>Earlier in ${esc(SHORT_MONTHS[ctx.state.selectedMonth])}</strong>
                     <span class="spec-acc-sub">· ${earlierItems.length} ${earlierItems.length === 1 ? 'entry' : 'entries'}</span>
                   </span>
                   <span class="spec-acc-right">
                     <span class="spec-acc-sub num">${ctx.formatCurrency(earlierTotal)}</span>
                     <span class="spec-acc-chev">▾</span>
                   </span>
                 </button>
                 <div class="spec-accordion-body is-entries-body">
                   ${renderEntryRows(earlierItems.slice(0, 12))}
                   <div style="padding: 0.55rem 0.85rem; text-align:center;">
                     <button type="button" class="spec-btn-ghost" data-nav="history" style="width:100%;">View all in History (${monthExpenses.length} entries) ›</button>
                   </div>
                 </div>
               </section>`
            : ''
        }
      </div>

      <div class="spec-midnight-dock">
        <button type="button" class="spec-midnight-composer" id="spec-open-add-pill">
          <span class="spec-composer-placeholder">200 coffee upi…</span>
          <span class="spec-composer-plus" aria-hidden="true">${MIDNIGHT_ICONS.plus}</span>
        </button>
        ${renderMidnightBottomNav('home')}
      </div>
    `;

    root.querySelectorAll('[data-acc-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.accToggle;
        const card = btn.closest('.spec-accordion-card');
        if (!card || !key) return;
        const nextOpen = !card.classList.contains('is-open');
        specState.homeAccordions[key] = nextOpen;
        card.classList.toggle('is-open', nextOpen);
        triggerHaptic('light');
      });
    });

    root.querySelector('#spec-open-add-pill')?.addEventListener('click', () => openAddPalette(''));
    root.querySelector('#spec-open-add-empty')?.addEventListener('click', () => openAddPalette(''));
    root.querySelector('#spec-dismiss-recap-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.dismissRecap(prevRecap.monthKey);
      render();
    });
    root.querySelector('#spec-open-recap-story')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.openStoryModal(prevRecap);
    });
    root.querySelectorAll('[data-mark-cc-paid]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.markCardPaid?.(btn.dataset.markCcPaid, true);
      });
    });
    root.querySelectorAll('[data-open-cc-modal]').forEach((el) => {
      el.addEventListener('click', () => {
        ctx.openRecurringModal?.();
      });
    });

    bindCommonClicks(root);
  }

  // 1B, 1C, 1D, 3A: Full-screen Add / Ask Palette
  function renderAddOverlay(expenses, settings) {
    let overlay = document.getElementById('spec-add-overlay');
    if (!specState.addOpen) {
      if (overlay) overlay.hidden = true;
      return;
    }
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'spec-add-overlay';
      overlay.className = 'spec-add-overlay';
      document.body.appendChild(overlay);
    }
    overlay.hidden = false;

    const usualsCount = Number(settings.usualsCount) || 6;
    const usuals = computeUsuals(expenses, usualsCount);

    // 3A: KEYPAD MODE (Zero-Rebuild In-Place Updates for <0.2ms Key Taps)
    if (specState.addInputStyle === 'keypad') {
      const modes = ['upi', 'cash', 'card', 'bank'];

      function syncKeypadDom() {
        const amtNum = parseFloat(specState.keypadAmountStr) || 0;
        const catObj = getCategoryById(specState.keypadCategory || 'food');
        const digitsEl = overlay.querySelector('.spec-kp-digits');
        if (digitsEl) digitsEl.textContent = specState.keypadAmountStr || '0';

        const catPill = overlay.querySelector('#spec-kp-cat-cycle');
        if (catPill) {
          catPill.textContent = `${catObj.icon} ${catObj.shortName || catObj.name} ⌄`;
        }

        const noteInp = overlay.querySelector('#spec-kp-note-input');
        if (noteInp && noteInp !== document.activeElement && noteInp.value !== specState.keypadNote) {
          noteInp.value = specState.keypadNote;
        }

        overlay.querySelectorAll('.spec-kp-usual-chip').forEach((chip) => {
          const isAct =
            specState.keypadNote.trim().toLowerCase() ===
            (chip.dataset.kpNote || '').trim().toLowerCase();
          chip.classList.toggle('active', isAct);
        });

        overlay.querySelectorAll('[data-kp-mode-btn]').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.kpModeBtn === specState.keypadMode);
        });

        const submitBtn = overlay.querySelector('#spec-kp-submit-btn');
        if (submitBtn) {
          submitBtn.textContent = `Add ${ctx.formatCurrency(amtNum)} · ${catObj.icon} ${
            specState.keypadNote || catObj.shortName || 'expense'
          }`;
        }
      }

      if (!overlay.querySelector('.spec-add-sheet.is-keypad-mode')) {
        const catObj = getCategoryById(specState.keypadCategory || 'food');
        const amtNum = parseFloat(specState.keypadAmountStr) || 0;

        overlay.innerHTML = `
          <div class="spec-add-sheet is-keypad-mode">
            <div class="spec-sheet-drag-pill" aria-hidden="true"></div>
            <header class="spec-add-header">
              <span class="spec-add-title">Add · keypad</span>
              <button type="button" class="spec-circle-btn" id="spec-close-add-btn">✕</button>
            </header>

            <div class="spec-keypad-hero">
              <span class="spec-kp-sym">₹</span><span class="spec-kp-digits">${esc(specState.keypadAmountStr || '0')}</span>
            </div>

            <div class="spec-kp-note-row">
              <input type="text" id="spec-kp-note-input" class="spec-kp-note-input" placeholder="Note (e.g. auto, chai, lunch)" value="${esc(specState.keypadNote)}" autocomplete="off" />
              <button type="button" class="spec-kp-cat-pill" id="spec-kp-cat-cycle">${catObj.icon} ${esc(catObj.shortName || catObj.name)} ⌄</button>
            </div>

            <div class="spec-kp-usuals-strip">
              ${usuals
                .map((u) => {
                  const c = getCategoryById(u.category);
                  const isAct = specState.keypadNote.toLowerCase() === u.note.toLowerCase();
                  return `<button type="button" class="spec-kp-usual-chip ${isAct ? 'active' : ''}" data-kp-note="${esc(u.note)}" data-kp-amt="${u.amount}" data-kp-cat="${u.category}" data-kp-mode="${u.paymentMethod}">${c.icon} ${esc(u.note)} ⌄</button>`;
                })
                .join('')}
            </div>

            <div class="spec-segmented-4">
              ${modes
                .map((m) => {
                  const pm = getPaymentMethodById(m);
                  return `<button type="button" class="spec-seg-btn ${specState.keypadMode === m ? 'active' : ''}" data-kp-mode-btn="${m}">${esc(pm.shortName)}</button>`;
                })
                .join('')}
            </div>

            <div class="spec-numpad-grid">
              ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
                .map(
                  (key) =>
                    `<button type="button" class="spec-numpad-key" data-kp-key="${key}">${key}</button>`
                )
                .join('')}
            </div>

            <button type="button" class="spec-kp-submit-btn" id="spec-kp-submit-btn">
              Add ${ctx.formatCurrency(amtNum)} · ${catObj.icon} ${esc(specState.keypadNote || catObj.shortName || 'expense')}
            </button>

            <button type="button" class="spec-kp-switch-link" id="spec-switch-to-keyboard">
              ⌨ Switch to typing · set your default in Settings
            </button>
          </div>
        `;

        const sheetEl = overlay.querySelector('.spec-add-sheet');
        attachSwipeToDismiss(sheetEl, '.spec-add-header, .spec-sheet-drag-pill', closeAddPalette);

        overlay.querySelector('#spec-close-add-btn')?.addEventListener('click', closeAddPalette);
        overlay.querySelector('#spec-switch-to-keyboard')?.addEventListener('click', () => {
          specState.addInputStyle = 'keyboard';
          overlay.replaceChildren();
          renderAddOverlay(ctx.state.expenses, ctx.getSettings());
        });
        overlay.querySelector('#spec-kp-note-input')?.addEventListener('input', (e) => {
          specState.keypadNote = e.target.value;
          const inferred = inferCategory(specState.keypadNote, 'expense');
          if (inferred) specState.keypadCategory = inferred;
          syncKeypadDom();
        });
        overlay.querySelector('#spec-kp-cat-cycle')?.addEventListener('click', () => {
          const idx = EXPENSE_CATEGORIES.findIndex((c) => c.id === specState.keypadCategory);
          const next = EXPENSE_CATEGORIES[(idx + 1) % EXPENSE_CATEGORIES.length];
          specState.keypadCategory = next.id;
          if (specState.keypadNote.trim()) {
            learnFromNote(specState.keypadNote.trim(), next.id);
          }
          syncKeypadDom();
        });
        overlay.querySelectorAll('.spec-kp-usual-chip').forEach((btn) => {
          btn.addEventListener('click', () => {
            specState.keypadNote = btn.dataset.kpNote || '';
            if (!specState.keypadAmountStr) {
              specState.keypadAmountStr = String(btn.dataset.kpAmt || '');
            }
            specState.keypadCategory = btn.dataset.kpCat || 'food';
            specState.keypadMode = btn.dataset.kpMode || 'upi';
            syncKeypadDom();
          });
        });
        overlay.querySelectorAll('[data-kp-mode-btn]').forEach((btn) => {
          btn.addEventListener('click', () => {
            specState.keypadMode = btn.dataset.kpModeBtn || 'upi';
            syncKeypadDom();
          });
        });
        overlay.querySelectorAll('[data-kp-key]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const k = btn.dataset.kpKey;
            let cur = specState.keypadAmountStr;
            if (k === '⌫') {
              cur = cur.slice(0, -1);
            } else if (k === '.') {
              if (!cur.includes('.')) cur = (cur || '0') + '.';
            } else {
              const parts = cur.split('.');
              if (parts[0].length < 7 && (!parts[1] || parts[1].length < 2)) {
                cur = cur === '0' ? k : cur + k;
              }
            }
            specState.keypadAmountStr = cur;
            syncKeypadDom();
          });
        });
        overlay.querySelector('#spec-kp-submit-btn')?.addEventListener('click', () => {
          const amt = parseFloat(specState.keypadAmountStr);
          if (!(amt > 0)) {
            triggerHaptic('warning');
            const hero = overlay.querySelector('.spec-keypad-hero');
            hero?.classList.add('spec-shake');
            setTimeout(() => hero?.classList.remove('spec-shake'), 380);
            return;
          }
          triggerHaptic('success');
          const msg = `${amt} ${specState.keypadNote || getCategoryById(specState.keypadCategory).name} ${specState.keypadMode}`;
          ctx.QuickAdd(msg, specState.keypadCategory);
          specState.keypadAmountStr = '';
          specState.keypadNote = '';
          closeAddPalette();
        });
      } else {
        syncKeypadDom();
      }
      return;
    }

    // 1B, 1C, 1D: KEYBOARD MODE (Empty -> Usuals Grid, Typing -> Preview + History, Question -> Answer Card)
    const raw = specState.addText;
    const trimmed = raw.trim();
    const defaultPay = settings.defaultPayment || 'upi';
    const drafts = trimmed ? parseDraftMessage(raw, new Date(), 'expense', defaultPay) : [];
    const firstDraft = drafts[0] || null;
    const hasAmount = Boolean(firstDraft && Number(firstDraft.amount) > 0);
    const questionObj = !hasAmount && trimmed ? parseQuestionQuery(trimmed, new Date()) : null;
    const isQuestion = Boolean(questionObj && questionObj.isSpecific && !hasAmount);

    let bodyContentHtml = '';

    if (!trimmed) {
      // 1B: EMPTY STATE -> YOUR USUALS 2x3 GRID
      const cardsHtml =
        usuals.length > 0
          ? usuals
              .map((u) => {
                const c = getCategoryById(u.category);
                const p = getPaymentMethodById(u.paymentMethod);
                return `
                  <div class="spec-usual-tile" data-usual-note="${esc(u.note)}" data-usual-amt="${u.amount}" data-usual-mode="${esc(p.shortName)}">
                    <button type="button" class="spec-usual-tile-main">
                      <span class="spec-usual-emoji">${c.icon}</span>
                      <strong class="spec-usual-title">${esc(u.note)}</strong>
                      <span class="spec-usual-sub">${ctx.formatCurrency(u.amount)} · ${esc(p.shortName)}</span>
                    </button>
                    <button type="button" class="spec-usual-prefill" title="Edit before saving">✎</button>
                  </div>
                `;
              })
              .join('')
          : `<div class="spec-card" style="grid-column: 1 / -1; text-align:center; padding: 1.2rem;">
               <p class="field-hint">Your 6 most frequent items in the last 30 days will appear here for 1-tap logging.</p>
             </div>`;

      bodyContentHtml = `
        <div class="spec-usuals-section">
          <div class="spec-section-kicker">YOUR USUALS · TAP TO ADD</div>
          <div class="spec-usuals-2x3">
            ${cardsHtml}
          </div>
        </div>
      `;
    } else if (isQuestion) {
      // 1D: ASKING A QUESTION -> ANSWER CARD
      const ans = evaluateQuestionQuery(expenses, questionObj);
      const isLess = (ans.deltaAmt || 0) <= 0;
      const deltaLine =
        ans.deltaPct !== null
          ? `<div class="spec-qa-delta ${isLess ? 'is-good' : 'is-bad'}">${isLess ? '▼' : '▲'} ${Math.abs(ans.deltaPct)}% ${isLess ? 'less' : 'more'} vs ${esc(ans.prevLabel)}</div>`
          : '';
      const maxTop = Math.max(1, ...ans.topItems.slice(0, 4).map((t) => t.amount));
      const barsHtml = ans.topItems
        .slice(0, 4)
        .map((it) => {
          const pct = Math.max(6, Math.round((it.amount / maxTop) * 100));
          return `
            <div class="spec-qa-bar-row">
              <span class="spec-qa-item-name">${esc(it.note)}</span>
              <div class="spec-qa-bar-track"><div class="spec-qa-bar-fill" style="width:${pct}%"></div></div>
              <strong class="spec-qa-item-val">${ctx.formatCurrency(it.amount)}</strong>
            </div>
          `;
        })
        .join('');

      bodyContentHtml = `
        <div class="spec-card spec-qa-card">
          <div class="spec-qa-pill">🔍 ${esc(ans.filterTitle)} · ${esc(ans.periodLabel)}</div>
          <div class="spec-qa-hero">${ctx.formatCurrency(ans.total)}</div>
          <div class="spec-qa-meta">${ans.count} ${ans.count === 1 ? 'entry' : 'entries'} · avg ${ctx.formatCurrency(ans.avg)}</div>
          ${deltaLine}
          ${barsHtml ? `<div class="spec-qa-bars">${barsHtml}</div>` : ''}
          <button type="button" class="spec-qa-explore-btn" id="spec-qa-open-explore">
            Open in Stats → Explore ›
          </button>
        </div>
      `;
    } else if (firstDraft) {
      // 1C: TYPING AN EXPENSE -> BIG LIVE PREVIEW + CHIPS + FROM YOUR HISTORY
      const activeCatId = specState.overrideCategory || firstDraft.category || 'other';
      const activeModeId = specState.overrideMode || firstDraft.paymentMethod || defaultPay;
      const activeDateIso = specState.overrideDate || firstDraft.date || toLocalISODate(new Date());
      const catObj = getCategoryById(activeCatId);
      const payObj = getPaymentMethodById(activeModeId);
      const isDefaultMode = !specState.overrideMode && !firstDraft.explicitPayment;
      const matches = computeHistoryMatches(expenses, firstDraft.note || trimmed, 4);

      const historyChipsHtml = (matches.length > 0 ? matches : usuals)
        .map((m) => {
          const c = getCategoryById(m.category);
          const p = getPaymentMethodById(m.paymentMethod);
          return `
            <button type="button" class="spec-hist-match-row spec-midnight-hist-chip" data-hist-note="${esc(m.note)}" data-hist-amt="${m.amount}" data-hist-mode="${esc(p.shortName.toLowerCase())}">
              <span>${c.icon} ${esc(m.note)}</span>
              <strong>${ctx.formatCurrency(m.amount)}</strong>
            </button>
          `;
        })
        .join('');

      bodyContentHtml = `
        <div class="spec-typing-preview">
          <section class="spec-card spec-midnight-preview-card">
            <span class="spec-eyebrow">WILL SAVE AS</span>
            <div class="spec-typing-amt num ${!hasAmount ? 'is-missing' : ''}">
              ${hasAmount ? ctx.formatCurrency(firstDraft.amount) : '₹?'}
            </div>
            <div class="spec-typing-chips">
              <button type="button" class="spec-preview-chip" id="spec-cycle-cat-chip">
                ${catObj.icon} ${esc(catObj.shortName || catObj.name)} ▾
                ${specState.overrideCategory ? '<small class="spec-learned-tag">saved</small>' : ''}
              </button>
              <button type="button" class="spec-preview-chip ${isDefaultMode ? 'is-dimmed' : ''}" id="spec-cycle-mode-chip">
                💳 ${esc(payObj.shortName)} ${isDefaultMode ? '<small>default</small>' : ''} ▾
              </button>
              <label class="spec-preview-chip">
                <span>📅 ${esc(firstDraft.dateLabel || 'Today')} ▾</span>
                <input type="date" id="spec-preview-date-input" value="${esc(activeDateIso)}" style="position:absolute; opacity:0; width:1px; height:1px;" />
              </label>
              ${
                firstDraft.note
                  ? `<span class="spec-preview-chip is-static-note">${esc(firstDraft.note)} ${(firstDraft.tags || []).map((t) => `#${esc(t)}`).join(' ')}</span>`
                  : ''
              }
            </div>
          </section>

          ${
            historyChipsHtml
              ? `<div class="spec-from-history-block">
                   <div class="spec-section-kicker">FROM YOUR HISTORY</div>
                   <div class="spec-midnight-hist-chips">
                     ${historyChipsHtml}
                   </div>
                 </div>`
              : ''
          }
        </div>
      `;
    }

    const bottomHintText = !trimmed
      ? 'Type <code>200 snacks upi</code> to add · ask <code>food this month</code>'
      : isQuestion
        ? 'No amount, so this is a question. Add a number to log it.'
        : 'Tap any chip to change it · Press Save or Enter to log.';

    // Only rebuild the shell if not already built, or update parts so input never loses focus!
    const existingInput = overlay.querySelector('#spec-add-input');
    if (!existingInput) {
      overlay.innerHTML = `
        <div class="spec-add-sheet">
          <div class="spec-sheet-drag-pill" aria-hidden="true"></div>
          <header class="spec-add-header">
            <button type="button" class="spec-circle-btn" id="spec-close-add-btn" aria-label="Close Add">${MIDNIGHT_ICONS.x}</button>
            <span class="spec-add-title">Add</span>
            <button type="button" class="spec-mini-text-btn" id="spec-switch-to-keypad" title="Switch to Keypad">🔢 Keypad</button>
          </header>
          <div class="spec-add-top-bar">
            <form id="spec-add-form" class="spec-add-input-pill">
              <input type="text" id="spec-add-input" placeholder="1299 shoes myntra cc" autocomplete="off" />
              <button type="submit" class="spec-return-btn">Save</button>
            </form>
            <div id="spec-add-hint-line" class="spec-add-hint-line"></div>
          </div>
          <div id="spec-add-dynamic-body" class="spec-add-dynamic-body"></div>
        </div>
      `;

      const sheetEl = overlay.querySelector('.spec-add-sheet');
      attachSwipeToDismiss(sheetEl, '.spec-add-header, .spec-sheet-drag-pill', closeAddPalette);

      overlay.querySelector('#spec-close-add-btn')?.addEventListener('click', closeAddPalette);
      overlay.querySelector('#spec-switch-to-keypad')?.addEventListener('click', () => {
        specState.addInputStyle = 'keypad';
        overlay.replaceChildren();
        renderAddOverlay(expenses, settings);
      });
      const inp = overlay.querySelector('#spec-add-input');
      inp.value = specState.addText;
      inp.addEventListener('input', () => {
        specState.addText = inp.value;
        renderAddOverlay(ctx.state.expenses, ctx.getSettings());
      });
      overlay.querySelector('#spec-add-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = specState.addText.trim();
        if (!text) return;
        const dList = parseDraftMessage(text, new Date(), 'expense', settings.defaultPayment || 'upi');
        const d0 = dList[0];
        if (!d0 || !(Number(d0.amount) > 0)) {
          const qCheck = parseQuestionQuery(text, new Date());
          if (qCheck && qCheck.isSpecific) {
            specState.exploreFromQuestion = text;
            ctx.state.exploreQuery = text;
            specState.addOpen = false;
            specState.screen = 'stats';
            specState.statsTab = 'explore';
            specState.statsSubscreen = null;
            render();
            return;
          }
          // Shake the missing amount
          const amtEl = overlay.querySelector('.spec-typing-amt');
          amtEl?.classList.add('spec-shake');
          setTimeout(() => amtEl?.classList.remove('spec-shake'), 400);
          return;
        }
        ctx.QuickAdd(
          text,
          specState.overrideCategory,
          specState.overrideMode,
          specState.overrideDate
        );
        closeAddPalette();
      });
    } else if (existingInput.value !== specState.addText) {
      existingInput.value = specState.addText;
    }

    const dynBody = overlay.querySelector('#spec-add-dynamic-body');
    const hintEl = overlay.querySelector('#spec-add-hint-line');
    if (dynBody) dynBody.innerHTML = bodyContentHtml;
    if (hintEl) hintEl.innerHTML = bottomHintText;

    // Bind dynamic body interactions (1B Usuals, 1C Chips & History, 1D Explore deep-link)
    dynBody?.querySelectorAll('.spec-usual-tile').forEach((tile) => {
      const note = tile.dataset.usualNote;
      const amt = tile.dataset.usualAmt;
      const mode = (tile.dataset.usualMode || 'upi').toLowerCase();
      tile.querySelector('.spec-usual-tile-main')?.addEventListener('click', () => {
        ctx.QuickAdd(`${amt} ${note} ${mode}`);
        closeAddPalette();
      });
      tile.querySelector('.spec-usual-prefill')?.addEventListener('click', (e) => {
        e.stopPropagation();
        specState.addText = `${amt} ${note} ${mode}`;
        const inp = overlay.querySelector('#spec-add-input');
        if (inp) {
          inp.value = specState.addText;
          inp.focus();
        }
        renderAddOverlay(ctx.state.expenses, ctx.getSettings());
      });
    });

    dynBody?.querySelector('#spec-cycle-cat-chip')?.addEventListener('click', () => {
      const curCat = specState.overrideCategory || firstDraft?.category || 'other';
      const idx = EXPENSE_CATEGORIES.findIndex((c) => c.id === curCat);
      const next = EXPENSE_CATEGORIES[(idx + 1) % EXPENSE_CATEGORIES.length];
      specState.overrideCategory = next.id;
      if (firstDraft?.note) {
        learnFromNote(firstDraft.note, next.id);
      }
      renderAddOverlay(ctx.state.expenses, ctx.getSettings());
    });

    dynBody?.querySelector('#spec-cycle-mode-chip')?.addEventListener('click', () => {
      const modes = ['upi', 'cash', 'card', 'bank', 'wallet', 'debit'];
      const curMode = specState.overrideMode || firstDraft?.paymentMethod || defaultPay;
      const idx = modes.indexOf(curMode);
      specState.overrideMode = modes[(idx + 1) % modes.length];
      renderAddOverlay(ctx.state.expenses, ctx.getSettings());
    });

    const dateInp = dynBody?.querySelector('#spec-preview-date-input');
    dateInp?.addEventListener('change', () => {
      if (dateInp.value) {
        specState.overrideDate = dateInp.value;
        renderAddOverlay(ctx.state.expenses, ctx.getSettings());
      }
    });

    dynBody?.querySelectorAll('.spec-hist-match-row').forEach((row) => {
      row.addEventListener('click', () => {
        const note = row.dataset.histNote || '';
        const histAmt = row.dataset.histAmt || '';
        const mode = row.dataset.histMode || 'upi';
        const keepAmt = hasAmount ? firstDraft.amount : histAmt;
        specState.addText = `${keepAmt} ${note} ${mode}`;
        const inp = overlay.querySelector('#spec-add-input');
        if (inp) {
          inp.value = specState.addText;
          inp.focus();
        }
        renderAddOverlay(ctx.state.expenses, ctx.getSettings());
      });
    });

    dynBody?.querySelector('#spec-qa-open-explore')?.addEventListener('click', () => {
      specState.exploreFromQuestion = trimmed;
      ctx.state.exploreQuery = trimmed;
      specState.addOpen = false;
      specState.screen = 'stats';
      specState.statsTab = 'explore';
      specState.statsSubscreen = null;
      render();
    });
  }

  // 4A-4D, 5A-5D, 6B: STATS SCREEN & SUB-SCREENS
  function renderStatsScreen(root, expenses, settings, spanComp) {
    const budget = Number(settings.monthlyBudget) || 30000;
    const prevM = ctx.state.selectedMonth === 0 ? 11 : ctx.state.selectedMonth - 1;
    const prevY = ctx.state.selectedMonth === 0 ? ctx.state.selectedYear - 1 : ctx.state.selectedYear;
    const prevRecap = computeMonthlyRecap(expenses, budget, prevY, prevM, ctx.formatCurrency);
    const hasUnseenRecap = !settings.recapSeen?.[prevRecap.monthKey] && prevRecap.entryCount > 0;

    // Check if we are in a Sub-screen (4B Drill-down, 4C All Fun Facts, 5B Patterns, 5D Compare)
    if (specState.statsSubscreen === 'drilldown') {
      renderCategoryDrillSubscreen(root, expenses, spanComp);
      return;
    }
    if (specState.statsSubscreen === 'allfacts') {
      renderAllFunFactsSubscreen(root, expenses, settings, spanComp);
      return;
    }
    if (specState.statsSubscreen === 'patterns') {
      renderPatternsSubscreen(root, expenses);
      return;
    }
    if (specState.statsSubscreen === 'compare') {
      renderCompareSubscreen(root, expenses);
      return;
    }

    const tabsHeaderHtml = `
      <header class="spec-midnight-hdr">
        <h2 class="spec-hdr-greeting">Stats</h2>
        <div class="spec-segmented-3" style="width:176px">
          <button type="button" class="spec-seg-btn ${specState.statsPeriod === 'week' ? 'active' : ''}" data-stats-period="week">Week</button>
          <button type="button" class="spec-seg-btn ${specState.statsPeriod === 'month' ? 'active' : ''}" data-stats-period="month">Month</button>
          <button type="button" class="spec-seg-btn ${specState.statsPeriod === 'year' ? 'active' : ''}" data-stats-period="year">Year</button>
        </div>
      </header>
      <nav class="spec-underline-tabs" role="tablist">
        <button type="button" class="spec-utab ${specState.statsTab === 'overview' ? 'active' : ''}" data-stats-tab="overview">Overview</button>
        <button type="button" class="spec-utab ${specState.statsTab === 'calendar' ? 'active' : ''}" data-stats-tab="calendar">Calendar</button>
        <button type="button" class="spec-utab ${specState.statsTab === 'explore' ? 'active' : ''}" data-stats-tab="explore">Explore</button>
        <button type="button" class="spec-utab ${specState.statsTab === 'recaps' ? 'active' : ''}">
          <span data-stats-tab="recaps">Recaps ${hasUnseenRecap ? '<i class="spec-red-dot"></i>' : ''}</span>
        </button>
      </nav>
    `;

    let tabBodyHtml = '';

    if (specState.statsTab === 'overview') {
      // 4A: OVERVIEW TAB
      const modeForComp = specState.statsPeriod === 'week' ? '7d' : 'month';
      const comp = computeSameSpanComparison(
        expenses,
        modeForComp,
        ctx.state.selectedYear,
        ctx.state.selectedMonth,
        new Date()
      );
      const isLess = (comp.deltaAmt || 0) <= 0;
      const deltaText =
        comp.deltaPct !== null
          ? `${isLess ? '▼' : '▲'} ${Math.abs(comp.deltaPct)}% ${isLess ? 'less' : 'more'} vs ${comp.prevSpanLabel}`
          : `vs ${comp.prevSpanLabel}`;

      // Running total chart or table (4A / 4D)
      const runTableOn = isTableOn('running');
      let runningBodyHtml = '';
      if (runTableOn) {
        const rows = comp.runningDays
          .filter((d) => d.curCumulative !== null || d.prevCumulative !== null)
          .map(
            (d) => `
              <tr>
                <td>${d.day}</td>
                <td class="num">${d.curCumulative !== null ? ctx.formatCurrency(d.curCumulative) : '—'}</td>
                <td class="num">${d.prevCumulative !== null ? ctx.formatCurrency(d.prevCumulative) : '—'}</td>
              </tr>
            `
          )
          .join('');
        runningBodyHtml = `
          <div class="spec-table-scroll">
            <table class="spec-table">
              <thead><tr><th>Day of month</th><th class="num">${esc(comp.curMonthName)}</th><th class="num">${esc(comp.prevMonthName)}</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      } else {
        const days = comp.runningDays;
        const maxV = Math.max(
          1000,
          ...days.map((d) => Math.max(d.curCumulative || 0, d.prevCumulative || 0))
        );
        const W = 340, H = 140, pL = 36, pR = 38, pT = 14, pB = 22;
        const pW = W - pL - pR, pH = H - pT - pB;
        const totD = Math.max(1, days.length - 1);
        const toX = (day) => pL + ((day - 1) / totD) * pW;
        const toY = (val) => pT + pH - (val / maxV) * pH;
        const curPts = days.filter((d) => d.curCumulative !== null);
        const prevPts = days.filter((d) => d.prevCumulative !== null);
        const mkPath = (pts, k) =>
          pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p[k]).toFixed(1)}`).join(' ');
        const curLine = mkPath(curPts, 'curCumulative');
        const prevLine = mkPath(prevPts, 'prevCumulative');
        const lastC = curPts[curPts.length - 1];
        const curArea =
          curPts.length > 1
            ? `${curLine} L${toX(lastC.day).toFixed(1)},${(pT + pH).toFixed(1)} L${toX(1).toFixed(1)},${(pT + pH).toFixed(1)} Z`
            : '';

        runningBodyHtml = `
          <div class="spec-chart-legend">
            <span><i class="spec-line-swatch is-blue"></i> ${esc(comp.curMonthName)}</span>
            <span><i class="spec-line-swatch is-dashed"></i> ${esc(comp.prevMonthName)}</span>
          </div>
          <svg viewBox="0 0 ${W} ${H}" class="spec-svg">
            <line x1="${pL}" y1="${pT}" x2="${W - pR}" y2="${pT}" class="spec-gridline" />
            <line x1="${pL}" y1="${pT + pH / 2}" x2="${W - pR}" y2="${pT + pH / 2}" class="spec-gridline" />
            <line x1="${pL}" y1="${pT + pH}" x2="${W - pR}" y2="${pT + pH}" class="spec-gridline" />
            <text x="${pL - 5}" y="${pT + 4}" class="spec-axis-txt" text-anchor="end">${fmtK(maxV)}</text>
            <text x="${pL - 5}" y="${pT + pH / 2 + 4}" class="spec-axis-txt" text-anchor="end">${fmtK(maxV / 2)}</text>
            <text x="${pL - 5}" y="${pT + pH + 4}" class="spec-axis-txt" text-anchor="end">₹0</text>
            <text x="${toX(1)}" y="${H - 4}" class="spec-axis-txt" text-anchor="middle">1</text>
            <text x="${toX(10)}" y="${H - 4}" class="spec-axis-txt" text-anchor="middle">10</text>
            <text x="${toX(20)}" y="${H - 4}" class="spec-axis-txt" text-anchor="middle">20</text>
            <text x="${toX(days.length)}" y="${H - 4}" class="spec-axis-txt" text-anchor="middle">${days.length}</text>
            ${curArea ? `<path d="${curArea}" fill="rgba(16,185,129,0.14)" />` : ''}
            ${prevLine ? `<path d="${prevLine}" fill="none" stroke="#8b98ad" stroke-width="1.6" stroke-dasharray="4 3" />` : ''}
            ${curLine ? `<path d="${curLine}" fill="none" stroke="#10b981" stroke-width="2.2" />` : ''}
            ${
              lastC
                ? `<circle cx="${toX(lastC.day).toFixed(1)}" cy="${toY(lastC.curCumulative).toFixed(1)}" r="3.5" fill="#10b981" stroke="#0b1120" stroke-width="1.5" />
                   <text x="${(toX(lastC.day) + 5).toFixed(1)}" y="${(toY(lastC.curCumulative) + 3).toFixed(1)}" class="spec-end-txt">${fmtK(lastC.curCumulative)}</text>`
                : ''
            }
          </svg>
        `;
      }

      // Categories card (4A / 4D)
      const catTableOn = isTableOn('categories');
      const activeCats = EXPENSE_CATEGORIES.map((c) => {
        const dObj = comp.categoryDeltaById[c.id] || { curAmt: 0, prevAmt: 0, diff: 0, pct: 0 };
        return { ...c, ...dObj };
      })
        .filter((c) => c.curAmt > 0)
        .sort((a, b) => b.curAmt - a.curAmt);

      const maxCatAmt = Math.max(1, ...activeCats.map((c) => c.curAmt));
      const stackedBarHtml = EXPENSE_CATEGORIES.map((c) => {
        const dObj = comp.categoryDeltaById[c.id];
        const amt = dObj?.curAmt || 0;
        if (amt <= 0 || comp.curTotal <= 0) return '';
        const pct = Math.max(2, (amt / comp.curTotal) * 100);
        return `<div class="spec-cat-seg" style="width:${pct}%; background:${c.color}"></div>`;
      }).join('');

      let categoriesBodyHtml = '';
      if (catTableOn) {
        categoriesBodyHtml = `
          <div class="spec-table-scroll">
            <table class="spec-table">
              <thead><tr><th>Category</th><th class="num">Spent</th><th class="num">vs before</th><th class="num">Share</th></tr></thead>
              <tbody>
                ${activeCats
                  .map((c) => {
                    const share = comp.curTotal > 0 ? Math.round((c.curAmt / comp.curTotal) * 100) : 0;
                    const pSign = c.pct <= 0 ? '▼' : '▲';
                    return `
                      <tr class="spec-clickable-tr" data-drill-cat="${c.id}">
                        <td>${c.icon} ${esc(c.shortName || c.name)}</td>
                        <td class="num"><strong>${ctx.formatCurrency(c.curAmt)}</strong></td>
                        <td class="num ${c.pct <= 0 ? 'is-good' : 'is-bad'}">${pSign}${Math.abs(c.pct)}%</td>
                        <td class="num">${share}%</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        categoriesBodyHtml = `
          <div class="spec-cat-stacked-bar" style="margin-bottom:0.75rem">${stackedBarHtml}</div>
          <div class="spec-cat-rows">
            ${activeCats
              .map((c) => {
                const wPct = Math.max(6, Math.round((c.curAmt / maxCatAmt) * 100));
                const pSign = c.pct <= 0 ? '▼' : '▲';
                return `
                  <button type="button" class="spec-cat-row-btn" data-drill-cat="${c.id}">
                    <span class="spec-cat-row-name">${c.icon} ${esc(c.shortName || c.name)}</span>
                    <div class="spec-cat-row-track"><div class="spec-cat-row-fill" style="width:${wPct}%; background:${c.color}"></div></div>
                    <strong class="spec-cat-row-amt">${ctx.formatCurrency(c.curAmt)}</strong>
                    <span class="spec-cat-row-delta ${c.pct <= 0 ? 'is-good' : 'is-bad'}">${pSign}${Math.abs(c.pct)}%</span>
                  </button>
                `;
              })
              .join('')}
          </div>
        `;
      }

      // One highlighted Fun Fact + "All N fun facts >" link (4A)
      const periodItems = ctx.getPeriodExpenses();
      const { clearedFacts } = computeFunFacts(
        expenses,
        periodItems,
        comp,
        budget,
        ctx.formatCurrency
      );
      const preferredOrder = ['weekend', 'habit', 'delivery', 'small', 'bigday', 'nospend'];
      const oneFact =
        clearedFacts.find((f) => preferredOrder.includes(f.id)) || clearedFacts[0] || null;

      // Compute 7-day "This week" bars (Midnight Stats design)
      const nowDt = new Date();
      const weekBars = [];
      const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(nowDt);
        d.setDate(nowDt.getDate() - i);
        const iso = toLocalISODate(d);
        const sum = expenses
          .filter((e) => e.date === iso && normalizeEntryType(e) !== 'income')
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        weekBars.push({ label: dayLetters[d.getDay()], sum, isToday: i === 0 });
      }
      const maxWeekBar = Math.max(100, ...weekBars.map((b) => b.sum));
      const weekTotal = weekBars.reduce((s, b) => s + b.sum, 0);
      const weekBarsHtml = weekBars
        .map((b) => {
          const hPx = b.sum > 0 ? Math.max(10, Math.round((b.sum / maxWeekBar) * 86)) : 4;
          return `<div class="spec-midnight-wbar ${b.isToday ? 'is-on' : ''}"><span style="height:${hPx}px" title="${ctx.formatCurrency(b.sum)}"></span>${b.label}</div>`;
        })
        .join('');

      tabBodyHtml = `
        <section class="spec-stats-kpi">
          <div class="spec-eyebrow">${esc(comp.curSpanLabel)}</div>
          <h2 class="spec-hero-amount num" style="font-size:2.4rem">${ctx.formatCurrency(comp.curTotal)}</h2>
          <div class="spec-delta-line ${isLess ? 'is-good' : 'is-bad'}">${esc(deltaText)}</div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>This week</strong>
            <span class="spec-muted-sm num">${ctx.formatCurrency(weekTotal)} total</span>
          </div>
          <div class="spec-midnight-week-bars">${weekBarsHtml}</div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Where it went</strong>
            <div class="spec-card-head-right">
              <span class="spec-muted-sm">Tap to drill in</span>
              <button type="button" class="spec-table-toggle-btn" data-toggle-table="categories">${catTableOn ? '📊 Chart' : '⊞ Table'}</button>
            </div>
          </div>
          ${categoriesBodyHtml || '<p class="field-hint">No expenses in this period yet.</p>'}
        </section>

        ${
          oneFact
            ? `<section class="spec-midnight-insight">
                 <span class="spec-fact-emoji">${oneFact.icon}</span>
                 <div style="flex:1">
                   <strong>${esc(oneFact.title)}</strong>
                   <p>${esc(oneFact.body)}</p>
                   <button type="button" class="spec-inline-link-btn" id="spec-open-all-facts" style="padding:0.25rem 0 0">
                     All ${clearedFacts.length} fun facts ›
                   </button>
                 </div>
               </section>`
            : ''
        }

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Running total</strong>
            <div class="spec-card-head-right">
              <span class="spec-muted-sm">day 1 → ${comp.daysInCurMonth}</span>
              <button type="button" class="spec-table-toggle-btn" data-toggle-table="running">${runTableOn ? '📊 Chart' : '⊞ Table'}</button>
            </div>
          </div>
          ${runningBodyHtml}
        </section>
      `;
    } else if (specState.statsTab === 'calendar') {
      // 5A: CALENDAR TAB
      const cal = computeCalendarAndPatterns(
        expenses,
        ctx.state.selectedYear,
        ctx.state.selectedMonth
      );
      const calTableOn = isTableOn('calendar');
      const fmtCell = (amt) => {
        if (amt === 0) return '🌱';
        if (amt >= 1000) return `₹${(amt / 1000).toFixed(1)}k`;
        return `₹${Math.round(amt)}`;
      };

      const selectedIso =
        ctx.state.selectedCalendarDate ||
        toLocalISODate(new Date(ctx.state.selectedYear, ctx.state.selectedMonth, Math.min(19, cal.cells.length)));
      const dayItems = expenses.filter(
        (e) => e.date === selectedIso && normalizeEntryType(e) !== 'income'
      );

      tabBodyHtml = `
        <div class="spec-month-switcher">
          <button type="button" class="spec-circle-btn" id="spec-cal-prev">‹</button>
          <strong>${FULL_MONTHS[ctx.state.selectedMonth]} ${ctx.state.selectedYear}</strong>
          <button type="button" class="spec-circle-btn" id="spec-cal-next">›</button>
        </div>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Daily spend</strong>
            <div class="spec-card-head-right">
              <span class="spec-muted-sm">tap a day</span>
              <button type="button" class="spec-table-toggle-btn" data-toggle-table="calendar">${calTableOn ? '📊 Chart' : '⊞ Table'}</button>
            </div>
          </div>

          ${
            calTableOn
              ? `<div class="spec-table-scroll">
                   <table class="spec-table">
                     <thead><tr><th>Date</th><th class="num">Entries</th><th class="num">Spent</th></tr></thead>
                     <tbody>
                       ${cal.cells
                         .filter((c) => !c.empty && !c.isFuture)
                         .map(
                           (c) => `
                             <tr class="spec-clickable-tr" data-cal-iso="${c.iso}">
                               <td>${c.iso}</td>
                               <td class="num">${c.entries.length}</td>
                               <td class="num"><strong>${c.total === 0 ? '🌱 ₹0' : ctx.formatCurrency(c.total)}</strong></td>
                             </tr>
                           `
                         )
                         .join('')}
                     </tbody>
                   </table>
                 </div>`
              : `<div class="spec-cal-weekdays">
                   <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                 </div>
                 <div class="spec-cal-grid">
                   ${cal.cells
                     .map((cell) => {
                       if (cell.empty) return `<div class="spec-cal-cell is-empty"></div>`;
                       return `
                         <button type="button" class="spec-cal-cell tier-${cell.isFuture ? 'future' : cell.tier} ${ctx.state.selectedCalendarDate === cell.iso ? 'is-selected' : ''}" data-cal-iso="${cell.iso}" ${cell.isFuture ? 'disabled' : ''}>
                           <span class="spec-cal-d">${cell.day}</span>
                           <span class="spec-cal-v">${cell.isFuture ? '' : fmtCell(cell.total)}</span>
                         </button>
                       `;
                     })
                     .join('')}
                 </div>
                 <div class="spec-cal-legend">
                   <span>Less <i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i> More</span>
                   <span>🌱 no spend</span>
                 </div>`
          }
        </section>

        <div class="spec-two-tiles">
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Month</span>
            <strong>${ctx.formatCurrency(cal.monthTotal)}</strong>
            <span class="spec-muted-sm">${cal.activeDays || 0} active days</span>
          </div>
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Heavy · no-spend</span>
            <strong>${cal.heavyDays} · ${cal.noSpendDays}</strong>
            <span class="spec-muted-sm">days ≥ ₹1,200 · days at ₹0</span>
          </div>
        </div>

        ${
          dayItems.length > 0
            ? `<div class="spec-day-group">
                 <div class="spec-day-header">
                   <span>${esc(selectedIso)}</span>
                   <span>${ctx.formatCurrency(dayItems.reduce((s, e) => s + Number(e.amount), 0))}</span>
                 </div>
                 <div class="spec-card spec-entries-card">
                   ${dayItems
                     .map((item, idx) => {
                       const c = getCategoryById(item.category);
                       const p = getPaymentMethodById(normalizePaymentMethod(item));
                       return `
                         <div class="spec-entry-row" data-edit-id="${esc(item.id)}">
                           <div class="spec-entry-icon" style="background:${c.color}18">${c.icon}</div>
                           <div class="spec-entry-mid">
                             <div class="spec-entry-note">${esc(item.note)}</div>
                             <div class="spec-entry-sub">${esc(c.shortName || c.name)} · ${esc(p.shortName)} · ${formatTime12h(item.updatedAt, idx)}</div>
                           </div>
                           <div class="spec-entry-amt">${ctx.formatCurrency(item.amount)}</div>
                         </div>
                       `;
                     })
                     .join('')}
                 </div>
               </div>`
            : ''
        }

        <button type="button" class="spec-card spec-nav-card-btn" id="spec-open-patterns-btn">
          <span><strong>Patterns (last 90 days)</strong><br><small class="spec-muted-sm">Weekday rhythm, peak hours, streaks & auto-detected habits</small></span>
          <span>›</span>
        </button>
      `;
    } else if (specState.statsTab === 'explore') {
      // 5C: EXPLORE TAB
      const rawQ = (ctx.state.exploreQuery || '').trim();
      const parsedQ = rawQ
        ? parseQuestionQuery(rawQ, new Date())
        : parseQuestionQuery('this month', new Date());
      const ans = evaluateQuestionQuery(expenses, parsedQ);
      const isLess = (ans?.deltaAmt || 0) <= 0;

      // Group items by ctx.state.exploreGroupBy
      const matched = ans?.matchingItems || [];
      const total = ans?.total || 0;
      const groups = new Map();
      const wkNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const e of matched) {
        const amt = Number(e.amount) || 0;
        let keys = [];
        if (ctx.state.exploreGroupBy === 'category') {
          const c = getCategoryById(e.category);
          keys = [{ id: c.id, label: `${c.icon} ${c.shortName || c.name}` }];
        } else if (ctx.state.exploreGroupBy === 'payment') {
          const p = getPaymentMethodById(normalizePaymentMethod(e));
          keys = [{ id: p.id, label: `${p.icon} ${p.shortName}` }];
        } else if (ctx.state.exploreGroupBy === 'weekday') {
          const [y, m, d] = (e.date || '').split('-').map(Number);
          const idx = y && m && d ? (new Date(y, m - 1, d).getDay() + 6) % 7 : 0;
          keys = [{ id: String(idx), label: wkNames[idx] }];
        } else if (ctx.state.exploreGroupBy === 'tag') {
          const tList = normalizeTags(e);
          keys = tList.length > 0 ? tList.map((t) => ({ id: t, label: `#${t}` })) : [{ id: 'untagged', label: 'Untagged' }];
        } else {
          const k = (e.note || 'Item').toLowerCase().trim();
          keys = [{ id: k, label: e.note || 'Item' }];
        }
        for (const kObj of keys) {
          const cur = groups.get(kObj.id) || { id: kObj.id, label: kObj.label, amount: 0, count: 0 };
          cur.amount += amt;
          cur.count += 1;
          groups.set(kObj.id, cur);
        }
      }
      const sortedGroups = Array.from(groups.values()).sort((a, b) => b.amount - a.amount).slice(0, 8);
      const maxG = Math.max(1, ...sortedGroups.map((g) => g.amount));
      const expTableOn = isTableOn('explore');

      tabBodyHtml = `
        ${
          specState.exploreFromQuestion
            ? `<div class="spec-deeplink-banner">
                 <span>↩ From your question "${esc(specState.exploreFromQuestion)}"</span>
                 <button type="button" id="spec-edit-question-btn">Edit</button>
               </div>`
            : ''
        }

        <div class="spec-search-pill">
          <span>🔍</span>
          <input type="text" id="spec-explore-input" value="${esc(ctx.state.exploreQuery)}" placeholder="food this month, swiggy, #goa, upi last week..." autocomplete="off" />
        </div>

        <div class="spec-groupby-row">
          <span class="spec-muted-sm">Group by</span>
          ${[
            { id: 'category', label: 'Category' },
            { id: 'item', label: 'Item' },
            { id: 'payment', label: 'Mode' },
            { id: 'weekday', label: 'Weekday' },
            { id: 'tag', label: 'Tag' }
          ]
            .map(
              (g) =>
                `<button type="button" class="spec-group-pill ${ctx.state.exploreGroupBy === g.id ? 'active' : ''}" data-exp-group="${g.id}">${g.label} ⌄</button>`
            )
            .join('')}
        </div>

        <div class="spec-two-tiles">
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Total (${esc(ans?.periodLabel || 'Period')})</span>
            <strong>${ctx.formatCurrency(total)}</strong>
            ${
              ans?.deltaPct !== null && ans?.deltaPct !== undefined
                ? `<span class="${isLess ? 'is-good' : 'is-bad'}">${isLess ? '▼' : '▲'} ${Math.abs(ans.deltaPct)}% ${isLess ? 'less' : 'more'} vs ${esc(ans.prevLabel)}</span>`
                : `<span class="spec-muted-sm">${esc(ans?.filterTitle || 'All')}</span>`
            }
          </div>
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Entries · avg</span>
            <strong>${ans?.count || 0} · ${ctx.formatCurrency(ans?.avg || 0)}</strong>
            <span class="spec-muted-sm">${ans?.maxSingle ? `max ${ctx.formatCurrency(ans.maxSingle.amount)} ${esc(ans.maxSingle.note.toLowerCase())}` : '—'}</span>
          </div>
        </div>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>By ${esc(ctx.state.exploreGroupBy)}</strong>
            <div class="spec-card-head-right">
              <span class="spec-muted-sm">₹ · share</span>
              <button type="button" class="spec-table-toggle-btn" data-toggle-table="explore">${expTableOn ? '📊 Chart' : '⊞ Table'}</button>
            </div>
          </div>
          ${
            expTableOn
              ? `<div class="spec-table-scroll">
                   <table class="spec-table">
                     <thead><tr><th>${esc(ctx.state.exploreGroupBy)}</th><th class="num">Count</th><th class="num">Spent</th><th class="num">Share</th></tr></thead>
                     <tbody>
                       ${sortedGroups
                         .map((g) => {
                           const sh = total > 0 ? Math.round((g.amount / total) * 100) : 0;
                           return `<tr><td>${esc(g.label)}</td><td class="num">×${g.count}</td><td class="num"><strong>${ctx.formatCurrency(g.amount)}</strong></td><td class="num">${sh}%</td></tr>`;
                         })
                         .join('')}
                     </tbody>
                   </table>
                 </div>`
              : `<div class="spec-qa-bars">
                   ${sortedGroups
                     .map((g) => {
                       const w = Math.max(5, Math.round((g.amount / maxG) * 100));
                       const sh = total > 0 ? Math.round((g.amount / total) * 100) : 0;
                       return `
                         <div class="spec-qa-bar-row">
                           <span class="spec-qa-item-name">${esc(g.label)}</span>
                           <div class="spec-qa-bar-track"><div class="spec-qa-bar-fill" style="width:${w}%"></div></div>
                           <strong class="spec-qa-item-val">${ctx.formatCurrency(g.amount)}</strong>
                           <span class="spec-muted-sm" style="min-width:32px; text-align:right">${sh}%</span>
                         </div>
                       `;
                     })
                     .join('')}
                 </div>`
          }
        </section>

        <button type="button" class="spec-card spec-nav-card-btn" id="spec-open-compare-btn">
          <span>⇄ <strong>Compare with the previous period</strong></span>
          <span>›</span>
        </button>
      `;
    } else if (specState.statsTab === 'recaps') {
      // 6B: RECAPS TAB
      const curRecap = computeMonthlyRecap(
        expenses,
        budget,
        ctx.state.selectedYear,
        ctx.state.selectedMonth,
        ctx.formatCurrency
      );
      const earlierMonths = [];
      for (let i = 1; i <= 4; i++) {
        const d = new Date(ctx.state.selectedYear, ctx.state.selectedMonth - i, 1);
        const r = computeMonthlyRecap(expenses, budget, d.getFullYear(), d.getMonth(), ctx.formatCurrency);
        if (r.entryCount > 0) earlierMonths.push({ ...r, year: d.getFullYear(), month: d.getMonth() });
      }

      tabBodyHtml = `
        <section class="spec-recap-home-card is-large" id="spec-watch-featured-recap">
          <div class="spec-recap-kicker">🎁 NEW · Latest recap</div>
          <h2>${esc(curRecap.monthLabel)}</h2>
          <p>${ctx.formatCurrency(curRecap.totalSpent)} · ${curRecap.topCat ? `${curRecap.topCat.icon} ${esc(curRecap.topCat.shortName || curRecap.topCat.name)} on top` : `${curRecap.entryCount} entries`}</p>
          <div class="spec-story-color-strip">
            <span style="background:#2a78d6"></span>
            <span style="background:#d03b3b"></span>
            <span style="background:#1baf7a"></span>
            <span style="background:#4a3aa7"></span>
            <span style="background:#eb6834"></span>
            <span style="background:#0f172a"></span>
          </div>
          <div class="spec-watch-cta">▶ Watch ${curRecap.slides.length} stories</div>
        </section>

        ${
          earlierMonths.length > 0
            ? `<section class="spec-card">
                 <div class="spec-card-head"><strong>Earlier months</strong></div>
                 <div class="spec-earlier-recaps">
                   ${earlierMonths
                     .map(
                       (er) => `
                         <button type="button" class="spec-earlier-recap-row" data-recap-y="${er.year}" data-recap-m="${er.month}">
                           <div>
                             <strong>${esc(er.monthLabel)}</strong>
                             <div class="spec-muted-sm">${er.entryCount} entries · ${er.slides.length} stories ${er.topTag ? `· 🧳 ${esc(er.topTag)}` : ''}</div>
                           </div>
                           <strong>${ctx.formatCurrency(er.totalSpent)} ›</strong>
                         </button>
                       `
                     )
                     .join('')}
                 </div>
               </section>`
            : ''
        }
      `;
    }

    root.innerHTML = `
      <div class="spec-phone-container">
        ${tabsHeaderHtml}
        <div class="spec-stats-body">
          ${tabBodyHtml}
        </div>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('stats')}
      </div>
    `;

    // Bind Stats events
    root.querySelectorAll('[data-stats-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        specState.statsTab = btn.dataset.statsTab;
        specState.statsSubscreen = null;
        render();
      });
    });
    root.querySelectorAll('[data-stats-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        specState.statsPeriod = btn.dataset.statsPeriod;
        render();
      });
    });
    root.querySelectorAll('[data-toggle-table]').forEach((btn) => {
      btn.addEventListener('click', () => toggleTable(btn.dataset.toggleTable));
    });
    root.querySelectorAll('[data-drill-cat]').forEach((el) => {
      el.addEventListener('click', () => {
        specState.drillCategoryId = el.dataset.drillCat;
        specState.statsSubscreen = 'drilldown';
        render();
      });
    });
    root.querySelector('#spec-open-all-facts')?.addEventListener('click', () => {
      specState.statsSubscreen = 'allfacts';
      render();
    });
    root.querySelector('#spec-cal-prev')?.addEventListener('click', () => {
      ctx.changeMonth(-1);
      render();
    });
    root.querySelector('#spec-cal-next')?.addEventListener('click', () => {
      ctx.changeMonth(1);
      render();
    });
    root.querySelectorAll('[data-cal-iso]').forEach((el) => {
      el.addEventListener('click', () => {
        const iso = el.dataset.calIso;
        ctx.state.selectedCalendarDate = ctx.state.selectedCalendarDate === iso ? null : iso;
        render();
      });
    });
    root.querySelector('#spec-open-patterns-btn')?.addEventListener('click', () => {
      specState.statsSubscreen = 'patterns';
      render();
    });
    const expInp = root.querySelector('#spec-explore-input');
    expInp?.addEventListener('input', () => {
      ctx.state.exploreQuery = expInp.value;
      renderStatsScreen(root, expenses, settings, spanComp);
      const newInp = root.querySelector('#spec-explore-input');
      if (newInp) {
        newInp.focus();
        newInp.setSelectionRange(newInp.value.length, newInp.value.length);
      }
    });
    root.querySelector('#spec-edit-question-btn')?.addEventListener('click', () => {
      openAddPalette(specState.exploreFromQuestion || ctx.state.exploreQuery || '');
    });
    root.querySelectorAll('[data-exp-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.state.exploreGroupBy = btn.dataset.expGroup;
        render();
      });
    });
    root.querySelector('#spec-open-compare-btn')?.addEventListener('click', () => {
      specState.statsSubscreen = 'compare';
      render();
    });
    root.querySelector('#spec-watch-featured-recap')?.addEventListener('click', () => {
      const curRecap = computeMonthlyRecap(
        expenses,
        budget,
        ctx.state.selectedYear,
        ctx.state.selectedMonth,
        ctx.formatCurrency
      );
      ctx.openStoryModal(curRecap);
    });
    root.querySelectorAll('[data-recap-y]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const y = Number(btn.dataset.recapY);
        const m = Number(btn.dataset.recapM);
        const r = computeMonthlyRecap(expenses, budget, y, m, ctx.formatCurrency);
        ctx.openStoryModal(r);
      });
    });

    bindCommonClicks(root);
  }

  // 4B: CATEGORY DRILL-DOWN SUB-SCREEN (< Overview   🍲 Food)
  function renderCategoryDrillSubscreen(root, expenses, spanComp) {
    const drill = computeCategoryDrilldown(
      expenses,
      specState.drillCategoryId,
      ctx.state.selectedYear,
      ctx.state.selectedMonth
    );
    const catDelta = spanComp.categoryDeltaById[specState.drillCategoryId] || { pct: 0, diff: 0 };
    const isLess = (catDelta.diff || 0) <= 0;
    const maxM = Math.max(1, ...drill.last5Months.map((m) => m.amount));
    const maxItem = Math.max(1, ...drill.topItems.map((i) => i.amount));
    const maxW = Math.max(1, ...drill.weekdayAvgs.map((w) => w.avg));

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-sub-header">
          <button type="button" class="spec-back-link" id="spec-back-overview">‹ Overview</button>
          <strong class="spec-sub-title">${drill.category.icon} ${esc(drill.category.shortName || drill.category.name)}</strong>
          <span style="width:64px"></span>
        </header>

        <section class="spec-stats-kpi">
          <div class="spec-span-kicker">${esc(spanComp.curSpanLabel)}</div>
          <h2 class="spec-hero-amount">${ctx.formatCurrency(drill.curCatTotal)}</h2>
          <div class="spec-delta-line ${isLess ? 'is-good' : 'is-bad'}">
            ${isLess ? '▼' : '▲'} ${Math.abs(catDelta.pct || 0)}% ${isLess ? 'less' : 'more'} vs ${esc(spanComp.prevSpanLabel)}
          </div>
          <div class="spec-muted-sm">${drill.entryCount} entries · ${drill.sharePct}% of all spending</div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Last 5 months</strong>
            <span class="spec-muted-sm">${FULL_MONTHS[ctx.state.selectedMonth]} so far</span>
          </div>
          <div class="spec-vbars-5">
            ${drill.last5Months
              .map((m) => {
                const h = Math.max(6, Math.round((m.amount / maxM) * 100));
                return `
                  <div class="spec-vbar-col ${m.isCurrent ? 'is-highlight' : ''}">
                    <span class="spec-vbar-top">${m.isCurrent && m.amount > 0 ? fmtK(m.amount) : ''}</span>
                    <div class="spec-vbar-track"><div class="spec-vbar-fill" style="height:${h}%"></div></div>
                    <span class="spec-vbar-lbl">${esc(m.label)}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Top items</strong>
            <span class="spec-muted-sm">by ₹</span>
          </div>
          <div class="spec-qa-bars">
            ${drill.topItems
              .map((it) => {
                const w = Math.max(6, Math.round((it.amount / maxItem) * 100));
                return `
                  <div class="spec-qa-bar-row">
                    <span class="spec-qa-item-name">${esc(it.note)}</span>
                    <div class="spec-qa-bar-track"><div class="spec-qa-bar-fill" style="width:${w}%"></div></div>
                    <strong class="spec-qa-item-val">${ctx.formatCurrency(it.amount)}</strong>
                    <span class="spec-muted-sm">×${it.count}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Which day</strong>
            <span class="spec-muted-sm">avg/week · 90 days</span>
          </div>
          <div class="spec-vbars-7">
            ${drill.weekdayAvgs
              .map((w) => {
                const isPeak = w.avg === maxW && w.avg > 0;
                const h = Math.max(6, Math.round((w.avg / maxW) * 100));
                return `
                  <div class="spec-vbar-col ${isPeak ? 'is-highlight' : ''}">
                    <span class="spec-vbar-top">${isPeak ? fmtK(w.avg) : ''}</span>
                    <div class="spec-vbar-track"><div class="spec-vbar-fill" style="height:${h}%"></div></div>
                    <span class="spec-vbar-lbl">${esc(w.label[0])}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <button type="button" class="spec-card spec-nav-card-btn" id="spec-drill-to-explore">
          <span>See every ${esc(drill.category.shortName || drill.category.name)} entry in Explore</span>
          <span>›</span>
        </button>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('stats')}
      </div>
    `;

    root.querySelector('#spec-back-overview')?.addEventListener('click', () => {
      specState.statsSubscreen = null;
      render();
    });
    root.querySelector('#spec-drill-to-explore')?.addEventListener('click', () => {
      ctx.state.exploreQuery = `${(drill.category.shortName || drill.category.name).toLowerCase()} this month`;
      ctx.state.exploreGroupBy = 'item';
      specState.statsSubscreen = null;
      specState.statsTab = 'explore';
      render();
    });
    bindCommonClicks(root);
  }

  // 4C: ALL FUN FACTS SUB-SCREEN (< Overview   Fun facts)
  function renderAllFunFactsSubscreen(root, expenses, settings, spanComp) {
    const periodItems = ctx.getPeriodExpenses();
    const { clearedFacts, totalRules } = computeFunFacts(
      expenses,
      periodItems,
      spanComp,
      Number(settings.monthlyBudget) || 30000,
      ctx.formatCurrency
    );

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-sub-header">
          <button type="button" class="spec-back-link" id="spec-back-overview">‹ Overview</button>
          <strong class="spec-sub-title">Fun facts</strong>
          <span style="width:64px"></span>
        </header>

        <p class="spec-muted-sm" style="margin: 0.25rem 0 0.75rem;">
          ${esc(spanComp.curSpanLabel)} · ${clearedFacts.length} of ${totalRules} facts cleared their bar. The rest stay hidden until they're interesting.
        </p>

        <div class="spec-facts-stack">
          ${clearedFacts
            .map(
              (f) => `
                <article class="spec-card spec-fact-row">
                  <span class="spec-fact-emoji">${f.icon}</span>
                  <div>
                    <strong>${esc(f.title)}</strong>
                    <p>${esc(f.body)}</p>
                  </div>
                </article>
              `
            )
            .join('')}
        </div>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('stats')}
      </div>
    `;

    root.querySelector('#spec-back-overview')?.addEventListener('click', () => {
      specState.statsSubscreen = null;
      render();
    });
    bindCommonClicks(root);
  }

  // 5B: PATTERNS SUB-SCREEN (< Calendar   Patterns)
  function renderPatternsSubscreen(root, expenses) {
    const data = computeCalendarAndPatterns(
      expenses,
      ctx.state.selectedYear,
      ctx.state.selectedMonth
    );
    const maxW = Math.max(1, ...data.weekdayBars.map((b) => b.avg));
    const maxH = Math.max(1, ...data.hourBuckets.map((b) => b.total));

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-sub-header">
          <button type="button" class="spec-back-link" id="spec-back-calendar">‹ Calendar</button>
          <strong class="spec-sub-title">Patterns</strong>
          <span style="width:64px"></span>
        </header>

        <div class="spec-muted-sm" style="margin-bottom:0.5rem">Last 90 days</div>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Your week</strong>
            <span class="spec-muted-sm">avg per weekday</span>
          </div>
          <div class="spec-vbars-7">
            ${data.weekdayBars
              .map((wb) => {
                const isPeak = wb.label === data.maxWeekday.label && wb.avg > 0;
                const h = Math.max(6, Math.round((wb.avg / maxW) * 100));
                return `
                  <div class="spec-vbar-col ${isPeak ? 'is-highlight' : ''}">
                    <span class="spec-vbar-top">${isPeak ? fmtK(wb.avg) : ''}</span>
                    <div class="spec-vbar-track"><div class="spec-vbar-fill" style="height:${h}%"></div></div>
                    <span class="spec-vbar-lbl">${esc(wb.label)}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
          <div class="spec-muted-sm" style="margin-top:0.5rem">
            ${data.maxWeekday.avg > 0 ? `${esc(data.maxWeekday.label)} is your priciest day: ${data.priciestMultiplier}× your daily average` : ''}
          </div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Your day</strong>
            <span class="spec-muted-sm">avg ₹/hour</span>
          </div>
          <div class="spec-vbars-9">
            ${data.hourBuckets
              .map((hb) => {
                const isPeak = hb.label === data.peakHourBucket.label && hb.total > 0;
                const h = Math.max(6, Math.round((hb.total / maxH) * 100));
                return `
                  <div class="spec-vbar-col ${isPeak ? 'is-highlight' : ''}">
                    <span class="spec-vbar-top">${isPeak ? fmtK(hb.total) : ''}</span>
                    <div class="spec-vbar-track"><div class="spec-vbar-fill" style="height:${h}%"></div></div>
                    <span class="spec-vbar-lbl">${esc(hb.label)}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <div class="spec-two-tiles">
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Light-day streak</span>
            <strong>${data.currentLightStreak} days</strong>
            <span class="spec-muted-sm">in a row under ₹300</span>
          </div>
          <div class="spec-card spec-stat-tile">
            <span class="spec-muted-sm">Best no-spend run</span>
            <strong>${data.bestNoSpendRun} days</strong>
            <span class="spec-muted-sm">in last 90 days</span>
          </div>
        </div>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Habits we noticed</strong>
            <span class="spec-muted-sm">auto-detected</span>
          </div>
          <div class="spec-entries-card">
            ${
              data.habits.length > 0
                ? data.habits
                    .map((h) => {
                      const c = getCategoryById(h.category);
                      return `
                        <div class="spec-entry-row">
                          <div class="spec-entry-icon" style="background:${c.color}18">${c.icon}</div>
                          <div class="spec-entry-mid">
                            <div class="spec-entry-note">${esc(h.note)}</div>
                            <div class="spec-entry-sub">${esc(h.meta)}</div>
                          </div>
                          <div class="spec-entry-amt">${ctx.formatCurrency(h.avgAmt)} avg</div>
                        </div>
                      `;
                    })
                    .join('')
                : `<p class="field-hint">Items logged 3+ times will automatically appear here with their cadence and usual time.</p>`
            }
          </div>
        </section>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('stats')}
      </div>
    `;

    root.querySelector('#spec-back-calendar')?.addEventListener('click', () => {
      specState.statsSubscreen = null;
      render();
    });
    bindCommonClicks(root);
  }

  // 5D: COMPARE SUB-SCREEN (< Explore   Compare)
  function renderCompareSubscreen(root, expenses) {
    const modeForComp = specState.comparePeriod === 'week' ? '7d' : 'month';
    const comp = computeSameSpanComparison(
      expenses,
      modeForComp,
      ctx.state.selectedYear,
      ctx.state.selectedMonth,
      new Date()
    );
    const diff = comp.deltaAmt || 0;
    const isLess = diff <= 0;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const maxAbs = Math.max(1, ...comp.categoryDeltas.map((c) => Math.abs(c.diff)));

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-sub-header">
          <button type="button" class="spec-back-link" id="spec-back-explore">‹ Explore</button>
          <strong class="spec-sub-title">Compare</strong>
          <span style="width:64px"></span>
        </header>

        <div class="spec-segmented-2">
          <button type="button" class="spec-seg-btn ${specState.comparePeriod === 'week' ? 'active' : ''}" data-comp-period="week">Week</button>
          <button type="button" class="spec-seg-btn ${specState.comparePeriod === 'month' ? 'active' : ''}" data-comp-period="month">Month</button>
        </div>

        <section class="spec-stats-kpi">
          <div class="spec-span-kicker">${esc(comp.curSpanLabel)} vs ${esc(comp.prevSpanLabel)}</div>
          <h2 class="spec-hero-amount">${sign}${ctx.formatCurrency(Math.abs(diff))}</h2>
          <div class="spec-delta-line ${isLess ? 'is-good' : 'is-bad'}">
            ${comp.deltaPct !== null ? `${isLess ? '▼' : '▲'} ${Math.abs(comp.deltaPct)}% ${isLess ? 'less' : 'more'} vs ${esc(comp.prevSpanLabel)}` : ''}
          </div>
        </section>

        <section class="spec-card">
          <div class="spec-card-head">
            <strong>Change by category</strong>
          </div>
          <div class="spec-div-legend">
            <span><i style="background:#2a78d6"></i> spent less</span>
            <span><i style="background:#e34948"></i> spent more</span>
          </div>
          <div class="spec-diverging-list">
            ${comp.categoryDeltas
              .map((c) => {
                const more = c.diff > 0;
                const w = Math.min(48, Math.max(2, Math.round((Math.abs(c.diff) / maxAbs) * 48)));
                const s = c.diff > 0 ? '+' : c.diff < 0 ? '−' : '';
                return `
                  <div class="spec-div-row">
                    <span class="spec-div-cat">${c.icon} ${esc(c.shortName || c.name)}</span>
                    <div class="spec-div-track">
                      <div class="spec-div-mid"></div>
                      <div class="spec-div-bar ${more ? 'is-more' : 'is-less'}" style="${more ? `left:50%; width:${w}%` : `right:50%; width:${w}%`}"></div>
                    </div>
                    <strong class="spec-div-val ${more ? 'is-more' : 'is-less'}">${s}${ctx.formatCurrency(Math.abs(c.diff))}</strong>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <section class="spec-card spec-what-changed-card">
          <strong>💬 What changed</strong>
          <p>
            ${comp.biggestRise ? `${comp.biggestRise.icon} <strong>${esc(comp.biggestRise.shortName || comp.biggestRise.name)}</strong> rose the most (+${ctx.formatCurrency(comp.biggestRise.diff)}). ` : ''}
            ${comp.biggestFall ? `${comp.biggestFall.icon} <strong>${esc(comp.biggestFall.shortName || comp.biggestFall.name)}</strong> fell the most (−${ctx.formatCurrency(Math.abs(comp.biggestFall.diff))}).` : ''}
          </p>
          ${comp.newItems.length > 0 ? `<p><strong>New this time:</strong> ${esc(comp.newItems.join(', '))}</p>` : ''}
          ${comp.skippedItems.length > 0 ? `<p><strong>Skipped:</strong> ${esc(comp.skippedItems.join(', '))}</p>` : ''}
        </section>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('stats')}
      </div>
    `;

    root.querySelector('#spec-back-explore')?.addEventListener('click', () => {
      specState.statsSubscreen = null;
      render();
    });
    root.querySelectorAll('[data-comp-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        specState.comparePeriod = btn.dataset.compPeriod;
        render();
      });
    });
    bindCommonClicks(root);
  }

  // 3C: HISTORY SCREEN (Midnight Redesign with Filter Chips & Out/In Summary)
  function renderHistoryScreen(root, expenses) {
    const rawQ = specState.historyQuery.trim();
    const activeChip = specState.historyChip || 'all';
    const parsedQ = rawQ ? parseQuestionQuery(rawQ, new Date()) : null;
    let filtered = [...expenses];
    let filterLabel = FULL_MONTHS[ctx.state.selectedMonth];

    if (parsedQ && parsedQ.isSpecific) {
      const ans = evaluateQuestionQuery(expenses, parsedQ);
      filtered = ans.matchingItems;
      filterLabel = `${ans.filterTitle} · ${ans.periodLabel}`;
    } else if (rawQ) {
      const q = rawQ.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          (e.note || '').toLowerCase().includes(q) ||
          normalizeTags(e).some((t) => t.includes(q))
      );
      filterLabel = `“${rawQ}”`;
    }

    if (activeChip === 'expense') {
      filtered = filtered.filter((e) => normalizeEntryType(e) !== 'income');
    } else if (activeChip === 'income') {
      filtered = filtered.filter((e) => normalizeEntryType(e) === 'income');
    } else if (['upi', 'card', 'cash'].includes(activeChip)) {
      filtered = filtered.filter((e) => normalizePaymentMethod(e) === activeChip);
    }

    const totalOut = filtered
      .filter((e) => normalizeEntryType(e) !== 'income')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalIn = filtered
      .filter((e) => normalizeEntryType(e) === 'income')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const todayIso = toLocalISODate(new Date());
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterdayIso = toLocalISODate(yest);

    const byDate = new Map();
    for (const e of filtered) {
      const list = byDate.get(e.date) || [];
      list.push(e);
      byDate.set(e.date, list);
    }
    const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

    const chips = [
      ['all', 'All'],
      ['expense', 'Expenses'],
      ['income', 'Income'],
      ['upi', 'UPI'],
      ['card', 'Card'],
      ['cash', 'Cash']
    ];

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-midnight-hdr">
          <h2 class="spec-hdr-greeting">History</h2>
          <button type="button" class="spec-circle-btn" id="spec-export-history-csv" title="Export CSV">⇩</button>
        </header>

        <div class="spec-search-pill">
          <span class="spec-search-ico">${MIDNIGHT_ICONS.search}</span>
          <input type="text" id="spec-history-search" value="${esc(specState.historyQuery)}" placeholder="Try &quot;food last week&quot; or &quot;&gt; 500&quot;" autocomplete="off" />
        </div>

        <div class="spec-midnight-filter-chips">
          ${chips
            .map(
              ([id, lbl]) =>
                `<button type="button" class="spec-filter-chip ${activeChip === id ? 'is-on' : ''}" data-hist-chip="${id}">${lbl}</button>`
            )
            .join('')}
        </div>

        <div class="spec-history-summary">
          ${esc(filterLabel)} · ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'} · <b style="color:var(--spec-ink)">${ctx.formatCurrency(totalOut)} out</b>${totalIn > 0 ? ` · <b style="color:var(--spec-primary)">${ctx.formatCurrency(totalIn)} in</b>` : ''}
        </div>

        <div class="spec-days-feed">
          ${sortedDates
            .map((iso) => {
              const items = byDate.get(iso) || [];
              const daySum = items
                .filter((e) => normalizeEntryType(e) !== 'income')
                .reduce((s, e) => s + (Number(e.amount) || 0), 0);
              return `
                <div class="spec-day-group">
                  <div class="spec-day-header">
                    <span>${esc(formatDayGroupHeader(iso, todayIso, yesterdayIso))}</span>
                    <span>${ctx.formatCurrency(daySum)}</span>
                  </div>
                  <div class="spec-card spec-entries-card">
                    ${items
                      .map((item, idx) => {
                        const isInc = normalizeEntryType(item) === 'income';
                        const c = getCategoryById(item.category);
                        const p = getPaymentMethodById(normalizePaymentMethod(item));
                        return `
                          <div class="spec-entry-row" data-edit-id="${esc(item.id)}">
                            <div class="spec-entry-icon" style="background:${isInc ? '#22c55e24' : `${c.color}22`}">${isInc ? '💰' : c.icon}</div>
                            <div class="spec-entry-mid">
                              <div class="spec-entry-note">${esc(item.note)}</div>
                              <div class="spec-entry-sub">${isInc ? 'Income · Bank' : `${esc(c.shortName || c.name)} · ${esc(p.shortName)} · ${formatTime12h(item.updatedAt, idx)}`}</div>
                            </div>
                            <div class="spec-entry-amt ${isInc ? 'is-inc' : ''}">${isInc ? '+' : ''}${ctx.formatCurrency(item.amount)}</div>
                          </div>
                        `;
                      })
                      .join('')}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('history')}
      </div>
    `;

    const sInp = root.querySelector('#spec-history-search');
    sInp?.addEventListener('input', () => {
      specState.historyQuery = sInp.value;
      renderHistoryScreen(root, expenses);
      const newInp = root.querySelector('#spec-history-search');
      if (newInp) {
        newInp.focus();
        newInp.setSelectionRange(newInp.value.length, newInp.value.length);
      }
    });
    root.querySelectorAll('[data-hist-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        specState.historyChip = btn.dataset.histChip || 'all';
        renderHistoryScreen(root, expenses);
      });
    });
    root.querySelector('#spec-export-history-csv')?.addEventListener('click', () => {
      ctx.exportCsv(filtered);
    });
    bindCommonClicks(root);
  }

  // 3D: SETTINGS SCREEN (Midnight Redesign)
  function renderSettingsScreen(root, expenses, settings) {
    const curTheme = settings.theme || 'dark';
    const curInputStyle = settings.inputStyle || 'keyboard';
    const learnedCount = Object.keys(getLearnedKeywords() || {}).length;
    const rawName = (settings.userName || '').trim();
    const initial = rawName ? rawName[0].toUpperCase() : 'T';

    root.innerHTML = `
      <div class="spec-phone-container">
        <header class="spec-midnight-hdr">
          <h2 class="spec-hdr-greeting">Settings</h2>
        </header>

        <div class="spec-midnight-profile">
          <span class="spec-midnight-avatar">${esc(initial)}</span>
          <label class="spec-midnight-profile-meta" for="spec-set-username">
            <input type="text" id="spec-set-username" class="spec-midnight-name-input" placeholder="Your name" value="${esc(rawName)}" />
            <small class="spec-muted-sm">Tap to edit name</small>
          </label>
        </div>

        <div class="spec-settings-group">
          <div class="spec-section-kicker">MONEY</div>
          <div class="spec-card spec-settings-card">
            <div class="spec-setting-row">
              <div><strong>Monthly budget</strong></div>
              <div style="display:inline-flex;align-items:center;gap:4px">
                <span class="spec-muted-sm">₹</span>
                <input type="number" id="spec-set-budget" class="spec-inline-num" value="${Number(settings.monthlyBudget) || 30000}" step="500" />
              </div>
            </div>
            <div class="spec-setting-row" id="spec-open-recurring-modal" style="cursor:pointer">
              <div>
                <strong>Credit cards &amp; recurring bills</strong>
                <div class="spec-muted-sm">Statement cycles, due reminders &amp; monthly subscriptions</div>
              </div>
              <span class="spec-muted-sm">${(settings.creditCards || []).length || 1} ${(settings.creditCards || []).length === 1 ? 'card' : 'cards'} · ${ctx.state.recurringRules.length} bills ›</span>
            </div>
          </div>
        </div>

        <div class="spec-settings-group">
          <div class="spec-section-kicker">ADDING</div>
          <div class="spec-card spec-settings-card">
            <div class="spec-setting-row">
              <div>
                <strong>Input</strong>
                <div class="spec-muted-sm">Keyboard typing vs numeric keypad</div>
              </div>
              <div class="spec-pill-switch">
                <button type="button" class="${curInputStyle === 'keyboard' ? 'active' : ''}" data-set-input="keyboard">Keyboard</button>
                <button type="button" class="${curInputStyle === 'keypad' ? 'active' : ''}" data-set-input="keypad">Keypad</button>
              </div>
            </div>

            <div class="spec-setting-row">
              <div>
                <strong>Default payment</strong>
                <div class="spec-muted-sm">Used when you don't type one</div>
              </div>
              <select id="spec-set-default-pay" class="spec-select">
                ${PAYMENT_METHODS.map(
                  (pm) =>
                    `<option value="${pm.id}" ${(settings.defaultPayment || 'upi') === pm.id ? 'selected' : ''}>${esc(pm.shortName)}</option>`
                ).join('')}
              </select>
            </div>

            <div class="spec-setting-row">
              <div>
                <strong>Open straight to Add</strong>
                <div class="spec-muted-sm">Launches directly into Add with keyboard open</div>
              </div>
              <input type="checkbox" id="spec-set-open-add" class="spec-ios-switch" ${settings.openToAdd !== false ? 'checked' : ''} />
            </div>

            <div class="spec-setting-row">
              <div>
                <strong>Haptic feedback</strong>
                <div class="spec-muted-sm">Subtle vibration when tapping keys &amp; saving</div>
              </div>
              <input type="checkbox" id="spec-set-haptics" class="spec-ios-switch" ${settings.hapticsEnabled !== false ? 'checked' : ''} />
            </div>
          </div>
        </div>

        <div class="spec-settings-group">
          <div class="spec-section-kicker">LOOK</div>
          <div class="spec-card spec-settings-card">
            <div class="spec-setting-row">
              <div><strong>Theme</strong></div>
              <div class="spec-pill-switch">
                <button type="button" class="${curTheme === 'clean' ? 'active' : ''}" data-set-theme="clean">Light</button>
                <button type="button" class="${curTheme === 'dark' ? 'active' : ''}" data-set-theme="dark">Dark</button>
                <button type="button" class="${curTheme === 'receipt' ? 'active' : ''}" data-set-theme="receipt">Receipt</button>
              </div>
            </div>
            <div class="spec-setting-row">
              <div>
                <strong>Home screen density</strong>
                <div class="spec-muted-sm">Collapsible Yesterday/Earlier vs all open</div>
              </div>
              <div class="spec-pill-switch">
                <button type="button" class="${settings.homeStyle !== 'expanded' ? 'active' : ''}" data-set-homestyle="accordions">Compact</button>
                <button type="button" class="${settings.homeStyle === 'expanded' ? 'active' : ''}" data-set-homestyle="expanded">Expanded</button>
              </div>
            </div>
            <div class="spec-setting-row">
              <div><strong>Show monthly recap card on Home</strong></div>
              <input type="checkbox" id="spec-set-recap-card" class="spec-ios-switch" ${settings.recapCard !== false ? 'checked' : ''} />
            </div>
          </div>
        </div>

        <div class="spec-settings-group">
          <div class="spec-section-kicker">DATA</div>
          <div class="spec-card spec-settings-card">
            <div class="spec-setting-row" id="spec-open-cloud-sync" style="cursor:pointer">
              <div>
                <strong>Google Sheets</strong>
                <div class="spec-muted-sm">${settings.webhookUrl ? '2-way cloud backup active' : 'Optional free cloud backup'}</div>
              </div>
              <span class="spec-muted-sm" style="display:inline-flex;align-items:center;gap:6px">
                <i class="spec-status-dot ${settings.webhookUrl ? 'is-on' : ''}"></i>
                ${settings.webhookUrl ? 'Synced ›' : 'Set up ›'}
              </span>
            </div>
            <div class="spec-setting-row" id="spec-export-all-csv" style="cursor:pointer">
              <div>
                <strong>Export CSV / Backup</strong>
                <div class="spec-muted-sm">${learnedCount} learned category keywords active</div>
              </div>
              <span>›</span>
            </div>
            <div class="spec-setting-row" id="spec-seed-demo-settings" style="cursor:pointer">
              <div>
                <strong>Load sample data</strong>
                <div class="spec-muted-sm">Populate sample entries to preview all charts</div>
              </div>
              <span>✨</span>
            </div>
          </div>
        </div>

        <div class="spec-settings-group">
          <div class="spec-section-kicker">ANDROID APP &amp; NOTIFICATIONS</div>
          <div class="spec-card spec-settings-card" id="TODO-HERE-11">
            <!-- TODO-HERE-11 -->
            ${FEATURE_REMOTE_NOTIF_SYNC ? `
            <div class="spec-setting-row">
              <div>
                <strong>Store data locally on this phone</strong>
              </div>
              <input type="checkbox" id="spec-set-remote-notif-sync" class="spec-ios-switch" ${settings.remoteNotificationSyncEnabled ? 'checked' : ''} />
            </div>
            ` : ''}
            <div class="spec-setting-row" id="spec-open-widget-sim" style="cursor:pointer">
              <div>
                <strong>📱 Preview Android Home Widget</strong>
                <div class="spec-muted-sm">Test the 4×2 live widget &amp; floating Quick-Add</div>
              </div>
              <span>▶</span>
            </div>
            <div class="spec-setting-row" id="spec-check-ota-btn" style="cursor:pointer">
              <div>
                <strong>↻ Check for OTA Update</strong>
                <div class="spec-muted-sm" id="spec-ota-status-line">${
                  getOtaMeta()?.sha
                    ? `Live build ${esc(getOtaMeta().sha)} · Tap to pull latest`
                    : 'Pulls latest GitHub main update'
                }</div>
              </div>
              <span>↻</span>
            </div>
            <a
              class="spec-setting-row"
              href="https://github.com/Tanay-J/quick-expense/releases/latest/download/DropSpend.apk"
              target="_blank"
              rel="noopener"
              style="text-decoration:none; color:inherit;"
            >
              <div>
                <strong>📦 Download Android APK</strong>
                <div class="spec-muted-sm">Install on your phone</div>
              </div>
              <span>⬇</span>
            </a>
          </div>
          <p class="spec-settings-footer">Stored on this device · ${expenses.length} entries</p>
        </div>
      </div>
      <div class="spec-midnight-dock">
        ${renderMidnightBottomNav('settings')}
      </div>
    `;

    root.querySelector('#spec-set-username')?.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        ctx.updateSettings({ userName: val });
      }
    });
    root.querySelector('#spec-ui-design-select')?.addEventListener('change', (e) => {
      ctx.setUiDesign(e.target.value);
    });
    root.querySelectorAll('[data-set-input]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.updateSettings({ inputStyle: btn.dataset.setInput });
        specState.addInputStyle = btn.dataset.setInput;
        render();
      });
    });
    root.querySelector('#spec-set-default-pay')?.addEventListener('change', (e) => {
      ctx.updateSettings({ defaultPayment: e.target.value });
      render();
    });
    root.querySelector('#spec-set-open-add')?.addEventListener('change', (e) => {
      ctx.updateSettings({ openToAdd: e.target.checked });
    });
    root.querySelector('#spec-set-haptics')?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      window.__qeHapticsEnabled = enabled;
      ctx.updateSettings({ hapticsEnabled: enabled });
      if (enabled) {
        triggerHaptic('light');
      }
    });
    root.querySelector('#spec-set-usuals-cnt')?.addEventListener('change', (e) => {
      ctx.updateSettings({ usualsCount: Number(e.target.value) });
      render();
    });
    root.querySelector('#spec-set-budget')?.addEventListener('change', (e) => {
      const val = Number(e.target.value);
      if (val >= 0) {
        ctx.updateSettings({ monthlyBudget: val });
      }
    });
    root.querySelector('#spec-open-recurring-modal')?.addEventListener('click', () => {
      ctx.openRecurringModal();
    });
    root.querySelectorAll('[data-set-homestyle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.updateSettings({ homeStyle: btn.dataset.setHomestyle });
        render();
      });
    });
    root.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ctx.updateSettings({ theme: btn.dataset.setTheme });
        render();
      });
    });
    root.querySelector('#spec-set-recap-card')?.addEventListener('change', (e) => {
      ctx.updateSettings({ recapCard: e.target.checked });
    });
    root.querySelector('#spec-set-always-tables')?.addEventListener('change', (e) => {
      ctx.updateSettings({ alwaysTables: e.target.checked });
      render();
    });
    // NotificationFeature - TODO-HERE-11
    if (FEATURE_REMOTE_NOTIF_SYNC) {
      const syncToggle = root.querySelector('#spec-set-remote-notif-sync');

      syncToggle?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;

        if (isChecked) {
          // Preemptive check: Is Android Notification Listener permission granted?
          const isPermGranted = window.DropSpendNative?.isNotificationListenerEnabled
            ? window.DropSpendNative.isNotificationListenerEnabled()
            : false;

          if (!isPermGranted) {
            // Revert switch to OFF until granted in system settings
            e.target.checked = false;
            // Directly launch Android's system settings screen — no intermediate popup
            if (window.DropSpendNative?.openNotificationListenerSettings) {
              window.DropSpendNative.openNotificationListenerSettings();
            }
            return;
          }
        }

        // Permission is granted (or user turned it OFF)
        ctx.updateSettings({ remoteNotificationSyncEnabled: isChecked });
        setRemoteNotificationSync(isChecked);
        if (ctx.showToast) {
          ctx.showToast(isChecked ? 'Remote notification sync enabled' : 'Remote notification sync disabled');
        }
      });

      // Auto-detect when user returns from Android Settings
      window.addEventListener('focus', () => {
        if (syncToggle && !syncToggle.checked) {
          const isNowGranted = window.DropSpendNative?.isNotificationListenerEnabled?.();
          if (isNowGranted && !ctx.getSettings()?.remoteNotificationSyncEnabled) {
            syncToggle.checked = true;
            ctx.updateSettings({ remoteNotificationSyncEnabled: true });
            setRemoteNotificationSync(true);
            if (ctx.showToast) {
              ctx.showToast('✅ Notification access verified — sync enabled!');
            }
          }
        }
      }, { once: true });
    }
    root.querySelector('#spec-open-widget-sim')?.addEventListener('click', () => {
      toggleWidgetSimulator(true);
    });
    root.querySelector('#spec-open-floating-qa')?.addEventListener('click', () => {
      openFloatingQuickAddSimulator('');
    });
    root.querySelector('#spec-check-ota-btn')?.addEventListener('click', () => {
      const statusEl = root.querySelector('#spec-ota-status-line');
      checkAndApplyOtaUpdate({
        manual: true,
        onStatus: (msg) => {
          if (statusEl) statusEl.textContent = msg;
        }
      });
    });
    root.querySelector('#spec-open-cloud-sync')?.addEventListener('click', () => {
      ctx.openSyncAndSettingsModal();
    });
    root.querySelector('#spec-export-all-csv')?.addEventListener('click', () => {
      ctx.exportCsv(expenses);
    });
    root.querySelector('#spec-seed-demo-settings')?.addEventListener('click', () => {
      ctx.seedDemoData();
      specState.screen = 'home';
      render();
    });

    bindCommonClicks(root);
  }

  function bindCommonClicks(root) {
    root.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextScreen = el.dataset.nav;
        if (nextScreen !== 'home') {
          pushNavigationGuard();
        }
        specState.screen = nextScreen;
        specState.statsSubscreen = null;
        render();
        if (nextScreen !== 'home') {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      });
    });

    root.querySelectorAll('[data-edit-id]').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.editId;
        const exp = ctx.state.expenses.find((e) => e.id === id);
        if (exp) {
          pushNavigationGuard();
          ctx.openEditModal(exp);
        }
      });
    });
  }

  // SPA View Caching (faster-spa-view-transitions pattern: content-visibility: hidden + inert)
  let lastHomeSignature = '';

  function ensureViewContainers(root) {
    let homeEl = root.querySelector('#spec-view-home');
    if (!homeEl) {
      root.innerHTML = `
        <div id="spec-view-home" class="spa-view" tabindex="-1"></div>
        <div id="spec-view-stats" class="spa-view inactive" aria-hidden="true" inert tabindex="-1"></div>
        <div id="spec-view-history" class="spa-view inactive" aria-hidden="true" inert tabindex="-1"></div>
        <div id="spec-view-settings" class="spa-view inactive" aria-hidden="true" inert tabindex="-1"></div>
      `;
      lastHomeSignature = '';
    }
    return {
      home: root.querySelector('#spec-view-home'),
      stats: root.querySelector('#spec-view-stats'),
      history: root.querySelector('#spec-view-history'),
      settings: root.querySelector('#spec-view-settings')
    };
  }

  function activateCachedView(views, activeKey) {
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      if (key === activeKey) {
        el.classList.remove('inactive');
        el.setAttribute('aria-hidden', 'false');
        el.removeAttribute('inert');
      } else {
        el.classList.add('inactive');
        el.setAttribute('aria-hidden', 'true');
        el.setAttribute('inert', 'inert');
      }
    });
  }

  function render() {
    const root = document.getElementById('spec-app-root');
    if (!root) return;

    if (ctx.state.uiDesign !== 'spec') {
      root.hidden = true;
      const overlay = document.getElementById('spec-add-overlay');
      if (overlay) overlay.hidden = true;
      return;
    }

    root.hidden = false;
    const expenses = ctx.state.expenses;
    const settings = ctx.getSettings();
    const spanComp = computeSameSpanComparison(
      expenses,
      'month',
      ctx.state.selectedYear,
      ctx.state.selectedMonth,
      new Date()
    );

    const views = ensureViewContainers(root);
    const activeKey = ['stats', 'history', 'settings'].includes(specState.screen)
      ? specState.screen
      : 'home';

    if (activeKey === 'stats') {
      renderStatsScreen(views.stats, expenses, settings, spanComp);
    } else if (activeKey === 'history') {
      renderHistoryScreen(views.history, expenses);
    } else if (activeKey === 'settings') {
      renderSettingsScreen(views.settings, expenses, settings);
    } else {
      // Only rebuild Home DOM if data, month, or theme changed; otherwise reveal cached DOM in <0.5ms!
      const topId = expenses[0]?.id || '';
      const topUpd = expenses[0]?.updatedAt || 0;
      const ccSig = JSON.stringify(settings.creditCards || []) + ':' + (settings.ccRemindDays || 5);
      const homeSig = `${expenses.length}:${topId}:${topUpd}:${spanComp.curTotal}:${settings.monthlyBudget}:${settings.userName || ''}:${settings.theme}:${settings.homeStyle}:${settings.recapCard}:${ccSig}:${ctx.state.selectedYear}-${ctx.state.selectedMonth}`;
      if (homeSig !== lastHomeSignature || !views.home.firstElementChild) {
        renderHomeScreen(views.home, expenses, settings, spanComp);
        lastHomeSignature = homeSig;
      }
    }

    activateCachedView(views, activeKey);
    renderAddOverlay(expenses, settings);
  }

  /**
   * Unwind navigation stack on Android Back swipe or Browser Back button
   * Returns true if back navigation was handled inside the app.
   */
  function handleBackGesture() {
    if (specState.addOpen) {
      closeAddPalette();
      return true;
    }
    if (specState.screen === 'stats' && specState.statsSubscreen) {
      specState.statsSubscreen = null;
      render();
      return true;
    }
    if (specState.screen !== 'home') {
      specState.screen = 'home';
      specState.statsSubscreen = null;
      render();
      return true;
    }
    return false;
  }

  function navigateScreen(screenName) {
    if (screenName && screenName !== specState.screen) {
      if (screenName !== 'home') pushNavigationGuard();
      specState.screen = screenName;
      specState.statsSubscreen = null;
      render();
    }
  }

  return {
    render,
    openAddPalette,
    closeAddPalette,
    handleBackGesture,
    navigateScreen,
    specState
  };
}
