const STORAGE_KEY = 'qe_expenses_v1';
const TOMBSTONES_KEY = 'qe_tombstones_v1';
const SETTINGS_KEY = 'qe_settings_v1';

export const GOOGLE_APPS_SCRIPT_CODE = `const SHEET_NAME = 'Expenses';
const HEADERS = ['id', 'date', 'amount', 'category', 'note', 'raw', 'updatedAt', 'deleted'];

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAllRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
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
      deleted: row[7] === true || row[7] === 'true'
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
        Boolean(item.deleted)
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

export function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
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
      currency: parsed.currency || '₹',
      monthlyBudget: Number(parsed.monthlyBudget) || 0,
      lastSyncAt: parsed.lastSyncAt || null
    };
  } catch {
    return { webhookUrl: '', currency: '₹', monthlyBudget: 0, lastSyncAt: null };
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

/**
 * Two-way sync with Google Sheets Web App URL.
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
      deleted: false
    })),
    ...tombstones.map((t) => ({
      id: t.id,
      date: t.date || '',
      amount: t.amount || 0,
      category: t.category || 'other',
      note: t.note || '',
      raw: '',
      updatedAt: t.updatedAt || Date.now(),
      deleted: true
    }))
  ];

  try {
    let response;
    if (payloadItems.length > 0) {
      // Use text/plain to avoid CORS preflight on Google Apps Script Web Apps
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sync', items: payloadItems })
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
        synced: loc.synced || syncedIds.has(loc.id)
      });
    }

    for (const rem of remoteItems) {
      if (!rem || !rem.id || rem.deleted) continue;
      const existing = mergedMap.get(rem.id);
      if (!existing || (Number(rem.updatedAt) || 0) > (Number(existing.updatedAt) || 0)) {
        mergedMap.set(rem.id, {
          id: String(rem.id),
          date: String(rem.date).slice(0, 10),
          amount: Number(rem.amount) || 0,
          category: String(rem.category || 'other'),
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
      expenses: mergedList
    };
  } catch (err) {
    return {
      status: 'error',
      message: err.message || 'Failed to reach Google Sheet webhook'
    };
  }
}

export function exportToCSV(expenses) {
  const headers = ['Date', 'Amount', 'Category', 'Item / Note', 'Original Message'];
  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = expenses.map((e) => [
    e.date,
    e.amount,
    e.category,
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
