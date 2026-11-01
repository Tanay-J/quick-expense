import { getPaymentMethodById, isIncomeCategory } from './parser.js';

const STORAGE_KEY = 'qe_expenses_v1';
const TOMBSTONES_KEY = 'qe_tombstones_v1';
const SETTINGS_KEY = 'qe_settings_v1';
const ANON_DEVICE_KEY = 'qe_anon_device_id_v1';
const PUBLIC_COUNTER_CACHE_KEY = 'qe_usage_stats_cache_v1';

/**
 * Optional: When deploying publicly for others to use, you can paste your own
 * Google Apps Script Web App URL here so every visitor's anonymous usage count
 * (deviceId, session count, tx count — NEVER their private expense amounts/notes)
 * is logged to the "UsageStats" tab of your Google Sheet!
 */
export const DEFAULT_TELEMETRY_WEBHOOK_URL = '';

export const GOOGLE_APPS_SCRIPT_CODE = `const SHEET_NAME = 'Expenses';
const HEADERS = ['id', 'date', 'amount', 'category', 'note', 'raw', 'updatedAt', 'deleted', 'type', 'paymentMethod'];
const STATS_SHEET_NAME = 'UsageStats';
const STATS_HEADERS = ['deviceId', 'firstSeen', 'lastSeen', 'sessions', 'txCount', 'platform', 'timezone'];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < HEADERS.length) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#f3f4f6');
  }
  return sheet;
}

function getOrCreateStatsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET_NAME);
    sheet.appendRow(STATS_HEADERS);
    sheet.getRange(1, 1, 1, STATS_HEADERS.length).setFontWeight('bold').setBackground('#ecfdf5');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function recordTelemetry(telemetry) {
  if (!telemetry || !telemetry.deviceId) return null;
  const sheet = getOrCreateStatsSheet();
  const lastRow = sheet.getLastRow();
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let foundRow = -1;
  let existingSessions = 0;

  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(telemetry.deviceId)) {
        foundRow = i + 2;
        existingSessions = Number(rows[i][3]) || 0;
        break;
      }
    }
  }

  const nextSessions = telemetry.isNewSession ? existingSessions + 1 : Math.max(1, existingSessions);
  if (foundRow !== -1) {
    const firstSeen = sheet.getRange(foundRow, 2).getValue() || nowIso;
    sheet.getRange(foundRow, 1, 1, STATS_HEADERS.length).setValues([[
      String(telemetry.deviceId),
      firstSeen,
      nowIso,
      nextSessions,
      Number(telemetry.txCount) || 0,
      String(telemetry.platform || ''),
      String(telemetry.timezone || '')
    ]]);
  } else {
    sheet.appendRow([
      String(telemetry.deviceId),
      nowIso,
      nowIso,
      1,
      Number(telemetry.txCount) || 0,
      String(telemetry.platform || ''),
      String(telemetry.timezone || '')
    ]);
  }
  return getUsageSummary();
}

function getUsageSummary() {
  const sheet = getOrCreateStatsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { uniqueUsers: 0, totalSessions: 0, totalTxLogged: 0 };
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
  var uniqueUsers = 0;
  var totalSessions = 0;
  var totalTxLogged = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    uniqueUsers++;
    totalSessions += Number(rows[i][3]) || 1;
    totalTxLogged += Number(rows[i][4]) || 0;
  }
  return { uniqueUsers: uniqueUsers, totalSessions: totalSessions, totalTxLogged: totalTxLogged };
}

function readAllRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const colCount = Math.max(sheet.getLastColumn(), HEADERS.length);
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  const items = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    let dateVal = row[1];
    if (dateVal instanceof Date) {
      const y = dateVal.getFullYear();
      const m = String(dateVal.getMonth() + 1).padStart(2, '0');
      const d = String(dateVal.getDate()).padStart(2, '0');
      dateVal = y + '-' + m + '-' + d;
    } else {
      dateVal = String(dateVal).slice(0, 10);
    }
    items.push({
      rowIndex: i + 2,
      id: String(row[0]),
      date: dateVal,
      amount: Number(row[2]) || 0,
      category: String(row[3] || 'other'),
      note: String(row[4] || ''),
      raw: String(row[5] || ''),
      updatedAt: Number(row[6]) || 0,
      deleted: row[7] === true || row[7] === 'true',
      type: String(row[8] || ''),
      paymentMethod: String(row[9] || 'upi')
    });
  }
  return items;
}

function doGet() {
  try {
    const sheet = getOrCreateSheet();
    const items = readAllRows(sheet).filter(function(item) { return !item.deleted; });
    const usageSummary = getUsageSummary();
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items: items, usageSummary: usageSummary, serverTime: Date.now() })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    if (payload.telemetry) {
      recordTelemetry(payload.telemetry);
    }
    if (payload.action === 'telemetry_only') {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, usageSummary: getUsageSummary(), serverTime: Date.now() })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    const incoming = Array.isArray(payload.items) ? payload.items : [];
    const sheet = getOrCreateSheet();
    const existing = readAllRows(sheet);
    const byId = new Map();
    for (var i = 0; i < existing.length; i++) {
      byId.set(existing[i].id, existing[i]);
    }
    for (var j = 0; j < incoming.length; j++) {
      var item = incoming[j];
      if (!item || !item.id) continue;
      var current = byId.get(String(item.id));
      var rowData = [
        String(item.id),
        String(item.date || ''),
        Number(item.amount) || 0,
        String(item.category || 'other'),
        String(item.note || ''),
        String(item.raw || ''),
        Number(item.updatedAt) || Date.now(),
        Boolean(item.deleted),
        String(item.type || 'expense'),
        String(item.paymentMethod || 'upi')
      ];
      if (current) {
        if ((Number(item.updatedAt) || 0) >= current.updatedAt) {
          sheet.getRange(current.rowIndex, 1, 1, HEADERS.length).setValues([rowData]);
        }
      } else {
        sheet.appendRow(rowData);
      }
    }
    const updatedItems = readAllRows(sheet).filter(function(it) { return !it.deleted; });
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items: updatedItems, usageSummary: getUsageSummary(), serverTime: Date.now() })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

export function normalizeEntryType(item) {
  if (item?.type === 'income' || item?.type === 'expense') {
    return item.type;
  }
  return isIncomeCategory(item?.category) ? 'income' : 'expense';
}

export function normalizePaymentMethod(item) {
  if (item?.paymentMethod) return item.paymentMethod;
  const type = normalizeEntryType(item);
  if (type === 'income' && (item?.category === 'salary' || item?.category === 'investments')) {
    return 'bank';
  }
  return 'upi';
}

export function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.map((item) => ({
          ...item,
          type: normalizeEntryType(item),
          paymentMethod: normalizePaymentMethod(item)
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveExpenses(expenses) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.error('Failed to save expenses locally:', e);
  }
}

export function loadTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTombstones(tombstones) {
  try {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
  } catch {
    // ignore
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      webhookUrl: parsed.webhookUrl || '',
      telemetryUrl: parsed.telemetryUrl || DEFAULT_TELEMETRY_WEBHOOK_URL || '',
      currency: parsed.currency || '₹',
      defaultPayment: parsed.defaultPayment || 'upi',
      monthlyBudget: Number(parsed.monthlyBudget) || 0,
      lastSyncAt: parsed.lastSyncAt || null
    };
  } catch {
    return {
      webhookUrl: '',
      telemetryUrl: DEFAULT_TELEMETRY_WEBHOOK_URL || '',
      currency: '₹',
      defaultPayment: 'upi',
      monthlyBudget: 0,
      lastSyncAt: null
    };
  }
}

export function saveSettings(settings) {
  const current = loadSettings();
  const next = { ...current, ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function getOrCreateAnonDeviceId() {
  try {
    let id = localStorage.getItem(ANON_DEVICE_KEY);
    if (!id) {
      id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(ANON_DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'usr_anonymous';
  }
}

export function loadCachedUsageStats() {
  try {
    const raw = localStorage.getItem(PUBLIC_COUNTER_CACHE_KEY);
    return raw ? JSON.parse(raw) : { uniqueUsers: 1, totalSessions: 1, source: 'local' };
  } catch {
    return { uniqueUsers: 1, totalSessions: 1, source: 'local' };
  }
}

function saveCachedUsageStats(stats) {
  try {
    localStorage.setItem(PUBLIC_COUNTER_CACHE_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

function buildTelemetryPayload(isNewSession = false) {
  const expenses = loadExpenses();
  return {
    deviceId: getOrCreateAnonDeviceId(),
    isNewSession: Boolean(isNewSession),
    txCount: expenses.length,
    platform: navigator.userAgentData?.platform || navigator.platform || 'web',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  };
}

/**
 * Zero-cost anonymous usage tracker for deployed instances:
 * 1. Tracks Unique Users & Total Sessions automatically using a free public JSON counter
 *    keyed to the deployed hostname (e.g. GitHub Pages / Cloudflare Pages / Vercel).
 * 2. Also sends an anonymous telemetry ping to the Google Sheet `UsageStats` tab if configured.
 */
export async function trackAppUsage({ onLaunch = false } = {}) {
  const cached = loadCachedUsageStats();
  let isFirstVisitEver = false;
  let isNewSession = false;

  try {
    if (!localStorage.getItem('qe_user_counted_v1')) {
      isFirstVisitEver = true;
      localStorage.setItem('qe_user_counted_v1', '1');
    }
    if (onLaunch && !sessionStorage.getItem('qe_session_counted_v1')) {
      isNewSession = true;
      sessionStorage.setItem('qe_session_counted_v1', '1');
    }
  } catch {
    // ignore storage restrictions
  }

  let updatedStats = {
    uniqueUsers: Math.max(1, cached.uniqueUsers || 1),
    totalSessions: Math.max(1, (cached.totalSessions || 0) + (isNewSession ? 1 : 0)),
    totalTxLogged: loadExpenses().length,
    source: cached.source || 'local'
  };
  saveCachedUsageStats(updatedStats);

  if (!navigator.onLine) {
    return updatedStats;
  }

  // 1. If a dedicated telemetryUrl or webhookUrl is set, sync with Google Sheet UsageStats tab
  const settings = loadSettings();
  const sheetUrl = (settings.telemetryUrl || settings.webhookUrl || DEFAULT_TELEMETRY_WEBHOOK_URL || '').trim();
  if (sheetUrl) {
    try {
      const resp = await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'telemetry_only',
          telemetry: buildTelemetryPayload(isNewSession)
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && data.usageSummary) {
          updatedStats = {
            uniqueUsers: Math.max(1, Number(data.usageSummary.uniqueUsers) || 1),
            totalSessions: Math.max(1, Number(data.usageSummary.totalSessions) || 1),
            totalTxLogged: Number(data.usageSummary.totalTxLogged) || loadExpenses().length,
            source: 'sheet'
          };
          saveCachedUsageStats(updatedStats);
          return updatedStats;
        }
      }
    } catch {
      // fall through to public counter
    }
  }

  // 2. Zero-config public counter (CounterAPI) keyed by deployed hostname
  try {
    const hostSlug = (window.location.hostname || 'localhost')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'localhost';
    const namespace = `dropspend-${hostSlug}`;

    const userEndpoint = isFirstVisitEver
      ? `https://api.counterapi.dev/v1/${namespace}/unique_users/up`
      : `https://api.counterapi.dev/v1/${namespace}/unique_users/`;
    const sessionEndpoint = isNewSession
      ? `https://api.counterapi.dev/v1/${namespace}/sessions/up`
      : `https://api.counterapi.dev/v1/${namespace}/sessions/`;

    const [uRes, sRes] = await Promise.allSettled([
      fetch(userEndpoint),
      fetch(sessionEndpoint)
    ]);

    let usersCount = updatedStats.uniqueUsers;
    let sessionsCount = updatedStats.totalSessions;

    if (uRes.status === 'fulfilled' && uRes.value.ok) {
      const uJson = await uRes.value.json();
      if (typeof uJson?.count === 'number') usersCount = Math.max(1, uJson.count);
    }
    if (sRes.status === 'fulfilled' && sRes.value.ok) {
      const sJson = await sRes.value.json();
      if (typeof sJson?.count === 'number') sessionsCount = Math.max(1, sJson.count);
    }

    updatedStats = {
      uniqueUsers: usersCount,
      totalSessions: sessionsCount,
      totalTxLogged: loadExpenses().length,
      source: 'counterapi'
    };
    saveCachedUsageStats(updatedStats);
  } catch {
    // keep cached stats offline/fallback
  }

  return updatedStats;
}

/**
 * Two-way sync with Google Sheets Web App URL.
 * Sends any dirty/unsynced items + tombstones + anonymous telemetry, then merges cloud rows back into local state.
 */
export async function syncWithGoogleSheets({ forceAll = false } = {}) {
  const settings = loadSettings();
  const url = (settings.webhookUrl || '').trim();
  if (!url) {
    return { status: 'unconfigured', message: 'Google Sheet URL not configured' };
  }

  if (!navigator.onLine) {
    return { status: 'offline', message: 'Offline — queued for automatic sync' };
  }

  const localExpenses = loadExpenses();
  const tombstones = loadTombstones();

  const dirtyExpenses = forceAll
    ? localExpenses
    : localExpenses.filter((item) => !item.synced);

  const payloadItems = [
    ...dirtyExpenses.map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      category: e.category,
      note: e.note,
      raw: e.raw || '',
      updatedAt: e.updatedAt || Date.now(),
      deleted: false,
      type: normalizeEntryType(e),
      paymentMethod: normalizePaymentMethod(e)
    })),
    ...tombstones.map((t) => ({
      id: t.id,
      date: t.date || '',
      amount: t.amount || 0,
      category: t.category || 'other',
      note: t.note || '',
      raw: '',
      updatedAt: t.updatedAt || Date.now(),
      deleted: true,
      type: normalizeEntryType(t),
      paymentMethod: normalizePaymentMethod(t)
    }))
  ];

  try {
    let response;
    if (payloadItems.length > 0) {
      // Use text/plain to avoid CORS preflight on Google Apps Script Web Apps
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sync',
          items: payloadItems,
          telemetry: buildTelemetryPayload(false)
        })
      });
    } else {
      response = await fetch(url, { method: 'GET' });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.ok) {
      throw new Error(data?.error || 'Invalid response from Google Sheet script');
    }

    if (data.usageSummary) {
      saveCachedUsageStats({
        uniqueUsers: Math.max(1, Number(data.usageSummary.uniqueUsers) || 1),
        totalSessions: Math.max(1, Number(data.usageSummary.totalSessions) || 1),
        totalTxLogged: Number(data.usageSummary.totalTxLogged) || localExpenses.length,
        source: 'sheet'
      });
    }

    // Merge remote items with local state
    const remoteItems = Array.isArray(data.items) ? data.items : [];
    const remoteActiveIds = new Set(
      remoteItems.filter((r) => r && r.id && !r.deleted).map((r) => String(r.id))
    );
    const mergedMap = new Map();

    // Keep local items that are either newly synced/unsynced or still active on the remote sheet
    const syncedIds = new Set(dirtyExpenses.map((d) => d.id));
    for (const loc of localExpenses) {
      const wasAlreadySynced = Boolean(loc.synced) && !syncedIds.has(loc.id);
      if (wasAlreadySynced && !remoteActiveIds.has(String(loc.id))) {
        // Deleted on another device or removed in Google Sheet
        continue;
      }
      mergedMap.set(loc.id, {
        ...loc,
        type: normalizeEntryType(loc),
        paymentMethod: normalizePaymentMethod(loc),
        synced: loc.synced || syncedIds.has(loc.id)
      });
    }

    for (const rem of remoteItems) {
      if (!rem || !rem.id || rem.deleted) continue;
      const existing = mergedMap.get(rem.id);
      if (!existing || (Number(rem.updatedAt) || 0) > (Number(existing.updatedAt) || 0)) {
        const remCat = String(rem.category || 'other');
        mergedMap.set(rem.id, {
          id: String(rem.id),
          date: String(rem.date).slice(0, 10),
          amount: Number(rem.amount) || 0,
          category: remCat,
          type: normalizeEntryType(rem),
          paymentMethod: normalizePaymentMethod(rem),
          note: String(rem.note || ''),
          raw: String(rem.raw || ''),
          updatedAt: Number(rem.updatedAt) || Date.now(),
          synced: true
        });
      }
    }

    const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    saveExpenses(mergedList);
    saveTombstones([]);
    const nowTs = Date.now();
    saveSettings({ lastSyncAt: nowTs });

    return {
      status: 'synced',
      count: mergedList.length,
      lastSyncAt: nowTs,
      expenses: mergedList,
      usageSummary: data.usageSummary || null
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.message || 'Failed to reach Google Sheet webhook'
    };
  }
}

export function exportToCSV(expenses) {
  const headers = ['Date', 'Type', 'Amount', 'Category', 'Payment Mode', 'Item / Note', 'Original Message'];
  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = expenses.map((e) => [
    e.date,
    normalizeEntryType(e) === 'income' ? 'Income' : 'Expense',
    e.amount,
    e.category,
    getPaymentMethodById(normalizePaymentMethod(e)).name,
    e.note,
    e.raw || ''
  ]);

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((r) => r.map(escapeCSV).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
