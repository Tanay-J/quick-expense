import {
  EXPENSE_CATEGORIES,
  getCategoryById,
  getPaymentMethodById,
  PAYMENT_METHODS,
  toLocalISODate
} from './parser.js?v=16';
import { normalizeEntryType, normalizePaymentMethod, normalizeTags } from './sync.js?v=16';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeNoteKey(note) {
  return String(note || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 1B: Compute "Your Usuals" — top 6 most frequent expense notes in the last 30 days
 * (falls back to all-time expenses if fewer than 3 usuals in last 30 days)
 */
export function computeUsuals(expenses, limit = 6, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = toLocalISODate(cutoff);

  const onlyExpenses = expenses.filter((e) => normalizeEntryType(e) !== 'income');
  const recentPool = onlyExpenses.filter((e) => e.date >= cutoffIso);
  const pool = recentPool.length >= 3 ? recentPool : onlyExpenses;

  const byNote = new Map();
  for (const item of pool) {
    const key = normalizeNoteKey(item.note);
    if (!key) continue;
    const existing = byNote.get(key);
    const ts = Number(item.updatedAt) || 0;
    if (!existing) {
      byNote.set(key, {
        key,
        note: item.note,
        category: item.category || 'other',
        paymentMethod: normalizePaymentMethod(item),
        amount: Number(item.amount) || 0,
        count: 1,
        latestDate: item.date || '',
        latestTs: ts
      });
    } else {
      existing.count += 1;
      if (item.date > existing.latestDate || (item.date === existing.latestDate && ts > existing.latestTs)) {
        existing.note = item.note;
        existing.category = item.category || existing.category;
        existing.paymentMethod = normalizePaymentMethod(item);
        existing.amount = Number(item.amount) || existing.amount;
        existing.latestDate = item.date;
        existing.latestTs = ts;
      }
    }
  }

  return Array.from(byNote.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      if (b.latestDate !== a.latestDate) return b.latestDate.localeCompare(a.latestDate);
      return b.latestTs - a.latestTs;
    })
    .slice(0, limit);
}

/**
 * 1C: Compute "From Your History" autocomplete suggestions while typing
 * Matches past notes starting with or containing the draft note text.
 */
export function computeHistoryMatches(expenses, draftNote, rawInput, limit = 4) {
  const query = normalizeNoteKey(draftNote || rawInput);
  if (!query || query.length < 1) return [];

  const byNote = new Map();
  for (const item of expenses) {
    const key = normalizeNoteKey(item.note);
    if (!key) continue;
    const existing = byNote.get(key);
    const ts = Number(item.updatedAt) || 0;
    if (!existing) {
      byNote.set(key, {
        key,
        note: item.note,
        type: normalizeEntryType(item),
        category: item.category || 'other',
        paymentMethod: normalizePaymentMethod(item),
        amount: Number(item.amount) || 0,
        tags: normalizeTags(item),
        count: 1,
        latestTs: ts
      });
    } else {
      existing.count += 1;
      if (ts > existing.latestTs) {
        existing.amount = Number(item.amount) || existing.amount;
        existing.paymentMethod = normalizePaymentMethod(item);
        existing.category = item.category || existing.category;
        existing.latestTs = ts;
      }
    }
  }

  const starts = [];
  const contains = [];
  for (const entry of byNote.values()) {
    if (entry.key.startsWith(query)) {
      starts.push(entry);
    } else if (entry.key.includes(query)) {
      contains.push(entry);
    }
  }

  const sortFn = (a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.latestTs - a.latestTs;
  };
  starts.sort(sortFn);
  contains.sort(sortFn);

  return [...starts, ...contains].slice(0, limit);
}

/**
 * Helper to filter expenses for a parsed question or Explore query
 */
export function filterExpensesByQuery(expenses, q, startDate, endDate) {
  return expenses.filter((item) => {
    if (!item.date) return false;
    if (startDate && item.date < startDate) return false;
    if (endDate && item.date > endDate) return false;

    const entryType = normalizeEntryType(item);
    if (q.filterCategory === 'income_all') {
      if (entryType !== 'income') return false;
    } else if (q.filterCategory) {
      if (item.category !== q.filterCategory) return false;
    } else {
      // Default to expenses unless querying an income item
      if (entryType === 'income' && !q.itemQuery) return false;
    }

    if (q.filterPayment && normalizePaymentMethod(item) !== q.filterPayment) {
      return false;
    }

    if (q.tags && q.tags.length > 0) {
      const itemTags = normalizeTags(item);
      const hasAll = q.tags.every((t) => itemTags.includes(t.toLowerCase()));
      if (!hasAll) return false;
    }

    if (q.itemQuery) {
      const iq = q.itemQuery.toLowerCase();
      const noteMatch = (item.note || '').toLowerCase().includes(iq);
      const rawMatch = (item.raw || '').toLowerCase().includes(iq);
      const catName = getCategoryById(item.category).name.toLowerCase();
      const tagMatch = normalizeTags(item).some((t) => t.includes(iq));
      if (!noteMatch && !rawMatch && !catName.includes(iq) && !tagMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 1D & 5C: Evaluate a natural-language question ("food this month", "swiggy", "#goa", "upi last week")
 */
export function evaluateQuestionQuery(expenses, parsedQuery) {
  if (!parsedQuery) return null;

  const currentItems = filterExpensesByQuery(
    expenses,
    parsedQuery,
    parsedQuery.startDate,
    parsedQuery.endDate
  );
  const prevItems = filterExpensesByQuery(
    expenses,
    parsedQuery,
    parsedQuery.prevStartDate,
    parsedQuery.prevEndDate
  );

  const total = currentItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const prevTotal = prevItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const count = currentItems.length;
  const avg = count > 0 ? Math.round(total / count) : 0;

  let deltaPct = null;
  let deltaAmt = total - prevTotal;
  if (prevTotal > 0) {
    deltaPct = Math.round(((total - prevTotal) / prevTotal) * 100);
  }

  // Group top items by note
  const byItem = new Map();
  let maxSingle = null;
  for (const e of currentItems) {
    const amt = Number(e.amount) || 0;
    if (!maxSingle || amt > maxSingle.amount) {
      maxSingle = { note: e.note, amount: amt, date: e.date };
    }
    const key = normalizeNoteKey(e.note) || 'item';
    const cur = byItem.get(key) || {
      note: e.note,
      category: e.category,
      amount: 0,
      count: 0
    };
    cur.amount += amt;
    cur.count += 1;
    byItem.set(key, cur);
  }

  const topItems = Array.from(byItem.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((it) => ({
      ...it,
      sharePct: total > 0 ? Math.round((it.amount / total) * 100) : 0
    }));

  // Build human-readable filter title
  const parts = [];
  if (parsedQuery.tags?.length > 0) {
    parts.push(parsedQuery.tags.map((t) => `#${t}`).join(' '));
  }
  if (parsedQuery.filterCategory) {
    if (parsedQuery.filterCategory === 'income_all') {
      parts.push('💰 Income');
    } else {
      const c = getCategoryById(parsedQuery.filterCategory);
      parts.push(`${c.icon} ${c.shortName || c.name}`);
    }
  }
  if (parsedQuery.filterPayment) {
    const pm = getPaymentMethodById(parsedQuery.filterPayment);
    parts.push(`${pm.icon} ${pm.shortName}`);
  }
  if (parsedQuery.itemQuery) {
    const cap = parsedQuery.itemQuery.charAt(0).toUpperCase() + parsedQuery.itemQuery.slice(1);
    parts.push(`“${cap}”`);
  }
  if (parts.length === 0) {
    parts.push('All Spending');
  }

  return {
    query: parsedQuery,
    filterTitle: parts.join(' · '),
    periodLabel: parsedQuery.periodLabel,
    prevLabel: parsedQuery.prevLabel,
    total,
    prevTotal,
    deltaAmt,
    deltaPct,
    count,
    avg,
    maxSingle,
    topItems,
    matchingItems: currentItems
  };
}

/**
 * 4A & 5D: Same-Elapsed-Span Period Comparison + Cumulative Running Total + Diverging Category Compare
 */
export function computeSameSpanComparison(expenses, periodMode, selectedYear, selectedMonth, now = new Date()) {
  const onlyExpenses = expenses.filter((e) => normalizeEntryType(e) !== 'income');

  let curStart;
  let curEnd;
  let prevStart;
  let prevEnd;
  let curSpanLabel = '';
  let prevSpanLabel = '';
  let daysInCurMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  let prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
  let prevMonthYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  let daysInPrevMonth = new Date(prevMonthYear, prevMonthIdx + 1, 0).getDate();
  let elapsedDay = daysInCurMonth;

  const isCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth();

  if (periodMode === '7d') {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(end.getDate() - 6);
    const pEnd = new Date(start);
    pEnd.setDate(start.getDate() - 1);
    const pStart = new Date(pEnd);
    pStart.setDate(pEnd.getDate() - 6);

    curStart = toLocalISODate(start);
    curEnd = toLocalISODate(end);
    prevStart = toLocalISODate(pStart);
    prevEnd = toLocalISODate(pEnd);
    curSpanLabel = 'Last 7 days';
    prevSpanLabel = 'Prior 7 days';
  } else {
    // 'month' or 'all' (use selected month for span comparison)
    elapsedDay = isCurrentMonth ? Math.max(1, now.getDate()) : daysInCurMonth;
    const prevSpanDay = Math.min(elapsedDay, daysInPrevMonth);

    curStart = toLocalISODate(new Date(selectedYear, selectedMonth, 1));
    curEnd = toLocalISODate(new Date(selectedYear, selectedMonth, elapsedDay));
    prevStart = toLocalISODate(new Date(prevMonthYear, prevMonthIdx, 1));
    prevEnd = toLocalISODate(new Date(prevMonthYear, prevMonthIdx, prevSpanDay));

    curSpanLabel = `${SHORT_MONTHS[selectedMonth]} 1–${elapsedDay}`;
    prevSpanLabel = `${SHORT_MONTHS[prevMonthIdx]} 1–${prevSpanDay}`;
  }

  const curSpanItems = onlyExpenses.filter((e) => e.date >= curStart && e.date <= curEnd);
  const prevSpanItems = onlyExpenses.filter((e) => e.date >= prevStart && e.date <= prevEnd);

  const curTotal = curSpanItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const prevTotal = prevSpanItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const deltaAmt = curTotal - prevTotal;
  const deltaPct = prevTotal > 0 ? Math.round(((curTotal - prevTotal) / prevTotal) * 100) : null;

  // Cumulative daily running total for selected month vs full previous month
  const curMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const prevMonthPrefix = `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;

  const curByDay = new Array(daysInCurMonth + 1).fill(0);
  const prevByDay = new Array(daysInPrevMonth + 1).fill(0);

  for (const e of onlyExpenses) {
    if (!e.date) continue;
    const dayNum = Number(e.date.slice(8, 10));
    if (e.date.startsWith(curMonthPrefix) && dayNum >= 1 && dayNum <= daysInCurMonth) {
      curByDay[dayNum] += Number(e.amount) || 0;
    } else if (e.date.startsWith(prevMonthPrefix) && dayNum >= 1 && dayNum <= daysInPrevMonth) {
      prevByDay[dayNum] += Number(e.amount) || 0;
    }
  }

  const maxDays = Math.max(daysInCurMonth, daysInPrevMonth);
  const runningDays = [];
  let runCur = 0;
  let runPrev = 0;
  for (let d = 1; d <= maxDays; d++) {
    if (d <= daysInCurMonth) runCur += curByDay[d];
    if (d <= daysInPrevMonth) runPrev += prevByDay[d];
    runningDays.push({
      day: d,
      curCumulative: d <= elapsedDay ? runCur : null,
      prevCumulative: d <= daysInPrevMonth ? runPrev : null,
      curDaySpend: d <= daysInCurMonth ? curByDay[d] : 0,
      prevDaySpend: d <= daysInPrevMonth ? prevByDay[d] : 0
    });
  }

  // Category deltas (for Overview Δ% badges and 5D Diverging Compare chart)
  const curCatMap = {};
  const prevCatMap = {};
  for (const e of curSpanItems) {
    curCatMap[e.category] = (curCatMap[e.category] || 0) + (Number(e.amount) || 0);
  }
  for (const e of prevSpanItems) {
    prevCatMap[e.category] = (prevCatMap[e.category] || 0) + (Number(e.amount) || 0);
  }

  const categoryDeltas = EXPENSE_CATEGORIES.map((cat) => {
    const curAmt = curCatMap[cat.id] || 0;
    const prevAmt = prevCatMap[cat.id] || 0;
    const diff = curAmt - prevAmt;
    const pct = prevAmt > 0 ? Math.round(((curAmt - prevAmt) / prevAmt) * 100) : curAmt > 0 ? 100 : 0;
    return {
      ...cat,
      curAmt,
      prevAmt,
      diff,
      pct
    };
  }).filter((c) => c.curAmt > 0 || c.prevAmt > 0);

  // Sort by diff descending (spent more at top, spent less at bottom)
  const sortedByDiff = [...categoryDeltas].sort((a, b) => b.diff - a.diff);
  const biggestRise = sortedByDiff.find((c) => c.diff > 0) || null;
  const biggestFall = [...sortedByDiff].reverse().find((c) => c.diff < 0) || null;

  // "What changed": New items this span vs Skipped items from previous span
  const curNotesMap = new Map();
  for (const e of curSpanItems) {
    const k = normalizeNoteKey(e.note);
    if (!k) continue;
    curNotesMap.set(k, {
      note: e.note,
      amount: (curNotesMap.get(k)?.amount || 0) + (Number(e.amount) || 0)
    });
  }
  const prevNotesMap = new Map();
  for (const e of prevSpanItems) {
    const k = normalizeNoteKey(e.note);
    if (!k) continue;
    prevNotesMap.set(k, {
      note: e.note,
      amount: (prevNotesMap.get(k)?.amount || 0) + (Number(e.amount) || 0)
    });
  }

  const newItems = Array.from(curNotesMap.entries())
    .filter(([k]) => !prevNotesMap.has(k))
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 4)
    .map(([, v]) => v.note);

  const skippedItems = Array.from(prevNotesMap.entries())
    .filter(([k]) => !curNotesMap.has(k))
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 4)
    .map(([, v]) => v.note);

  return {
    curSpanLabel,
    prevSpanLabel,
    curMonthName: FULL_MONTHS[selectedMonth],
    prevMonthName: FULL_MONTHS[prevMonthIdx],
    elapsedDay,
    daysInCurMonth,
    curTotal,
    prevTotal,
    deltaAmt,
    deltaPct,
    runningDays,
    categoryDeltas: sortedByDiff,
    categoryDeltaById: Object.fromEntries(categoryDeltas.map((c) => [c.id, c])),
    biggestRise,
    biggestFall,
    newItems,
    skippedItems
  };
}

/**
 * 4B: Category Drill-Down (Last 5 months bars, Top items in category, Weekday average)
 */
export function computeCategoryDrilldown(expenses, categoryId, selectedYear, selectedMonth, now = new Date()) {
  const catObj = getCategoryById(categoryId);
  const isInc = catObj.type === 'income';
  const pool = expenses.filter((e) => e.category === categoryId);

  const curMonthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthExpenses = expenses.filter(
    (e) => e.date?.startsWith(curMonthPrefix) && (isInc ? normalizeEntryType(e) === 'income' : normalizeEntryType(e) !== 'income')
  );
  const monthTotalAllCats = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const curCatItems = pool.filter((e) => e.date?.startsWith(curMonthPrefix));
  const curCatTotal = curCatItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const sharePct = monthTotalAllCats > 0 ? Math.round((curCatTotal / monthTotalAllCats) * 100) : 0;

  // Last 5 months bars ending at selectedMonth
  const last5Months = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(selectedYear, selectedMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    const amt = pool
      .filter((e) => e.date?.startsWith(prefix))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    last5Months.push({
      label: SHORT_MONTHS[m].toUpperCase(),
      year: y,
      month: m,
      amount: amt,
      isCurrent: i === 0
    });
  }

  // Top items in selected month (or all time if selected month has 0)
  const itemPool = curCatItems.length > 0 ? curCatItems : pool;
  const byNote = new Map();
  for (const e of itemPool) {
    const k = normalizeNoteKey(e.note) || catObj.name;
    const cur = byNote.get(k) || { note: e.note || catObj.name, amount: 0, count: 0 };
    cur.amount += Number(e.amount) || 0;
    cur.count += 1;
    byNote.set(k, cur);
  }
  const topItems = Array.from(byNote.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  // Weekday distribution over last 90 days
  const cutoff90 = new Date(now);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoffIso = toLocalISODate(cutoff90);
  const recent90 = pool.filter((e) => e.date >= cutoffIso);
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon=0..Sun=6
  for (const e of recent90) {
    const [y, m, d] = (e.date || '').split('-').map(Number);
    if (!y || !m || !d) continue;
    const dt = new Date(y, m - 1, d);
    const idx = (dt.getDay() + 6) % 7;
    weekdayTotals[idx] += Number(e.amount) || 0;
  }
  const weeksCount = Math.max(1, Math.round(90 / 7));
  const weekdayAvgs = WEEKDAY_LABELS.map((lbl, idx) => ({
    label: lbl,
    avg: Math.round(weekdayTotals[idx] / weeksCount),
    total: weekdayTotals[idx]
  }));

  return {
    category: catObj,
    curCatTotal,
    entryCount: curCatItems.length,
    sharePct,
    last5Months,
    topItems,
    weekdayAvgs
  };
}

/**
 * 5A & 5B: Calendar Heatmap + 90-Day Behavioral Patterns (Weekday avg, Hourly spend, Streaks, Habits)
 */
export function computeCalendarAndPatterns(expenses, selectedYear, selectedMonth, now = new Date()) {
  const onlyExpenses = expenses.filter((e) => normalizeEntryType(e) !== 'income');
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayDate = new Date(selectedYear, selectedMonth, 1);
  const startOffset = (firstDayDate.getDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  const todayIso = toLocalISODate(now);

  const monthPrefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const byDate = new Map();
  for (const e of onlyExpenses) {
    if (e.date?.startsWith(monthPrefix)) {
      const list = byDate.get(e.date) || [];
      list.push(e);
      byDate.set(e.date, list);
    }
  }

  const cells = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ empty: true });
  }

  let monthTotal = 0;
  let elapsedDays = 0;
  let heavyDays = 0;
  let noSpendDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    const dayEntries = byDate.get(iso) || [];
    const total = dayEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const isFuture = iso > todayIso;
    const isToday = iso === todayIso;

    if (!isFuture) {
      elapsedDays += 1;
      monthTotal += total;
      if (total >= 1200) heavyDays += 1;
      if (total === 0) noSpendDays += 1;
    }

    // Color bins per Page 5A: 0 (no-spend 🌱), <300, <700, <1200, <2000, >=2000
    let tier = 0;
    if (total > 0 && total < 300) tier = 1;
    else if (total >= 300 && total < 700) tier = 2;
    else if (total >= 700 && total < 1200) tier = 3;
    else if (total >= 1200 && total < 2000) tier = 4;
    else if (total >= 2000) tier = 5;

    cells.push({
      empty: false,
      day: d,
      iso,
      total,
      entries: dayEntries,
      isFuture,
      isToday,
      tier
    });
  }

  const dailyAvg = elapsedDays > 0 ? Math.round(monthTotal / elapsedDays) : 0;

  // --- 5B: 90-Day Patterns ---
  const cutoff90 = new Date(now);
  cutoff90.setDate(cutoff90.getDate() - 89);
  const cutoff90Iso = toLocalISODate(cutoff90);
  const recent90 = onlyExpenses.filter((e) => e.date >= cutoff90Iso && e.date <= todayIso);

  // 1. Weekday averages over last 90 days
  const weekdaySums = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const totalsByIso = new Map();

  for (let i = 0; i < 90; i++) {
    const dt = new Date(cutoff90);
    dt.setDate(cutoff90.getDate() + i);
    const iso = toLocalISODate(dt);
    if (iso > todayIso) break;
    const wIdx = (dt.getDay() + 6) % 7;
    weekdayCounts[wIdx] += 1;
    totalsByIso.set(iso, 0);
  }

  for (const e of recent90) {
    const [y, m, d] = (e.date || '').split('-').map(Number);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      const wIdx = (dt.getDay() + 6) % 7;
      weekdaySums[wIdx] += Number(e.amount) || 0;
    }
    totalsByIso.set(e.date, (totalsByIso.get(e.date) || 0) + (Number(e.amount) || 0));
  }

  const overall90Total = recent90.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const overallDailyAvg = totalsByIso.size > 0 ? overall90Total / totalsByIso.size : 0;

  const weekdayBars = WEEKDAY_LABELS.map((label, idx) => {
    const avg = weekdayCounts[idx] > 0 ? Math.round(weekdaySums[idx] / weekdayCounts[idx]) : 0;
    return { label, avg, total: weekdaySums[idx] };
  });
  let maxWeekday = weekdayBars[0];
  for (const wb of weekdayBars) {
    if (wb.avg > maxWeekday.avg) maxWeekday = wb;
  }
  const priciestMultiplier =
    overallDailyAvg > 0 && maxWeekday.avg > 0
      ? (maxWeekday.avg / overallDailyAvg).toFixed(1)
      : '1.0';

  // 2. Hour-of-day distribution (6am to midnight in 2-hour buckets)
  const hourBuckets = [
    { label: '6am', start: 6, end: 8, total: 0, count: 0 },
    { label: '8am', start: 8, end: 10, total: 0, count: 0 },
    { label: '10am', start: 10, end: 12, total: 0, count: 0 },
    { label: '12pm', start: 12, end: 14, total: 0, count: 0 },
    { label: '2pm', start: 14, end: 16, total: 0, count: 0 },
    { label: '4pm', start: 16, end: 18, total: 0, count: 0 },
    { label: '6pm', start: 18, end: 20, total: 0, count: 0 },
    { label: '8pm', start: 20, end: 22, total: 0, count: 0 },
    { label: '10pm', start: 22, end: 24, total: 0, count: 0 }
  ];

  for (const e of recent90) {
    if (!e.updatedAt) continue;
    const hr = new Date(Number(e.updatedAt)).getHours();
    const bucket = hourBuckets.find((b) => hr >= b.start && hr < b.end) || hourBuckets[hourBuckets.length - 1];
    bucket.total += Number(e.amount) || 0;
    bucket.count += 1;
  }

  let peakHourBucket = hourBuckets[0];
  for (const b of hourBuckets) {
    if (b.total > peakHourBucket.total) peakHourBucket = b;
  }

  // 3. Streaks: Current Light-day streak (< ₹300) & Best No-Spend run
  const sortedIsos = Array.from(totalsByIso.keys()).sort();
  let currentLightStreak = 0;
  for (let i = sortedIsos.length - 1; i >= 0; i--) {
    const daySpend = totalsByIso.get(sortedIsos[i]) || 0;
    if (daySpend < 300) {
      currentLightStreak += 1;
    } else {
      break;
    }
  }

  let bestNoSpendRun = 0;
  let curNoSpend = 0;
  for (const iso of sortedIsos) {
    const daySpend = totalsByIso.get(iso) || 0;
    if (daySpend === 0) {
      curNoSpend += 1;
      if (curNoSpend > bestNoSpendRun) bestNoSpendRun = curNoSpend;
    } else {
      curNoSpend = 0;
    }
  }

  // 4. Habits we noticed (auto-detected notes with >= 3 occurrences)
  const noteGroups = new Map();
  for (const e of recent90) {
    const k = normalizeNoteKey(e.note);
    if (!k) continue;
    const g = noteGroups.get(k) || {
      note: e.note,
      category: e.category,
      paymentMethod: normalizePaymentMethod(e),
      count: 0,
      total: 0,
      dates: [],
      hours: [],
      weekdayHits: 0
    };
    g.count += 1;
    g.total += Number(e.amount) || 0;
    g.dates.push(e.date);
    if (e.updatedAt) {
      const dt = new Date(Number(e.updatedAt));
      g.hours.push(dt.getHours() * 60 + dt.getMinutes());
    }
    const [y, m, d] = (e.date || '').split('-').map(Number);
    if (y && m && d) {
      const dayOfW = new Date(y, m - 1, d).getDay();
      if (dayOfW >= 1 && dayOfW <= 5) g.weekdayHits += 1;
    }
    noteGroups.set(k, g);
  }

  const habits = Array.from(noteGroups.values())
    .filter((g) => g.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((g) => {
      const avgAmt = Math.round(g.total / g.count);
      const uniqueDates = Array.from(new Set(g.dates)).sort();
      let cadenceText = `${g.count}× in 90d`;
      if (uniqueDates.length >= 2) {
        const first = new Date(uniqueDates[0]);
        const last = new Date(uniqueDates[uniqueDates.length - 1]);
        const spanDays = Math.max(1, Math.round((last - first) / 86400000));
        const everyDays = Math.max(1, Math.round(spanDays / (g.count - 1)));
        if (g.weekdayHits / g.count >= 0.85 && everyDays <= 3) {
          cadenceText = 'weekdays';
        } else {
          cadenceText = `every ~${everyDays} day${everyDays === 1 ? '' : 's'}`;
        }
      }
      let timeText = '';
      if (g.hours.length > 0) {
        const sortedMins = [...g.hours].sort((a, b) => a - b);
        const medianMin = sortedMins[Math.floor(sortedMins.length / 2)];
        const h24 = Math.floor(medianMin / 60);
        const m60 = String(medianMin % 60).padStart(2, '0');
        const ampm = h24 >= 12 ? 'pm' : 'am';
        const h12 = h24 % 12 || 12;
        timeText = ` · around ${h12}:${m60} ${ampm}`;
      }
      const payObj = getPaymentMethodById(g.paymentMethod);
      return {
        note: g.note,
        category: g.category,
        count: g.count,
        avgAmt,
        total: g.total,
        meta: `${cadenceText}${timeText} · ${payObj.shortName}`
      };
    });

  return {
    cells,
    monthTotal,
    dailyAvg,
    heavyDays,
    noSpendDays,
    weekdayBars,
    maxWeekday,
    priciestMultiplier,
    hourBuckets,
    peakHourBucket,
    currentLightStreak,
    bestNoSpendRun,
    habits
  };
}

/**
 * 4C & 7.1: Threshold-Gated Deterministic Fun Facts (10 rules)
 * Only facts that clear their threshold appear!
 */
export function computeFunFacts(expenses, periodExpenses, spanComp, monthlyBudget, formatCurrency, now = new Date()) {
  const onlyExpenses = periodExpenses.filter((e) => normalizeEntryType(e) !== 'income');
  const totalSpend = onlyExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const facts = [];

  if (onlyExpenses.length === 0) {
    return { clearedFacts: [], totalRules: 10 };
  }

  // 1. habit: Most repeated note, count >= 3 (or 5)
  const byNote = new Map();
  for (const e of onlyExpenses) {
    const k = normalizeNoteKey(e.note);
    if (!k) continue;
    const cur = byNote.get(k) || { note: e.note, count: 0, total: 0, mins: [] };
    cur.count += 1;
    cur.total += Number(e.amount) || 0;
    if (e.updatedAt) {
      const dt = new Date(Number(e.updatedAt));
      cur.mins.push(dt.getHours() * 60 + dt.getMinutes());
    }
    byNote.set(k, cur);
  }
  const topHabit = Array.from(byNote.values()).sort((a, b) => b.count - a.count)[0];
  if (topHabit && topHabit.count >= 3) {
    let timeStr = '';
    if (topHabit.mins.length > 0) {
      const sorted = [...topHabit.mins].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const h24 = Math.floor(med / 60);
      const m60 = String(med % 60).padStart(2, '0');
      timeStr = ` Usual time: ${h24 % 12 || 12}:${m60} ${h24 >= 12 ? 'pm' : 'am'}.`;
    }
    facts.push({
      id: 'habit',
      icon: '☕',
      title: `${topHabit.note} ×${topHabit.count}`,
      body: `Your most repeated buy, ${formatCurrency(topHabit.total)} in total.${timeStr}`
    });
  }

  // 2. bigday: Highest-spend day and its biggest item
  const byDate = new Map();
  for (const e of onlyExpenses) {
    if (!e.date) continue;
    const cur = byDate.get(e.date) || { date: e.date, total: 0, maxItem: null };
    const amt = Number(e.amount) || 0;
    cur.total += amt;
    if (!cur.maxItem || amt > cur.maxItem.amount) {
      cur.maxItem = { note: e.note, amount: amt };
    }
    byDate.set(e.date, cur);
  }
  const biggestDay = Array.from(byDate.values()).sort((a, b) => b.total - a.total)[0];
  if (biggestDay && biggestDay.total > 0) {
    const [y, m, d] = biggestDay.date.split('-').map(Number);
    const dtLabel = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
    facts.push({
      id: 'bigday',
      icon: '📈',
      title: `Biggest day: ${dtLabel}`,
      body: `${formatCurrency(biggestDay.total)}, mostly ${biggestDay.maxItem.note.toLowerCase()} (${formatCurrency(biggestDay.maxItem.amount)}).`
    });
  }

  // 3. weekend: Avg per weekend day vs weekday (ratio >= 1.2x either way)
  let wkndSum = 0;
  let wkdySum = 0;
  const wkndDays = new Set();
  const wkdyDays = new Set();
  for (const e of onlyExpenses) {
    const [y, m, d] = (e.date || '').split('-').map(Number);
    if (!y || !m || !d) continue;
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) {
      wkndSum += Number(e.amount) || 0;
      wkndDays.add(e.date);
    } else {
      wkdySum += Number(e.amount) || 0;
      wkdyDays.add(e.date);
    }
  }
  const wkndAvg = wkndDays.size > 0 ? wkndSum / wkndDays.size : 0;
  const wkdyAvg = wkdyDays.size > 0 ? wkdySum / wkdyDays.size : 0;
  if (wkndAvg > 0 && wkdyAvg > 0) {
    const ratio = wkndAvg / wkdyAvg;
    if (ratio >= 1.2) {
      facts.push({
        id: 'weekend',
        icon: '🎉',
        title: `Weekends cost ${ratio.toFixed(1)}× more`,
        body: `${formatCurrency(Math.round(wkndAvg))}/day on weekends vs ${formatCurrency(Math.round(wkdyAvg))}/day on weekdays.`
      });
    } else if (1 / ratio >= 1.2) {
      facts.push({
        id: 'weekend',
        icon: '💼',
        title: `Weekdays cost ${(1 / ratio).toFixed(1)}× more`,
        body: `${formatCurrency(Math.round(wkdyAvg))}/day on weekdays vs ${formatCurrency(Math.round(wkndAvg))}/day on weekends.`
      });
    }
  }

  // 4. nospend: Days with zero entries in current month
  const elapsed = spanComp?.elapsedDay || 1;
  const activeDatesCount = byDate.size;
  const noSpendCount = Math.max(0, elapsed - activeDatesCount);
  if (noSpendCount >= 1) {
    facts.push({
      id: 'nospend',
      icon: '🌱',
      title: `${noSpendCount} no-spend day${noSpendCount === 1 ? '' : 's'}`,
      body: `Small wins count — you had ₹0 spend on ${noSpendCount} day${noSpendCount === 1 ? '' : 's'} this period.`
    });
  }

  // 5. small: Share of entries under ₹200 vs their share of ₹ (threshold: >= 40% of entries)
  const under200 = onlyExpenses.filter((e) => (Number(e.amount) || 0) <= 200);
  const under200CountPct = Math.round((under200.length / onlyExpenses.length) * 100);
  if (under200CountPct >= 40 && onlyExpenses.length >= 3) {
    const under200Sum = under200.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const under200SpendPct = totalSpend > 0 ? Math.round((under200Sum / totalSpend) * 100) : 0;
    facts.push({
      id: 'small',
      icon: '🪙',
      title: `${under200CountPct}% of buys are under ₹200`,
      body: `…but together they're only ${under200SpendPct}% of your spend (${formatCurrency(under200Sum)}).`
    });
  }

  // 6. hour: Peak 2-hour spending window
  const windowSums = new Array(12).fill(0);
  for (const e of onlyExpenses) {
    if (!e.updatedAt) continue;
    const hr = new Date(Number(e.updatedAt)).getHours();
    const bucketIdx = Math.floor(hr / 2);
    windowSums[bucketIdx] += Number(e.amount) || 0;
  }
  const maxWinVal = Math.max(...windowSums);
  if (maxWinVal > 0 && totalSpend > 0) {
    const winIdx = windowSums.indexOf(maxWinVal);
    const startH = winIdx * 2;
    const endH = startH + 2;
    const fmtH = (h) => `${h % 12 || 12}${h >= 12 ? 'pm' : 'am'}`;
    const share = Math.round((maxWinVal / totalSpend) * 100);
    facts.push({
      id: 'hour',
      icon: '🕗',
      title: `Peak spending: ${fmtH(startH)}–${fmtH(endH)}`,
      body: `${share}% of your money goes out in these two hours.`
    });
  }

  // 7. delivery: Notes matching swiggy / zomato / blinkit / zepto (>= 2 orders)
  const deliveries = onlyExpenses.filter((e) =>
    /\b(swiggy|zomato|blinkit|zepto|instamart|dominos)\b/i.test(`${e.note} ${e.raw}`)
  );
  if (deliveries.length >= 2) {
    const delSum = deliveries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const delAvg = Math.round(delSum / deliveries.length);
    facts.push({
      id: 'delivery',
      icon: '🛵',
      title: `${deliveries.length} food & quick deliveries`,
      body: `${formatCurrency(delSum)} total, ${formatCurrency(delAvg)} on average. Skip 2 and your WiFi bill is paid.`
    });
  }

  // 8. cash / payment split: Payment mode insight
  const upiSum = onlyExpenses
    .filter((e) => normalizePaymentMethod(e) === 'upi')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const cashItems = onlyExpenses.filter((e) => normalizePaymentMethod(e) === 'cash');
  if (totalSpend > 0 && onlyExpenses.length >= 2) {
    const upiPct = Math.round((upiSum / totalSpend) * 100);
    if (cashItems.length >= 2) {
      const smallCash = cashItems.filter((e) => Number(e.amount) <= 200).length;
      const smallCashPct = Math.round((smallCash / cashItems.length) * 100);
      facts.push({
        id: 'cash',
        icon: '💵',
        title: 'Cash is for small stuff',
        body: `${smallCashPct}% of cash payments were under ₹200. UPI moves ${upiPct}% of your money.`
      });
    } else if (upiPct >= 50) {
      facts.push({
        id: 'cash',
        icon: '⚡',
        title: `UPI moves ${upiPct}% of your money`,
        body: `${formatCurrency(upiSum)} paid via UPI across this period.`
      });
    }
  }

  // 9. mover: Category with largest ₹ change vs previous period (>= ₹300)
  if (spanComp?.biggestRise && Math.abs(spanComp.biggestRise.diff) >= 300) {
    const m = spanComp.biggestRise;
    facts.push({
      id: 'mover',
      icon: m.icon,
      title: `${m.shortName || m.name} up ${formatCurrency(m.diff)}`,
      body: `Biggest category increase vs ${spanComp.prevSpanLabel}.`
    });
  } else if (spanComp?.biggestFall && Math.abs(spanComp.biggestFall.diff) >= 300) {
    const m = spanComp.biggestFall;
    facts.push({
      id: 'mover',
      icon: m.icon,
      title: `${m.shortName || m.name} down ${formatCurrency(Math.abs(m.diff))}`,
      body: `Biggest category savings vs ${spanComp.prevSpanLabel}.`
    });
  }

  // 10. pace: Current month projection vs budget
  if (monthlyBudget > 0 && spanComp) {
    const proj = Math.round((totalSpend / Math.max(1, spanComp.elapsedDay)) * spanComp.daysInCurMonth);
    const diff = proj - monthlyBudget;
    const remDays = Math.max(1, spanComp.daysInCurMonth - spanComp.elapsedDay + 1);
    const safeDaily = Math.max(0, Math.round((monthlyBudget - totalSpend) / remDays));
    if (diff > 0) {
      facts.push({
        id: 'pace',
        icon: '🎯',
        title: `On track for ${formatCurrency(proj)}`,
        body: `${formatCurrency(diff)} over budget pace. Keep it to ${formatCurrency(safeDaily)}/day to finish on budget.`
      });
    } else {
      facts.push({
        id: 'pace',
        icon: '✅',
        title: `On track for ${formatCurrency(proj)}`,
        body: `${formatCurrency(Math.abs(diff))} under your ${formatCurrency(monthlyBudget)} budget. Allowance: ${formatCurrency(safeDaily)}/day.`
      });
    }
  }

  return {
    clearedFacts: facts,
    totalRules: 10
  };
}

/**
 * 6A–6C: Monthly "Wrapped" Story Recap Generator
 */
export function computeMonthlyRecap(expenses, monthlyBudget, targetYear, targetMonth, formatCurrency) {
  const prefix = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
  const monthItems = expenses.filter((e) => e.date?.startsWith(prefix));
  const expItems = monthItems.filter((e) => normalizeEntryType(e) !== 'income');
  const incItems = monthItems.filter((e) => normalizeEntryType(e) === 'income');

  const totalSpent = expItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalIncome = incItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  const slides = [];
  const monthLabel = `${FULL_MONTHS[targetMonth]} ${targetYear}`;

  // Slide 1: Total vs Budget
  const dailyAvg = Math.round(totalSpent / Math.max(1, daysInMonth));
  let budgetSub = `${expItems.length} expenses · ${formatCurrency(dailyAvg)}/day average`;
  if (monthlyBudget > 0) {
    const diff = monthlyBudget - totalSpent;
    budgetSub =
      diff >= 0
        ? `🎉 ${formatCurrency(diff)} under your ${formatCurrency(monthlyBudget)} budget!`
        : `▲ ${formatCurrency(Math.abs(diff))} over your ${formatCurrency(monthlyBudget)} budget.`;
  }
  slides.push({
    id: 'total',
    kicker: `${monthLabel.toUpperCase()} WRAPPED`,
    emoji: '🎁',
    headline: formatCurrency(totalSpent),
    subtitle: `Total spent across ${expItems.length} entries`,
    detail: budgetSub,
    bg: 'linear-gradient(145deg, #0f172a, #1e3a8a)'
  });

  // Slide 2: Top Category
  const byCat = {};
  for (const e of expItems) {
    byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0);
  }
  const topCatEntry = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (topCatEntry) {
    const [catId, catAmt] = topCatEntry;
    const catObj = getCategoryById(catId);
    const share = totalSpent > 0 ? Math.round((catAmt / totalSpent) * 100) : 0;
    slides.push({
      id: 'topcat',
      kicker: 'BIGGEST CATEGORY',
      emoji: catObj.icon,
      headline: `${catObj.shortName || catObj.name} · ${formatCurrency(catAmt)}`,
      subtitle: `${share}% of your entire month's spending`,
      detail: `Top category out of ${Object.keys(byCat).length} active categories.`,
      bg: 'linear-gradient(145deg, #111827, #065f46)'
    });
  }

  // Slide 3: Trip / #Tag of the Month (6C)
  const byTag = new Map();
  for (const e of expItems) {
    for (const tag of normalizeTags(e)) {
      const cur = byTag.get(tag) || { tag, total: 0, count: 0, days: new Set(), maxItem: null };
      const amt = Number(e.amount) || 0;
      cur.total += amt;
      cur.count += 1;
      cur.days.add(e.date);
      if (!cur.maxItem || amt > cur.maxItem.amount) {
        cur.maxItem = { note: e.note, amount: amt };
      }
      byTag.set(tag, cur);
    }
  }
  const topTag = Array.from(byTag.values()).sort((a, b) => b.total - a.total)[0];
  if (topTag) {
    const pct = totalSpent > 0 ? Math.round((topTag.total / totalSpent) * 100) : 0;
    slides.push({
      id: 'trip',
      kicker: 'TRIP / TAG OF THE MONTH',
      emoji: '🧳',
      headline: `#${topTag.tag} · ${formatCurrency(topTag.total)}`,
      subtitle: `${topTag.count} entries over ${topTag.days.size} day${topTag.days.size === 1 ? '' : 's'}, ${pct}% of the month.`,
      detail: topTag.maxItem ? `Biggest: ${topTag.maxItem.note.toLowerCase()} ${formatCurrency(topTag.maxItem.amount)}.` : '',
      bg: 'linear-gradient(145deg, #042f2e, #115e59)'
    });
  }

  // Slide 4: Your #1 Ritual (Most repeated item)
  const byNote = new Map();
  for (const e of expItems) {
    const k = normalizeNoteKey(e.note);
    if (!k) continue;
    const cur = byNote.get(k) || { note: e.note, category: e.category, count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(e.amount) || 0;
    byNote.set(k, cur);
  }
  const ritual = Array.from(byNote.values()).sort((a, b) => b.count - a.count)[0];
  if (ritual && ritual.count >= 2) {
    const cat = getCategoryById(ritual.category);
    slides.push({
      id: 'ritual',
      kicker: 'YOUR #1 RITUAL',
      emoji: cat.icon,
      headline: `${ritual.note} ×${ritual.count}`,
      subtitle: `Logged ${ritual.count} times for ${formatCurrency(ritual.total)} total`,
      detail: `Average ${formatCurrency(Math.round(ritual.total / ritual.count))} per buy.`,
      bg: 'linear-gradient(145deg, #31102f, #701a75)'
    });
  }

  // Slide 5: Biggest Spend Day
  const byDate = new Map();
  for (const e of expItems) {
    if (!e.date) continue;
    const cur = byDate.get(e.date) || { date: e.date, total: 0, maxItem: null };
    const amt = Number(e.amount) || 0;
    cur.total += amt;
    if (!cur.maxItem || amt > cur.maxItem.amount) {
      cur.maxItem = { note: e.note, amount: amt };
    }
    byDate.set(e.date, cur);
  }
  const bigDay = Array.from(byDate.values()).sort((a, b) => b.total - a.total)[0];
  if (bigDay) {
    const [y, m, d] = bigDay.date.split('-').map(Number);
    const dStr = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' });
    slides.push({
      id: 'bigday',
      kicker: 'PEAK SPEND DAY',
      emoji: '🔥',
      headline: `${dStr} · ${formatCurrency(bigDay.total)}`,
      subtitle: bigDay.maxItem ? `Led by ${bigDay.maxItem.note} (${formatCurrency(bigDay.maxItem.amount)})` : 'Highest single-day spend',
      detail: `${Math.max(0, daysInMonth - byDate.size)}🌱 no-spend days during ${SHORT_MONTHS[targetMonth]}.`,
      bg: 'linear-gradient(145deg, #431407, #7c2d12)'
    });
  }

  // Slide 6: Small Wins & Net Cashflow
  const noSpendDays = Math.max(0, daysInMonth - byDate.size);
  const net = totalIncome - totalSpent;
  slides.push({
    id: 'wins',
    kicker: 'SMALL WINS & SUMMARY',
    emoji: '🌱',
    headline: `${noSpendDays} No-Spend Days`,
    subtitle:
      totalIncome > 0
        ? `Income +${formatCurrency(totalIncome)} · Net ${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net))}`
        : `Active on ${byDate.size} of ${daysInMonth} days in ${SHORT_MONTHS[targetMonth]}`,
    detail: 'Keep dropping your daily expenses in 3 seconds!',
    bg: 'linear-gradient(145deg, #064e3b, #0f172a)'
  });

  return {
    monthKey: prefix,
    monthLabel,
    totalSpent,
    entryCount: expItems.length,
    topCat: topCatEntry ? getCategoryById(topCatEntry[0]) : null,
    topTag: topTag ? `#${topTag.tag}` : null,
    slides
  };
}
