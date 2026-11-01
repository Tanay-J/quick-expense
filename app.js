import {
  CATEGORIES,
  getCategoryById,
  getLearnedKeywords,
  learnFromNote,
  mergeLearnedKeywords,
  parseDraftMessage,
  parseExpenseMessage,
  toLocalISODate
} from './parser.js';

import {
  exportToCSV,
  GOOGLE_APPS_SCRIPT_CODE,
  loadExpenses,
  loadSettings,
  loadTombstones,
  saveExpenses,
  saveSettings,
  saveTombstones,
  syncWithGoogleSheets
} from './sync.js';

// Application State
const state = {
  expenses: loadExpenses(),
  settings: loadSettings(),
  periodMode: 'month', // 'month' | '7d' | 'all'
  selectedYear: new Date().getFullYear(),
  selectedMonth: new Date().getMonth(), // 0-11
  selectedCategory: null,
  searchQuery: '',
  syncState: 'local', // 'local' | 'synced' | 'syncing' | 'error'
  draftItems: [], // Interactive parsed items staged for saving
  lastSavedIds: new Set()
};

// DOM Elements
const els = {
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
  kpiAvg: document.getElementById('kpi-avg'),
  kpiProjected: document.getElementById('kpi-projected'),
  kpiTopCat: document.getElementById('kpi-top-cat'),
  kpiTopCatAmt: document.getElementById('kpi-top-cat-amt'),
  budgetWrap: document.getElementById('budget-progress-wrap'),
  budgetStatusText: document.getElementById('budget-status-text'),
  budgetProgress: document.getElementById('budget-progress'),
  catStackedBar: document.getElementById('category-stacked-bar'),
  catList: document.getElementById('category-list'),
  clearCatFilterBtn: document.getElementById('clear-cat-filter-btn'),
  trendChart: document.getElementById('trend-chart'),
  trendSubtitle: document.getElementById('trend-subtitle'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  expenseList: document.getElementById('expense-list'),
  emptyState: document.getElementById('empty-state'),
  sampleChips: document.querySelectorAll('.sample-chip'),
  parsePreview: document.getElementById('parse-preview'),
  expenseForm: document.getElementById('expense-form'),
  expenseInput: document.getElementById('expense-input'),
  sendExpenseBtn: document.getElementById('send-expense-btn'),
  sendBtnText: document.getElementById('send-btn-text'),
  toastRegion: document.getElementById('toast-region'),
  // Dialogs
  syncDialog: document.getElementById('sync-dialog'),
  settingsForm: document.getElementById('settings-form'),
  webhookUrlInput: document.getElementById('webhook-url-input'),
  currencyInput: document.getElementById('currency-input'),
  budgetInput: document.getElementById('budget-input'),
  forceSyncBtn: document.getElementById('force-sync-btn'),
  copyGasBtn: document.getElementById('copy-gas-btn'),
  gasCodeBlock: document.getElementById('gas-code-block'),
  exportJsonBtn: document.getElementById('export-json-btn'),
  importJsonInput: document.getElementById('import-json-input'),
  editDialog: document.getElementById('edit-dialog'),
  editExpenseForm: document.getElementById('edit-expense-form'),
  editId: document.getElementById('edit-id'),
  editAmount: document.getElementById('edit-amount'),
  editNote: document.getElementById('edit-note'),
  editCategory: document.getElementById('edit-category'),
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
  const total = periodExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  els.kpiTotal.textContent = formatCurrency(total);
  els.kpiSubCount.textContent = `${periodExpenses.length} expense${periodExpenses.length === 1 ? '' : 's'} logged`;

  // Budget progress (shown in month mode if budget > 0)
  const budget = Number(state.settings.monthlyBudget) || 0;
  if (state.periodMode === 'month' && budget > 0) {
    els.budgetWrap.hidden = false;
    const pct = Math.min(100, Math.round((total / budget) * 100));
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

  const dailyAvg = total / daysElapsed;
  els.kpiAvg.textContent = formatCurrency(Math.round(dailyAvg));

  if (state.periodMode === 'month') {
    const projected = Math.round(dailyAvg * daysInMonth);
    els.kpiProjected.textContent = `Month pace: ${formatCurrency(projected)}`;
  } else {
    els.kpiProjected.textContent = `Across ${daysElapsed} active day${daysElapsed === 1 ? '' : 's'}`;
  }

  // Top category
  const byCat = {};
  for (const e of periodExpenses) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  }
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (sortedCats.length > 0) {
    const [topCatId, topAmt] = sortedCats[0];
    const catObj = getCategoryById(topCatId);
    const pct = total > 0 ? Math.round((topAmt / total) * 100) : 0;
    els.kpiTopCat.textContent = `${catObj.icon} ${catObj.name}`;
    els.kpiTopCatAmt.textContent = `${formatCurrency(topAmt)} (${pct}% of spend)`;
  } else {
    els.kpiTopCat.textContent = '—';
    els.kpiTopCatAmt.textContent = 'No data yet';
  }
}

function renderCategories(periodExpenses) {
  const total = periodExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const byCat = {};
  for (const e of periodExpenses) {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  }

  els.catStackedBar.replaceChildren();
  els.catList.replaceChildren();
  els.clearCatFilterBtn.hidden = !state.selectedCategory;

  const sorted = CATEGORIES.map((c) => ({
    ...c,
    amount: byCat[c.id] || 0,
    pct: total > 0 ? ((byCat[c.id] || 0) / total) * 100 : 0
  })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);

  if (sorted.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'field-hint';
    emptyLi.textContent = 'Category breakdown will appear once you log an expense.';
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
    amtStrong.textContent = formatCurrency(cat.amount);

    const pctSpan = document.createElement('span');
    pctSpan.className = 'cat-pct';
    pctSpan.textContent = `${Math.round(cat.pct)}%`;

    right.append(amtStrong, pctSpan);
    btn.append(left, right);

    btn.addEventListener('click', () => {
      state.selectedCategory = state.selectedCategory === cat.id ? null : cat.id;
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
      amount: 0
    });
  }

  const byDate = {};
  for (const e of periodExpenses) {
    byDate[e.date] = (byDate[e.date] || 0) + Number(e.amount || 0);
  }

  let maxAmt = 0;
  for (const d of days) {
    d.amount = byDate[d.iso] || 0;
    if (d.amount > maxAmt) maxAmt = d.amount;
  }

  for (const d of days) {
    const col = document.createElement('div');
    col.className = 'trend-col';
    col.title = `${d.iso}: ${formatCurrency(d.amount)}`;

    const track = document.createElement('div');
    track.className = 'trend-bar-track';

    const fill = document.createElement('div');
    fill.className = 'trend-bar-fill';
    const pct = maxAmt > 0 ? Math.max(4, Math.round((d.amount / maxAmt) * 100)) : 4;
    fill.style.setProperty('--bar-pct', `${pct}%`);
    fill.style.setProperty('--bar-alpha', d.amount > 0 ? '0.95' : '0.2');

    track.appendChild(fill);

    const lbl = document.createElement('span');
    lbl.className = 'trend-day-label';
    lbl.textContent = String(d.label);

    col.append(track, lbl);
    els.trendChart.appendChild(col);
  }
}

function renderExpenseList(periodExpenses) {
  let filtered = periodExpenses;

  if (state.selectedCategory) {
    filtered = filtered.filter((e) => e.category === state.selectedCategory);
  }

  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter((e) => {
      const catName = getCategoryById(e.category).name.toLowerCase();
      return (
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.raw && e.raw.toLowerCase().includes(q)) ||
        catName.includes(q) ||
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
    const cat = getCategoryById(item.category);
    const li = document.createElement('li');
    li.className = 'expense-item';
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
    metaP.textContent = `${cat.name} • ${formatReadableDate(item.date)} • ${syncIndicator}`;

    details.append(noteP, metaP);
    main.append(catBadge, details);

    const right = document.createElement('div');
    right.className = 'expense-right';

    const amtSpan = document.createElement('span');
    amtSpan.className = 'expense-amount';
    amtSpan.textContent = formatCurrency(item.amount);

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

// Sync draftItems when user types in #expense-input, preserving manual field overrides
function updateLivePreview({ resetOverrides = false } = {}) {
  const raw = els.expenseInput.value;
  const parsedDrafts = parseDraftMessage(raw);

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
    return {
      ...item,
      amount: mergedAmount,
      missingAmount: !(Number(mergedAmount) > 0),
      category: overrides.category ? prev.category : item.category,
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
  if (hasMissingAmt) {
    titleLabel.textContent = 'Parsed draft — enter amount to save:';
  } else if (state.draftItems.length > 1) {
    const totalAmt = state.draftItems.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    titleLabel.textContent = `Going to save ${state.draftItems.length} expenses (${formatCurrency(totalAmt)}):`;
  } else {
    titleLabel.textContent = 'Going to be saved:';
  }

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
    const row = document.createElement('div');
    row.className = 'preview-edit-row';

    // 1. Amount field
    const amtGroup = document.createElement('label');
    amtGroup.className = `preview-field preview-field-amount ${!(Number(draft.amount) > 0) ? 'is-missing' : ''}`;
    amtGroup.title = 'Edit amount before saving';

    const symSpan = document.createElement('span');
    symSpan.className = 'preview-currency-sym';
    symSpan.textContent = state.settings.currency || '₹';

    const amtInput = document.createElement('input');
    amtInput.type = 'text';
    amtInput.inputMode = 'decimal';
    amtInput.className = 'preview-inline-input preview-amount-input';
    amtInput.placeholder = 'Amount';
    amtInput.setAttribute('aria-label', `Amount for expense ${idx + 1}`);
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
      if (anyMissing) {
        titleLabel.textContent = 'Parsed draft — enter amount to save:';
      } else if (state.draftItems.length > 1) {
        const sum = state.draftItems.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        titleLabel.textContent = `Going to save ${state.draftItems.length} expenses (${formatCurrency(sum)}):`;
      } else {
        titleLabel.textContent = 'Going to be saved:';
      }
      updateSendBtnLabel();
    });
    attachImeSafeEnterSubmit(amtInput);
    amtGroup.append(symSpan, amtInput);

    // 2. Category dropdown
    const catGroup = document.createElement('label');
    catGroup.className = 'preview-field preview-field-category';
    catGroup.title = 'Change category (teaches DropSpend for next time)';

    const catSelect = document.createElement('select');
    catSelect.className = 'preview-inline-select';
    catSelect.setAttribute('aria-label', `Category for expense ${idx + 1}`);
    for (const c of CATEGORIES) {
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

    // 3. Description / Note input
    const noteGroup = document.createElement('label');
    noteGroup.className = 'preview-field preview-field-note';
    noteGroup.title = 'Edit description / note before saving';

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'preview-inline-input preview-note-input';
    noteInput.placeholder = 'Description';
    noteInput.setAttribute('aria-label', `Description for expense ${idx + 1}`);
    noteInput.value = draft.note || '';
    noteInput.addEventListener('input', () => {
      draft.note = noteInput.value;
      draft.overrides = draft.overrides || {};
      draft.overrides.note = true;
      resetBtn.hidden = false;
    });
    attachImeSafeEnterSubmit(noteInput);
    noteGroup.appendChild(noteInput);

    // 4. Date picker
    const dateGroup = document.createElement('label');
    dateGroup.className = 'preview-field preview-field-date';
    dateGroup.title = 'Change expense date';

    const dateBadge = document.createElement('span');
    dateBadge.className = 'preview-date-badge';
    dateBadge.textContent = formatReadableDate(draft.date);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'preview-inline-date';
    dateInput.setAttribute('aria-label', `Date for expense ${idx + 1}`);
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

    row.append(amtGroup, catGroup, noteGroup, dateGroup);

    // 5. Remove button when multiple items are staged
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
    showToast('Type an expense, e.g. "200 fuel bike"');
    return;
  }

  const missingIdx = state.draftItems.findIndex((item) => !(Number(item.amount) > 0));
  if (missingIdx !== -1) {
    const amtInputs = els.parsePreview.querySelectorAll('.preview-amount-input');
    if (amtInputs[missingIdx]) {
      amtInputs[missingIdx].focus();
    }
    showToast('Enter the expense amount in the preview box above');
    return;
  }

  const originalMessage = messageText;
  const savedDraftSnapshot = state.draftItems.map((d) => ({
    ...d,
    overrides: d.overrides ? { ...d.overrides } : {}
  }));

  const nowTs = Date.now();
  const newEntries = state.draftItems.map((item, idx) => {
    const cleanedNote = (item.note || '').trim() || getCategoryById(item.category).name;
    // If the user changed the category in the preview before saving, teach the parser!
    if (item.overrides?.category) {
      learnFromNote(cleanedNote, item.category);
    }
    return {
      id: `exp_${nowTs}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      date: item.date || toLocalISODate(new Date()),
      amount: Number(item.amount),
      category: item.category || 'other',
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
        date: entry.date,
        amount: entry.amount,
        category: entry.category,
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
    showToast(
      `✅ Saved ${formatCurrency(e.amount)} • ${cat.icon} ${e.note} (${formatReadableDate(e.date)})`,
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
      `✅ Saved ${newEntries.length} expenses (${formatCurrency(sum)})`,
      [
        {
          label: '↩ Undo & Edit in Bar',
          onClick: undoAddedExpenses
        }
      ]
    );
  }

  triggerBackgroundSync(false);
}

function populateCategorySelect() {
  els.editCategory.replaceChildren();
  for (const cat of CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    els.editCategory.appendChild(opt);
  }
}

function openEditModal(expense) {
  els.editId.value = expense.id;
  els.editAmount.value = String(expense.amount);
  els.editNote.value = expense.note;
  els.editCategory.value = expense.category;
  els.editDate.value = expense.date;
  els.editDialog.showModal();
}

function setupEventListeners() {
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
      updateLivePreview();
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

  els.clearCatFilterBtn.addEventListener('click', () => {
    state.selectedCategory = null;
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
      showToast('No expenses to export yet');
      return;
    }
    exportToCSV(state.expenses);
    showToast('Downloaded CSV file');
  });

  // Cloud Sync Dialog
  els.syncStatusBtn.addEventListener('click', () => {
    els.webhookUrlInput.value = state.settings.webhookUrl || '';
    els.currencyInput.value = state.settings.currency || '₹';
    els.budgetInput.value = state.settings.monthlyBudget ? String(state.settings.monthlyBudget) : '';
    els.syncDialog.showModal();
  });

  els.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.settings = saveSettings({
      webhookUrl: els.webhookUrlInput.value.trim(),
      currency: els.currencyInput.value.trim() || '₹',
      monthlyBudget: Number(els.budgetInput.value.replace(/,/g, '')) || 0
    });
    els.syncDialog.close();
    renderAll();
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
      showToast(`✅ Synced ${state.expenses.length} expenses with Google Sheet`);
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
        monthlyBudget: state.settings.monthlyBudget || 0
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
            monthlyBudget: Number(parsed.settings.monthlyBudget) || state.settings.monthlyBudget || 0
          });
        }
      }
      const byId = new Map(state.expenses.map((item) => [item.id, item]));
      for (const item of list) {
        if (item && item.id && item.amount) {
          byId.set(item.id, { ...item, synced: false });
        }
      }
      state.expenses = Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
      saveExpenses(state.expenses);
      renderAll();
      els.syncDialog.close();
      showToast(`✅ Restored ${list.length} expenses`);
      triggerBackgroundSync(true);
    } catch {
      showToast('Invalid JSON backup file');
    } finally {
      els.importJsonInput.value = '';
    }
  });

  // Edit & Delete Expense Modal
  els.editExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = els.editId.value;
    const idx = state.expenses.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const newAmount = parseFloat(els.editAmount.value);
    if (Number.isNaN(newAmount) || newAmount <= 0) return;

    const newNote = els.editNote.value.trim();
    const newCategory = els.editCategory.value;
    const newDate = els.editDate.value;

    // Self-learning: remember note keywords for this category!
    learnFromNote(newNote, newCategory);

    state.expenses[idx] = {
      ...state.expenses[idx],
      amount: newAmount,
      note: newNote,
      category: newCategory,
      date: newDate,
      updatedAt: Date.now(),
      synced: false
    };

    saveExpenses(state.expenses);
    els.editDialog.close();
    renderAll();
    showToast('Updated & learned category preference');
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
      date: target.date,
      amount: target.amount,
      category: target.category,
      note: target.note,
      updatedAt: Date.now()
    });
    saveTombstones(tombstones);

    els.editDialog.close();
    renderAll();
    showToast('Deleted expense');
    triggerBackgroundSync(false);
  });

  // Auto-sync when device comes back online
  window.addEventListener('online', () => {
    triggerBackgroundSync(false);
  });
}

// Initialize App
function init() {
  populateCategorySelect();
  els.gasCodeBlock.textContent = GOOGLE_APPS_SCRIPT_CODE;
  setupEventListeners();
  renderAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (state.settings.webhookUrl) {
    triggerBackgroundSync(false);
  }
}

init();
