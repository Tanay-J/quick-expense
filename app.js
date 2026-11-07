import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  extractTags,
  getCategoriesByType,
  getCategoryById,
  getLearnedKeywords,
  getPaymentMethodById,
  inferCategory,
  isIncomeCategory,
  learnFromNote,
  mergeLearnedKeywords,
  parseDraftMessage,
  parseExpenseMessage,
  parseQuestionQuery,
  PAYMENT_METHODS,
  toLocalISODate
} from './parser.js?v=22';

import {
  exportToCSV,
  getOrCreateAnonDeviceId,
  GOOGLE_APPS_SCRIPT_CODE,
  loadCachedUsageStats,
  loadExpenses,
  loadRecurringRules,
  loadSettings,
  loadTombstones,
  normalizeEntryType,
  normalizePaymentMethod,
  normalizeTags,
  saveExpenses,
  saveRecurringRules,
  saveSettings,
  saveTombstones,
  syncWithGoogleSheets,
  trackAppUsage
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

import { createSpecController } from './spec-ui.js?v=22';
import {
  initNativeBridge,
  requestSoftKeyboard,
  syncWidgetSnapshot,
  triggerHaptic
} from './native-bridge.js?v=22';

const DESIGN_DESCRIPTIONS = {
  spec: 'Exact 1:1 Clean Mobile UI from the 7 Spec Mockups',
  spotlight: 'Hero input at top + minimal summary + last 5 entries',
  tabs: 'Two clean tabs: ⚡ Quick Log vs 📊 Insights & History',
  chat: 'WhatsApp-style personal chat feed + bottom message bar',
  pocket: 'Apple Wallet summary card + top input + expandable insights',
  classic: 'Original full dashboard layout'
};

function getInitialDesign() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('design');
    if (fromUrl && DESIGN_DESCRIPTIONS[fromUrl]) {
      localStorage.setItem('qe_ui_design_v2', fromUrl);
      return fromUrl;
    }
    const saved = localStorage.getItem('qe_ui_design_v2');
    if (saved && DESIGN_DESCRIPTIONS[saved]) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'spec';
}

// Application State
const state = {
  expenses: loadExpenses(),
  recurringRules: loadRecurringRules(),
  settings: loadSettings(),
  uiDesign: getInitialDesign(), // 'spotlight' | 'tabs' | 'chat' | 'pocket' | 'classic'
  activeView: 'log', // 'log' | 'insights' (used in 'tabs' design)
  insightsSubtab: 'overview', // 'overview' | 'calendar' | 'explore' | 'recaps'
  insightsOpen: false, // used in 'spotlight', 'chat', 'pocket'
  showAllFeed: false, // limits feed to 5 most recent items on minimal landing views
  periodMode: 'month', // 'month' | '7d' | 'all'
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth(), // 0-11
  selectedCategory: null,
  selectedPaymentMethod: null,
  selectedTag: null,
  selectedCalendarDate: null,
  drilldownCategoryId: null,
  showAllFacts: false,
  tableToggles: {
    category: false,
    running: false
  },
  exploreQuery: '',
  exploreGroupBy: 'item', // 'item' | 'category' | 'payment' | 'weekday' | 'tag'
  activeQuestionResult: null,
  activeStory: {
    slides: [],
    index: 0,
    monthKey: ''
  },
  catBreakdownType: 'expense', // 'expense' | 'payment' | 'income'
  feedFilterType: 'all', // 'all' | 'expense' | 'income'
  composerType: 'expense', // 'expense' | 'income'
  searchQuery: '',
  syncState: 'local', // 'local' | 'synced' | 'syncing' | 'error'
  usageStats: loadCachedUsageStats(),
  draftItems: [], // Interactive parsed items staged for saving
  lastSavedIds: new Set()
};

// DOM Elements
const els = {
  designSwitcherBar: document.getElementById('design-switcher-bar'),
  composerDock: document.querySelector('.composer-dock'),
  designPills: document.querySelectorAll('.design-pill'),
  designSwitcherHint: document.getElementById('design-switcher-hint'),
  viewTabs: document.querySelectorAll('.view-tab'),
  themeCycleBtn: document.getElementById('theme-cycle-btn'),
  themeCycleIcon: document.getElementById('theme-cycle-icon'),
  themeCycleLabel: document.getElementById('theme-cycle-label'),
  homeRecapBanner: document.getElementById('home-recap-banner'),
  homeRecapOpenArea: document.getElementById('home-recap-open-area'),
  homeRecapKicker: document.getElementById('home-recap-kicker'),
  homeRecapTitle: document.getElementById('home-recap-title'),
  homeRecapSub: document.getElementById('home-recap-sub'),
  homeRecapDismissBtn: document.getElementById('home-recap-dismiss-btn'),
  miniPeriodTitle: document.getElementById('mini-period-title'),
  miniMonthSpent: document.getElementById('mini-month-spent'),
  miniTodaySpent: document.getElementById('mini-today-spent'),
  miniMonthNet: document.getElementById('mini-month-net'),
  miniPaceCard: document.getElementById('mini-pace-card'),
  miniBudgetLeft: document.getElementById('mini-budget-left'),
  miniBudgetAllowance: document.getElementById('mini-budget-allowance'),
  miniPaceFill: document.getElementById('mini-pace-fill'),
  miniPaceTick: document.getElementById('mini-pace-tick'),
  miniPaceStatus: document.getElementById('mini-pace-status'),
  miniSpanDelta: document.getElementById('mini-span-delta'),
  miniCatStrip: document.getElementById('mini-cat-strip'),
  miniStackedBar: document.getElementById('mini-stacked-bar'),
  miniCatLegend: document.getElementById('mini-cat-legend'),
  toggleInsightsBtn: document.getElementById('toggle-insights-btn'),
  toggleInsightsLabel: document.getElementById('toggle-insights-label'),
  insightsContainer: document.getElementById('insights-container'),
  insightsSubtabs: document.querySelectorAll('.insights-subtab'),
  subtabOverview: document.getElementById('subtab-overview'),
  subtabCalendar: document.getElementById('subtab-calendar'),
  subtabExplore: document.getElementById('subtab-explore'),
  subtabRecaps: document.getElementById('subtab-recaps'),
  recapUnseenDot: document.getElementById('recap-unseen-dot'),
  usualsContainer: document.getElementById('usuals-container'),
  usualsGrid: document.getElementById('usuals-grid'),
  historyAutocomplete: document.getElementById('history-autocomplete'),
  questionAnswerCard: document.getElementById('question-answer-card'),
  quickFillChips: document.querySelectorAll('.quick-fill-chip'),
  quickOpenRecurringBtn: document.getElementById('quick-open-recurring-btn'),
  dueRemindersBar: document.getElementById('due-reminders-bar'),
  ccCycleSpent: document.getElementById('cc-cycle-spent'),
  ccCycleMeta: document.getElementById('cc-cycle-meta'),
  ccMarkPaidBtn: document.getElementById('cc-mark-paid-btn'),
  openCcSettingsBtn: document.getElementById('open-cc-settings-btn'),
  recurringMonthlyTotal: document.getElementById('recurring-monthly-total'),
  recurringSubMeta: document.getElementById('recurring-sub-meta'),
  openRecurringBtn: document.getElementById('open-recurring-btn'),
  feedHeading: document.getElementById('feed-heading'),
  feedFooter: document.getElementById('feed-footer'),
  showAllFeedBtn: document.getElementById('show-all-feed-btn'),
  nameGateDialog: document.getElementById('name-gate-dialog'),
  quickNameForm: document.getElementById('quick-name-form'),
  quickNameInput: document.getElementById('quick-name-input'),
  usageStatsBtn: document.getElementById('usage-stats-btn'),
  usageStatsLabel: document.getElementById('usage-stats-label'),
  syncStatusBtn: document.getElementById('sync-status-btn'),
  syncDot: document.getElementById('sync-dot'),
  syncLabel: document.getElementById('sync-label'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  prevMonthBtn: document.getElementById('prev-month-btn'),
  nextMonthBtn: document.getElementById('next-month-btn'),
  currentPeriodLabel: document.getElementById('current-period-label'),
  modeChips: document.querySelectorAll('.mode-chip'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiSpanDelta: document.getElementById('kpi-span-delta'),
  kpiSubCount: document.getElementById('kpi-sub-count'),
  kpiIncome: document.getElementById('kpi-income'),
  kpiIncomeSub: document.getElementById('kpi-income-sub'),
  kpiNet: document.getElementById('kpi-net'),
  kpiAvg: document.getElementById('kpi-avg'),
  kpiProjected: document.getElementById('kpi-projected'),
  kpiTopCat: document.getElementById('kpi-top-cat'),
  kpiTopCatAmt: document.getElementById('kpi-top-cat-amt'),
  budgetWrap: document.getElementById('budget-progress-wrap'),
  budgetStatusText: document.getElementById('budget-status-text'),
  budgetPacePill: document.getElementById('budget-pace-pill'),
  budgetProgress: document.getElementById('budget-progress'),
  kpiPaceTick: document.getElementById('kpi-pace-tick'),
  catTypeChips: document.querySelectorAll('[data-cat-type]'),
  toggleCatTableBtn: document.getElementById('toggle-cat-table-btn'),
  catStackedBar: document.getElementById('category-stacked-bar'),
  catList: document.getElementById('category-list'),
  catTableWrap: document.getElementById('category-table-wrap'),
  catDrilldownPanel: document.getElementById('cat-drilldown-panel'),
  clearCatFilterBtn: document.getElementById('clear-cat-filter-btn'),
  runningTotalSubtitle: document.getElementById('running-total-subtitle'),
  toggleRunningTableBtn: document.getElementById('toggle-running-table-btn'),
  runningTotalChart: document.getElementById('running-total-chart'),
  runningTotalTable: document.getElementById('running-total-table'),
  trendChart: document.getElementById('trend-chart'),
  trendSubtitle: document.getElementById('trend-subtitle'),
  funFactsPanel: document.getElementById('fun-facts-panel'),
  funFactsSubtitle: document.getElementById('fun-facts-subtitle'),
  toggleAllFactsBtn: document.getElementById('toggle-all-facts-btn'),
  funFactsGrid: document.getElementById('fun-facts-grid'),
  clearCalDateBtn: document.getElementById('clear-cal-date-btn'),
  calendarGrid: document.getElementById('calendar-grid'),
  calMonthTotal: document.getElementById('cal-month-total'),
  calDailyAvg: document.getElementById('cal-daily-avg'),
  calHeavyNospend: document.getElementById('cal-heavy-nospend'),
  patternsWeekdayCallout: document.getElementById('patterns-weekday-callout'),
  patternsWeekdayChart: document.getElementById('patterns-weekday-chart'),
  patternsHourChart: document.getElementById('patterns-hour-chart'),
  streakLightDays: document.getElementById('streak-light-days'),
  streakBestNospend: document.getElementById('streak-best-nospend'),
  habitsList: document.getElementById('habits-list'),
  exploreQueryInput: document.getElementById('explore-query-input'),
  exploreGroupChips: document.querySelectorAll('[data-explore-group]'),
  exploreSummaryTiles: document.getElementById('explore-summary-tiles'),
  exploreBarsList: document.getElementById('explore-bars-list'),
  compareSpanSubtitle: document.getElementById('compare-span-subtitle'),
  compareHeroBox: document.getElementById('compare-hero-box'),
  compareDivergingChart: document.getElementById('compare-diverging-chart'),
  compareWhatChanged: document.getElementById('compare-what-changed'),
  recapsTabContent: document.getElementById('recaps-tab-content'),
  feedTypeChips: document.querySelectorAll('[data-feed-type]'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  expenseList: document.getElementById('expense-list'),
  emptyState: document.getElementById('empty-state'),
  sampleChips: document.querySelectorAll('.sample-chip'),
  parsePreview: document.getElementById('parse-preview'),
  expenseForm: document.getElementById('expense-form'),
  composerTypeBtn: document.getElementById('composer-type-btn'),
  composerTypeIcon: document.getElementById('composer-type-icon'),
  composerTypeLabel: document.getElementById('composer-type-label'),
  expenseInput: document.getElementById('expense-input'),
  sendExpenseBtn: document.getElementById('send-expense-btn'),
  sendBtnText: document.getElementById('send-btn-text'),
  toastRegion: document.getElementById('toast-region'),
  // Dialogs
  syncDialog: document.getElementById('sync-dialog'),
  usageTrackerBadge: document.getElementById('usage-tracker-badge'),
  modalActiveUsers: document.getElementById('modal-active-users'),
  modalUniqueUsers: document.getElementById('modal-unique-users'),
  modalTotalSessions: document.getElementById('modal-total-sessions'),
  modalAnonId: document.getElementById('modal-anon-id'),
  modalUserNames: document.getElementById('modal-user-names'),
  settingsForm: document.getElementById('settings-form'),
  userNameInput: document.getElementById('user-name-input'),
  webhookUrlInput: document.getElementById('webhook-url-input'),
  currencyInput: document.getElementById('currency-input'),
  budgetInput: document.getElementById('budget-input'),
  defaultPaymentInput: document.getElementById('default-payment-input'),
  uiDesignSelectInput: document.getElementById('ui-design-select-input'),
  themeSelectInput: document.getElementById('theme-select-input'),
  alwaysTablesInput: document.getElementById('always-tables-input'),
  forceSyncBtn: document.getElementById('force-sync-btn'),
  copyGasBtn: document.getElementById('copy-gas-btn'),
  gasCodeBlock: document.getElementById('gas-code-block'),
  exportJsonBtn: document.getElementById('export-json-btn'),
  importJsonInput: document.getElementById('import-json-input'),
  editDialog: document.getElementById('edit-dialog'),
  editExpenseForm: document.getElementById('edit-expense-form'),
  editId: document.getElementById('edit-id'),
  editType: document.getElementById('edit-type'),
  editAmount: document.getElementById('edit-amount'),
  editNote: document.getElementById('edit-note'),
  editTags: document.getElementById('edit-tags'),
  editCategoryGrid: document.getElementById('edit-category-grid'),
  editCategory: document.getElementById('edit-category'),
  editPaymentPills: document.getElementById('edit-payment-pills'),
  editPayment: document.getElementById('edit-payment'),
  editDate: document.getElementById('edit-date'),
  editLearnToggle: document.getElementById('edit-learn-toggle'),
  editLearnLabel: document.getElementById('edit-learn-label'),
  editRecurring: document.getElementById('edit-recurring'),
  deleteExpenseBtn: document.getElementById('delete-expense-btn'),
  recurringDialog: document.getElementById('recurring-dialog'),
  ccCycleForm: document.getElementById('cc-cycle-form'),
  ccStatementDayInput: document.getElementById('cc-statement-day-input'),
  ccDueDayInput: document.getElementById('cc-due-day-input'),
  recurringRulesList: document.getElementById('recurring-rules-list'),
  addRecurringForm: document.getElementById('add-recurring-form'),
  addRecurringInput: document.getElementById('add-recurring-input'),
  storyDialog: document.getElementById('story-dialog'),
  storyCardSurface: document.getElementById('story-card-surface'),
  storyProgressBars: document.getElementById('story-progress-bars'),
  storySlideBody: document.getElementById('story-slide-body'),
  storyPrevBtn: document.getElementById('story-prev-btn'),
  storyNextBtn: document.getElementById('story-next-btn'),
  storyCounter: document.getElementById('story-counter')
};

function formatCurrency(amount) {
  const sym = state.settings.currency || '₹';
  const formatted = Number(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2
  });
  return `${sym}${formatted}`;
}

function formatReadableDate(isoDate) {
  const today = toLocalISODate(new Date());
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yesterday = toLocalISODate(yestDate);

  if (isoDate === today) return 'Today';
  if (isoDate === yesterday) return 'Yesterday';

  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function showToast(text, actions = []) {
  els.toastRegion.replaceChildren();
  const timeoutMs = actions.length > 0 ? 2200 : 1400;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.setProperty('--toast-duration', `${timeoutMs}ms`);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'toast-body';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = text;
  bodyWrap.appendChild(msgSpan);

  if (actions.length > 0) {
    const actWrap = document.createElement('div');
    actWrap.className = 'toast-actions';
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action-btn';
      btn.textContent = act.label;
      btn.addEventListener('click', () => {
        toast.remove();
        act.onClick();
      });
      actWrap.appendChild(btn);
    }
    bodyWrap.appendChild(actWrap);
  }

  const progressTrack = document.createElement('div');
  progressTrack.className = 'toast-progress-track';
  progressTrack.setAttribute('aria-hidden', 'true');

  const progressBar = document.createElement('div');
  progressBar.className = 'toast-progress-bar';
  progressTrack.appendChild(progressBar);

  toast.append(bodyWrap, progressTrack);
  els.toastRegion.appendChild(toast);

  // Dismiss automatically when countdown bar finishes (pauses on hover/focus!)
  let fallbackTimer = setTimeout(() => {
    toast.remove();
  }, timeoutMs + 300);

  progressBar.addEventListener('animationend', () => {
    clearTimeout(fallbackTimer);
    toast.remove();
  });

  toast.addEventListener('pointerenter', () => {
    clearTimeout(fallbackTimer);
  });
}

function getPeriodExpenses() {
  const all = state.expenses;
  if (state.periodMode === 'all') {
    return all;
  }
  if (state.periodMode === '7d') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffStr = toLocalISODate(cutoff);
    return all.filter((e) => e.date >= cutoffStr);
  }
  // 'month' mode
  const prefix = `${state.selectedYear}-${String(state.selectedMonth + 1).padStart(2, '0')}`;
  return all.filter((e) => e.date && e.date.startsWith(prefix));
}

function updatePeriodHeader() {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (state.periodMode === 'month') {
    els.currentPeriodLabel.textContent = `${monthNames[state.selectedMonth]} ${state.selectedYear}`;
    els.prevMonthBtn.disabled = false;
    els.nextMonthBtn.disabled = false;
  } else if (state.periodMode === '7d') {
    els.currentPeriodLabel.textContent = 'Last 7 Days';
    els.prevMonthBtn.disabled = true;
    els.nextMonthBtn.disabled = true;
  } else {
    els.currentPeriodLabel.textContent = 'All Time';
    els.prevMonthBtn.disabled = true;
    els.nextMonthBtn.disabled = true;
  }

  els.modeChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.mode === state.periodMode);
  });
}

function formatOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderKPIs(periodExpenses, spanComp) {
  const expenseItems = periodExpenses.filter((item) => normalizeEntryType(item) !== 'income');
  const incomeItems = periodExpenses.filter((item) => normalizeEntryType(item) === 'income');

  const totalSpent = expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalIncome = incomeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const netCashflow = totalIncome - totalSpent;

  els.kpiTotal.textContent = formatCurrency(totalSpent);

  // Same-elapsed-span comparison badge (4A & 1A: e.g. "▼ 6% less vs Oct 1–2")
  const hasSpanDelta = spanComp && spanComp.prevTotal > 0 && spanComp.deltaPct !== null;
  const deltaText = hasSpanDelta
    ? `${spanComp.deltaPct <= 0 ? '▼' : '▲'} ${Math.abs(spanComp.deltaPct)}% ${spanComp.deltaPct <= 0 ? 'less' : 'more'} vs ${spanComp.prevSpanLabel}`
    : '';

  if (els.kpiSpanDelta) {
    if (hasSpanDelta) {
      els.kpiSpanDelta.hidden = false;
      els.kpiSpanDelta.textContent = deltaText;
      els.kpiSpanDelta.dataset.trend = spanComp.deltaPct <= 0 ? 'good' : 'warn';
    } else {
      els.kpiSpanDelta.hidden = true;
    }
  }

  // Update Minimal Summary Bar (Options 1–4)
  const todayIso = toLocalISODate(new Date());
  const todaySpent = state.expenses
    .filter((item) => item.date === todayIso && normalizeEntryType(item) !== 'income')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  if (els.miniPeriodTitle) {
    els.miniPeriodTitle.textContent =
      state.periodMode === '7d'
        ? 'Last 7 Days'
        : state.periodMode === 'all'
          ? 'All Time Spent'
          : `Spent in ${spanComp ? spanComp.curMonthName : 'This Month'}`;
  }
  if (els.miniMonthSpent) {
    els.miniMonthSpent.textContent = formatCurrency(totalSpent);
  }
  if (els.miniTodaySpent) {
    els.miniTodaySpent.textContent = formatCurrency(todaySpent);
  }
  if (els.miniMonthNet) {
    if (netCashflow > 0) {
      els.miniMonthNet.textContent = `+${formatCurrency(netCashflow)}`;
      els.miniMonthNet.dataset.sign = 'positive';
    } else if (netCashflow < 0) {
      els.miniMonthNet.textContent = `−${formatCurrency(Math.abs(netCashflow))}`;
      els.miniMonthNet.dataset.sign = 'negative';
    } else {
      els.miniMonthNet.textContent = formatCurrency(0);
      els.miniMonthNet.dataset.sign = 'neutral';
    }
  }

  // 1A: Smart Budget Pace Tick & Allowance Meter (both in Home Minimal Bar and KPI Card)
  const budget = Number(state.settings.monthlyBudget) || 0;
  const elapsedDay = spanComp ? spanComp.elapsedDay : Math.max(1, new Date().getDate());
  const daysInMonth = spanComp
    ? spanComp.daysInCurMonth
    : new Date(state.selectedYear, state.selectedMonth + 1, 0).getDate();
  const remDays = Math.max(1, daysInMonth - elapsedDay + 1);
  const elapsedPct = Math.min(100, Math.max(2, Math.round((elapsedDay / daysInMonth) * 100)));

  if (state.periodMode === 'month' && budget > 0) {
    const pct = Math.min(100, Math.round((totalSpent / budget) * 100));
    const expectedAtTick = Math.round((budget * elapsedDay) / daysInMonth);
    const paceDiff = Math.round(totalSpent - expectedAtTick);
    const leftAmt = Math.max(0, Math.round(budget - totalSpent));
    const dailyAllowance = Math.round(leftAmt / remDays);
    const isOnPace = paceDiff <= 0;
    const statusCopy = isOnPace
      ? `✓ On pace · ${formatCurrency(Math.abs(paceDiff))} under`
      : `▲ ${formatCurrency(paceDiff)} over pace`;

    // KPI Card budget wrap
    els.budgetWrap.hidden = false;
    els.budgetProgress.value = pct;
    const hue = pct > 90 ? 0 : pct > 75 ? 38 : 150;
    els.budgetProgress.style.setProperty('--budget-hue', String(hue));
    els.budgetStatusText.textContent = `${formatCurrency(leftAmt)} left of ${formatCurrency(budget)}`;
    if (els.budgetPacePill) {
      els.budgetPacePill.textContent = statusCopy;
      els.budgetPacePill.dataset.status = isOnPace ? 'good' : 'warn';
    }
    if (els.kpiPaceTick) {
      els.kpiPaceTick.style.left = `${elapsedPct}%`;
    }

    // Home Minimal Summary Bar Pace Card (1A)
    if (els.miniPaceCard) {
      els.miniPaceCard.hidden = false;
      els.miniBudgetLeft.textContent =
        totalSpent <= budget
          ? `${formatCurrency(leftAmt)} left of ${formatCurrency(budget)}`
          : `${formatCurrency(Math.round(totalSpent - budget))} over ${formatCurrency(budget)} budget`;
      els.miniBudgetAllowance.textContent = `${pct}% of budget`;
      els.miniPaceFill.style.width = `${pct}%`;
      els.miniPaceFill.dataset.status = isOnPace ? 'good' : 'warn';
      els.miniPaceTick.style.left = `${elapsedPct}%`;
      els.miniPaceStatus.textContent = statusCopy;
      els.miniPaceStatus.dataset.status = isOnPace ? 'good' : 'warn';
      if (els.miniSpanDelta) {
        els.miniSpanDelta.textContent = deltaText;
      }
    }
  } else {
    els.budgetWrap.hidden = true;
    if (els.miniPaceCard) {
      if (hasSpanDelta) {
        els.miniPaceCard.hidden = false;
        els.miniBudgetLeft.textContent = `${expenseItems.length} entries in ${spanComp.curSpanLabel}`;
        els.miniBudgetAllowance.textContent = '';
        els.miniPaceFill.style.width = `${elapsedPct}%`;
        els.miniPaceFill.dataset.status = spanComp.deltaPct <= 0 ? 'good' : 'warn';
        els.miniPaceTick.style.left = `${elapsedPct}%`;
        els.miniPaceStatus.textContent = deltaText;
        els.miniPaceStatus.dataset.status = spanComp.deltaPct <= 0 ? 'good' : 'warn';
        if (els.miniSpanDelta) els.miniSpanDelta.textContent = 'Set a Monthly Budget in Settings for pace tracking';
      } else {
        els.miniPaceCard.hidden = true;
      }
    }
  }

  // 1A: Home Mini Stacked Category Bar & Legend (shows categories >= 4%)
  if (els.miniCatStrip && els.miniStackedBar && els.miniCatLegend) {
    els.miniStackedBar.replaceChildren();
    els.miniCatLegend.replaceChildren();
    if (totalSpent > 0 && expenseItems.length > 0) {
      els.miniCatStrip.hidden = false;
      const byCat = {};
      for (const e of expenseItems) {
        byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
      }
      // Fixed order per Page 0 spec for the stacked bar, legend shows >= 4%
      for (const cat of EXPENSE_CATEGORIES) {
        const amt = byCat[cat.id] || 0;
        if (amt <= 0) continue;
        const pct = (amt / totalSpent) * 100;
        const seg = document.createElement('div');
        seg.className = 'stacked-segment';
        seg.style.width = `${Math.max(2, pct)}%`;
        seg.style.setProperty('--cat-hue', cat.hue);
        if (cat.color) seg.style.backgroundColor = cat.color;
        els.miniStackedBar.appendChild(seg);

        if (pct >= 4) {
          const leg = document.createElement('span');
          leg.className = 'mini-cat-leg-item';
          const dot = document.createElement('i');
          dot.className = 'mini-cat-leg-dot';
          dot.style.backgroundColor = cat.color || `hsl(${cat.hue} 75% 55%)`;
          leg.append(dot, document.createTextNode(`${cat.icon} ${cat.shortName || cat.name} ${Math.round(pct)}%`));
          els.miniCatLegend.appendChild(leg);
        }
      }
    } else {
      els.miniCatStrip.hidden = true;
    }
  }

  // Daily average & projected
  const dailyAvg = totalSpent / Math.max(1, elapsedDay);
  els.kpiAvg.textContent = formatCurrency(Math.round(dailyAvg));
  els.kpiSubCount.textContent = `${expenseItems.length} expense${expenseItems.length === 1 ? '' : 's'} • ${formatCurrency(Math.round(dailyAvg))}/day`;

  // Income KPI card
  if (els.kpiIncome) {
    els.kpiIncome.textContent = `+${formatCurrency(totalIncome)}`;
    els.kpiIncomeSub.textContent = `${incomeItems.length} income entr${incomeItems.length === 1 ? 'y' : 'ies'}`;
  }

  // Net Cashflow KPI card
  if (els.kpiNet) {
    if (netCashflow > 0) {
      els.kpiNet.textContent = `+${formatCurrency(netCashflow)}`;
      els.kpiNet.dataset.sign = 'positive';
    } else if (netCashflow < 0) {
      els.kpiNet.textContent = `−${formatCurrency(Math.abs(netCashflow))}`;
      els.kpiNet.dataset.sign = 'negative';
    } else {
      els.kpiNet.textContent = formatCurrency(0);
      els.kpiNet.dataset.sign = 'neutral';
    }
  }

  if (totalIncome > 0) {
    const savingsPct = Math.round(((totalIncome - totalSpent) / totalIncome) * 100);
    if (savingsPct >= 0) {
      els.kpiProjected.textContent = `Saved ${savingsPct}% of income`;
    } else {
      els.kpiProjected.textContent = `Overspent by ${formatCurrency(Math.abs(netCashflow))}`;
    }
  } else if (state.periodMode === 'month') {
    const projected = Math.round(dailyAvg * daysInMonth);
    els.kpiProjected.textContent = `Month pace: ${formatCurrency(projected)}`;
  } else {
    els.kpiProjected.textContent = `Across ${elapsedDay} active day${elapsedDay === 1 ? '' : 's'}`;
  }

  // Top category (for expenses, or income if no expenses exist)
  const targetItems = expenseItems.length > 0 ? expenseItems : incomeItems;
  const targetTotal = expenseItems.length > 0 ? totalSpent : totalIncome;
  const targetLabel = expenseItems.length > 0 ? 'spend' : 'income';

  const byCat = {};
  for (const e of targetItems) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  }
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (sortedCats.length > 0) {
    const [topCatId, topAmt] = sortedCats[0];
    const catObj = getCategoryById(topCatId);
    const pct = targetTotal > 0 ? Math.round((topAmt / targetTotal) * 100) : 0;
    els.kpiTopCat.textContent = `${catObj.icon} ${catObj.name}`;
    els.kpiTopCatAmt.textContent = `${formatCurrency(topAmt)} (${pct}% of ${targetLabel})`;
  } else {
    els.kpiTopCat.textContent = '—';
    els.kpiTopCatAmt.textContent = 'No data yet';
  }
}

function renderCategories(periodExpenses, spanComp) {
  els.catTypeChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.catType === state.catBreakdownType);
  });

  const showTable = Boolean(state.settings.alwaysTables || state.tableToggles.category);
  if (els.toggleCatTableBtn) {
    els.toggleCatTableBtn.textContent = showTable ? '📊 Chart' : '⇄ Table';
    els.toggleCatTableBtn.classList.toggle('active', showTable);
  }

  els.catStackedBar.replaceChildren();
  els.catList.replaceChildren();
  if (els.catTableWrap) els.catTableWrap.replaceChildren();
  els.clearCatFilterBtn.hidden = !(state.selectedCategory || state.selectedPaymentMethod || state.selectedTag);

  // Payment Mode breakdown mode (Expenses grouped by UPI, Credit Card, Cash, Cashback/Wallet, etc.)
  if (state.catBreakdownType === 'payment') {
    if (els.catDrilldownPanel) els.catDrilldownPanel.hidden = true;
    const expenseItems = periodExpenses.filter((item) => normalizeEntryType(item) !== 'income');
    const total = expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const byPay = {};
    for (const e of expenseItems) {
      const pId = normalizePaymentMethod(e);
      byPay[pId] = (byPay[pId] || 0) + Number(e.amount || 0);
    }

    const sortedPay = PAYMENT_METHODS.map((pm) => ({
      ...pm,
      amount: byPay[pm.id] || 0,
      pct: total > 0 ? ((byPay[pm.id] || 0) / total) * 100 : 0
    }))
      .filter((pm) => pm.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    if (sortedPay.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'field-hint';
      emptyLi.textContent =
        'Payment mode breakdown will appear once you log an expense (e.g. "200 fuel upi", "1500 shoes cc", "250 coffee from cashback").';
      els.catList.appendChild(emptyLi);
      return;
    }

    for (const pm of sortedPay) {
      const seg = document.createElement('div');
      seg.className = 'stacked-segment';
      seg.style.width = `${Math.max(2, pm.pct)}%`;
      seg.style.setProperty('--cat-hue', pm.hue);
      els.catStackedBar.appendChild(seg);

      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-row-btn';
      if (state.selectedPaymentMethod === pm.id) {
        btn.classList.add('active');
      }

      const left = document.createElement('span');
      left.className = 'cat-left';

      const dot = document.createElement('span');
      dot.className = 'cat-dot';
      dot.style.setProperty('--cat-hue', pm.hue);
      dot.setAttribute('aria-hidden', 'true');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${pm.icon} ${pm.name}`;

      left.append(dot, nameSpan);

      const right = document.createElement('span');
      right.className = 'cat-right';

      const amtStrong = document.createElement('strong');
      amtStrong.textContent = formatCurrency(pm.amount);

      const pctSpan = document.createElement('span');
      pctSpan.className = 'cat-pct';
      pctSpan.textContent = `${Math.round(pm.pct)}%`;

      right.append(amtStrong, pctSpan);
      btn.append(left, right);

      btn.addEventListener('click', () => {
        state.selectedPaymentMethod = state.selectedPaymentMethod === pm.id ? null : pm.id;
        state.selectedCategory = null;
        renderAll();
      });

      li.appendChild(btn);
      els.catList.appendChild(li);
    }
    return;
  }

  const matchingItems = periodExpenses.filter(
    (item) => normalizeEntryType(item) === state.catBreakdownType
  );
  const total = matchingItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const byCat = {};
  for (const e of matchingItems) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  }

  const pool = getCategoriesByType(state.catBreakdownType);
  const sorted = pool
    .map((c) => {
      const deltaObj = spanComp?.categoryDeltaById?.[c.id];
      return {
        ...c,
        amount: byCat[c.id] || 0,
        pct: total > 0 ? ((byCat[c.id] || 0) / total) * 100 : 0,
        deltaPct: state.catBreakdownType === 'expense' && deltaObj && deltaObj.prevAmt > 0 ? deltaObj.pct : null
      };
    })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'field-hint';
    emptyLi.textContent =
      state.catBreakdownType === 'income'
        ? 'Income breakdown will appear once you log an income entry (e.g. "+50000 salary").'
        : 'Category breakdown will appear once you log an expense.';
    els.catList.appendChild(emptyLi);
    if (els.catDrilldownPanel) els.catDrilldownPanel.hidden = true;
    return;
  }

  // Stacked bar segments in fixed order per Page 0 spec
  for (const cat of pool) {
    const amt = byCat[cat.id] || 0;
    if (amt <= 0) continue;
    const pct = total > 0 ? (amt / total) * 100 : 0;
    const seg = document.createElement('div');
    seg.className = 'stacked-segment';
    seg.style.width = `${Math.max(2, pct)}%`;
    seg.style.setProperty('--cat-hue', cat.hue);
    if (cat.color) seg.style.backgroundColor = cat.color;
    els.catStackedBar.appendChild(seg);
  }

  // 4D: If Table mode is active, render accessible tabular breakdown
  if (showTable && els.catTableWrap) {
    els.catList.hidden = true;
    els.catTableWrap.hidden = false;
    const tbl = document.createElement('table');
    tbl.className = 'data-table';
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Category</th>
          <th class="num-col">Spent</th>
          <th class="num-col">vs Before</th>
          <th class="num-col">Share</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tbl.querySelector('tbody');
    for (const cat of sorted) {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      const deltaStr =
        cat.deltaPct !== null
          ? `<span class="delta-pill" data-trend="${cat.deltaPct <= 0 ? 'good' : 'warn'}">${cat.deltaPct <= 0 ? '▼' : '▲'}${Math.abs(cat.deltaPct)}%</span>`
          : '—';
      tr.innerHTML = `
        <td>${cat.icon} ${cat.shortName || cat.name}</td>
        <td class="num-col"><strong>${formatCurrency(cat.amount)}</strong></td>
        <td class="num-col">${deltaStr}</td>
        <td class="num-col">${Math.round(cat.pct)}%</td>
      `;
      tr.addEventListener('click', () => {
        state.drilldownCategoryId = state.drilldownCategoryId === cat.id ? null : cat.id;
        renderCategoryDrilldown();
      });
      tbody.appendChild(tr);
    }
    els.catTableWrap.appendChild(tbl);
  } else {
    els.catList.hidden = false;
    if (els.catTableWrap) els.catTableWrap.hidden = true;

    for (const cat of sorted) {
      const li = document.createElement('li');
      li.className = 'cat-row-wrap';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-row-btn';
      if (state.selectedCategory === cat.id) {
        btn.classList.add('active');
      }

      const left = document.createElement('span');
      left.className = 'cat-left';

      const dot = document.createElement('span');
      dot.className = 'cat-dot';
      dot.style.setProperty('--cat-hue', cat.hue);
      if (cat.color) dot.style.backgroundColor = cat.color;
      dot.setAttribute('aria-hidden', 'true');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${cat.icon} ${cat.name}`;

      left.append(dot, nameSpan);

      const right = document.createElement('span');
      right.className = 'cat-right';

      const amtStrong = document.createElement('strong');
      amtStrong.textContent =
        state.catBreakdownType === 'income'
          ? `+${formatCurrency(cat.amount)}`
          : formatCurrency(cat.amount);

      right.appendChild(amtStrong);

      if (cat.deltaPct !== null) {
        const deltaSpan = document.createElement('span');
        deltaSpan.className = 'delta-pill';
        deltaSpan.dataset.trend = cat.deltaPct <= 0 ? 'good' : 'warn';
        deltaSpan.textContent = `${cat.deltaPct <= 0 ? '▼' : '▲'}${Math.abs(cat.deltaPct)}%`;
        right.appendChild(deltaSpan);
      }

      const pctSpan = document.createElement('span');
      pctSpan.className = 'cat-pct';
      pctSpan.textContent = `${Math.round(cat.pct)}%`;
      right.appendChild(pctSpan);

      btn.append(left, right);

      btn.addEventListener('click', () => {
        state.selectedCategory = state.selectedCategory === cat.id ? null : cat.id;
        state.selectedPaymentMethod = null;
        renderAll();
      });

      // 4B: Drill-in button to inspect 5-month bars, top items, and weekday average
      const drillBtn = document.createElement('button');
      drillBtn.type = 'button';
      drillBtn.className = `cat-drill-btn ${state.drilldownCategoryId === cat.id ? 'active' : ''}`;
      drillBtn.title = `Drill into ${cat.name} (5-month trend & top items)`;
      drillBtn.textContent = state.drilldownCategoryId === cat.id ? 'Close ▴' : 'Drill ▸';
      drillBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.drilldownCategoryId = state.drilldownCategoryId === cat.id ? null : cat.id;
        renderCategoryDrilldown();
        renderCategories(periodExpenses, spanComp);
      });

      li.append(btn, drillBtn);
      els.catList.appendChild(li);
    }
  }

  renderCategoryDrilldown();
}

/**
 * 4B: Render Category Drill-Down Panel (Last 5 months bars, Top items with xCount, Weekday avg)
 */
function renderCategoryDrilldown() {
  if (!els.catDrilldownPanel) return;
  if (!state.drilldownCategoryId) {
    els.catDrilldownPanel.hidden = true;
    els.catDrilldownPanel.replaceChildren();
    return;
  }

  const drill = computeCategoryDrilldown(
    state.expenses,
    state.drilldownCategoryId,
    state.selectedYear,
    state.selectedMonth
  );
  els.catDrilldownPanel.hidden = false;
  els.catDrilldownPanel.replaceChildren();

  const header = document.createElement('div');
  header.className = 'drill-header';
  header.innerHTML = `
    <div>
      <span class="drill-kicker">CATEGORY DRILL-DOWN</span>
      <h3 class="drill-title">${drill.category.icon} ${drill.category.name} · ${formatCurrency(drill.curCatTotal)}</h3>
      <span class="panel-subtitle">${drill.entryCount} entries · ${drill.sharePct}% of period spend</span>
    </div>
    <div class="drill-header-actions">
      <button type="button" class="mini-pill-btn is-accent" id="drill-open-explore-btn">Explore ${drill.category.shortName || drill.category.name} ▸</button>
      <button type="button" class="mini-pill-btn" id="drill-close-btn">✕</button>
    </div>
  `;
  els.catDrilldownPanel.appendChild(header);

  header.querySelector('#drill-close-btn')?.addEventListener('click', () => {
    state.drilldownCategoryId = null;
    renderAll();
  });
  header.querySelector('#drill-open-explore-btn')?.addEventListener('click', () => {
    state.insightsSubtab = 'explore';
    state.exploreQuery = (drill.category.shortName || drill.category.id).toLowerCase();
    if (els.exploreQueryInput) els.exploreQueryInput.value = state.exploreQuery;
    renderAll();
  });

  // 1. Last 5 Months mini bar chart
  const max5m = Math.max(1, ...drill.last5Months.map((m) => m.amount));
  const mSection = document.createElement('div');
  mSection.className = 'drill-subcard';
  mSection.innerHTML = `<h4 class="sub-card-title">Last 5 Months</h4>`;
  const mBars = document.createElement('div');
  mBars.className = 'patterns-bar-chart';
  for (const m of drill.last5Months) {
    const pct = Math.max(4, Math.round((m.amount / max5m) * 100));
    const col = document.createElement('div');
    col.className = `pattern-col ${m.isCurrent ? 'is-highlight' : ''}`;
    col.innerHTML = `
      <span class="pattern-val">${m.amount > 0 ? formatCurrency(m.amount) : '—'}</span>
      <div class="pattern-track"><div class="pattern-fill" style="height:${pct}%"></div></div>
      <span class="pattern-lbl">${m.label}</span>
    `;
    mBars.appendChild(col);
  }
  mSection.appendChild(mBars);

  // 2. Top Items in Category
  const maxItemAmt = Math.max(1, ...drill.topItems.map((it) => it.amount));
  const topSection = document.createElement('div');
  topSection.className = 'drill-subcard';
  topSection.innerHTML = `<h4 class="sub-card-title">Top Items in ${drill.category.shortName || drill.category.name}</h4>`;
  const itemList = document.createElement('div');
  itemList.className = 'drill-items-list';
  for (const it of drill.topItems) {
    const pct = Math.max(4, Math.round((it.amount / maxItemAmt) * 100));
    const row = document.createElement('div');
    row.className = 'drill-item-row';
    row.innerHTML = `
      <span class="drill-item-name">${it.note}</span>
      <div class="drill-item-bar-wrap"><div class="drill-item-bar" style="width:${pct}%"></div></div>
      <strong class="drill-item-amt">${formatCurrency(it.amount)}</strong>
      <span class="drill-item-cnt">×${it.count}</span>
    `;
    itemList.appendChild(row);
  }
  topSection.appendChild(itemList);

  els.catDrilldownPanel.append(mSection, topSection);
}

/**
 * 4A & 4D: Render Cumulative Running Total Line/Area Chart (Current Month vs Previous Month) + Table Toggle
 */
function renderRunningTotalSection(spanComp) {
  if (!els.runningTotalChart || !spanComp) return;
  const showTable = Boolean(state.settings.alwaysTables || state.tableToggles.running);

  if (els.toggleRunningTableBtn) {
    els.toggleRunningTableBtn.textContent = showTable ? '📊 Chart' : '⇄ Table';
    els.toggleRunningTableBtn.classList.toggle('active', showTable);
  }
  if (els.runningTotalSubtitle) {
    els.runningTotalSubtitle.textContent = `${spanComp.curMonthName} (solid) vs ${spanComp.prevMonthName} (dashed)`;
  }

  els.runningTotalChart.replaceChildren();
  if (els.runningTotalTable) els.runningTotalTable.replaceChildren();

  if (showTable && els.runningTotalTable) {
    els.runningTotalChart.hidden = true;
    els.runningTotalTable.hidden = false;
    const tbl = document.createElement('table');
    tbl.className = 'data-table';
    tbl.innerHTML = `
      <thead>
        <tr>
          <th>Day</th>
          <th class="num-col">${spanComp.curMonthName}</th>
          <th class="num-col">${spanComp.prevMonthName}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = tbl.querySelector('tbody');
    for (const d of spanComp.runningDays) {
      if (d.curCumulative === null && d.prevCumulative === null) continue;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>Day ${d.day}</td>
        <td class="num-col">${d.curCumulative !== null ? `<strong>${formatCurrency(d.curCumulative)}</strong>` : '—'}</td>
        <td class="num-col">${d.prevCumulative !== null ? formatCurrency(d.prevCumulative) : '—'}</td>
      `;
      tbody.appendChild(tr);
    }
    els.runningTotalTable.appendChild(tbl);
    return;
  }

  els.runningTotalChart.hidden = false;
  if (els.runningTotalTable) els.runningTotalTable.hidden = true;

  const days = spanComp.runningDays;
  const maxVal = Math.max(
    1000,
    ...days.map((d) => Math.max(d.curCumulative || 0, d.prevCumulative || 0))
  );

  const width = 460;
  const height = 165;
  const padL = 42;
  const padR = 46;
  const padT = 16;
  const padB = 24;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const totalDays = Math.max(1, days.length - 1);

  const toX = (day) => padL + ((day - 1) / totalDays) * plotW;
  const toY = (val) => padT + plotH - (val / maxVal) * plotH;

  const curPts = days.filter((d) => d.curCumulative !== null);
  const prevPts = days.filter((d) => d.prevCumulative !== null);

  const buildPath = (pts, key) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.day).toFixed(1)},${toY(p[key]).toFixed(1)}`)
      .join(' ');

  const curLine = buildPath(curPts, 'curCumulative');
  const prevLine = buildPath(prevPts, 'prevCumulative');
  const lastCur = curPts[curPts.length - 1];
  const curArea =
    curPts.length > 1
      ? `${curLine} L${toX(lastCur.day).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : '';

  const fmtK = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)));

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'running-svg');
  svg.innerHTML = `
    <line x1="${padL}" y1="${padT}" x2="${width - padR}" y2="${padT}" class="svg-grid-line" />
    <line x1="${padL}" y1="${padT + plotH / 2}" x2="${width - padR}" y2="${padT + plotH / 2}" class="svg-grid-line" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" class="svg-grid-line" />
    <text x="${padL - 6}" y="${padT + 4}" class="svg-axis-lbl" text-anchor="end">₹${fmtK(maxVal)}</text>
    <text x="${padL - 6}" y="${padT + plotH / 2 + 4}" class="svg-axis-lbl" text-anchor="end">₹${fmtK(maxVal / 2)}</text>
    <text x="${padL - 6}" y="${padT + plotH + 4}" class="svg-axis-lbl" text-anchor="end">₹0</text>
    <text x="${toX(1)}" y="${height - 5}" class="svg-axis-lbl" text-anchor="middle">1</text>
    <text x="${toX(10)}" y="${height - 5}" class="svg-axis-lbl" text-anchor="middle">10</text>
    <text x="${toX(20)}" y="${height - 5}" class="svg-axis-lbl" text-anchor="middle">20</text>
    <text x="${toX(days.length)}" y="${height - 5}" class="svg-axis-lbl" text-anchor="middle">${days.length}</text>
    ${curArea ? `<path d="${curArea}" class="svg-cur-area" />` : ''}
    ${prevLine ? `<path d="${prevLine}" class="svg-prev-line" />` : ''}
    ${curLine ? `<path d="${curLine}" class="svg-cur-line" />` : ''}
    ${
      lastCur
        ? `<circle cx="${toX(lastCur.day).toFixed(1)}" cy="${toY(lastCur.curCumulative).toFixed(1)}" r="4" class="svg-cur-dot" />
           <text x="${(toX(lastCur.day) + 6).toFixed(1)}" y="${(toY(lastCur.curCumulative) + 4).toFixed(1)}" class="svg-end-lbl">₹${fmtK(lastCur.curCumulative)}</text>`
        : ''
    }
  `;
  els.runningTotalChart.appendChild(svg);
}

/**
 * 4C & 7.1: Render Threshold-Gated Deterministic Fun Facts
 */
function renderFunFactsSection(periodExpenses, spanComp) {
  if (!els.funFactsGrid || !els.funFactsPanel) return;
  const { clearedFacts, totalRules } = computeFunFacts(
    state.expenses,
    periodExpenses,
    spanComp,
    state.settings.monthlyBudget,
    formatCurrency
  );

  els.funFactsGrid.replaceChildren();
  if (els.funFactsSubtitle) {
    els.funFactsSubtitle.textContent = `${clearedFacts.length} of ${totalRules} facts cleared their threshold for this period`;
  }

  if (clearedFacts.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.className = 'field-hint';
    emptyP.textContent = 'Log a few more daily transactions to unlock personalized spending patterns and fun facts!';
    els.funFactsGrid.appendChild(emptyP);
    if (els.toggleAllFactsBtn) els.toggleAllFactsBtn.hidden = true;
    return;
  }

  const visibleFacts = state.showAllFacts ? clearedFacts : clearedFacts.slice(0, 3);
  if (els.toggleAllFactsBtn) {
    els.toggleAllFactsBtn.hidden = clearedFacts.length <= 3;
    els.toggleAllFactsBtn.textContent = state.showAllFacts
      ? 'Show top 3 ▴'
      : `All ${clearedFacts.length} fun facts ▸`;
  }

  for (const fact of visibleFacts) {
    const card = document.createElement('article');
    card.className = 'fun-fact-card';
    card.innerHTML = `
      <span class="fun-fact-icon" aria-hidden="true">${fact.icon}</span>
      <div class="fun-fact-content">
        <strong class="fun-fact-title">${fact.title}</strong>
        <p class="fun-fact-body">${fact.body}</p>
      </div>
    `;
    els.funFactsGrid.appendChild(card);
  }
}

/**
 * 5A & 5B: Render Calendar Heatmap + 90-Day Patterns, Streaks, and Auto-Detected Habits
 */
function renderCalendarAndPatternsSection() {
  if (!els.calendarGrid) return;
  const data = computeCalendarAndPatterns(state.expenses, state.selectedYear, state.selectedMonth);

  els.calendarGrid.replaceChildren();
  if (els.clearCalDateBtn) {
    els.clearCalDateBtn.hidden = !state.selectedCalendarDate;
  }

  const fmtCompact = (amt) => {
    if (amt === 0) return '🌱';
    if (amt >= 1000) return `₹${(amt / 1000).toFixed(1)}k`;
    return `₹${Math.round(amt)}`;
  };

  for (const cell of data.cells) {
    if (cell.empty) {
      const blank = document.createElement('div');
      blank.className = 'cal-cell is-empty';
      els.calendarGrid.appendChild(blank);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cal-cell tier-${cell.isFuture ? 'future' : cell.tier} ${cell.isToday ? 'is-today' : ''} ${state.selectedCalendarDate === cell.iso ? 'is-selected' : ''}`;
    btn.disabled = cell.isFuture;
    btn.title = cell.isFuture
      ? `${cell.iso} (Future)`
      : `${cell.iso}: ${formatCurrency(cell.total)} (${cell.entries.length} entries)`;
    btn.innerHTML = `
      <span class="cal-day-num">${cell.day}</span>
      <span class="cal-day-amt">${cell.isFuture ? '' : fmtCompact(cell.total)}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedCalendarDate = state.selectedCalendarDate === cell.iso ? null : cell.iso;
      renderAll();
    });
    els.calendarGrid.appendChild(btn);
  }

  if (els.calMonthTotal) els.calMonthTotal.textContent = formatCurrency(data.monthTotal);
  if (els.calDailyAvg) els.calDailyAvg.textContent = `${formatCurrency(data.dailyAvg)}/day avg`;
  if (els.calHeavyNospend) els.calHeavyNospend.textContent = `${data.heavyDays} · ${data.noSpendDays} 🌱`;

  // 5B: Weekday bars
  if (els.patternsWeekdayCallout) {
    els.patternsWeekdayCallout.textContent =
      data.maxWeekday.avg > 0
        ? `${data.maxWeekday.label} is your priciest day: ${data.priciestMultiplier}× your daily average`
        : 'Your weekday & time-of-day rhythm';
  }
  if (els.patternsWeekdayChart) {
    els.patternsWeekdayChart.replaceChildren();
    const maxW = Math.max(1, ...data.weekdayBars.map((b) => b.avg));
    for (const wb of data.weekdayBars) {
      const isPeak = wb.label === data.maxWeekday.label && wb.avg > 0;
      const pct = Math.max(4, Math.round((wb.avg / maxW) * 100));
      const col = document.createElement('div');
      col.className = `pattern-col ${isPeak ? 'is-highlight' : ''}`;
      col.innerHTML = `
        <span class="pattern-val">${wb.avg > 0 ? formatCurrency(wb.avg) : '—'}</span>
        <div class="pattern-track"><div class="pattern-fill" style="height:${pct}%"></div></div>
        <span class="pattern-lbl">${wb.label}</span>
      `;
      els.patternsWeekdayChart.appendChild(col);
    }
  }

  // 5B: Hourly bars
  if (els.patternsHourChart) {
    els.patternsHourChart.replaceChildren();
    const maxH = Math.max(1, ...data.hourBuckets.map((b) => b.total));
    for (const hb of data.hourBuckets) {
      const isPeak = hb.label === data.peakHourBucket.label && hb.total > 0;
      const pct = Math.max(4, Math.round((hb.total / maxH) * 100));
      const col = document.createElement('div');
      col.className = `pattern-col ${isPeak ? 'is-highlight' : ''}`;
      col.innerHTML = `
        <span class="pattern-val">${hb.total > 0 ? formatCurrency(hb.total) : ''}</span>
        <div class="pattern-track"><div class="pattern-fill" style="height:${pct}%"></div></div>
        <span class="pattern-lbl">${hb.label}</span>
      `;
      els.patternsHourChart.appendChild(col);
    }
  }

  if (els.streakLightDays) els.streakLightDays.textContent = `${data.currentLightStreak} day${data.currentLightStreak === 1 ? '' : 's'}`;
  if (els.streakBestNospend) els.streakBestNospend.textContent = `${data.bestNoSpendRun} day${data.bestNoSpendRun === 1 ? '' : 's'}`;

  // 5B: Habits list
  if (els.habitsList) {
    els.habitsList.replaceChildren();
    if (data.habits.length === 0) {
      const li = document.createElement('li');
      li.className = 'field-hint';
      li.textContent = 'Repeat items (3+ times) will automatically appear here with their cadence and average cost.';
      els.habitsList.appendChild(li);
    } else {
      for (const h of data.habits) {
        const cat = getCategoryById(h.category);
        const li = document.createElement('li');
        li.className = 'habit-row';
        li.innerHTML = `
          <div class="habit-left">
            <span class="habit-icon">${cat.icon}</span>
            <div>
              <strong class="habit-note">${h.note} <span class="habit-cnt">×${h.count}</span></strong>
              <span class="habit-meta">${h.meta}</span>
            </div>
          </div>
          <strong class="habit-avg">${formatCurrency(h.avgAmt)} avg</strong>
        `;
        els.habitsList.appendChild(li);
      }
    }
  }
}

/**
 * 5C & 5D: Render Explore (Natural Language Query + 5 Group-By Modes) & Period Compare (Diverging Bars + What Changed)
 */
function renderExploreAndCompareSection(spanComp) {
  if (!els.exploreBarsList) return;

  els.exploreGroupChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.exploreGroup === state.exploreGroupBy);
  });

  // 5C: Evaluate Explore Query (or default to current period expenses)
  const rawQ = (state.exploreQuery || '').trim();
  const parsedQ = rawQ
    ? parseQuestionQuery(rawQ, new Date()) || {
        raw: rawQ,
        isSpecific: true,
        itemQuery: rawQ,
        startDate: '',
        endDate: '',
        prevStartDate: '',
        prevEndDate: '',
        periodLabel: 'All matching'
      }
    : {
        raw: '',
        isSpecific: true,
        startDate: `${state.selectedYear}-${String(state.selectedMonth + 1).padStart(2, '0')}-01`,
        endDate: `${state.selectedYear}-${String(state.selectedMonth + 1).padStart(2, '0')}-31`,
        periodLabel: spanComp?.curSpanLabel || 'This Month'
      };

  const matched = filterExpensesByQuery(state.expenses, parsedQ, parsedQ.startDate, parsedQ.endDate);
  const total = matched.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const avg = matched.length > 0 ? Math.round(total / matched.length) : 0;

  if (els.exploreSummaryTiles) {
    els.exploreSummaryTiles.innerHTML = `
      <div class="cal-tile">
        <span class="cal-tile-label">Total (${parsedQ.periodLabel || 'Filtered'})</span>
        <strong class="cal-tile-val">${formatCurrency(total)}</strong>
        <span class="cal-tile-sub">${matched.length} entries · avg ${formatCurrency(avg)}</span>
      </div>
      <div class="cal-tile">
        <span class="cal-tile-label">Grouped By</span>
        <strong class="cal-tile-val" style="text-transform:capitalize">${state.exploreGroupBy}</strong>
        <span class="cal-tile-sub">Tap any bar below to filter feed</span>
      </div>
    `;
  }

  // Group matched items by state.exploreGroupBy ('item' | 'category' | 'payment' | 'weekday' | 'tag')
  const groups = new Map();
  const wkNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const e of matched) {
    const amt = Number(e.amount) || 0;
    let keys = [];
    if (state.exploreGroupBy === 'category') {
      const c = getCategoryById(e.category);
      keys = [{ id: c.id, label: `${c.icon} ${c.name}` }];
    } else if (state.exploreGroupBy === 'payment') {
      const p = getPaymentMethodById(normalizePaymentMethod(e));
      keys = [{ id: p.id, label: `${p.icon} ${p.name}` }];
    } else if (state.exploreGroupBy === 'weekday') {
      const [y, m, d] = (e.date || '').split('-').map(Number);
      const dow = y && m && d ? new Date(y, m - 1, d).getDay() : 0;
      keys = [{ id: String(dow), label: wkNames[dow] }];
    } else if (state.exploreGroupBy === 'tag') {
      const tList = normalizeTags(e);
      keys = tList.length > 0 ? tList.map((t) => ({ id: t, label: `#${t}` })) : [{ id: 'untagged', label: 'Untagged' }];
    } else {
      const k = normalizeNoteKey(e.note) || 'Item';
      const c = getCategoryById(e.category);
      keys = [{ id: k, label: `${c.icon} ${e.note}` }];
    }

    for (const kObj of keys) {
      const cur = groups.get(kObj.id) || { id: kObj.id, label: kObj.label, amount: 0, count: 0 };
      cur.amount += amt;
      cur.count += 1;
      groups.set(kObj.id, cur);
    }
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.amount - a.amount).slice(0, 8);
  const maxGrpAmt = Math.max(1, ...sortedGroups.map((g) => g.amount));
  els.exploreBarsList.replaceChildren();

  if (sortedGroups.length === 0) {
    const emptyP = document.createElement('p');
    emptyP.className = 'field-hint';
    emptyP.textContent = 'No matching transactions for this query. Try "food this month", "upi", or clear the search box.';
    els.exploreBarsList.appendChild(emptyP);
  } else {
    for (const g of sortedGroups) {
      const widthPct = Math.max(4, Math.round((g.amount / maxGrpAmt) * 100));
      const sharePct = total > 0 ? Math.round((g.amount / total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'drill-item-row';
      row.innerHTML = `
        <span class="drill-item-name">${g.label} <small class="field-hint">×${g.count}</small></span>
        <div class="drill-item-bar-wrap"><div class="drill-item-bar" style="width:${widthPct}%"></div></div>
        <strong class="drill-item-amt">${formatCurrency(g.amount)}</strong>
        <span class="drill-item-cnt">${sharePct}%</span>
      `;
      els.exploreBarsList.appendChild(row);
    }
  }

  // --- 5D: Period Compare (Diverging Bars + "What Changed" Card) ---
  if (!spanComp || !els.compareDivergingChart) return;
  if (els.compareSpanSubtitle) {
    els.compareSpanSubtitle.textContent = `${spanComp.curSpanLabel} vs ${spanComp.prevSpanLabel}`;
  }
  if (els.compareHeroBox) {
    const diff = spanComp.deltaAmt;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
    const pctTxt =
      spanComp.deltaPct !== null
        ? `${spanComp.deltaPct <= 0 ? '▼' : '▲'} ${Math.abs(spanComp.deltaPct)}% ${spanComp.deltaPct <= 0 ? 'less' : 'more'} vs ${spanComp.prevSpanLabel}`
        : `vs ${spanComp.prevSpanLabel}`;
    els.compareHeroBox.innerHTML = `
      <strong class="compare-hero-val" data-trend="${diff <= 0 ? 'good' : 'warn'}">${sign}${formatCurrency(Math.abs(diff))}</strong>
      <span class="compare-hero-sub">${pctTxt}</span>
    `;
  }

  els.compareDivergingChart.replaceChildren();
  const maxAbsDiff = Math.max(1, ...spanComp.categoryDeltas.map((c) => Math.abs(c.diff)));

  for (const cat of spanComp.categoryDeltas) {
    const isMore = cat.diff > 0;
    const halfWidthPct = Math.min(48, Math.max(2, Math.round((Math.abs(cat.diff) / maxAbsDiff) * 48)));
    const sign = cat.diff > 0 ? '+' : cat.diff < 0 ? '−' : '';
    const row = document.createElement('div');
    row.className = 'diverging-row';
    row.innerHTML = `
      <span class="diverging-cat">${cat.icon} ${cat.shortName || cat.name}</span>
      <div class="diverging-track">
        <div class="diverging-midline"></div>
        <div class="diverging-bar ${isMore ? 'is-more' : 'is-less'}" style="${
          isMore ? `left:50%; width:${halfWidthPct}%` : `right:50%; width:${halfWidthPct}%`
        }"></div>
      </div>
      <strong class="diverging-val ${isMore ? 'is-more' : 'is-less'}">${sign}${formatCurrency(Math.abs(cat.diff))}</strong>
    `;
    els.compareDivergingChart.appendChild(row);
  }

  if (els.compareWhatChanged) {
    const lines = [];
    if (spanComp.biggestRise) {
      lines.push(
        `<strong>${spanComp.biggestRise.icon} ${spanComp.biggestRise.shortName || spanComp.biggestRise.name}</strong> rose the most (+${formatCurrency(spanComp.biggestRise.diff)}).`
      );
    }
    if (spanComp.biggestFall) {
      lines.push(
        `<strong>${spanComp.biggestFall.icon} ${spanComp.biggestFall.shortName || spanComp.biggestFall.name}</strong> fell the most (−${formatCurrency(Math.abs(spanComp.biggestFall.diff))}).`
      );
    }
    els.compareWhatChanged.innerHTML = `
      <h4 class="sub-card-title">💬 What Changed (${spanComp.curSpanLabel} vs ${spanComp.prevSpanLabel})</h4>
      <p class="what-changed-line">${lines.join(' ') || 'Log across two periods to see category movers.'}</p>
      ${
        spanComp.newItems.length > 0
          ? `<p class="what-changed-line"><strong>New this time:</strong> ${spanComp.newItems.join(', ')}</p>`
          : ''
      }
      ${
        spanComp.skippedItems.length > 0
          ? `<p class="what-changed-line"><strong>Skipped this time:</strong> ${spanComp.skippedItems.join(', ')}</p>`
          : ''
      }
    `;
  }
}

/**
 * 6A–6C: Render Home Monthly Recap Banner + Recaps Tab + Full-Screen Story Modal
 */
function renderRecapsSection() {
  const now = new Date();
  // On days 1–3 of the month, feature previous finished month; otherwise feature selected month
  const isEarlyMonth = now.getDate() <= 3;
  const recapMonth = isEarlyMonth
    ? now.getMonth() === 0
      ? 11
      : now.getMonth() - 1
    : state.selectedMonth;
  const recapYear = isEarlyMonth && now.getMonth() === 0 ? now.getFullYear() - 1 : state.selectedYear;

  const recap = computeMonthlyRecap(
    state.expenses,
    state.settings.monthlyBudget,
    recapYear,
    recapMonth,
    formatCurrency
  );

  const isSeen = Boolean(state.settings.recapSeen?.[recap.monthKey]);
  if (els.recapUnseenDot) {
    els.recapUnseenDot.hidden = isSeen || recap.entryCount === 0;
  }

  // 6A: Home Banner (shown on days 1–3 when unseen and has entries)
  if (els.homeRecapBanner) {
    if (isEarlyMonth && !isSeen && recap.entryCount > 0) {
      els.homeRecapBanner.hidden = false;
      els.homeRecapKicker.textContent = `🎁 NEW · ${recap.monthLabel.toUpperCase()} RECAP`;
      els.homeRecapTitle.textContent = `Your ${recap.monthLabel.split(' ')[0]} is wrapped`;
      els.homeRecapSub.textContent = `${formatCurrency(recap.totalSpent)} · ${recap.slides.length} stories · tap to watch ▶`;
      els.homeRecapOpenArea.onclick = () => openStoryModal(recap);
    } else {
      els.homeRecapBanner.hidden = true;
    }
  }

  // 6B: Recaps Tab Content
  if (!els.recapsTabContent) return;
  els.recapsTabContent.replaceChildren();

  const curRecap = computeMonthlyRecap(
    state.expenses,
    state.settings.monthlyBudget,
    state.selectedYear,
    state.selectedMonth,
    formatCurrency
  );

  const heroCard = document.createElement('div');
  heroCard.className = 'recap-feature-card';
  heroCard.innerHTML = `
    <span class="recap-kicker">🎁 MONTHLY WRAPPED STORY</span>
    <h3 class="recap-feature-title">${curRecap.monthLabel}</h3>
    <p class="recap-feature-sub">${formatCurrency(curRecap.totalSpent)} across ${curRecap.entryCount} entries${
      curRecap.topCat ? ` · ${curRecap.topCat.icon} ${curRecap.topCat.shortName || curRecap.topCat.name} on top` : ''
    }${curRecap.topTag ? ` · 🧳 ${curRecap.topTag}` : ''}</p>
    <div class="recap-color-strip" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
    <button type="button" class="primary-btn recap-watch-btn">▶ Watch ${curRecap.slides.length} Stories</button>
  `;
  heroCard.querySelector('.recap-watch-btn')?.addEventListener('click', () => openStoryModal(curRecap));
  els.recapsTabContent.appendChild(heroCard);
}

function openStoryModal(recap) {
  if (!els.storyDialog || !recap || recap.slides.length === 0) return;
  state.activeStory = {
    slides: recap.slides,
    index: 0,
    monthKey: recap.monthKey
  };
  const nextSeen = { ...(state.settings.recapSeen || {}), [recap.monthKey]: true };
  state.settings = saveSettings({ recapSeen: nextSeen });
  renderStorySlide();
  els.storyDialog.showModal();
  renderRecapsSection();
}

function renderStorySlide() {
  const { slides, index } = state.activeStory;
  const slide = slides[index];
  if (!slide || !els.storySlideBody) return;

  if (els.storyCardSurface) {
    els.storyCardSurface.style.background = slide.bg;
  }

  if (els.storyProgressBars) {
    els.storyProgressBars.replaceChildren();
    slides.forEach((_, idx) => {
      const seg = document.createElement('div');
      seg.className = `story-prog-seg ${idx <= index ? 'is-filled' : ''}`;
      els.storyProgressBars.appendChild(seg);
    });
  }

  els.storySlideBody.innerHTML = `
    <span class="story-kicker">${slide.kicker}</span>
    <div class="story-emoji" aria-hidden="true">${slide.emoji}</div>
    <h2 class="story-headline">${slide.headline}</h2>
    <p class="story-subtitle">${slide.subtitle}</p>
    ${slide.detail ? `<p class="story-detail">${slide.detail}</p>` : ''}
  `;

  if (els.storyCounter) {
    els.storyCounter.textContent = `${index + 1} / ${slides.length}`;
  }
  if (els.storyPrevBtn) {
    els.storyPrevBtn.disabled = index === 0;
  }
  if (els.storyNextBtn) {
    els.storyNextBtn.textContent = index === slides.length - 1 ? 'Done ✓' : 'Next ›';
  }
}

/**
 * 1B: Render "Your Usuals" (Top 6 frequent items in last 30 days)
 * Single tap logs immediately with [Undo] toast; clicking ✎ pre-fills input to edit!
 */
function renderUsualsBar() {
  if (!els.usualsContainer || !els.usualsGrid) return;
  const usuals = computeUsuals(state.expenses, 6);
  els.usualsGrid.replaceChildren();

  if (usuals.length === 0) {
    els.usualsContainer.hidden = true;
    return;
  }

  els.usualsContainer.hidden = false;
  for (const u of usuals) {
    const cat = getCategoryById(u.category);
    const pay = getPaymentMethodById(u.paymentMethod);

    const pill = document.createElement('div');
    pill.className = 'usual-card';

    const logBtn = document.createElement('button');
    logBtn.type = 'button';
    logBtn.className = 'usual-main-btn';
    logBtn.title = `Tap to instantly log ${formatCurrency(u.amount)} ${u.note} (${pay.shortName})`;
    logBtn.innerHTML = `
      <span class="usual-icon">${cat.icon}</span>
      <span class="usual-info">
        <strong class="usual-note">${u.note}</strong>
        <span class="usual-meta">${formatCurrency(u.amount)} · ${pay.shortName}</span>
      </span>
    `;
    logBtn.addEventListener('click', () => {
      addExpenseFromMessage(`${u.amount} ${u.note} ${pay.shortName.toLowerCase()}`);
    });

    const editPrefillBtn = document.createElement('button');
    editPrefillBtn.type = 'button';
    editPrefillBtn.className = 'usual-edit-btn';
    editPrefillBtn.title = `Pre-fill "${u.amount} ${u.note}" in input bar to edit`;
    editPrefillBtn.setAttribute('aria-label', `Pre-fill ${u.note} to edit before saving`);
    editPrefillBtn.textContent = '✎';
    editPrefillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.expenseInput.value = `${u.amount} ${u.note} ${pay.shortName.toLowerCase()}`;
      updateLivePreview({ resetOverrides: true });
      focusExpenseInput();
    });

    pill.append(logBtn, editPrefillBtn);
    els.usualsGrid.appendChild(pill);
  }
}

function renderTrendChart(periodExpenses) {
  els.trendChart.replaceChildren();
  const days = [];
  const now = new Date();
  let anchor = new Date(now);

  if (
    state.periodMode === 'month' &&
    (state.selectedYear !== now.getFullYear() || state.selectedMonth !== now.getMonth())
  ) {
    // Last day of selected month
    anchor = new Date(state.selectedYear, state.selectedMonth + 1, 0);
  }

  for (let i = 13; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - i);
    const iso = toLocalISODate(d);
    days.push({
      iso,
      label: d.getDate(),
      expenseAmt: 0,
      incomeAmt: 0
    });
  }

  const expByDate = {};
  const incByDate = {};
  for (const e of periodExpenses) {
    if (normalizeEntryType(e) === 'income') {
      incByDate[e.date] = (incByDate[e.date] || 0) + Number(e.amount || 0);
    } else {
      expByDate[e.date] = (expByDate[e.date] || 0) + Number(e.amount || 0);
    }
  }

  const showIncomeBars = state.catBreakdownType === 'income' || state.feedFilterType === 'income';
  let maxAmt = 0;
  for (const d of days) {
    d.expenseAmt = expByDate[d.iso] || 0;
    d.incomeAmt = incByDate[d.iso] || 0;
    const primary = showIncomeBars ? d.incomeAmt : d.expenseAmt;
    if (primary > maxAmt) maxAmt = primary;
  }

  for (const d of days) {
    const primaryAmt = showIncomeBars ? d.incomeAmt : d.expenseAmt;
    const col = document.createElement('div');
    col.className = 'trend-col';
    const parts = [];
    if (d.expenseAmt > 0) parts.push(`Spent ${formatCurrency(d.expenseAmt)}`);
    if (d.incomeAmt > 0) parts.push(`Income +${formatCurrency(d.incomeAmt)}`);
    col.title = `${d.iso}: ${parts.length > 0 ? parts.join(' • ') : formatCurrency(0)}`;

    const track = document.createElement('div');
    track.className = 'trend-bar-track';

    const fill = document.createElement('div');
    fill.className = `trend-bar-fill ${showIncomeBars ? 'is-income' : ''}`;
    const pct = maxAmt > 0 ? Math.max(4, Math.round((primaryAmt / maxAmt) * 100)) : 4;
    fill.style.setProperty('--bar-pct', `${pct}%`);
    fill.style.setProperty('--bar-alpha', primaryAmt > 0 ? '0.95' : '0.2');

    track.appendChild(fill);

    const lbl = document.createElement('span');
    lbl.className = 'trend-day-label';
    lbl.textContent = String(d.label);

    col.append(track, lbl);
    els.trendChart.appendChild(col);
  }
}

function renderExpenseList(periodExpenses) {
  els.feedTypeChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.feedType === state.feedFilterType);
  });

  let filtered = periodExpenses;

  if (state.feedFilterType !== 'all') {
    filtered = filtered.filter((e) => normalizeEntryType(e) === state.feedFilterType);
  }

  if (state.selectedCategory) {
    filtered = filtered.filter((e) => e.category === state.selectedCategory);
  }

  if (state.selectedPaymentMethod) {
    filtered = filtered.filter((e) => normalizePaymentMethod(e) === state.selectedPaymentMethod);
  }

  if (state.selectedTag) {
    filtered = filtered.filter((e) => normalizeTags(e).includes(state.selectedTag));
  }

  if (state.selectedCalendarDate) {
    filtered = filtered.filter((e) => e.date === state.selectedCalendarDate);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter((e) => {
      const catName = getCategoryById(e.category).name.toLowerCase();
      const payObj = getPaymentMethodById(normalizePaymentMethod(e));
      const payName = `${payObj.name} ${payObj.shortName}`.toLowerCase();
      const typeLabel = normalizeEntryType(e);
      const tagStr = normalizeTags(e).map((t) => `#${t}`).join(' ');
      return (
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.raw && e.raw.toLowerCase().includes(q)) ||
        catName.includes(q) ||
        payName.includes(q) ||
        typeLabel.includes(q) ||
        tagStr.includes(q) ||
        String(e.amount).includes(q)
      );
    });
  }

  els.expenseList.replaceChildren();

  if (filtered.length === 0) {
    els.emptyState.hidden = false;
    if (els.feedFooter) els.feedFooter.hidden = true;
    return;
  }

  els.emptyState.hidden = true;

  // In minimal landing modes (Spotlight, Two-Tab Zen on Log tab, Pocket Card when collapsed),
  // keep the landing page fast & uncluttered by showing the 5 most recent entries first.
  const isMinimalLanding =
    (state.uiDesign === 'spotlight' && !state.insightsOpen) ||
    (state.uiDesign === 'tabs' && state.activeView === 'log') ||
    (state.uiDesign === 'pocket' && !state.insightsOpen);

  const hasActiveFilters = Boolean(
    state.searchQuery.trim() ||
      state.selectedCategory ||
      state.selectedPaymentMethod ||
      state.selectedTag ||
      state.selectedCalendarDate ||
      state.feedFilterType !== 'all'
  );

  const shouldLimitToRecent = isMinimalLanding && !state.showAllFeed && !hasActiveFilters;
  const visibleItems = shouldLimitToRecent ? filtered.slice(0, 5) : filtered;

  if (els.feedHeading) {
    if (state.selectedCalendarDate) {
      els.feedHeading.textContent = `Transactions on ${formatReadableDate(state.selectedCalendarDate)}`;
    } else if (state.selectedTag) {
      els.feedHeading.textContent = `Transactions tagged #${state.selectedTag}`;
    } else {
      els.feedHeading.textContent = shouldLimitToRecent ? 'Recent Activity' : 'Transactions';
    }
  }

  if (els.feedFooter && els.showAllFeedBtn) {
    if (shouldLimitToRecent && filtered.length > 5) {
      els.feedFooter.hidden = false;
      els.showAllFeedBtn.textContent = `View all ${filtered.length} transactions & insights →`;
    } else {
      els.feedFooter.hidden = true;
    }
  }

  for (const item of visibleItems) {
    const isIncome = normalizeEntryType(item) === 'income';
    const cat = getCategoryById(item.category);
    const payObj = getPaymentMethodById(normalizePaymentMethod(item));
    const itemTags = normalizeTags(item);
    const li = document.createElement('li');
    li.className = `expense-item ${isIncome ? 'is-income' : ''}`;
    if (state.lastSavedIds.has(item.id)) {
      li.classList.add('just-saved');
    }

    const main = document.createElement('div');
    main.className = 'expense-main';

    const catBadge = document.createElement('button');
    catBadge.type = 'button';
    catBadge.className = 'expense-cat-badge';
    catBadge.textContent = cat.icon;
    catBadge.setAttribute('aria-label', `Category: ${cat.name}. Click to edit.`);
    catBadge.addEventListener('click', () => openEditModal(item));

    const details = document.createElement('div');
    details.className = 'expense-details';

    const noteP = document.createElement('p');
    noteP.className = 'expense-note';
    noteP.textContent = item.note;

    const metaP = document.createElement('p');
    metaP.className = 'expense-meta';
    const typeTag = isIncome ? 'Income • ' : '';
    const catSpan = document.createElement('span');
    catSpan.textContent = `${typeTag}${cat.name}`;

    const dot1 = document.createElement('span');
    dot1.textContent = '•';
    dot1.setAttribute('aria-hidden', 'true');

    const payBadge = document.createElement('span');
    payBadge.className = 'expense-pay-pill';
    payBadge.textContent = payObj.shortName;

    const dot2 = document.createElement('span');
    dot2.textContent = '•';
    dot2.setAttribute('aria-hidden', 'true');

    const dateSpan = document.createElement('span');
    dateSpan.textContent = formatReadableDate(item.date);

    metaP.append(catSpan, dot1, payBadge, dot2, dateSpan);

    // #Hashtag pills on transaction rows
    for (const t of itemTags) {
      const tagBtn = document.createElement('button');
      tagBtn.type = 'button';
      tagBtn.className = `expense-tag-pill ${state.selectedTag === t ? 'active' : ''}`;
      tagBtn.textContent = `#${t}`;
      tagBtn.title = `Filter by #${t}`;
      tagBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.selectedTag = state.selectedTag === t ? null : t;
        renderAll();
      });
      metaP.appendChild(tagBtn);
    }

    if (isItemRecurring(item)) {
      const recSpan = document.createElement('span');
      recSpan.className = 'expense-rec-tag';
      recSpan.title = 'Repeats monthly';
      recSpan.textContent = '• 🔁';
      metaP.appendChild(recSpan);
    }
    if (item.synced) {
      const syncSpan = document.createElement('span');
      syncSpan.className = 'expense-sync-tag';
      syncSpan.title = 'Synced to Google Sheet';
      syncSpan.textContent = '• ☁️';
      metaP.appendChild(syncSpan);
    }

    details.append(noteP, metaP);
    main.append(catBadge, details);

    const right = document.createElement('div');
    right.className = 'expense-right';

    const amtSpan = document.createElement('span');
    amtSpan.className = `expense-amount ${isIncome ? 'is-income' : ''}`;
    amtSpan.textContent = isIncome ? `+${formatCurrency(item.amount)}` : formatCurrency(item.amount);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-row-btn';
    editBtn.setAttribute('aria-label', `Edit ${item.note}`);
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => openEditModal(item));

    right.append(amtSpan, editBtn);
    li.append(main, right);
    li.addEventListener('click', (ev) => {
      if (!ev.target.closest('button')) {
        openEditModal(item);
      }
    });
    els.expenseList.appendChild(li);
  }
}

function isAnyDialogOpen() {
  return Boolean(
    els.nameGateDialog?.open ||
      els.syncDialog?.open ||
      els.editDialog?.open ||
      els.recurringDialog?.open ||
      els.storyDialog?.open
  );
}

function normalizeNoteKey(note) {
  return String(note || '')
    .toLowerCase()
    .trim();
}

function isItemRecurring(item) {
  if (item?.recurring) return true;
  const key = normalizeNoteKey(item?.note);
  if (!key) return false;
  return state.recurringRules.some(
    (r) => r.active !== false && normalizeNoteKey(r.note) === key
  );
}

function upsertRecurringRuleFromEntry(entry) {
  const key = normalizeNoteKey(entry.note);
  if (!key) return;
  const dayOfMonth = Math.min(28, Math.max(1, Number((entry.date || '').split('-')[2]) || 1));
  const monthPrefix = (entry.date || toLocalISODate(new Date())).slice(0, 7);

  const existingIdx = state.recurringRules.findIndex(
    (r) => normalizeNoteKey(r.note) === key && r.type === normalizeEntryType(entry)
  );

  if (existingIdx !== -1) {
    state.recurringRules[existingIdx] = {
      ...state.recurringRules[existingIdx],
      amount: Number(entry.amount) || state.recurringRules[existingIdx].amount,
      category: entry.category,
      paymentMethod: normalizePaymentMethod(entry),
      dayOfMonth,
      active: true,
      lastLoggedMonth: monthPrefix
    };
  } else {
    state.recurringRules.push({
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: normalizeEntryType(entry),
      amount: Number(entry.amount) || 0,
      note: entry.note,
      category: entry.category,
      paymentMethod: normalizePaymentMethod(entry),
      dayOfMonth,
      active: true,
      lastLoggedMonth: monthPrefix
    });
  }
  saveRecurringRules(state.recurringRules);
}

function removeRecurringRuleForEntry(entry) {
  const key = normalizeNoteKey(entry.note);
  state.recurringRules = state.recurringRules.filter(
    (r) => !(normalizeNoteKey(r.note) === key && r.type === normalizeEntryType(entry))
  );
  saveRecurringRules(state.recurringRules);
}

function markMatchingRecurringRuleLogged(entry) {
  const key = normalizeNoteKey(entry.note);
  const monthPrefix = (entry.date || toLocalISODate(new Date())).slice(0, 7);
  let changed = false;
  for (const r of state.recurringRules) {
    if (r.active !== false && normalizeNoteKey(r.note) === key) {
      r.lastLoggedMonth = monthPrefix;
      changed = true;
    }
  }
  if (changed) {
    saveRecurringRules(state.recurringRules);
  }
}

function getDueRecurringRules() {
  const now = new Date();
  const currentMonth = toLocalISODate(now).slice(0, 7);
  const todayDay = now.getDate();

  return state.recurringRules.filter((rule) => {
    if (rule.active === false) return false;
    if (rule.lastLoggedMonth === currentMonth) return false;
    // Check if an expense with the same note was already logged this month
    const alreadyInExpenses = state.expenses.some(
      (e) =>
        e.date &&
        e.date.startsWith(currentMonth) &&
        normalizeNoteKey(e.note) === normalizeNoteKey(rule.note)
    );
    if (alreadyInExpenses) return false;
    return todayDay >= (Number(rule.dayOfMonth) || 1);
  });
}

function logRecurringRuleNow(rule) {
  const todayIso = toLocalISODate(new Date());
  const nowTs = Date.now();
  const entryType = rule.type === 'income' ? 'income' : 'expense';
  const newEntry = {
    id: `${entryType === 'income' ? 'inc' : 'exp'}_${nowTs}_rec_${Math.random().toString(36).slice(2, 6)}`,
    type: entryType,
    date: todayIso,
    amount: Number(rule.amount) || 0,
    category: rule.category || (entryType === 'income' ? 'other_income' : 'bills'),
    paymentMethod: rule.paymentMethod || state.settings.defaultPayment || 'upi',
    note: rule.note,
    raw: `${rule.amount} ${rule.note} monthly`,
    recurring: true,
    updatedAt: nowTs,
    synced: false
  };

  rule.lastLoggedMonth = todayIso.slice(0, 7);
  saveRecurringRules(state.recurringRules);

  state.lastSavedIds = new Set([newEntry.id]);
  state.expenses = [newEntry, ...state.expenses].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  saveExpenses(state.expenses);
  renderAll();
  if (els.recurringDialog?.open) {
    renderRecurringModalList();
  }
  showToast(`✅ Logged monthly ${rule.note} (${formatCurrency(rule.amount)})`);
  triggerBackgroundSync(false);
}

function computeCreditCardCycleInfo() {
  const now = new Date();
  const stmtDay = Math.min(28, Math.max(1, Number(state.settings.ccStatementDay) || 15));
  const dueDay = Math.min(28, Math.max(1, Number(state.settings.ccDueDay) || 5));

  // Determine current unbilled cycle start & end dates
  let cycleStart;
  let cycleEnd;
  if (now.getDate() >= stmtDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth(), stmtDay);
    cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, stmtDay - 1);
  } else {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, stmtDay);
    cycleEnd = new Date(now.getFullYear(), now.getMonth(), stmtDay - 1);
  }

  const startIso = toLocalISODate(cycleStart);
  const endIso = toLocalISODate(cycleEnd);

  const ccItems = state.expenses.filter(
    (e) =>
      normalizeEntryType(e) !== 'income' &&
      normalizePaymentMethod(e) === 'credit_card' &&
      e.date >= startIso &&
      e.date <= endIso
  );
  const currentCycleSpend = ccItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Next due date calculation
  let nextDueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (now.getDate() > dueDay) {
    nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  }
  const msPerDay = 86400000;
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.round((nextDueDate - todayMidnight) / msPerDay);
  const dueCycleKey = toLocalISODate(nextDueDate).slice(0, 7);
  const isPaidThisCycle = state.settings.ccLastPaidCycle === dueCycleKey;

  const rangeFmt = (d) =>
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return {
    stmtDay,
    dueDay,
    startIso,
    endIso,
    rangeLabel: `${rangeFmt(cycleStart)} – ${rangeFmt(cycleEnd)}`,
    currentCycleSpend,
    txCount: ccItems.length,
    nextDueDateLabel: rangeFmt(nextDueDate),
    daysUntilDue,
    dueCycleKey,
    isPaidThisCycle,
    isDueSoon:
      !isPaidThisCycle && currentCycleSpend > 0 && daysUntilDue >= 0 && daysUntilDue <= 5
  };
}

function renderSmartTrackersAndReminders() {
  const ccInfo = computeCreditCardCycleInfo();
  const activeRules = state.recurringRules.filter((r) => r.active !== false);
  const dueRules = getDueRecurringRules();

  // 1. Update Insights Credit Card Tracker Card
  if (els.ccCycleSpent) {
    els.ccCycleSpent.textContent = formatCurrency(ccInfo.currentCycleSpend);
  }
  if (els.ccCycleMeta) {
    const dueStatus = ccInfo.isPaidThisCycle
      ? `✓ Paid for ${ccInfo.nextDueDateLabel}`
      : ccInfo.daysUntilDue === 0
        ? `⚠️ Due Today (${ccInfo.nextDueDateLabel})`
        : `Due ${ccInfo.nextDueDateLabel} (in ${ccInfo.daysUntilDue}d)`;
    els.ccCycleMeta.textContent = `${ccInfo.rangeLabel} • ${dueStatus}`;
  }
  if (els.ccMarkPaidBtn) {
    els.ccMarkPaidBtn.hidden = ccInfo.isPaidThisCycle || ccInfo.currentCycleSpend <= 0;
  }

  // 2. Update Insights Recurring Bills Card
  const monthlyExpenseTotal = activeRules
    .filter((r) => r.type !== 'income')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (els.recurringMonthlyTotal) {
    els.recurringMonthlyTotal.textContent = `${formatCurrency(monthlyExpenseTotal)}/mo`;
  }
  if (els.recurringSubMeta) {
    if (activeRules.length === 0) {
      els.recurringSubMeta.textContent = 'Tip: type "15000 rent monthly" or toggle 🔁 on any entry';
    } else if (dueRules.length > 0) {
      els.recurringSubMeta.textContent = `${activeRules.length} active • ⚠️ ${dueRules.length} due this month`;
    } else {
      els.recurringSubMeta.textContent = `${activeRules.length} active monthly item${activeRules.length === 1 ? '' : 's'} • All logged for this month`;
    }
  }

  // 2b. Update Quick Log chip label so user can open Recurring & Card Cycle right from Quick Log
  if (els.quickOpenRecurringBtn) {
    if (activeRules.length > 0 || ccInfo.currentCycleSpend > 0) {
      els.quickOpenRecurringBtn.textContent = `🔁 Bills (${activeRules.length}) • 💳 ${formatCurrency(ccInfo.currentCycleSpend)}`;
    } else {
      els.quickOpenRecurringBtn.textContent = '🔁 Bills & Card';
    }
  }

  // 3. Zero-Clutter Landing Page Due Banner (ONLY shown when something is due right now!)
  if (!els.dueRemindersBar) return;
  els.dueRemindersBar.replaceChildren();

  if (dueRules.length === 0 && !ccInfo.isDueSoon) {
    els.dueRemindersBar.hidden = true;
    return;
  }

  els.dueRemindersBar.hidden = false;

  // Render due recurring rules
  for (const rule of dueRules.slice(0, 2)) {
    const pill = document.createElement('div');
    pill.className = 'due-reminder-item';

    const textSpan = document.createElement('span');
    textSpan.className = 'due-reminder-text';
    textSpan.textContent = `🔁 Monthly due: ${rule.note} (${formatCurrency(rule.amount)})`;

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'due-reminder-actions';

    const logBtn = document.createElement('button');
    logBtn.type = 'button';
    logBtn.className = 'mini-pill-btn is-accent';
    logBtn.textContent = '✓ Log Now';
    logBtn.addEventListener('click', () => logRecurringRuleNow(rule));

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'mini-pill-btn';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      rule.lastLoggedMonth = toLocalISODate(new Date()).slice(0, 7);
      saveRecurringRules(state.recurringRules);
      renderAll();
      showToast(`Skipped ${rule.note} for this month`);
    });

    actionsWrap.append(logBtn, skipBtn);
    pill.append(textSpan, actionsWrap);
    els.dueRemindersBar.appendChild(pill);
  }

  // Render CC due soon alert if within 5 days
  if (ccInfo.isDueSoon) {
    const ccPill = document.createElement('div');
    ccPill.className = 'due-reminder-item is-cc-alert';

    const textSpan = document.createElement('span');
    textSpan.className = 'due-reminder-text';
    const whenTxt = ccInfo.daysUntilDue === 0 ? 'Due Today' : `Due in ${ccInfo.daysUntilDue}d`;
    textSpan.textContent = `💳 CC Bill (${formatCurrency(ccInfo.currentCycleSpend)}) • ${whenTxt}`;

    const paidBtn = document.createElement('button');
    paidBtn.type = 'button';
    paidBtn.className = 'mini-pill-btn is-accent';
    paidBtn.textContent = '✓ Mark Paid';
    paidBtn.addEventListener('click', () => {
      state.settings = saveSettings({ ccLastPaidCycle: ccInfo.dueCycleKey });
      renderAll();
      showToast('✅ Marked Credit Card bill as paid for this cycle');
    });

    ccPill.append(textSpan, paidBtn);
    els.dueRemindersBar.appendChild(ccPill);
  }
}

function renderRecurringModalList() {
  if (!els.recurringRulesList) return;
  els.recurringRulesList.replaceChildren();

  if (state.recurringRules.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'recurring-empty';
    emptyLi.textContent = 'No monthly recurring items yet. Add one below or type "15000 rent monthly" in the main bar.';
    els.recurringRulesList.appendChild(emptyLi);
    return;
  }

  const currentMonth = toLocalISODate(new Date()).slice(0, 7);

  for (const rule of state.recurringRules) {
    const li = document.createElement('li');
    li.className = 'recurring-rule-row';

    const cat = getCategoryById(rule.category);
    const pay = getPaymentMethodById(rule.paymentMethod || 'upi');
    const isLoggedThisMonth = rule.lastLoggedMonth === currentMonth;

    const info = document.createElement('div');
    info.className = 'recurring-rule-info';

    const title = document.createElement('strong');
    title.textContent = `${cat.icon} ${rule.note} • ${rule.type === 'income' ? '+' : ''}${formatCurrency(rule.amount)}`;

    const sub = document.createElement('span');
    sub.className = 'field-hint';
    sub.textContent = `Day ${rule.dayOfMonth || 1} of month • ${pay.shortName} • ${isLoggedThisMonth ? '✓ Logged this month' : 'Pending this month'}`;

    info.append(title, sub);

    const actions = document.createElement('div');
    actions.className = 'recurring-rule-actions';

    const logNowBtn = document.createElement('button');
    logNowBtn.type = 'button';
    logNowBtn.className = 'mini-pill-btn is-accent';
    logNowBtn.textContent = '+ Log';
    logNowBtn.title = 'Log this transaction today';
    logNowBtn.addEventListener('click', () => logRecurringRuleNow(rule));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'mini-pill-btn is-danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Remove recurring rule';
    delBtn.addEventListener('click', () => {
      state.recurringRules = state.recurringRules.filter((r) => r.id !== rule.id);
      saveRecurringRules(state.recurringRules);
      renderRecurringModalList();
      renderAll();
      showToast(`Removed recurring rule: ${rule.note}`);
    });

    actions.append(logNowBtn, delBtn);
    li.append(info, actions);
    els.recurringRulesList.appendChild(li);
  }
}

function openRecurringModal() {
  if (els.ccStatementDayInput) {
    els.ccStatementDayInput.value = String(state.settings.ccStatementDay || 15);
  }
  if (els.ccDueDayInput) {
    els.ccDueDayInput.value = String(state.settings.ccDueDay || 5);
  }
  renderRecurringModalList();
  els.recurringDialog?.showModal();
}

function focusExpenseInput() {
  if (!els.expenseInput || isAnyDialogOpen()) return;
  if (state.uiDesign === 'tabs' && state.activeView === 'insights') return;
  requestSoftKeyboard(els.expenseInput);
}

function ensureUserNameGate() {
  const myName = (state.settings.userName || '').trim();
  if (!myName && els.nameGateDialog) {
    if (!els.nameGateDialog.open) {
      els.nameGateDialog.showModal();
    }
    setTimeout(() => requestSoftKeyboard(els.quickNameInput), 40);
    return false;
  }
  return true;
}

function updateUsageTrackerUI() {
  const myName = (state.settings.userName || '').trim();
  if (els.usageStatsLabel) {
    els.usageStatsLabel.textContent = myName || 'My Name';
  }
}

function updateSyncStatusUI() {
  const hasWebhook = Boolean((state.settings.webhookUrl || '').trim());
  const unsyncedCount = state.expenses.filter((e) => !e.synced).length;

  if (!hasWebhook) {
    els.syncDot.dataset.state = 'local';
    els.syncLabel.textContent = 'Setup Sync';
    return;
  }

  if (state.syncState === 'syncing') {
    els.syncDot.dataset.state = 'syncing';
    els.syncLabel.textContent = 'Syncing...';
  } else if (state.syncState === 'error') {
    els.syncDot.dataset.state = 'error';
    els.syncLabel.textContent = `Retry (${unsyncedCount})`;
  } else if (unsyncedCount === 0) {
    els.syncDot.dataset.state = 'synced';
    els.syncLabel.textContent = 'Synced';
  } else {
    els.syncDot.dataset.state = 'local';
    els.syncLabel.textContent = `${unsyncedCount} pending`;
  }
}

function updateThemeMetaAndButton() {
  const theme = state.settings.theme || 'dark';
  document.body.dataset.theme = theme;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute(
      'content',
      theme === 'clean' ? '#f5f5f3' : theme === 'receipt' ? '#ece5d8' : '#090d16'
    );
  }
  if (els.themeCycleIcon && els.themeCycleLabel) {
    if (theme === 'clean') {
      els.themeCycleIcon.textContent = '☀️';
      els.themeCycleLabel.textContent = 'Clean';
    } else if (theme === 'receipt') {
      els.themeCycleIcon.textContent = '🧾';
      els.themeCycleLabel.textContent = 'Receipt';
    } else {
      els.themeCycleIcon.textContent = '🌙';
      els.themeCycleLabel.textContent = 'Dark';
    }
  }
}

function updateDesignAndViewDOM() {
  updateThemeMetaAndButton();
  document.body.dataset.design = state.uiDesign;
  document.body.dataset.view = state.activeView;
  document.body.dataset.insightsOpen = state.insightsOpen ? 'true' : 'false';
  document.body.dataset.showAllFeed = state.showAllFeed ? 'true' : 'false';

  els.designPills.forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.design === state.uiDesign);
  });

  if (els.designSwitcherHint) {
    els.designSwitcherHint.textContent = DESIGN_DESCRIPTIONS[state.uiDesign] || '';
  }

  els.viewTabs.forEach((tab) => {
    const isAct = tab.dataset.view === state.activeView;
    tab.classList.toggle('active', isAct);
    tab.setAttribute('aria-selected', isAct ? 'true' : 'false');
  });

  // Update Insights sub-tabs (Overview | Calendar & Patterns | Explore & Compare | Recaps)
  els.insightsSubtabs.forEach((btn) => {
    const isSubAct = btn.dataset.subtab === state.insightsSubtab;
    btn.classList.toggle('active', isSubAct);
    btn.setAttribute('aria-selected', isSubAct ? 'true' : 'false');
  });
  if (els.subtabOverview) els.subtabOverview.hidden = state.insightsSubtab !== 'overview';
  if (els.subtabCalendar) els.subtabCalendar.hidden = state.insightsSubtab !== 'calendar';
  if (els.subtabExplore) els.subtabExplore.hidden = state.insightsSubtab !== 'explore';
  if (els.subtabRecaps) els.subtabRecaps.hidden = state.insightsSubtab !== 'recaps';

  // Determine whether the heavy analytics container should be visible
  let showInsights = true;
  if (state.uiDesign === 'tabs') {
    showInsights = state.activeView === 'insights';
  } else if (
    state.uiDesign === 'spotlight' ||
    state.uiDesign === 'chat' ||
    state.uiDesign === 'pocket'
  ) {
    showInsights = state.insightsOpen;
  }

  if (els.insightsContainer) {
    els.insightsContainer.classList.toggle('is-hidden', !showInsights);
    els.insightsContainer.setAttribute('aria-hidden', showInsights ? 'false' : 'true');
  }

  if (els.toggleInsightsBtn && els.toggleInsightsLabel) {
    els.toggleInsightsBtn.setAttribute('aria-expanded', state.insightsOpen ? 'true' : 'false');
    els.toggleInsightsLabel.textContent = state.insightsOpen
      ? 'Hide Insights ▴'
      : 'Insights & Breakdown ▾';
  }
}

function seedDemoData() {
  const previousExpenses = [...state.expenses];
  const now = new Date();
  const y = state.selectedYear;
  const m = state.selectedMonth;
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const curPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  const prevPrefix = `${prevY}-${String(prevM + 1).padStart(2, '0')}`;
  const todayDay = Math.min(28, Math.max(5, now.getDate()));
  const dIso = (pref, day) => `${pref}-${String(Math.max(1, day)).padStart(2, '0')}`;
  const tsAt = (iso, hr, min) => {
    const [yy, mm, dd] = iso.split('-').map(Number);
    return new Date(yy, mm - 1, dd, hr, min).getTime();
  };

  const samples = [
    // Today
    { date: dIso(curPrefix, todayDay), amount: 180, category: 'transport', paymentMethod: 'upi', note: 'Uber', tags: [], hr: 19, min: 18 },
    { date: dIso(curPrefix, todayDay), amount: 510, category: 'health', paymentMethod: 'upi', note: 'Pharmacy', tags: [], hr: 17, min: 0 },
    { date: dIso(curPrefix, todayDay), amount: 20, category: 'food', paymentMethod: 'cash', note: 'Chai', tags: [], hr: 16, min: 26 },
    { date: dIso(curPrefix, todayDay), amount: 200, category: 'food', paymentMethod: 'upi', note: 'Lunch', tags: ['office'], hr: 13, min: 35 },
    { date: dIso(curPrefix, todayDay), amount: 190, category: 'transport', paymentMethod: 'upi', note: 'Uber', tags: ['office'], hr: 8, min: 51 },
    { date: dIso(curPrefix, todayDay), amount: 2000, category: 'transport', paymentMethod: 'card', note: 'Petrol', tags: [], hr: 8, min: 15 },
    // Yesterday
    { date: dIso(curPrefix, todayDay - 1), amount: 80, category: 'transport', paymentMethod: 'upi', note: 'Auto', tags: [], hr: 19, min: 25 },
    { date: dIso(curPrefix, todayDay - 1), amount: 20, category: 'food', paymentMethod: 'cash', note: 'Chai', tags: [], hr: 16, min: 22 },
    { date: dIso(curPrefix, todayDay - 1), amount: 240, category: 'food', paymentMethod: 'upi', note: 'Lunch', tags: ['office'], hr: 13, min: 26 },
    { date: dIso(curPrefix, todayDay - 1), amount: 64, category: 'groceries', paymentMethod: 'upi', note: 'Milk', tags: [], hr: 7, min: 50 },
    { date: dIso(curPrefix, todayDay - 1), amount: 410, category: 'food', paymentMethod: 'card', note: 'Swiggy', tags: [], hr: 21, min: 10 },
    // Earlier this month
    { date: dIso(curPrefix, Math.max(1, todayDay - 2)), amount: 680, category: 'food', paymentMethod: 'card', note: 'Brunch', tags: [], hr: 11, min: 30 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 2)), amount: 90, category: 'transport', paymentMethod: 'upi', note: 'Auto', tags: [], hr: 8, min: 50 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 3)), amount: 2698, category: 'shopping', paymentMethod: 'card', note: 'Shoes', tags: [], hr: 18, min: 40 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 3)), amount: 20, category: 'food', paymentMethod: 'cash', note: 'Chai', tags: [], hr: 9, min: 24 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 4)), amount: 1849, category: 'entertainment', paymentMethod: 'card', note: 'Concert tickets', tags: ['weekend'], hr: 20, min: 15 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 4)), amount: 500, category: 'Food'.toLowerCase(), paymentMethod: 'card', note: 'Swiggy', tags: [], hr: 21, min: 5 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 5)), amount: 1098, category: 'bills', paymentMethod: 'upi', note: 'WiFi Bill', tags: [], hr: 10, min: 0 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 5)), amount: 1910, category: 'groceries', paymentMethod: 'upi', note: 'Blinkit Groceries', tags: [], hr: 18, min: 20 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 6)), amount: 2110, category: 'health', paymentMethod: 'card', note: 'Health Checkup', tags: [], hr: 9, min: 15 },
    { date: dIso(curPrefix, Math.max(1, todayDay - 6)), amount: 640, category: 'food', paymentMethod: 'upi', note: 'Zomato', tags: [], hr: 20, min: 45 },
    // #goa trip entries
    { date: dIso(curPrefix, 2), amount: 6400, category: 'transport', paymentMethod: 'card', note: 'Flight', tags: ['goa'], hr: 9, min: 0 },
    { date: dIso(curPrefix, 3), amount: 3200, category: 'food', paymentMethod: 'card', note: 'Beach Shack Dinner', tags: ['goa'], hr: 21, min: 30 },
    { date: dIso(curPrefix, 4), amount: 1650, category: 'entertainment', paymentMethod: 'upi', note: 'Water Sports', tags: ['goa'], hr: 15, min: 0 },
    // Previous month entries for Same-Elapsed-Span & Diverging Compare (5D)
    { date: dIso(prevPrefix, 2), amount: 4200, category: 'food', paymentMethod: 'card', note: 'Team Dinner', tags: [], hr: 20, min: 30 },
    { date: dIso(prevPrefix, 5), amount: 3360, category: 'groceries', paymentMethod: 'upi', note: 'Monthly Groceries', tags: [], hr: 18, min: 0 },
    { date: dIso(prevPrefix, 7), amount: 1649, category: 'entertainment', paymentMethod: 'card', note: 'Movies', tags: [], hr: 19, min: 30 },
    { date: dIso(prevPrefix, 9), amount: 999, category: 'shopping', paymentMethod: 'upi', note: 'Myntra Shirt', tags: [], hr: 14, min: 15 },
    { date: dIso(prevPrefix, 11), amount: 2190, category: 'health', paymentMethod: 'upi', note: 'Gym & Supplements', tags: [], hr: 8, min: 30 },
    { date: dIso(prevPrefix, 12), amount: 1078, category: 'bills', paymentMethod: 'upi', note: 'Electricity Bill', tags: [], hr: 11, min: 0 },
    { date: dIso(prevPrefix, 14), amount: 6200, category: 'transport', paymentMethod: 'card', note: 'Cab & Fuel', tags: ['goa'], hr: 17, min: 45 },
    { date: dIso(prevPrefix, 15), amount: 3360, category: 'food', paymentMethod: 'upi', note: 'Swiggy & Samosa', tags: [], hr: 20, min: 0 }
  ];

  const created = samples.map((s, idx) => ({
    id: `demo_${Date.now()}_${idx}`,
    type: 'expense',
    date: s.date,
    amount: s.amount,
    category: s.category,
    paymentMethod: s.paymentMethod,
    note: s.note,
    tags: s.tags,
    raw: `${s.amount} ${s.note} ${s.paymentMethod}`,
    recurring: false,
    updatedAt: tsAt(s.date, s.hr, s.min),
    synced: false
  }));

  state.expenses = [...created, ...state.expenses].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  saveExpenses(state.expenses);
  renderAll();
  showToast('✨ Loaded realistic sample data from the mockups!', [
    {
      label: '↩ Undo Demo Data',
      onClick: () => {
        state.expenses = previousExpenses;
        saveExpenses(state.expenses);
        renderAll();
      }
    }
  ]);
}

function setUiDesign(nextDesign) {
  state.uiDesign = nextDesign || 'spec';
  try {
    localStorage.setItem('qe_ui_design_v2', state.uiDesign);
    localStorage.setItem('qe_ui_design_v1', state.uiDesign);
  } catch {
    // Ignore storage errors
  }
  renderAll();
  const label = state.uiDesign === 'spec' ? '✨ Mockup Spec UI' : `Classic UI (${state.uiDesign})`;
  showToast(`Switched layout to ${label}`);
}

function quickAddExpense(text, overrideCat, overrideMode, overrideDate) {
  const defaultPay = state.settings.defaultPayment || 'upi';
  const drafts = parseDraftMessage(text, new Date(), 'expense', defaultPay);
  if (!drafts.length || !(Number(drafts[0].amount) > 0)) return;
  const nowTs = Date.now();
  const newEntries = drafts
    .filter((d) => Number(d.amount) > 0)
    .map((d, idx) => {
      const finalCat = overrideCat || d.category || 'other';
      const cleanedNote = (d.note || '').trim() || getCategoryById(finalCat).name;
      if (overrideCat) {
        learnFromNote(cleanedNote, finalCat);
      }
      return {
        id: `exp_${nowTs}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        type: d.type === 'income' ? 'income' : 'expense',
        date: overrideDate || d.date || toLocalISODate(new Date()),
        amount: Number(d.amount),
        category: finalCat,
        paymentMethod: overrideMode || d.paymentMethod || defaultPay,
        note: cleanedNote,
        tags: Array.isArray(d.tags) ? d.tags : [],
        raw: text.trim(),
        recurring: Boolean(d.recurring),
        updatedAt: nowTs + idx,
        synced: false
      };
    });

  state.expenses = [...newEntries, ...state.expenses].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  saveExpenses(state.expenses);
  renderAll();

  const first = newEntries[0];
  const cat = getCategoryById(first.category);
  showToast(`Added ${formatCurrency(first.amount)} · ${cat.icon} ${first.note.toLowerCase()}`, [
    {
      label: 'Undo',
      onClick: () => {
        const ids = new Set(newEntries.map((e) => e.id));
        state.expenses = state.expenses.filter((e) => !ids.has(e.id));
        saveExpenses(state.expenses);
        renderAll();
      }
    }
  ]);
  triggerBackgroundSync(false);
}

const specController = createSpecController({
  state,
  getSettings: () => state.settings,
  updateSettings: (patch) => {
    state.settings = saveSettings(patch);
    updateThemeMetaAndButton();
  },
  setUiDesign,
  formatCurrency,
  getPeriodExpenses,
  changeMonth: (delta) => {
    state.selectedMonth += delta;
    if (state.selectedMonth < 0) {
      state.selectedMonth = 11;
      state.selectedYear -= 1;
    } else if (state.selectedMonth > 11) {
      state.selectedMonth = 0;
      state.selectedYear += 1;
    }
    state.selectedCalendarDate = null;
  },
  QuickAdd: quickAddExpense,
  openEditModal: (exp) => openEditModal(exp),
  openStoryModal: (recap) => openStoryModal(recap),
  openRecurringModal: () => openRecurringModal(),
  openSyncAndSettingsModal: () => openSyncAndSettingsModal(),
  exportCsv: (items) => {
    exportToCSV(items);
    showToast('Downloaded CSV file');
  },
  dismissRecap: (monthKey) => {
    const recapSeen = { ...(state.settings.recapSeen || {}), [monthKey]: true };
    state.settings = saveSettings({ recapSeen });
  },
  seedDemoData
});

function renderAll() {
  updateDesignAndViewDOM();
  specController.render();
  syncWidgetSnapshot(state.expenses, state.settings);
  if (state.uiDesign === 'spec') {
    updateSyncStatusUI();
    updateUsageTrackerUI();
    return;
  }
  updatePeriodHeader();
  const periodExpenses = getPeriodExpenses();
  const spanComp = computeSameSpanComparison(
    state.expenses,
    state.periodMode,
    state.selectedYear,
    state.selectedMonth,
    new Date()
  );

  renderKPIs(periodExpenses, spanComp);
  renderSmartTrackersAndReminders();
  renderCategories(periodExpenses, spanComp);
  renderRunningTotalSection(spanComp);
  renderFunFactsSection(periodExpenses, spanComp);
  renderCalendarAndPatternsSection();
  renderExploreAndCompareSection(spanComp);
  renderRecapsSection();
  renderTrendChart(periodExpenses);
  renderExpenseList(periodExpenses);
  renderUsualsBar();
  updateSyncStatusUI();
  updateUsageTrackerUI();
}

function updateSendBtnLabel() {
  if (!els.sendBtnText) return;
  const validDrafts = state.draftItems.filter((d) => Number(d.amount) > 0);
  if (validDrafts.length > 1) {
    els.sendBtnText.textContent = `Save (${validDrafts.length})`;
  } else {
    els.sendBtnText.textContent = 'Save';
  }
}

function attachImeSafeEnterSubmit(inputEl) {
  let lastCompEnd = null;
  inputEl.addEventListener('compositionend', (ev) => {
    lastCompEnd = ev.timeStamp;
  });
  inputEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (ev.isComposing || ev.keyCode === 229) return;
      if (lastCompEnd !== null && Math.abs(ev.timeStamp - lastCompEnd) < 50) return;
      els.expenseForm.requestSubmit();
    }
  });
}

function updateComposerTypeUI() {
  if (!els.composerTypeBtn) return;
  const isIncome = state.composerType === 'income';
  els.composerTypeBtn.dataset.type = state.composerType;
  els.composerTypeIcon.textContent = isIncome ? '+' : '−';
  els.composerTypeLabel.textContent = isIncome ? 'Income' : 'Expense';
  els.composerTypeBtn.setAttribute(
    'aria-label',
    `Entry mode: ${isIncome ? 'Income' : 'Expense'}. Click to switch to ${isIncome ? 'Expense' : 'Income'}.`
  );
  els.expenseInput.placeholder = isIncome
    ? 'e.g. 50000 salary, 500 cashback'
    : '200 snacks upi #office  •  or ask "food this month"';
}

function formatPreviewTitleText(draftItems) {
  const hasMissingAmt = draftItems.some((d) => !(Number(d.amount) > 0));
  if (hasMissingAmt) {
    return 'Parsed draft — enter amount to save:';
  }
  if (draftItems.length === 1) {
    const item = draftItems[0];
    return item.type === 'income'
      ? `Going to save income (+${formatCurrency(item.amount)}):`
      : 'Going to be saved:';
  }
  const incCount = draftItems.filter((d) => d.type === 'income').length;
  const expCount = draftItems.length - incCount;
  const totalAmt = draftItems.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  if (incCount > 0 && expCount > 0) {
    return `Going to save ${draftItems.length} entries (${expCount} expense, ${incCount} income):`;
  }
  if (incCount > 0) {
    return `Going to save ${incCount} income entries (+${formatCurrency(totalAmt)}):`;
  }
  return `Going to save ${expCount} expenses (${formatCurrency(totalAmt)}):`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 1D: Render Natural Language Question Answer Card
function renderQuestionAnswerCard(rawQuery) {
  if (!els.questionAnswerCard) return false;
  const q = parseQuestionQuery(rawQuery, new Date());
  if (!q || !q.isSpecific) {
    els.questionAnswerCard.hidden = true;
    els.questionAnswerCard.replaceChildren();
    return false;
  }

  const ans = evaluateQuestionQuery(state.expenses, q);
  if (!ans) {
    els.questionAnswerCard.hidden = true;
    els.questionAnswerCard.replaceChildren();
    return false;
  }

  els.questionAnswerCard.hidden = false;
  els.questionAnswerCard.replaceChildren();

  const header = document.createElement('div');
  header.className = 'qa-card-header';
  header.innerHTML = `<span class="qa-badge">🔍 ${escapeHtml(ans.filterTitle || 'Filtered')} • ${escapeHtml(ans.periodLabel)}</span>
    <span class="qa-grammar-hint">No amount = question</span>`;

  const heroRow = document.createElement('div');
  heroRow.className = 'qa-hero-row';

  const totalEl = document.createElement('div');
  totalEl.className = 'qa-hero-total';
  totalEl.textContent = formatCurrency(ans.total);

  const metaEl = document.createElement('div');
  metaEl.className = 'qa-hero-meta';
  let deltaHtml = '';
  if (ans.deltaPct !== null) {
    const isLess = ans.deltaAmt <= 0;
    deltaHtml = ` • <span class="${isLess ? 'is-good' : 'is-warn'}">${isLess ? '▼' : '▲'} ${Math.abs(ans.deltaPct)}% ${isLess ? 'less' : 'more'} vs ${escapeHtml(ans.prevLabel || 'prior span')}</span>`;
  }
  metaEl.innerHTML = `${ans.count} ${ans.count === 1 ? 'entry' : 'entries'} • avg ${formatCurrency(ans.avg)}${deltaHtml}`;

  heroRow.append(totalEl, metaEl);
  els.questionAnswerCard.append(header, heroRow);

  if (ans.topItems.length > 0) {
    const barsWrap = document.createElement('div');
    barsWrap.className = 'qa-top-bars';
    const maxItem = Math.max(1, ...ans.topItems.slice(0, 4).map((t) => t.amount));
    for (const item of ans.topItems.slice(0, 4)) {
      const cat = getCategoryById(item.category);
      const row = document.createElement('div');
      row.className = 'qa-bar-row';
      const pct = Math.max(6, Math.round((item.amount / maxItem) * 100));
      row.innerHTML = `
        <span class="qa-bar-label">${cat.icon} ${escapeHtml(item.note)} <small>×${item.count}</small></span>
        <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${pct}%"></div></div>
        <strong class="qa-bar-val">${formatCurrency(item.amount)}</strong>
      `;
      barsWrap.appendChild(row);
    }
    els.questionAnswerCard.appendChild(barsWrap);
  }

  const actions = document.createElement('div');
  actions.className = 'qa-actions-row';

  const openExploreBtn = document.createElement('button');
  openExploreBtn.type = 'button';
  openExploreBtn.className = 'mini-pill-btn is-accent';
  openExploreBtn.textContent = 'Open in Insights → Explore ▸';
  openExploreBtn.addEventListener('click', () => {
    state.exploreQuery = rawQuery.trim();
    if (els.exploreQueryInput) {
      els.exploreQueryInput.value = state.exploreQuery;
    }
    state.insightsSubtab = 'explore';
    if (state.uiDesign === 'tabs') {
      state.activeView = 'insights';
    } else {
      state.insightsOpen = true;
    }
    renderAll();
    els.insightsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const logInsteadBtn = document.createElement('button');
  logInsteadBtn.type = 'button';
  logInsteadBtn.className = 'mini-pill-btn';
  logInsteadBtn.textContent = '+ Log as expense instead';
  logInsteadBtn.addEventListener('click', () => {
    state.forceDraftMode = true;
    els.questionAnswerCard.hidden = true;
    renderParsePreviewDOM();
    const firstAmt = els.parsePreview?.querySelector('.preview-amount-input');
    firstAmt?.focus();
  });

  actions.append(openExploreBtn, logInsteadBtn);
  els.questionAnswerCard.appendChild(actions);
  return true;
}

// 1C: Render "FROM YOUR HISTORY" Autocomplete while typing
function renderHistoryAutocomplete() {
  if (!els.historyAutocomplete) return;
  const raw = els.expenseInput.value.trim();
  if (!raw || state.draftItems.length !== 1) {
    els.historyAutocomplete.hidden = true;
    els.historyAutocomplete.replaceChildren();
    return;
  }

  const draft = state.draftItems[0];
  const noteFragment = (draft.note || '').trim();
  const matches = computeHistoryMatches(state.expenses, noteFragment || raw, 4);

  if (matches.length === 0) {
    els.historyAutocomplete.hidden = true;
    els.historyAutocomplete.replaceChildren();
    return;
  }

  els.historyAutocomplete.hidden = false;
  els.historyAutocomplete.replaceChildren();

  const header = document.createElement('div');
  header.className = 'history-ac-header';
  header.textContent = 'FROM YOUR HISTORY';
  els.historyAutocomplete.appendChild(header);

  const list = document.createElement('div');
  list.className = 'history-ac-list';

  for (const m of matches) {
    const cat = getCategoryById(m.category);
    const pay = getPaymentMethodById(m.paymentMethod);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-ac-item';
    btn.innerHTML = `
      <span class="history-ac-left">${cat.icon} <strong>${escapeHtml(m.note)}</strong></span>
      <span class="history-ac-right">${formatCurrency(m.amount)} · ${escapeHtml(pay.shortName)} · ×${m.count}</span>
    `;
    btn.addEventListener('click', () => {
      // Keep an amount the user already typed; otherwise fill usual amount
      const typedAmt = Number(draft.amount) > 0 ? draft.amount : m.amount;
      const modeToken = m.paymentMethod === 'card' ? 'card' : m.paymentMethod;
      els.expenseInput.value = `${typedAmt} ${m.note} ${modeToken}`;
      updateLivePreview({ resetOverrides: true });
      els.expenseInput.focus();
    });
    list.appendChild(btn);
  }

  els.historyAutocomplete.appendChild(list);
}

// Sync draftItems when user types in #expense-input, preserving manual field overrides
function updateLivePreview({ resetOverrides = false } = {}) {
  const raw = els.expenseInput.value;
  if (resetOverrides) {
    state.forceDraftMode = false;
  }
  const defaultPayment = state.settings.defaultPayment || 'upi';
  const parsedDrafts = parseDraftMessage(raw, new Date(), state.composerType, defaultPayment);

  if (parsedDrafts.length === 0) {
    state.draftItems = [];
    els.parsePreview.hidden = true;
    els.parsePreview.replaceChildren();
    if (els.questionAnswerCard) {
      els.questionAnswerCard.hidden = true;
      els.questionAnswerCard.replaceChildren();
    }
    if (els.historyAutocomplete) {
      els.historyAutocomplete.hidden = true;
      els.historyAutocomplete.replaceChildren();
    }
    renderUsualsBar();
    updateSendBtnLabel();
    return;
  }

  const prevDrafts = resetOverrides ? [] : state.draftItems;
  state.draftItems = parsedDrafts.map((item, idx) => {
    const prev = prevDrafts[idx];
    const overrides = prev?.overrides ? { ...prev.overrides } : {};
    const mergedAmount = overrides.amount ? prev.amount : item.amount;
    const mergedType = overrides.type ? prev.type : item.type;
    let mergedCategory = overrides.category ? prev.category : item.category;
    const mergedPayment = overrides.paymentMethod ? prev.paymentMethod : item.paymentMethod;
    const mergedTags = overrides.tags ? prev.tags : item.tags || [];
    // Ensure category matches mergedType if type was overridden
    if (mergedType === 'income' && !isIncomeCategory(mergedCategory)) {
      mergedCategory = inferCategory(overrides.note ? prev.note : item.note, 'income');
    } else if (mergedType === 'expense' && isIncomeCategory(mergedCategory)) {
      mergedCategory = inferCategory(overrides.note ? prev.note : item.note, 'expense');
    }
    return {
      ...item,
      type: mergedType || 'expense',
      amount: mergedAmount,
      missingAmount: !(Number(mergedAmount) > 0),
      category: mergedCategory,
      paymentMethod: mergedPayment || defaultPayment,
      note: overrides.note ? prev.note : item.note,
      tags: mergedTags,
      date: overrides.date ? prev.date : item.date,
      dateLabel: overrides.date ? formatReadableDate(prev.date) : item.dateLabel,
      recurring: overrides.recurring ? Boolean(prev.recurring) : Boolean(item.recurring),
      overrides
    };
  });

  renderUsualsBar();

  // 1D: If no amount is typed and the text matches our question grammar, show the Answer Card!
  const allMissingAmount = state.draftItems.every((d) => !(Number(d.amount) > 0));
  if (allMissingAmount && !state.forceDraftMode && parsedDrafts.length === 1) {
    const showedQuestion = renderQuestionAnswerCard(raw);
    if (showedQuestion) {
      els.parsePreview.hidden = true;
      els.parsePreview.replaceChildren();
      if (els.historyAutocomplete) {
        els.historyAutocomplete.hidden = true;
      }
      updateSendBtnLabel();
      return;
    }
  }

  if (els.questionAnswerCard) {
    els.questionAnswerCard.hidden = true;
    els.questionAnswerCard.replaceChildren();
  }

  renderParsePreviewDOM();
  renderHistoryAutocomplete();
  updateSendBtnLabel();
}

function renderParsePreviewDOM() {
  if (state.draftItems.length === 0) {
    els.parsePreview.hidden = true;
    els.parsePreview.replaceChildren();
    return;
  }

  els.parsePreview.hidden = false;
  els.parsePreview.replaceChildren();

  // Header row: "Going to be saved" + quick edit hint + Reset button if customized
  const header = document.createElement('div');
  header.className = 'preview-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'preview-title-wrap';

  const statusDot = document.createElement('span');
  const hasMissingAmt = state.draftItems.some((d) => !(Number(d.amount) > 0));
  statusDot.className = `preview-status-dot ${hasMissingAmt ? 'is-pending' : 'is-ready'}`;
  statusDot.setAttribute('aria-hidden', 'true');

  const titleLabel = document.createElement('span');
  titleLabel.className = 'preview-title-text';
  titleLabel.textContent = formatPreviewTitleText(state.draftItems);

  titleWrap.append(statusDot, titleLabel);

  const rightMeta = document.createElement('div');
  rightMeta.className = 'preview-header-right';

  const hintSpan = document.createElement('span');
  hintSpan.className = 'preview-edit-hint';
  hintSpan.textContent = 'Tap any field to edit • #tags supported';
  rightMeta.appendChild(hintSpan);

  const hasAnyOverride = state.draftItems.some(
    (d) => d.overrides && Object.keys(d.overrides).length > 0
  );
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'preview-reset-btn';
  resetBtn.textContent = 'Reset edits';
  resetBtn.hidden = !hasAnyOverride;
  resetBtn.addEventListener('click', () => {
    updateLivePreview({ resetOverrides: true });
    els.expenseInput.focus();
  });
  rightMeta.appendChild(resetBtn);

  header.append(titleWrap, rightMeta);
  els.parsePreview.appendChild(header);

  const listWrap = document.createElement('div');
  listWrap.className = 'preview-rows';

  state.draftItems.forEach((draft, idx) => {
    const isInc = draft.type === 'income';
    const row = document.createElement('div');
    row.className = `preview-edit-row ${isInc ? 'is-income' : ''}`;

    // 0. Type Toggle Button (Expense vs Income)
    const typeBtn = document.createElement('button');
    typeBtn.type = 'button';
    typeBtn.className = `preview-type-toggle ${isInc ? 'is-income' : 'is-expense'}`;
    typeBtn.textContent = isInc ? '+ Income' : '− Expense';
    typeBtn.title = 'Click to switch between Expense and Income';
    typeBtn.setAttribute('aria-label', `Transaction type for item ${idx + 1}: ${isInc ? 'Income' : 'Expense'}. Click to switch.`);
    typeBtn.addEventListener('click', () => {
      draft.type = draft.type === 'income' ? 'expense' : 'income';
      draft.overrides = draft.overrides || {};
      draft.overrides.type = true;
      draft.category = inferCategory(draft.note || draft.raw, draft.type);
      renderParsePreviewDOM();
      updateSendBtnLabel();
    });

    // 1. Amount field
    const amtGroup = document.createElement('label');
    amtGroup.className = `preview-field preview-field-amount ${!(Number(draft.amount) > 0) ? 'is-missing' : ''}`;
    amtGroup.title = 'Edit amount before saving';

    const symSpan = document.createElement('span');
    symSpan.className = 'preview-currency-sym';
    symSpan.textContent = (isInc ? '+' : '') + (state.settings.currency || '₹');

    const amtInput = document.createElement('input');
    amtInput.type = 'text';
    amtInput.inputMode = 'decimal';
    amtInput.className = 'preview-inline-input preview-amount-input';
    amtInput.placeholder = 'Amount';
    amtInput.setAttribute('aria-label', `Amount for item ${idx + 1}`);
    amtInput.value = draft.amount !== null && draft.amount !== undefined ? String(draft.amount) : '';

    amtInput.addEventListener('input', () => {
      const cleaned = amtInput.value.replace(/,/g, '').trim();
      const num = parseFloat(cleaned);
      draft.overrides = draft.overrides || {};
      draft.overrides.amount = true;
      if (!Number.isNaN(num) && num > 0) {
        draft.amount = Math.round(num * 100) / 100;
        draft.missingAmount = false;
        amtGroup.classList.remove('is-missing');
      } else {
        draft.amount = null;
        draft.missingAmount = true;
        amtGroup.classList.add('is-missing');
      }
      resetBtn.hidden = false;
      const anyMissing = state.draftItems.some((d) => !(Number(d.amount) > 0));
      statusDot.className = `preview-status-dot ${anyMissing ? 'is-pending' : 'is-ready'}`;
      titleLabel.textContent = formatPreviewTitleText(state.draftItems);
      updateSendBtnLabel();
    });
    attachImeSafeEnterSubmit(amtInput);
    amtGroup.append(symSpan, amtInput);

    // 2. Category dropdown (filtered to matching type)
    const catGroup = document.createElement('label');
    catGroup.className = 'preview-field preview-field-category';
    catGroup.title = 'Change category (teaches DropSpend for next time)';

    const catSelect = document.createElement('select');
    catSelect.className = 'preview-inline-select';
    catSelect.setAttribute('aria-label', `Category for item ${idx + 1}`);
    for (const c of getCategoriesByType(draft.type)) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      if (c.id === draft.category) opt.selected = true;
      catSelect.appendChild(opt);
    }
    catSelect.addEventListener('change', () => {
      draft.category = catSelect.value;
      draft.overrides = draft.overrides || {};
      draft.overrides.category = true;
      resetBtn.hidden = false;
    });
    catGroup.appendChild(catSelect);

    // 3. Payment Method dropdown (UPI, Credit Card, Cash, From Cashback/Wallet, etc.)
    const payGroup = document.createElement('label');
    payGroup.className = 'preview-field preview-field-payment';
    payGroup.title = 'Change payment mode (UPI, Credit Card, Cash, Cashback/Wallet)';

    const paySelect = document.createElement('select');
    paySelect.className = 'preview-inline-select';
    paySelect.setAttribute('aria-label', `Payment mode for item ${idx + 1}`);
    for (const pm of PAYMENT_METHODS) {
      const opt = document.createElement('option');
      opt.value = pm.id;
      opt.textContent = `${pm.icon} ${pm.shortName}`;
      if (pm.id === (draft.paymentMethod || state.settings.defaultPayment || 'upi')) {
        opt.selected = true;
      }
      paySelect.appendChild(opt);
    }
    paySelect.addEventListener('change', () => {
      draft.paymentMethod = paySelect.value;
      draft.overrides = draft.overrides || {};
      draft.overrides.paymentMethod = true;
      resetBtn.hidden = false;
    });
    payGroup.appendChild(paySelect);

    // 4. Description / Note input
    const noteGroup = document.createElement('label');
    noteGroup.className = 'preview-field preview-field-note';
    noteGroup.title = 'Edit description / note before saving';

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'preview-inline-input preview-note-input';
    noteInput.placeholder = 'Description';
    noteInput.setAttribute('aria-label', `Description for item ${idx + 1}`);
    noteInput.value = draft.note || '';
    noteInput.addEventListener('input', () => {
      draft.note = noteInput.value;
      draft.overrides = draft.overrides || {};
      draft.overrides.note = true;
      resetBtn.hidden = false;
    });
    attachImeSafeEnterSubmit(noteInput);
    noteGroup.appendChild(noteInput);

    // 5. Date picker
    const dateGroup = document.createElement('label');
    dateGroup.className = 'preview-field preview-field-date';
    dateGroup.title = 'Change transaction date';

    const dateBadge = document.createElement('span');
    dateBadge.className = 'preview-date-badge';
    dateBadge.textContent = `📅 ${formatReadableDate(draft.date)}`;

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'preview-inline-date';
    dateInput.setAttribute('aria-label', `Date for item ${idx + 1}`);
    dateInput.value = draft.date;
    dateGroup.addEventListener('click', () => {
      try {
        dateInput.showPicker?.();
      } catch {
        // Fallback to native input click
      }
    });
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        draft.date = dateInput.value;
        draft.dateLabel = formatReadableDate(dateInput.value);
        dateBadge.textContent = `📅 ${draft.dateLabel}`;
        draft.overrides = draft.overrides || {};
        draft.overrides.date = true;
        resetBtn.hidden = false;
      }
    });
    attachImeSafeEnterSubmit(dateInput);
    dateGroup.append(dateBadge, dateInput);

    // 5b. Recurring monthly toggle button
    const recBtn = document.createElement('button');
    recBtn.type = 'button';
    recBtn.className = `preview-recurring-toggle ${draft.recurring ? 'is-active' : ''}`;
    recBtn.textContent = draft.recurring ? '🔁 Monthly' : '🔁';
    recBtn.title = draft.recurring
      ? 'Repeats every month — click to turn off'
      : 'Mark as monthly recurring bill / subscription / salary';
    recBtn.setAttribute('aria-pressed', draft.recurring ? 'true' : 'false');
    recBtn.addEventListener('click', () => {
      draft.recurring = !draft.recurring;
      draft.overrides = draft.overrides || {};
      draft.overrides.recurring = true;
      resetBtn.hidden = false;
      renderParsePreviewDOM();
    });

    row.append(typeBtn, amtGroup, catGroup, payGroup, noteGroup, dateGroup, recBtn);

    // Show #tag badges if present
    if (Array.isArray(draft.tags) && draft.tags.length > 0) {
      for (const t of draft.tags) {
        const tagBadge = document.createElement('span');
        tagBadge.className = 'tag-pill';
        tagBadge.textContent = `#${t}`;
        row.appendChild(tagBadge);
      }
    }

    // 6. Remove button when multiple items are staged
    if (state.draftItems.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'preview-remove-btn';
      removeBtn.setAttribute('aria-label', `Remove item ${idx + 1} from batch`);
      removeBtn.title = 'Remove this item';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        state.draftItems.splice(idx, 1);
        renderParsePreviewDOM();
        updateSendBtnLabel();
      });
      row.appendChild(removeBtn);
    }

    listWrap.appendChild(row);
  });

  els.parsePreview.appendChild(listWrap);
}

async function triggerBackgroundSync(forceAll = false) {
  if (!state.settings.webhookUrl) {
    updateSyncStatusUI();
    return;
  }
  state.syncState = 'syncing';
  updateSyncStatusUI();

  const result = await syncWithGoogleSheets({ forceAll });
  if (result.status === 'synced') {
    state.expenses = result.expenses;
    state.syncState = 'synced';
    renderAll();
  } else if (result.status === 'error') {
    state.syncState = 'error';
    updateSyncStatusUI();
  } else {
    state.syncState = 'local';
    updateSyncStatusUI();
  }
}

function addExpenseFromMessage(messageText) {
  if (!ensureUserNameGate()) {
    return;
  }
  // If user pressed Enter on a Question query, open Explore with that query!
  const rawTrimmed = (messageText || '').trim();
  if (rawTrimmed && !state.forceDraftMode) {
    const q = parseQuestionQuery(rawTrimmed, new Date());
    const parsedCheck = parseDraftMessage(rawTrimmed, new Date(), state.composerType, state.settings.defaultPayment || 'upi');
    if (q && q.isSpecific && parsedCheck.every((d) => !(Number(d.amount) > 0))) {
      renderQuestionAnswerCard(rawTrimmed);
      return;
    }
  }

  // Use interactive state.draftItems (including any inline edits made in the preview)
  if (state.draftItems.length === 0 && rawTrimmed) {
    updateLivePreview();
  }

  if (state.draftItems.length === 0) {
    showToast('Type an expense (e.g. "200 fuel upi") or ask a question ("food this month")');
    return;
  }

  const missingIdx = state.draftItems.findIndex((item) => !(Number(item.amount) > 0));
  if (missingIdx !== -1) {
    const amtInputs = els.parsePreview.querySelectorAll('.preview-amount-input');
    if (amtInputs[missingIdx]) {
      amtInputs[missingIdx].focus();
    }
    showToast('Enter the amount in the preview box above');
    return;
  }

  const originalMessage = messageText;
  const savedDraftSnapshot = state.draftItems.map((d) => ({
    ...d,
    overrides: d.overrides ? { ...d.overrides } : {}
  }));

  const nowTs = Date.now();
  const newEntries = state.draftItems.map((item, idx) => {
    const entryType = item.type === 'income' ? 'income' : 'expense';
    const cleanedNote = (item.note || '').trim() || getCategoryById(item.category).name;
    // If the user changed the category in the preview before saving, teach the parser!
    if (item.overrides?.category) {
      learnFromNote(cleanedNote, item.category);
    }
    return {
      id: `${entryType === 'income' ? 'inc' : 'exp'}_${nowTs}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      type: entryType,
      date: item.date || toLocalISODate(new Date()),
      amount: Number(item.amount),
      category: item.category || (entryType === 'income' ? 'other_income' : 'other'),
      paymentMethod: item.paymentMethod || state.settings.defaultPayment || 'upi',
      note: cleanedNote,
      tags: Array.isArray(item.tags) ? item.tags : [],
      raw: item.raw || messageText.trim(),
      recurring: Boolean(item.recurring),
      updatedAt: nowTs + idx,
      synced: false
    };
  });

  for (const entry of newEntries) {
    if (entry.recurring) {
      upsertRecurringRuleFromEntry(entry);
    } else {
      markMatchingRecurringRuleLogged(entry);
    }
  }

  state.lastSavedIds = new Set(newEntries.map((e) => e.id));
  state.expenses = [...newEntries, ...state.expenses].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  saveExpenses(state.expenses);
  els.expenseInput.value = '';
  state.draftItems = [];
  state.forceDraftMode = false;
  if (els.historyAutocomplete) els.historyAutocomplete.hidden = true;
  if (els.questionAnswerCard) els.questionAnswerCard.hidden = true;
  renderParsePreviewDOM();
  updateSendBtnLabel();
  renderAll();
  focusExpenseInput();

  const undoAddedExpenses = () => {
    const addedIds = new Set(newEntries.map((e) => e.id));
    state.expenses = state.expenses.filter((e) => !addedIds.has(e.id));
    state.lastSavedIds.clear();
    saveExpenses(state.expenses);

    const tombstones = loadTombstones();
    for (const entry of newEntries) {
      tombstones.push({
        id: entry.id,
        type: entry.type,
        date: entry.date,
        amount: entry.amount,
        category: entry.category,
        paymentMethod: entry.paymentMethod,
        note: entry.note,
        updatedAt: Date.now()
      });
    }
    saveTombstones(tombstones);

    els.expenseInput.value = originalMessage;
    state.draftItems = savedDraftSnapshot;
    renderParsePreviewDOM();
    updateSendBtnLabel();
    renderAll();

    const firstAmtInput = els.parsePreview.querySelector('.preview-amount-input');
    if (firstAmtInput) {
      firstAmtInput.focus();
      firstAmtInput.select();
    } else {
      els.expenseInput.focus();
    }
    triggerBackgroundSync(false);
  };

  if (newEntries.length === 1) {
    const e = newEntries[0];
    const cat = getCategoryById(e.category);
    const pay = getPaymentMethodById(e.paymentMethod);
    const amtText = e.type === 'income' ? `+${formatCurrency(e.amount)}` : formatCurrency(e.amount);
    showToast(
      `✅ Saved ${amtText} • ${cat.icon} ${e.note} • ${pay.icon} ${pay.shortName} (${formatReadableDate(e.date)})`,
      [
        {
          label: '✎ Edit',
          onClick: () => openEditModal(e)
        },
        {
          label: '↩ Undo',
          onClick: undoAddedExpenses
        }
      ]
    );
  } else {
    const sum = newEntries.reduce((s, e) => s + e.amount, 0);
    showToast(
      `✅ Saved ${newEntries.length} entries (${formatCurrency(sum)})`,
      [
        {
          label: '↩ Undo',
          onClick: undoAddedExpenses
        }
      ]
    );
  }

  triggerBackgroundSync(false);
  trackAppUsage({ onLaunch: false }).then((stats) => {
    state.usageStats = stats;
    updateUsageTrackerUI();
  });
}

function updateEditLearnLabel() {
  if (!els.editLearnLabel) return;
  const noteVal = (els.editNote?.value || '').trim() || 'this note';
  const catObj = getCategoryById(els.editCategory?.value || 'other');
  els.editLearnLabel.textContent = `Always file "${noteVal.toLowerCase()}" as ${catObj.icon} ${catObj.shortName || catObj.name}`;
}

function populateCategorySelect(type = 'expense') {
  els.editCategory.replaceChildren();
  const list = getCategoriesByType(type);
  for (const cat of list) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    els.editCategory.appendChild(opt);
  }

  // 3B: Also render 8-category icon grid inside Edit sheet
  if (els.editCategoryGrid) {
    els.editCategoryGrid.replaceChildren();
    for (const cat of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `edit-cat-grid-btn ${els.editCategory.value === cat.id ? 'active' : ''}`;
      btn.dataset.catId = cat.id;
      btn.innerHTML = `<span class="edit-cat-icon">${cat.icon}</span><span class="edit-cat-name">${escapeHtml(cat.shortName || cat.name)}</span>`;
      btn.addEventListener('click', () => {
        els.editCategory.value = cat.id;
        els.editCategoryGrid.querySelectorAll('.edit-cat-grid-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.catId === cat.id);
        });
        updateEditLearnLabel();
      });
      els.editCategoryGrid.appendChild(btn);
    }
  }
}

function populatePaymentSelects() {
  if (els.editPayment) {
    els.editPayment.replaceChildren();
    for (const pm of PAYMENT_METHODS) {
      const opt = document.createElement('option');
      opt.value = pm.id;
      opt.textContent = `${pm.icon} ${pm.name}`;
      els.editPayment.appendChild(opt);
    }
  }

  // 3B: Also render Payment Mode Pills inside Edit sheet
  if (els.editPaymentPills) {
    els.editPaymentPills.replaceChildren();
    for (const pm of PAYMENT_METHODS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'edit-pay-pill-btn';
      btn.dataset.payId = pm.id;
      btn.textContent = `${pm.icon} ${pm.shortName}`;
      btn.addEventListener('click', () => {
        if (els.editPayment) els.editPayment.value = pm.id;
        els.editPaymentPills.querySelectorAll('.edit-pay-pill-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.payId === pm.id);
        });
      });
      els.editPaymentPills.appendChild(btn);
    }
  }

  if (els.defaultPaymentInput) {
    els.defaultPaymentInput.replaceChildren();
    for (const pm of PAYMENT_METHODS) {
      const opt = document.createElement('option');
      opt.value = pm.id;
      opt.textContent = `${pm.icon} ${pm.shortName}`;
      els.defaultPaymentInput.appendChild(opt);
    }
  }
}

function openEditModal(expense) {
  const entryType = normalizeEntryType(expense);
  els.editId.value = expense.id;
  if (els.editType) {
    els.editType.value = entryType;
  }
  populateCategorySelect(entryType);
  els.editAmount.value = String(expense.amount);
  els.editNote.value = expense.note;
  els.editCategory.value = expense.category;
  if (els.editCategoryGrid) {
    els.editCategoryGrid.querySelectorAll('.edit-cat-grid-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.catId === expense.category);
    });
  }
  const payMode = normalizePaymentMethod(expense);
  if (els.editPayment) {
    els.editPayment.value = payMode;
  }
  if (els.editPaymentPills) {
    els.editPaymentPills.querySelectorAll('.edit-pay-pill-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.payId === payMode);
    });
  }
  if (els.editTags) {
    els.editTags.value = Array.isArray(expense.tags) && expense.tags.length > 0
      ? expense.tags.map((t) => `#${t}`).join(' ')
      : '';
  }
  els.editDate.value = expense.date;
  if (els.editRecurring) {
    els.editRecurring.checked = isItemRecurring(expense);
  }
  if (els.editLearnToggle) {
    els.editLearnToggle.checked = true;
  }
  updateEditLearnLabel();
  els.editDialog.showModal();
}

function openSyncAndSettingsModal() {
  if (els.userNameInput) {
    els.userNameInput.value = state.settings.userName || '';
  }
  els.webhookUrlInput.value = state.settings.webhookUrl || '';
  els.currencyInput.value = state.settings.currency || '₹';
  els.budgetInput.value = state.settings.monthlyBudget ? String(state.settings.monthlyBudget) : '';
  if (els.defaultPaymentInput) {
    els.defaultPaymentInput.value = state.settings.defaultPayment || 'upi';
  }
  if (els.uiDesignSelectInput) {
    els.uiDesignSelectInput.value = state.uiDesign || 'spec';
  }
  if (els.themeSelectInput) {
    els.themeSelectInput.value = state.settings.theme || 'dark';
  }
  if (els.alwaysTablesInput) {
    els.alwaysTablesInput.value = state.settings.alwaysTables ? 'true' : 'false';
  }
  updateUsageTrackerUI();
  els.syncDialog.showModal();
}

function setupEventListeners() {
  // Show design switcher bar only when ?switcher=1 or ?design= is present in URL
  try {
    const params = new URLSearchParams(window.location.search);
    if (els.designSwitcherBar && (params.has('switcher') || params.has('design'))) {
      els.designSwitcherBar.hidden = false;
    }
  } catch {
    // Ignore URL errors
  }

  // Clicking or touching anywhere non-interactive on the Quick Log screen focuses input & opens mobile keyboard
  const handleQuickLogSurfaceTap = (e) => {
    if (isAnyDialogOpen()) return;
    if (state.uiDesign === 'tabs' && state.activeView === 'insights') return;
    const interactive = e.target.closest(
      'button, input, select, textarea, a, label, dialog, .expense-item, .preview-edit-row, .usual-chip, .history-ac-item, .question-answer-card'
    );
    if (!interactive) {
      focusExpenseInput();
    }
  };
  document.addEventListener('touchend', handleQuickLogSurfaceTap, { passive: true });
  document.addEventListener('click', handleQuickLogSurfaceTap);

  // Re-focus input & open keyboard when returning to the app / tab
  window.addEventListener('pageshow', () => {
    focusExpenseInput();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      focusExpenseInput();
    }
  });
  window.addEventListener('focus', () => {
    if (document.activeElement === document.body || !document.activeElement) {
      focusExpenseInput();
    }
  });
  els.syncDialog?.addEventListener('close', () => focusExpenseInput());
  els.editDialog?.addEventListener('close', () => focusExpenseInput());
  els.recurringDialog?.addEventListener('close', () => focusExpenseInput());
  els.storyDialog?.addEventListener('close', () => focusExpenseInput());

  // 3D / 6D: Header Theme Cycle Button (Dark -> Clean -> Receipt)
  els.themeCycleBtn?.addEventListener('click', () => {
    const order = ['dark', 'clean', 'receipt'];
    const curr = state.settings.theme || 'dark';
    const next = order[(order.indexOf(curr) + 1) % order.length];
    state.settings = saveSettings({ theme: next });
    updateThemeMetaAndButton();
    const labelMap = { dark: '🌙 Dark Slate', clean: '☀️ Clean Paper', receipt: '🧾 Thermal Receipt' };
    showToast(`Theme: ${labelMap[next]}`);
  });

  // 6A: Home Recap Banner Dismiss
  els.homeRecapDismissBtn?.addEventListener('click', () => {
    const prevMonth = state.selectedMonth === 0 ? 11 : state.selectedMonth - 1;
    const prevYear = state.selectedMonth === 0 ? state.selectedYear - 1 : state.selectedYear;
    const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    const recapSeen = { ...(state.settings.recapSeen || {}), [prevKey]: true };
    state.settings = saveSettings({ recapSeen });
    if (els.homeRecapBanner) els.homeRecapBanner.hidden = true;
  });

  // 1A: Clicking mini stacked category strip on Home opens Insights Overview
  els.miniCatStrip?.addEventListener('click', () => {
    state.insightsSubtab = 'overview';
    if (state.uiDesign === 'tabs') {
      state.activeView = 'insights';
    } else {
      state.insightsOpen = true;
    }
    renderAll();
  });

  // Insights Sub-Tabs (Overview | Calendar & Patterns | Explore & Compare | Recaps)
  els.insightsSubtabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.insightsSubtab = btn.dataset.subtab || 'overview';
      renderAll();
    });
  });

  // 4D: Table toggles on chart cards
  els.toggleCatTableBtn?.addEventListener('click', () => {
    state.tableToggles.category = !state.tableToggles.category;
    renderAll();
  });

  els.toggleRunningTableBtn?.addEventListener('click', () => {
    state.tableToggles.running = !state.tableToggles.running;
    renderAll();
  });

  // 4C: Fun Facts Show All / Top 3 toggle
  els.toggleAllFactsBtn?.addEventListener('click', () => {
    state.showAllFacts = !state.showAllFacts;
    renderAll();
  });

  // 5A: Clear calendar day filter
  els.clearCalDateBtn?.addEventListener('click', () => {
    state.selectedCalendarDate = null;
    renderAll();
  });

  // 5C / 5D: Explore query input & Ask Chips & Group-by pills
  els.exploreQueryInput?.addEventListener('input', () => {
    state.exploreQuery = els.exploreQueryInput.value;
    const spanComp = computeSameSpanComparison(
      state.expenses,
      state.periodMode,
      state.selectedYear,
      state.selectedMonth,
      new Date()
    );
    renderExploreAndCompareSection(spanComp);
  });

  document.querySelectorAll('.is-ask-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const qText = chip.dataset.exploreQ || '';
      state.exploreQuery = qText;
      if (els.exploreQueryInput) {
        els.exploreQueryInput.value = qText;
      }
      const spanComp = computeSameSpanComparison(
        state.expenses,
        state.periodMode,
        state.selectedYear,
        state.selectedMonth,
        new Date()
      );
      renderExploreAndCompareSection(spanComp);
    });
  });

  els.exploreGroupChips.forEach((pill) => {
    pill.addEventListener('click', () => {
      state.exploreGroupBy = pill.dataset.exploreGroup || 'item';
      els.exploreGroupChips.forEach((p) =>
        p.classList.toggle('active', p.dataset.exploreGroup === state.exploreGroupBy)
      );
      const spanComp = computeSameSpanComparison(
        state.expenses,
        state.periodMode,
        state.selectedYear,
        state.selectedMonth,
        new Date()
      );
      renderExploreAndCompareSection(spanComp);
    });
  });

  // 6C: Story Modal Prev / Next navigation
  els.storyPrevBtn?.addEventListener('click', () => {
    if (state.activeStory.index > 0) {
      state.activeStory.index -= 1;
      renderStorySlide();
    }
  });

  els.storyNextBtn?.addEventListener('click', () => {
    const slides = state.activeStory?.slides || [];
    if (state.activeStory.index < slides.length - 1) {
      state.activeStory.index += 1;
      renderStorySlide();
    } else {
      els.storyDialog?.close();
    }
  });

  // Recurring & Credit Card Cycle Manager triggers
  els.openRecurringBtn?.addEventListener('click', openRecurringModal);
  els.openCcSettingsBtn?.addEventListener('click', openRecurringModal);
  els.quickOpenRecurringBtn?.addEventListener('click', openRecurringModal);

  els.ccMarkPaidBtn?.addEventListener('click', () => {
    const ccInfo = computeCreditCardCycleInfo();
    state.settings = saveSettings({ ccLastPaidCycle: ccInfo.dueCycleKey });
    renderAll();
    showToast('✅ Marked credit card bill paid for this cycle');
  });

  els.ccCycleForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const stDay = Math.min(28, Math.max(1, Number(els.ccStatementDayInput?.value) || 15));
    const dueDay = Math.min(28, Math.max(1, Number(els.ccDueDayInput?.value) || 5));
    state.settings = saveSettings({
      ccStatementDay: stDay,
      ccDueDay: dueDay
    });
    renderAll();
    showToast(`💳 Saved cycle: Statement ${formatOrdinal(stDay)} • Due ${formatOrdinal(dueDay)}`);
  });

  els.addRecurringForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = (els.addRecurringInput?.value || '').trim();
    if (!raw) return;
    const defaultPayment = state.settings.defaultPayment || 'upi';
    const parsed = parseDraftMessage(raw, new Date(), 'expense', defaultPayment);
    const first = parsed[0];
    if (!first || !(Number(first.amount) > 0)) {
      showToast('Enter an amount and label, e.g. "15000 rent" or "649 netflix card"');
      return;
    }
    const dayMatch = raw.match(/\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
    const parsedDay = dayMatch ? Math.min(28, Math.max(1, Number(dayMatch[1]))) : new Date().getDate();
    const cleanedNote =
      (first.note || '').replace(/\b(?:on\s+)?\d{1,2}(?:st|nd|rd|th)\b/gi, '').trim() ||
      getCategoryById(first.category).name;
    const key = normalizeNoteKey(cleanedNote);
    const existingIdx = state.recurringRules.findIndex(
      (r) => normalizeNoteKey(r.note) === key && r.type === (first.type || 'expense')
    );
    const ruleObj = {
      id: existingIdx >= 0 ? state.recurringRules[existingIdx].id : `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: first.type === 'income' ? 'income' : 'expense',
      amount: Number(first.amount),
      category: first.category || 'bills',
      paymentMethod: first.paymentMethod || defaultPayment,
      note: cleanedNote,
      dayOfMonth: Math.min(28, Math.max(1, parsedDay)),
      active: true,
      lastLoggedMonth: existingIdx >= 0 ? state.recurringRules[existingIdx].lastLoggedMonth : ''
    };
    if (existingIdx >= 0) {
      state.recurringRules[existingIdx] = ruleObj;
    } else {
      state.recurringRules.push(ruleObj);
    }
    saveRecurringRules(state.recurringRules);
    els.addRecurringInput.value = '';
    renderRecurringModalList();
    renderAll();
    showToast(`🔁 Added monthly rule: ${cleanedNote} (${formatCurrency(ruleObj.amount)})`);
  });

  // Design Switcher Bar (Option 1–4 + Classic)
  els.designPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const nextDesign = pill.dataset.design || 'spotlight';
      state.uiDesign = nextDesign;
      state.activeView = 'log';
      state.insightsOpen = false;
      state.showAllFeed = false;
      try {
        localStorage.setItem('qe_ui_design_v1', nextDesign);
      } catch {
        // Ignore storage errors
      }
      renderAll();
      els.expenseInput?.focus();
    });
  });

  // Two-Tab Zen View Switcher (⚡ Quick Log vs 📊 Insights)
  els.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeView = tab.dataset.view || 'log';
      if (state.activeView === 'log') {
        document.body.dataset.view = 'log';
        focusExpenseInput();
      } else if (state.activeView === 'insights') {
        state.showAllFeed = true;
      }
      renderAll();
      if (state.activeView === 'log') {
        focusExpenseInput();
      }
    });
  });

  // Insights & Breakdown Toggle Button (Options 1, 3, 4)
  if (els.toggleInsightsBtn) {
    els.toggleInsightsBtn.addEventListener('click', () => {
      state.insightsOpen = !state.insightsOpen;
      if (state.insightsOpen) {
        state.showAllFeed = true;
      }
      renderAll();
    });
  }

  // "View all transactions & insights ->" button at bottom of recent-5 list
  if (els.showAllFeedBtn) {
    els.showAllFeedBtn.addEventListener('click', () => {
      if (state.uiDesign === 'tabs') {
        state.activeView = 'insights';
      } else {
        state.insightsOpen = true;
        state.showAllFeed = true;
      }
      renderAll();
    });
  }

  // Quick 1-Tap Category / Mode Chips inside Composer
  els.quickFillChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const token = (chip.dataset.fill || '').trim();
      if (!token) return;
      focusExpenseInput();
      const current = els.expenseInput.value.trim();
      if (!current) {
        els.expenseInput.value = `${token} `;
      } else if (!current.toLowerCase().includes(token.toLowerCase())) {
        els.expenseInput.value = `${current} ${token}`;
      }
      focusExpenseInput();
      updateLivePreview();
    });
  });

  // Mandatory Welcome Name Gate (cannot be closed with Escape until name is submitted)
  if (els.nameGateDialog) {
    els.nameGateDialog.addEventListener('cancel', (e) => {
      const hasName = Boolean((state.settings.userName || '').trim());
      if (!hasName) {
        e.preventDefault();
        els.quickNameInput?.focus();
      }
    });
  }

  if (els.quickNameForm) {
    els.quickNameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredName = (els.quickNameInput?.value || '').trim();
      if (!enteredName) {
        requestSoftKeyboard(els.quickNameInput);
        return;
      }
      state.settings = saveSettings({ userName: enteredName });
      if (els.nameGateDialog?.open) {
        els.nameGateDialog.close();
      }
      updateUsageTrackerUI();
      renderAll();
      showToast(`👋 Welcome, ${enteredName}!`);
      if (state.uiDesign === 'spec') {
        if (state.settings.openToAdd !== false) {
          specController.openAddPalette('');
        }
      } else {
        focusExpenseInput();
      }
      trackAppUsage({ onLaunch: true }).then((stats) => {
        state.usageStats = stats;
        updateUsageTrackerUI();
      });
    });
  }

  // Composer default mode toggle (Expense <-> Income)
  if (els.composerTypeBtn) {
    els.composerTypeBtn.addEventListener('click', () => {
      state.composerType = state.composerType === 'income' ? 'expense' : 'income';
      updateComposerTypeUI();
      updateLivePreview({ resetOverrides: true });
      els.expenseInput.focus();
    });
  }

  // Live preview on input
  els.expenseInput.addEventListener('input', updateLivePreview);

  // IME-safe Enter-to-submit check
  let lastCompositionEndAt = null;
  els.expenseInput.addEventListener('compositionend', (event) => {
    lastCompositionEndAt = event.timeStamp;
  });

  els.expenseInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      if (
        lastCompositionEndAt !== null &&
        Math.abs(event.timeStamp - lastCompositionEndAt) < 50
      ) {
        return;
      }
      els.expenseForm.requestSubmit();
    }
  });

  els.expenseForm.addEventListener('submit', (event) => {
    event.preventDefault();
    addExpenseFromMessage(els.expenseInput.value);
  });

  // Sample demo chips
  els.sampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      els.expenseInput.value = chip.dataset.sample || '';
      updateLivePreview({ resetOverrides: true });
      els.expenseInput.focus();
    });
  });

  // Month navigation
  els.prevMonthBtn.addEventListener('click', () => {
    state.selectedMonth -= 1;
    if (state.selectedMonth < 0) {
      state.selectedMonth = 11;
      state.selectedYear -= 1;
    }
    state.selectedCalendarDate = null;
    renderAll();
  });

  els.nextMonthBtn.addEventListener('click', () => {
    state.selectedMonth += 1;
    if (state.selectedMonth > 11) {
      state.selectedMonth = 0;
      state.selectedYear += 1;
    }
    state.selectedCalendarDate = null;
    renderAll();
  });

  els.modeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.periodMode = chip.dataset.mode;
      renderAll();
    });
  });

  // Category panel type toggle (Expenses vs Payment Mode vs Income)
  els.catTypeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.catBreakdownType = chip.dataset.catType;
      state.selectedCategory = null;
      state.selectedPaymentMethod = null;
      renderAll();
    });
  });

  // Transactions feed type filter (All vs Expenses vs Income)
  els.feedTypeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.feedFilterType = chip.dataset.feedType;
      renderAll();
    });
  });

  els.clearCatFilterBtn.addEventListener('click', () => {
    state.selectedCategory = null;
    state.selectedPaymentMethod = null;
    state.selectedTag = null;
    state.selectedCalendarDate = null;
    renderAll();
  });

  // Search (supports question grammar + hashtag + substring)
  els.searchForm.addEventListener('submit', (e) => e.preventDefault());
  els.searchInput.addEventListener('input', () => {
    state.searchQuery = els.searchInput.value;
    renderExpenseList(getPeriodExpenses());
  });

  // CSV Export
  els.exportCsvBtn.addEventListener('click', () => {
    if (state.expenses.length === 0) {
      showToast('No transactions to export yet');
      return;
    }
    exportToCSV(state.expenses);
    showToast('Downloaded CSV file');
  });

  // Cloud Sync, Settings & 1-Tap Switch Back to Mockup Spec UI
  els.syncStatusBtn.addEventListener('click', openSyncAndSettingsModal);
  if (els.usageStatsBtn) {
    els.usageStatsBtn.addEventListener('click', openSyncAndSettingsModal);
  }
  document.getElementById('header-settings-btn')?.addEventListener('click', openSyncAndSettingsModal);
  document.getElementById('quick-switch-spec-btn')?.addEventListener('click', () => {
    setUiDesign('spec');
  });
  els.uiDesignSelectInput?.addEventListener('change', (e) => {
    if (e.target.value) {
      setUiDesign(e.target.value);
      els.syncDialog?.close();
    }
  });

  els.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredName = els.userNameInput ? els.userNameInput.value.trim() : '';
    const finalName = enteredName || state.settings.userName || '';
    const alwaysTables = els.alwaysTablesInput ? els.alwaysTablesInput.value === 'true' : false;
    if (els.uiDesignSelectInput && els.uiDesignSelectInput.value) {
      state.uiDesign = els.uiDesignSelectInput.value;
      try {
        localStorage.setItem('qe_ui_design_v2', state.uiDesign);
        localStorage.setItem('qe_ui_design_v1', state.uiDesign);
      } catch {
        // Ignore storage errors
      }
    }
    state.settings = saveSettings({
      userName: finalName,
      webhookUrl: els.webhookUrlInput.value.trim(),
      currency: els.currencyInput.value.trim() || '₹',
      monthlyBudget: Number(els.budgetInput.value.replace(/,/g, '')) || 0,
      defaultPayment: els.defaultPaymentInput ? els.defaultPaymentInput.value : 'upi',
      theme: els.themeSelectInput ? els.themeSelectInput.value : state.settings.theme || 'dark',
      alwaysTables
    });
    state.showCatTable = alwaysTables;
    state.showRunningTable = alwaysTables;
    els.syncDialog.close();
    renderAll();
    ensureUserNameGate();
    trackAppUsage({ onLaunch: false }).then((stats) => {
      state.usageStats = stats;
      updateUsageTrackerUI();
    });
    if (state.settings.webhookUrl) {
      showToast('Syncing with Google Sheets...');
      await triggerBackgroundSync(true);
    } else {
      showToast('Settings saved');
    }
  });

  els.forceSyncBtn.addEventListener('click', async () => {
    state.settings = saveSettings({
      webhookUrl: els.webhookUrlInput.value.trim()
    });
    if (!state.settings.webhookUrl) {
      showToast('Paste your Google Apps Script URL first');
      return;
    }
    showToast('Restoring & syncing with Google Sheet...');
    await triggerBackgroundSync(true);
    if (state.syncState === 'synced') {
      showToast(`✅ Synced ${state.expenses.length} entries with Google Sheet`);
      els.syncDialog.close();
    } else {
      showToast('⚠️ Could not reach URL. Check deployment permissions.');
    }
  });

  els.copyGasBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      showToast('Copied Google Apps Script to clipboard!');
    } catch {
      showToast('Select the code block below to copy');
    }
  });

  // JSON Backup & Restore
  els.exportJsonBtn.addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      expenses: state.expenses,
      recurringRules: state.recurringRules,
      learnedKeywords: getLearnedKeywords(),
      settings: {
        currency: state.settings.currency || '₹',
        monthlyBudget: state.settings.monthlyBudget || 0,
        defaultPayment: state.settings.defaultPayment || 'upi',
        ccStatementDay: state.settings.ccStatementDay || 15,
        ccDueDay: state.settings.ccDueDay || 5,
        theme: state.settings.theme || 'dark',
        alwaysTables: Boolean(state.settings.alwaysTables)
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dropspend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded JSON backup');
  });

  els.importJsonInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.expenses;
      if (!Array.isArray(list)) throw new Error('Invalid format');
      if (parsed && !Array.isArray(parsed)) {
        if (parsed.learnedKeywords) {
          mergeLearnedKeywords(parsed.learnedKeywords);
        }
        if (Array.isArray(parsed.recurringRules)) {
          state.recurringRules = parsed.recurringRules;
          saveRecurringRules(state.recurringRules);
        }
        if (parsed.settings) {
          state.settings = saveSettings({
            currency: parsed.settings.currency || state.settings.currency || '₹',
            monthlyBudget: Number(parsed.settings.monthlyBudget) || state.settings.monthlyBudget || 0,
            defaultPayment: parsed.settings.defaultPayment || state.settings.defaultPayment || 'upi',
            ccStatementDay: Number(parsed.settings.ccStatementDay) || state.settings.ccStatementDay || 15,
            ccDueDay: Number(parsed.settings.ccDueDay) || state.settings.ccDueDay || 5,
            theme: parsed.settings.theme || state.settings.theme || 'dark'
          });
        }
      }
      const byId = new Map(state.expenses.map((item) => [item.id, item]));
      for (const item of list) {
        if (item && item.id && item.amount) {
          byId.set(item.id, {
            ...item,
            type: normalizeEntryType(item),
            paymentMethod: normalizePaymentMethod(item),
            tags: Array.isArray(item.tags) ? item.tags : [],
            synced: false
          });
        }
      }
      state.expenses = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      saveExpenses(state.expenses);
      renderAll();
      els.syncDialog.close();
      showToast(`✅ Restored ${list.length} entries`);
      triggerBackgroundSync(true);
    } catch {
      showToast('Invalid JSON backup file');
    } finally {
      els.importJsonInput.value = '';
    }
  });

  // Update category options when Type or Note changes inside Edit Modal
  if (els.editType) {
    els.editType.addEventListener('change', () => {
      const newType = els.editType.value;
      populateCategorySelect(newType);
      els.editCategory.value = inferCategory(els.editNote.value, newType);
      if (els.editCategoryGrid) {
        els.editCategoryGrid.querySelectorAll('.edit-cat-grid-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.catId === els.editCategory.value);
        });
      }
      updateEditLearnLabel();
    });
  }

  els.editNote?.addEventListener('input', updateEditLearnLabel);

  // Edit & Delete Transaction Modal (3B)
  els.editExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = els.editId.value;
    const idx = state.expenses.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const newAmount = parseFloat(els.editAmount.value);
    if (Number.isNaN(newAmount) || newAmount <= 0) return;

    const newType = els.editType ? els.editType.value : normalizeEntryType(state.expenses[idx]);
    const newNote = els.editNote.value.trim();
    const newCategory = els.editCategory.value;
    const newPayment = els.editPayment
      ? els.editPayment.value
      : normalizePaymentMethod(state.expenses[idx]);
    const newDate = els.editDate.value;
    const isRecurring = Boolean(els.editRecurring?.checked);
    const shouldLearn = els.editLearnToggle ? els.editLearnToggle.checked : true;

    const rawTagsStr = (els.editTags?.value || '').trim();
    const extracted = extractTags(rawTagsStr).tags;
    const fallbackTags = rawTagsStr
      ? rawTagsStr
          .split(/[\s,]+/)
          .map((t) => t.replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, ''))
          .filter(Boolean)
      : [];
    const finalTags = extracted.length > 0 ? extracted : fallbackTags;

    if (shouldLearn) {
      learnFromNote(newNote, newCategory);
    }

    state.expenses[idx] = {
      ...state.expenses[idx],
      type: newType,
      amount: newAmount,
      note: newNote,
      category: newCategory,
      paymentMethod: newPayment,
      tags: Array.from(new Set(finalTags)),
      date: newDate,
      recurring: isRecurring,
      updatedAt: Date.now(),
      synced: false
    };

    if (isRecurring) {
      upsertRecurringRuleFromEntry(state.expenses[idx]);
    } else {
      removeRecurringRuleForEntry(state.expenses[idx]);
    }

    saveExpenses(state.expenses);
    els.editDialog.close();
    renderAll();
    showToast(shouldLearn ? '✅ Updated & learned category rule' : '✅ Entry updated');
    triggerBackgroundSync(false);
  });

  els.deleteExpenseBtn.addEventListener('click', () => {
    const id = els.editId.value;
    const target = state.expenses.find((item) => item.id === id);
    if (!target) return;

    const deletedSnapshot = { ...target };
    state.expenses = state.expenses.filter((item) => item.id !== id);
    saveExpenses(state.expenses);

    const tombstones = loadTombstones();
    tombstones.push({
      id: target.id,
      type: normalizeEntryType(target),
      date: target.date,
      amount: target.amount,
      category: target.category,
      paymentMethod: normalizePaymentMethod(target),
      note: target.note,
      updatedAt: Date.now()
    });
    saveTombstones(tombstones);

    els.editDialog.close();
    renderAll();
    showToast(`🗑️ Deleted "${target.note}" (${formatCurrency(target.amount)})`, [
      {
        label: '↩ Undo',
        onClick: () => {
          state.expenses = [deletedSnapshot, ...state.expenses].sort((a, b) =>
            b.date.localeCompare(a.date)
          );
          saveExpenses(state.expenses);
          const remainingTombstones = loadTombstones().filter((t) => t.id !== deletedSnapshot.id);
          saveTombstones(remainingTombstones);
          renderAll();
          triggerBackgroundSync(false);
        }
      }
    ]);
    triggerBackgroundSync(false);
  });

  // Auto-sync when device comes back online
  window.addEventListener('online', () => {
    triggerBackgroundSync(false);
    trackAppUsage({ onLaunch: false }).then((stats) => {
      state.usageStats = stats;
      updateUsageTrackerUI();
    });
  });
}

// Initialize App
function init() {
  try {
    navigator.storage?.persist?.();
  } catch {
    // Ignore storage persist errors
  }
  populateCategorySelect('expense');
  populatePaymentSelects();
  updateComposerTypeUI();
  els.gasCodeBlock.textContent = GOOGLE_APPS_SCRIPT_CODE;
  setupEventListeners();

  // One-time cleanup: purge any previously auto-seeded demo_* entries so only real user expenses remain
  try {
    if (!localStorage.getItem('qe_purged_auto_demo_v19')) {
      localStorage.setItem('qe_purged_auto_demo_v19', '1');
      const cleaned = state.expenses.filter((e) => !String(e.id || '').startsWith('demo_'));
      if (cleaned.length !== state.expenses.length) {
        state.expenses = cleaned;
        saveExpenses(state.expenses);
      }
    }
    if (!localStorage.getItem('qe_open_to_add_default_v19')) {
      localStorage.setItem('qe_open_to_add_default_v19', '1');
      state.settings = saveSettings({ openToAdd: true });
    }
  } catch {
    // Ignore storage errors
  }

  renderAll();

  initNativeBridge({
    getExpenses: () => state.expenses,
    getSettings: () => state.settings,
    QuickAdd: quickAddExpense,
    openSpecAddPalette: (prefill) => specController.openAddPalette(prefill || ''),
    navigateSpecScreen: (scr) => specController.navigateScreen?.(scr),
    handleSpecBack: () => specController.handleBackGesture?.()
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js?v=23')
      .then((reg) => reg.update())
      .catch(() => {});
  }

  if (state.settings.webhookUrl) {
    triggerBackgroundSync(false);
  }

  // Always prompt for user name on first launch; once name is set, auto-open keyboard input
  const hasName = ensureUserNameGate();
  if (hasName) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (state.uiDesign === 'spec') {
        if (params.has('add') || params.has('quickadd') || state.settings.openToAdd !== false) {
          specController.openAddPalette('');
        }
      } else {
        focusExpenseInput();
        requestAnimationFrame(() => focusExpenseInput());
        setTimeout(() => focusExpenseInput(), 80);
      }
    } catch {
      // Ignore URL errors
    }
    trackAppUsage({ onLaunch: true }).then((stats) => {
      state.usageStats = stats;
      updateUsageTrackerUI();
    });
  }
}

init();
