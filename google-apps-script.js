/**
 * ============================================================================
 * GOOGLE SHEETS CLOUD BACKUP & 2-WAY SYNC SCRIPT (100% Free Forever)
 * ============================================================================
 *
 * HOW TO SET UP (Takes 90 seconds):
 * 1. Create a new Google Sheet at https://sheets.new
 * 2. Click "Extensions" -> "Apps Script" in the top menu.
 * 3. Delete any code in the editor and paste this ENTIRE file.
 * 4. Click "Deploy" (top right) -> "New deployment".
 * 5. Select type: "Web app" (click the gear icon next to Select type).
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (this allows your PWA to sync without OAuth popups;
 *      you can also set an optional Secret Key below for extra security).
 * 6. Click "Deploy", authorize access, and copy the "Web app URL".
 * 7. Paste the Web app URL into the QuickExpense app -> Cloud Sync settings!
 */

const SHEET_NAME = 'Expenses';
const HEADERS = ['id', 'date', 'amount', 'category', 'note', 'raw', 'updatedAt', 'deleted', 'type', 'paymentMethod'];
const STATS_SHEET_NAME = 'UsageStats';
const STATS_HEADERS = ['deviceId', 'firstSeen', 'lastSeen', 'sessions', 'txCount', 'activeDays', 'platform', 'timezone'];
// Optional: If you create this script at https://script.google.com instead of Extensions -> Apps Script,
// paste your Google Sheet ID (from the Sheet URL: docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit) below:
const OPTIONAL_SPREADSHEET_ID = '';

function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (OPTIONAL_SPREADSHEET_ID) {
    return SpreadsheetApp.openById(OPTIONAL_SPREADSHEET_ID);
  }
  throw new Error('No active spreadsheet found. Either open via Extensions -> Apps Script in your Sheet, or set OPTIONAL_SPREADSHEET_ID.');
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

function getOrCreateStatsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET_NAME);
    sheet.appendRow(STATS_HEADERS);
    sheet.getRange(1, 1, 1, STATS_HEADERS.length).setFontWeight('bold').setBackground('#ecfdf5');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < STATS_HEADERS.length) {
    sheet.getRange(1, 1, 1, STATS_HEADERS.length).setValues([STATS_HEADERS]).setFontWeight('bold').setBackground('#ecfdf5');
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
  let existingTxCount = 0;
  let existingActiveDays = 1;

  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(telemetry.deviceId)) {
        foundRow = i + 2;
        existingSessions = Number(rows[i][3]) || 0;
        existingTxCount = Number(rows[i][4]) || 0;
        existingActiveDays = Number(rows[i][5]) || 1;
        break;
      }
    }
  }

  const nextSessions = telemetry.isNewSession ? existingSessions + 1 : Math.max(1, existingSessions);
  const nextTxCount = Math.max(existingTxCount, Number(telemetry.txCount) || 0);
  const nextActiveDays = Math.max(existingActiveDays, Number(telemetry.activeDays) || 1);

  if (foundRow !== -1) {
    const firstSeen = sheet.getRange(foundRow, 2).getValue() || nowIso;
    sheet.getRange(foundRow, 1, 1, STATS_HEADERS.length).setValues([[
      String(telemetry.deviceId),
      firstSeen,
      nowIso,
      nextSessions,
      nextTxCount,
      nextActiveDays,
      String(telemetry.platform || ''),
      String(telemetry.timezone || '')
    ]]);
  } else {
    sheet.appendRow([
      String(telemetry.deviceId),
      nowIso,
      nowIso,
      1,
      nextTxCount,
      nextActiveDays,
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
    return { uniqueUsers: 0, activeUsers: 0, totalSessions: 0, totalTxLogged: 0 };
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
  let uniqueUsers = 0;
  let activeUsers = 0;
  let totalSessions = 0;
  let totalTxLogged = 0;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    uniqueUsers++;
    const userTx = Number(rows[i][4]) || 0;
    if (userTx > 0) {
      activeUsers++;
    }
    totalSessions += Number(rows[i][3]) || 1;
    totalTxLogged += userTx;
  }
  return { uniqueUsers, activeUsers, totalSessions, totalTxLogged };
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
      dateVal = `${y}-${m}-${d}`;
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

function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const items = readAllRows(sheet).filter((item) => !item.deleted);
    const usageSummary = getUsageSummary();
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items, usageSummary, serverTime: Date.now() })
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
    for (const item of existing) {
      byId.set(item.id, item);
    }

    for (const item of incoming) {
      if (!item || !item.id) continue;
      const current = byId.get(String(item.id));
      const rowData = [
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

    const updatedItems = readAllRows(sheet).filter((item) => !item.deleted);
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
}
