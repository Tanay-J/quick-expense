import {
  CATEGORIES,
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
  PAYMENT_METHODS,
  toLocalISODate
} from './parser.js';

import {
  exportToCSV,
  getOrCreateAnonDeviceId,
  GOOGLE_APPS_SCRIPT_CODE,
  loadCachedUsageStats,
  loadExpenses,
  loadSettings,
  loadTombstones,
  normalizeEntryType,
  normalizePaymentMethod,
  saveExpenses,
  saveSettings,
  saveTombstones,
  syncWithGoogleSheets,
  trackAppUsage
} from './sync.js';

// Application State
const state = {
  expenses: loadExpenses(),
  settings: loadSettings(),
  periodMode: 'month', // 'month' | '7d' | 'all'
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth(), // 0-11
  selectedCategory: null,
  selectedPaymentMethod: null,
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
  budgetProgress: document.getElementById('budget-progress'),
  catTypeChips: document.querySelectorAll('[data-cat-type]'),
  catStackedBar: document.getElementById('category-stacked-bar'),
  catList: document.getElementById('category-list'),
  clearCatFilterBtn: document.getElementById('clear-cat-filter-btn'),
  trendChart: document.getElementById('trend-chart'),
  trendSubtitle: document.getElementById('trend-subtitle'),
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
  settingsForm: document.getElementById('settings-form'),
  webhookUrlInput: document.getElementById('webhook-url-input'),
  currencyInput: document.getElementById('currency-input'),
  budgetInput: document.getElementById('budget-input'),
  defaultPaymentInput: document.getElementById('default-payment-input'),
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
  editCategory: document.getElementById('edit-category'),
  editPayment: document.getElementById('edit-payment'),
  editDate: document.getElementById('edit-date'),
  deleteExpenseBtn: document.getElementById('delete-expense-btn')
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
  const toast = document.createElement('div');
  toast.className = 'toast';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = text;
  toast.appendChild(msgSpan);

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
    toast.appendChild(actWrap);
  }

  els.toastRegion.appendChild(toast);
  const timeoutMs = actions.length > 0 ? 6500 : 3200;
  setTimeout(() => {
    toast.remove();
  }, timeoutMs);
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

function renderKPIs(periodExpenses) {
  const expenseItems = periodExpenses.filter((item) => normalizeEntryType(item) !== 'income');
  const incomeItems = periodExpenses.filter((item) => normalizeEntryType(item) === 'income');

  const totalSpent = expenseItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalIncome = incomeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const netCashflow = totalIncome - totalSpent;

  els.kpiTotal.textContent = formatCurrency(totalSpent);

  // Budget progress (shown in month mode if budget > 0)
  const budget = Number(state.settings.monthlyBudget) || 0;
  if (state.periodMode === 'month' && budget > 0) {
    els.budgetWrap.hidden = false;
    const pct = Math.min(100, Math.round((totalSpent / budget) * 100));
    els.budgetProgress.value = pct;
    const hue = pct > 90 ? 0 : pct > 75 ? 38 : 150;
    els.budgetProgress.style.setProperty('--budget-hue', String(hue));
    els.budgetStatusText.textContent = `${pct}% of ${formatCurrency(budget)} budget`;
  } else {
    els.budgetWrap.hidden = true;
  }

  // Daily average & projected
  const now = new Date();
  let daysElapsed = 1;
  let daysInMonth = new Date(state.selectedYear, state.selectedMonth + 1, 0).getDate();

  if (state.periodMode === '7d') {
    daysElapsed = 7;
  } else if (state.periodMode === 'month') {
    if (
      state.selectedYear === now.getFullYear() &&
      state.selectedMonth === now.getMonth()
    ) {
      daysElapsed = Math.max(1, now.getDate());
    } else {
      daysElapsed = daysInMonth;
    }
  } else {
    const uniqueDates = new Set(periodExpenses.map((e) => e.date));
    daysElapsed = Math.max(1, uniqueDates.size);
  }

  const dailyAvg = totalSpent / daysElapsed;
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
    els.kpiProjected.textContent = `Across ${daysElapsed} active day${daysElapsed === 1 ? '' : 's'}`;
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

function renderCategories(periodExpenses) {
  els.catTypeChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.catType === state.catBreakdownType);
  });

  els.catStackedBar.replaceChildren();
  els.catList.replaceChildren();
  els.clearCatFilterBtn.hidden = !(state.selectedCategory || state.selectedPaymentMethod);

  // Payment Mode breakdown mode (Expenses grouped by UPI, Credit Card, Cash, Cashback/Wallet, etc.)
  if (state.catBreakdownType === 'payment') {
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
    .map((c) => ({
      ...c,
      amount: byCat[c.id] || 0,
      pct: total > 0 ? ((byCat[c.id] || 0) / total) * 100 : 0
    }))
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
    return;
  }

  for (const cat of sorted) {
    // Stacked bar segment
    const seg = document.createElement('div');
    seg.className = 'stacked-segment';
    seg.style.width = `${Math.max(2, cat.pct)}%`;
    seg.style.setProperty('--cat-hue', cat.hue);
    els.catStackedBar.appendChild(seg);

    // Interactive category list button
    const li = document.createElement('li');
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

    const pctSpan = document.createElement('span');
    pctSpan.className = 'cat-pct';
    pctSpan.textContent = `${Math.round(cat.pct)}%`;

    right.append(amtStrong, pctSpan);
    btn.append(left, right);

    btn.addEventListener('click', () => {
      state.selectedCategory = state.selectedCategory === cat.id ? null : cat.id;
      state.selectedPaymentMethod = null;
      renderAll();
    });

    li.appendChild(btn);
    els.catList.appendChild(li);
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

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter((e) => {
      const catName = getCategoryById(e.category).name.toLowerCase();
      const payObj = getPaymentMethodById(normalizePaymentMethod(e));
      const payName = `${payObj.name} ${payObj.shortName}`.toLowerCase();
      const typeLabel = normalizeEntryType(e);
      return (
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.raw && e.raw.toLowerCase().includes(q)) ||
        catName.includes(q) ||
        payName.includes(q) ||
        typeLabel.includes(q) ||
        String(e.amount).includes(q)
      );
    });
  }

  els.expenseList.replaceChildren();

  if (filtered.length === 0) {
    els.emptyState.hidden = false;
    return;
  }

  els.emptyState.hidden = true;

  for (const item of filtered) {
    const isIncome = normalizeEntryType(item) === 'income';
    const cat = getCategoryById(item.category);
    const payObj = getPaymentMethodById(normalizePaymentMethod(item));
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
    const syncIndicator = item.synced ? '☁️' : '📱';
    const typeTag = isIncome ? 'Income • ' : '';
    metaP.textContent = `${typeTag}${cat.name} • ${payObj.icon} ${payObj.shortName} • ${formatReadableDate(item.date)} • ${syncIndicator}`;

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
    els.expenseList.appendChild(li);
  }
}

function updateUsageTrackerUI() {
  const stats = state.usageStats || loadCachedUsageStats();
  const localHasTx = state.expenses.length > 0 ? 1 : 0;
  const activeUsers = Math.max(localHasTx, Number(stats.activeUsers) || 0);
  const visitors = Math.max(1, Number(stats.uniqueUsers) || 1);
  const entriesLogged = Math.max(state.expenses.length, Number(stats.totalTxLogged) || 0);

  if (els.usageStatsLabel) {
    const shownCount = activeUsers > 0 ? activeUsers : visitors;
    els.usageStatsLabel.textContent = `${shownCount.toLocaleString('en-IN')} ${shownCount === 1 ? 'user' : 'users'}`;
  }
  if (els.modalActiveUsers) {
    els.modalActiveUsers.textContent = activeUsers.toLocaleString('en-IN');
  }
  if (els.modalUniqueUsers) {
    els.modalUniqueUsers.textContent = visitors.toLocaleString('en-IN');
  }
  if (els.modalTotalSessions) {
    els.modalTotalSessions.textContent = entriesLogged.toLocaleString('en-IN');
  }
  if (els.modalAnonId) {
    els.modalAnonId.textContent = getOrCreateAnonDeviceId();
  }
  if (els.usageTrackerBadge) {
    if (stats.source === 'sheet') {
      els.usageTrackerBadge.textContent = 'Google Sheet Telemetry';
      els.usageTrackerBadge.dataset.source = 'live';
    } else {
      els.usageTrackerBadge.textContent = 'Local Device';
      els.usageTrackerBadge.dataset.source = 'local';
    }
  }
}

function updateSyncStatusUI() {
  const hasWebhook = Boolean((state.settings.webhookUrl || '').trim());
  const unsyncedCount = state.expenses.filter((e) => !e.synced).length;

  if (!hasWebhook) {
    els.syncDot.dataset.state = 'local';
    els.syncLabel.textContent = 'Backup: Set up Google Sheet';
    return;
  }

  if (state.syncState === 'syncing') {
    els.syncDot.dataset.state = 'syncing';
    els.syncLabel.textContent = 'Syncing to Sheet...';
  } else if (state.syncState === 'error') {
    els.syncDot.dataset.state = 'error';
    els.syncLabel.textContent = `Sync retry queued (${unsyncedCount})`;
  } else if (unsyncedCount === 0) {
    els.syncDot.dataset.state = 'synced';
    els.syncLabel.textContent = 'Google Sheet Synced';
  } else {
    els.syncDot.dataset.state = 'local';
    els.syncLabel.textContent = `${unsyncedCount} pending sync`;
  }
}

function renderAll() {
  updatePeriodHeader();
  const periodExpenses = getPeriodExpenses();
  renderKPIs(periodExpenses);
  renderCategories(periodExpenses);
  renderTrendChart(periodExpenses);
  renderExpenseList(periodExpenses);
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
    ? 'Drop income: e.g. 50000 salary, 1200 freelance yesterday...'
    : 'Drop expense or +income: e.g. 200 fuel upi, 1500 shoes cc, 250 coffee from cashback...';
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

// Sync draftItems when user types in #expense-input, preserving manual field overrides
function updateLivePreview({ resetOverrides = false } = {}) {
  const raw = els.expenseInput.value;
  const defaultPayment = state.settings.defaultPayment || 'upi';
  const parsedDrafts = parseDraftMessage(raw, new Date(), state.composerType, defaultPayment);

  if (parsedDrafts.length === 0) {
    state.draftItems = [];
    els.parsePreview.hidden = true;
    els.parsePreview.replaceChildren();
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
      date: overrides.date ? prev.date : item.date,
      dateLabel: overrides.date ? formatReadableDate(prev.date) : item.dateLabel,
      overrides
    };
  });

  renderParsePreviewDOM();
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
  hintSpan.textContent = 'Tap any field to edit before saving';
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
    dateBadge.textContent = formatReadableDate(draft.date);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'preview-inline-date';
    dateInput.setAttribute('aria-label', `Date for item ${idx + 1}`);
    dateInput.value = draft.date;
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        draft.date = dateInput.value;
        draft.dateLabel = formatReadableDate(dateInput.value);
        dateBadge.textContent = draft.dateLabel;
        draft.overrides = draft.overrides || {};
        draft.overrides.date = true;
        resetBtn.hidden = false;
      }
    });
    attachImeSafeEnterSubmit(dateInput);
    dateGroup.append(dateBadge, dateInput);

    row.append(typeBtn, amtGroup, catGroup, payGroup, noteGroup, dateGroup);

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
  // Use interactive state.draftItems (including any inline edits made in the preview)
  if (state.draftItems.length === 0 && messageText.trim()) {
    updateLivePreview();
  }

  if (state.draftItems.length === 0) {
    showToast('Type an expense or income, e.g. "200 fuel upi" or "+50000 salary"');
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
      raw: item.raw || messageText.trim(),
      updatedAt: nowTs + idx,
      synced: false
    };
  });

  state.lastSavedIds = new Set(newEntries.map((e) => e.id));
  state.expenses = [...newEntries, ...state.expenses].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  saveExpenses(state.expenses);
  els.expenseInput.value = '';
  state.draftItems = [];
  renderParsePreviewDOM();
  updateSendBtnLabel();
  renderAll();

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
          label: '↩ Undo & Edit in Bar',
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
          label: '↩ Undo & Edit in Bar',
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

function populateCategorySelect(type = 'expense') {
  els.editCategory.replaceChildren();
  const list = getCategoriesByType(type);
  for (const cat of list) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    els.editCategory.appendChild(opt);
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
  if (els.editPayment) {
    els.editPayment.value = normalizePaymentMethod(expense);
  }
  els.editDate.value = expense.date;
  els.editDialog.showModal();
}

function openSyncAndSettingsModal() {
  els.webhookUrlInput.value = state.settings.webhookUrl || '';
  els.currencyInput.value = state.settings.currency || '₹';
  els.budgetInput.value = state.settings.monthlyBudget ? String(state.settings.monthlyBudget) : '';
  if (els.defaultPaymentInput) {
    els.defaultPaymentInput.value = state.settings.defaultPayment || 'upi';
  }
  updateUsageTrackerUI();
  els.syncDialog.showModal();
}

function setupEventListeners() {
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

  // IME-safe Enter-to-submit check (per modern-web-guidance ime-safe-enter-submit)
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
    renderAll();
  });

  els.nextMonthBtn.addEventListener('click', () => {
    state.selectedMonth += 1;
    if (state.selectedMonth > 11) {
      state.selectedMonth = 0;
      state.selectedYear += 1;
    }
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
    renderAll();
  });

  // Search
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

  // Cloud Sync & Usage Stats Dialog
  els.syncStatusBtn.addEventListener('click', openSyncAndSettingsModal);
  if (els.usageStatsBtn) {
    els.usageStatsBtn.addEventListener('click', openSyncAndSettingsModal);
  }

  els.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.settings = saveSettings({
      webhookUrl: els.webhookUrlInput.value.trim(),
      currency: els.currencyInput.value.trim() || '₹',
      monthlyBudget: Number(els.budgetInput.value.replace(/,/g, '')) || 0,
      defaultPayment: els.defaultPaymentInput ? els.defaultPaymentInput.value : 'upi'
    });
    els.syncDialog.close();
    renderAll();
    if (state.settings.webhookUrl) {
      showToast('Syncing with Google Sheets...');
      await triggerBackgroundSync(true);
      trackAppUsage({ onLaunch: false }).then((stats) => {
        state.usageStats = stats;
        updateUsageTrackerUI();
      });
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
      learnedKeywords: getLearnedKeywords(),
      settings: {
        currency: state.settings.currency || '₹',
        monthlyBudget: state.settings.monthlyBudget || 0,
        defaultPayment: state.settings.defaultPayment || 'upi'
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
        if (parsed.settings) {
          state.settings = saveSettings({
            currency: parsed.settings.currency || state.settings.currency || '₹',
            monthlyBudget: Number(parsed.settings.monthlyBudget) || state.settings.monthlyBudget || 0,
            defaultPayment: parsed.settings.defaultPayment || state.settings.defaultPayment || 'upi'
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

  // Update category options when Type changes inside Edit Modal
  if (els.editType) {
    els.editType.addEventListener('change', () => {
      const newType = els.editType.value;
      populateCategorySelect(newType);
      els.editCategory.value = inferCategory(els.editNote.value, newType);
    });
  }

  // Edit & Delete Transaction Modal
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

    // Self-learning: remember note keywords for this category!
    learnFromNote(newNote, newCategory);

    state.expenses[idx] = {
      ...state.expenses[idx],
      type: newType,
      amount: newAmount,
      note: newNote,
      category: newCategory,
      paymentMethod: newPayment,
      date: newDate,
      updatedAt: Date.now(),
      synced: false
    };

    saveExpenses(state.expenses);
    els.editDialog.close();
    renderAll();
    showToast('Updated & learned preference');
    triggerBackgroundSync(false);
  });

  els.deleteExpenseBtn.addEventListener('click', () => {
    const id = els.editId.value;
    const target = state.expenses.find((item) => item.id === id);
    if (!target) return;

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
    showToast('Deleted entry');
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
  populateCategorySelect('expense');
  populatePaymentSelects();
  updateComposerTypeUI();
  els.gasCodeBlock.textContent = GOOGLE_APPS_SCRIPT_CODE;
  setupEventListeners();
  renderAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (state.settings.webhookUrl) {
    triggerBackgroundSync(false);
  }

  // Record anonymous launch & fetch active user count
  trackAppUsage({ onLaunch: true }).then((stats) => {
    state.usageStats = stats;
    updateUsageTrackerUI();
  });
}

init();
