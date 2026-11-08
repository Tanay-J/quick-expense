import { extractTags, getPaymentMethodById, isIncomeCategory } from './parser.js?v=22';

// Master code-level feature flag: Set to false to completely remove/disable this feature across the app
export const FEATURE_REMOTE_NOTIF_SYNC = true;

const STORAGE_KEY = 'qe_expenses_v1';
const TOMBSTONES_KEY = 'qe_tombstones_v1';
const RECURRING_KEY = 'qe_recurring_v1';
const UTILITY_BILLS_KEY = 'qe_utility_bills_v1';
const SETTINGS_KEY = 'qe_settings_v1';
const ANON_DEVICE_KEY = 'qe_anon_device_id_v1';
const PUBLIC_COUNTER_CACHE_KEY = 'qe_usage_stats_cache_v1';

/**
 * Optional: When deploying publicly for others to use, you can paste your own
 * Google Apps Script Web App URL here so every visitor's anonymous usage count
 * (deviceId, session count, tx count — NEVER their private expense amounts/notes)
 * is logged to the "UsageStats" tab of your Google Sheet!
 */
export const DEFAULT_TELEMETRY_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwWUN6LyBsdzRI-_p5f3aVhEQaZqIrvoGatXDbtLdFjzIl4wlmnX7f960fBC-3Kv1k/exec';

export const GOOGLE_APPS_SCRIPT_CODE = `const SHEET_NAME = 'Expenses';
const HEADERS = ['id', 'date', 'amount', 'category', 'note', 'raw', 'updatedAt', 'deleted', 'type', 'paymentMethod'];
// Optional: If created at https://script.google.com instead of Extensions -> Apps Script, paste your Sheet ID here:
const OPTIONAL_SPREADSHEET_ID = '';

function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (OPTIONAL_SPREADSHEET_ID) return SpreadsheetApp.openById(OPTIONAL_SPREADSHEET_ID);
  throw new Error('Paste your Google Sheet ID into OPTIONAL_SPREADSHEET_ID at the top of the script.');
}

function getOrCreateSheet() {
  const ss = getSpreadsheet();
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
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items: items, serverTime: Date.now() })
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
    const ss = getSpreadsheet();

    // 1. If action is append_notifications, record into a dedicated 'Notifications' tab
    if (payload.action === 'append_notifications') {
      const NOTIF_TAB = 'Notifications';
      let notifSheet = ss.getSheetByName(NOTIF_TAB);
      if (!notifSheet) {
        notifSheet = ss.insertSheet(NOTIF_TAB);
        notifSheet.appendRow(['Timestamp', 'App / Package', 'Amount (₹)', 'Merchant / Note', 'Full Notification Text']);
        notifSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#f3f4f6');
        notifSheet.setFrozenRows(1);
      }
      const notifItems = Array.isArray(payload.items) ? payload.items : [];
      for (var k = 0; k < notifItems.length; k++) {
        var n = notifItems[k];
        if (!n) continue;
        var dateStr = n.timestamp ? new Date(Number(n.timestamp)).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
        notifSheet.appendRow([
          dateStr,
          String(n.sourceApp || ''),
          Number(n.amount) || 0,
          String(n.merchant || ''),
          String(n.rawText || '')
        ]);
      }
      return ContentService.createTextOutput(
        JSON.stringify({ ok: true, count: notifItems.length })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Standard Expense sync logic
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
      JSON.stringify({ ok: true, items: updatedItems, serverTime: Date.now() })
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

export function normalizeTags(item) {
  if (Array.isArray(item?.tags) && item.tags.length > 0) {
    return item.tags.map((t) => String(t).replace(/^#/, '').toLowerCase().trim()).filter(Boolean);
  }
  const fromRaw = extractTags(`${item?.note || ''} ${item?.raw || ''}`).tags;
  return fromRaw;
}

export function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.map((item) => ({
          ...item,
          type: normalizeEntryType(item),
          paymentMethod: normalizePaymentMethod(item),
          tags: normalizeTags(item)
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

export function loadRecurringRules() {
  try {
    const raw = localStorage.getItem(RECURRING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecurringRules(rules) {
  try {
    localStorage.setItem(RECURRING_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

export const DEFAULT_UTILITY_BILLS = [
  {
    id: 'bill_electricity_01',
    name: 'Electricity Bill',
    icon: '⚡',
    cadence: 'monthly',
    dayOfMonth: 12,
    estimatedAmount: 2400,
    paymentMethod: 'upi',
    category: 'bills',
    remindDaysBefore: 4,
    notificationsEnabled: true,
    lastPaidCycle: '',
    updatedAt: 1731000000000,
    deleted: false
  },
  {
    id: 'bill_gas_02',
    name: 'MNGL Piped Gas',
    icon: '🔥',
    cadence: 'bimonthly',
    dayOfMonth: 25,
    bimonthlyStartMonth: 0,
    estimatedAmount: 950,
    paymentMethod: 'upi',
    category: 'bills',
    remindDaysBefore: 5,
    notificationsEnabled: true,
    lastPaidCycle: '',
    updatedAt: 1731000000000,
    deleted: false
  },
  {
    id: 'bill_property_tax_03',
    name: 'Property Tax',
    icon: '🏛️',
    cadence: 'yearly',
    dayOfMonth: 31,
    annualMonth: 11,
    estimatedAmount: 6800,
    paymentMethod: 'netbanking',
    category: 'bills',
    remindDaysBefore: 15,
    notificationsEnabled: true,
    lastPaidCycle: '',
    updatedAt: 1731000000000,
    deleted: false
  }
];

export function loadUtilityBills() {
  try {
    const raw = localStorage.getItem(UTILITY_BILLS_KEY);
    if (!raw) {
      localStorage.setItem(UTILITY_BILLS_KEY, JSON.stringify(DEFAULT_UTILITY_BILLS));
      return DEFAULT_UTILITY_BILLS;
    }
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : DEFAULT_UTILITY_BILLS;
  } catch {
    return DEFAULT_UTILITY_BILLS;
  }
}

export function saveUtilityBills(bills) {
  try {
    localStorage.setItem(UTILITY_BILLS_KEY, JSON.stringify(bills));
  } catch {
    // ignore
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const stDay = Math.min(28, Math.max(1, Number(parsed.ccStatementDay) || 15));
    const dueDay = Math.min(28, Math.max(1, Number(parsed.ccDueDay) || 5));
    const defaultCards = [
      {
        id: 'cc_primary',
        name: 'Primary Card',
        statementDay: stDay,
        dueDay,
        lastPaidCycle: parsed.ccLastPaidCycle || ''
      }
    ];
    const creditCards =
      Array.isArray(parsed.creditCards) && parsed.creditCards.length > 0
        ? parsed.creditCards.map((c, idx) => ({
            id: c.id || `cc_${idx + 1}`,
            name: String(c.name || `Card ${idx + 1}`).trim(),
            statementDay: Math.min(28, Math.max(1, Number(c.statementDay) || 15)),
            dueDay: Math.min(28, Math.max(1, Number(c.dueDay) || 5)),
            lastPaidCycle: c.lastPaidCycle || ''
          }))
        : defaultCards;

    return {
      userName: parsed.userName || '',
      webhookUrl: parsed.webhookUrl || '',
      telemetryUrl: parsed.telemetryUrl || DEFAULT_TELEMETRY_WEBHOOK_URL || '',
      currency: parsed.currency || '₹',
      defaultPayment: parsed.defaultPayment || 'upi',
      inputStyle: parsed.inputStyle || 'keyboard',
      openToAdd: parsed.openToAdd !== undefined ? Boolean(parsed.openToAdd) : true,
      usualsCount: Number(parsed.usualsCount) || 6,
      recapCard: parsed.recapCard !== undefined ? Boolean(parsed.recapCard) : true,
      monthlyBudget: parsed.monthlyBudget !== undefined ? Number(parsed.monthlyBudget) : 30000,
      ccStatementDay: creditCards[0]?.statementDay || stDay,
      ccDueDay: creditCards[0]?.dueDay || dueDay,
      ccLastPaidCycle: creditCards[0]?.lastPaidCycle || parsed.ccLastPaidCycle || '',
      creditCards,
      ccRemindDays: Math.min(14, Math.max(1, Number(parsed.ccRemindDays) || 5)),
      ccNotificationsEnabled: parsed.ccNotificationsEnabled !== false,
      hapticsEnabled: parsed.hapticsEnabled !== false,
      homeStyle: parsed.homeStyle || 'accordions',
      theme: parsed.themeMigratedMidnight ? (parsed.theme || 'dark') : 'dark',
      themeMigratedMidnight: true,
      alwaysTables: Boolean(parsed.alwaysTables),
      recapSeen: parsed.recapSeen && typeof parsed.recapSeen === 'object' ? parsed.recapSeen : {},
      lastSyncAt: parsed.lastSyncAt || null
    };
  } catch {
    return {
      userName: '',
      webhookUrl: '',
      telemetryUrl: DEFAULT_TELEMETRY_WEBHOOK_URL || '',
      currency: '₹',
      defaultPayment: 'upi',
      inputStyle: 'keyboard',
      openToAdd: true,
      usualsCount: 6,
      recapCard: true,
      monthlyBudget: 30000,
      ccStatementDay: 15,
      ccDueDay: 5,
      ccLastPaidCycle: '',
      creditCards: [
        {
          id: 'cc_primary',
          name: 'Primary Card',
          statementDay: 15,
          dueDay: 5,
          lastPaidCycle: ''
        }
      ],
      ccRemindDays: 5,
      ccNotificationsEnabled: true,
      remoteNotificationSyncEnabled: false, //TODO-HERE-11
      hapticsEnabled: true,
      homeStyle: 'accordions',
      theme: 'dark',
      themeMigratedMidnight: true,
      alwaysTables: false,
      recapSeen: {},
      lastSyncAt: null
    };
  }
}

export function saveSettings(settings) {
  const current = loadSettings();
  const next = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    window.__qeHapticsEnabled = next.hapticsEnabled !== false;
  }
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
    return raw
      ? JSON.parse(raw)
      : { uniqueUsers: 1, activeUsers: 0, totalSessions: 1, totalTxLogged: 0, userNames: [], source: 'local' };
  } catch {
    return { uniqueUsers: 1, activeUsers: 0, totalSessions: 1, totalTxLogged: 0, userNames: [], source: 'local' };
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
  const settings = loadSettings();
  const uniqueDates = new Set(expenses.map((e) => e.date).filter(Boolean));
  return {
    deviceId: getOrCreateAnonDeviceId(),
    userName: (settings.userName || '').trim(),
    isNewSession: Boolean(isNewSession),
    txCount: expenses.length,
    activeDays: Math.max(1, uniqueDates.size),
    platform: navigator.userAgentData?.platform || navigator.platform || 'web',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  };
}

/**
 * Zero-cost usage tracker for deployed instances:
 * Sends a telemetry ping (including `userName`, `deviceId`, `txCount`, `activeDays`)
 * to the Google Sheet `UsageStats` tab (via `DEFAULT_TELEMETRY_WEBHOOK_URL` or user's `webhookUrl`).
 */
export async function trackAppUsage({ onLaunch = false } = {}) {
  const cached = loadCachedUsageStats();
  const localTxCount = loadExpenses().length;
  let isNewSession = false;

  try {
    if (onLaunch && !sessionStorage.getItem('qe_session_counted_v1')) {
      isNewSession = true;
      sessionStorage.setItem('qe_session_counted_v1', '1');
    }
  } catch {
    // ignore storage restrictions
  }

  let updatedStats = {
    uniqueUsers: Math.max(1, cached.uniqueUsers || 1),
    activeUsers: Math.max(localTxCount > 0 ? 1 : 0, cached.activeUsers || 0),
    totalSessions: Math.max(1, (cached.totalSessions || 0) + (isNewSession ? 1 : 0)),
    totalTxLogged: Math.max(localTxCount, cached.totalTxLogged || 0),
    userNames: Array.isArray(cached.userNames) ? cached.userNames : [],
    source: cached.source || 'local'
  };
  saveCachedUsageStats(updatedStats);

  if (!navigator.onLine) {
    return updatedStats;
  }

  // Silently report usage to creator's telemetry webhook once userName is set
  const settings = loadSettings();
  const myName = (settings.userName || '').trim();
  const telemetryEndpoint = (DEFAULT_TELEMETRY_WEBHOOK_URL || '').trim();
  if (telemetryEndpoint && myName) {
    try {
      const resp = await fetch(telemetryEndpoint, {
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
            activeUsers: Number(data.usageSummary.activeUsers) ?? (localTxCount > 0 ? 1 : 0),
            totalSessions: Math.max(1, Number(data.usageSummary.totalSessions) || 1),
            totalTxLogged: Math.max(localTxCount, Number(data.usageSummary.totalTxLogged) || 0),
            userNames: Array.isArray(data.usageSummary.userNames) ? data.usageSummary.userNames : [],
            source: 'sheet'
          };
          saveCachedUsageStats(updatedStats);
          return updatedStats;
        }
      }
    } catch {
      // keep cached stats offline/fallback
    }
  }

  return updatedStats;
}

/**
 * Two-way sync with user's personal Google Sheets Web App URL.
 * Sends any dirty/unsynced items + tombstones, then merges cloud rows back into local state.
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
  const localUtilityBills = loadUtilityBills();

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
          utilityBills: localUtilityBills
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
        activeUsers: Number(data.usageSummary.activeUsers) ?? (localExpenses.length > 0 ? 1 : 0),
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

    if (Array.isArray(data.utilityBills)) {
      const remoteBills = data.utilityBills;
      const localMap = new Map(localUtilityBills.map((b) => [b.id, b]));
      for (const rb of remoteBills) {
        if (!rb || !rb.id) continue;
        const cur = localMap.get(rb.id);
        if (!cur || (rb.updatedAt || 0) >= (cur.updatedAt || 0)) {
          localMap.set(rb.id, { ...cur, ...rb });
        }
      }
      const mergedBills = Array.from(localMap.values()).filter((b) => !b.deleted);
      saveUtilityBills(mergedBills);
    }

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
  const headers = ['Date', 'Type', 'Amount', 'Category', 'Payment Mode', 'Item / Note', 'Tags', 'Original Message'];
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
    normalizeTags(e).map((t) => `#${t}`).join(' '),
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
