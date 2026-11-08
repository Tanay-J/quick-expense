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
const UTILITY_BILLS_SHEET_NAME = 'UtilityBills';
const UTILITY_BILLS_HEADERS = ['id', 'name', 'icon', 'cadence', 'dayOfMonth', 'annualMonth', 'bimonthlyStartMonth', 'estimatedAmount', 'paymentMethod', 'category', 'remindDaysBefore', 'notificationsEnabled', 'lastPaidCycle', 'updatedAt', 'deleted'];
const STATS_SHEET_NAME = 'UsageStats';
const STATS_HEADERS = ['deviceId', 'userName', 'firstSeen', 'lastSeen', 'sessions', 'txCount', 'activeDays', 'platform', 'timezone'];
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

function getOrCreateUtilityBillsSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(UTILITY_BILLS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UTILITY_BILLS_SHEET_NAME);
    sheet.appendRow(UTILITY_BILLS_HEADERS);
    sheet.getRange(1, 1, 1, UTILITY_BILLS_HEADERS.length).setFontWeight('bold').setBackground('#fef3c7');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < UTILITY_BILLS_HEADERS.length) {
    sheet.getRange(1, 1, 1, UTILITY_BILLS_HEADERS.length).setValues([UTILITY_BILLS_HEADERS]).setFontWeight('bold').setBackground('#fef3c7');
  }
  return sheet;
}

function readAllUtilityBills(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const colCount = Math.max(sheet.getLastColumn(), UTILITY_BILLS_HEADERS.length);
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  const items = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    items.push({
      rowIndex: i + 2,
      id: String(row[0]),
      name: String(row[1] || 'Utility Bill'),
      icon: String(row[2] || '⚡'),
      cadence: String(row[3] || 'monthly'),
      dayOfMonth: Number(row[4]) || 12,
      annualMonth: Number(row[5]) || 0,
      bimonthlyStartMonth: Number(row[6]) || 0,
      estimatedAmount: Number(row[7]) || 0,
      paymentMethod: String(row[8] || 'upi'),
      category: String(row[9] || 'bills'),
      remindDaysBefore: Number(row[10]) || 4,
      notificationsEnabled: row[11] === true || row[11] === 'true',
      lastPaidCycle: String(row[12] || ''),
      updatedAt: Number(row[13]) || Date.now(),
      deleted: row[14] === true || row[14] === 'true'
    });
  }
  return items;
}

function recordTelemetry(telemetry) {
  if (!telemetry || !telemetry.deviceId) return null;
  const sheet = getOrCreateStatsSheet();
  const lastRow = sheet.getLastRow();
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let foundRow = -1;
  let existingName = '';
  let existingFirstSeen = nowIso;
  let existingSessions = 0;
  let existingTxCount = 0;
  let existingActiveDays = 1;

  if (lastRow > 1) {
    const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(telemetry.deviceId)) {
        foundRow = i + 2;
        // Support both 8-column legacy rows and 9-column rows with userName
        const isNineCol = rows[i].length >= 9 && String(rows[i][2] || '').includes('-');
        if (isNineCol) {
          existingName = String(rows[i][1] || '');
          existingFirstSeen = rows[i][2] || nowIso;
          existingSessions = Number(rows[i][4]) || 0;
          existingTxCount = Number(rows[i][5]) || 0;
          existingActiveDays = Number(rows[i][6]) || 1;
        } else {
          existingFirstSeen = rows[i][1] || nowIso;
          existingSessions = Number(rows[i][3]) || 0;
          existingTxCount = Number(rows[i][4]) || 0;
          existingActiveDays = Number(rows[i][5]) || 1;
        }
        break;
      }
    }
  }

  const incomingName = String(telemetry.userName || '').trim().slice(0, 50);
  const finalName = incomingName || existingName || 'Anonymous';
  const nextSessions = telemetry.isNewSession ? existingSessions + 1 : Math.max(1, existingSessions);
  const nextTxCount = Math.max(existingTxCount, Number(telemetry.txCount) || 0);
  const nextActiveDays = Math.max(existingActiveDays, Number(telemetry.activeDays) || 1);

  const rowValues = [
    String(telemetry.deviceId),
    finalName,
    existingFirstSeen,
    nowIso,
    nextSessions,
    nextTxCount,
    nextActiveDays,
    String(telemetry.platform || ''),
    String(telemetry.timezone || '')
  ];

  if (foundRow !== -1) {
    sheet.getRange(foundRow, 1, 1, STATS_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return getUsageSummary();
}

function getUsageSummary() {
  const sheet = getOrCreateStatsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { uniqueUsers: 0, activeUsers: 0, totalSessions: 0, totalTxLogged: 0, userNames: [] };
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, STATS_HEADERS.length).getValues();
  let uniqueUsers = 0;
  let activeUsers = 0;
  let totalSessions = 0;
  let totalTxLogged = 0;
  const userNames = [];

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    uniqueUsers++;
    const isNineCol = String(rows[i][2] || '').includes('-');
    const nameVal = isNineCol ? String(rows[i][1] || '').trim() : '';
    const sessionsVal = isNineCol ? Number(rows[i][4]) || 1 : Number(rows[i][3]) || 1;
    const userTx = isNineCol ? Number(rows[i][5]) || 0 : Number(rows[i][4]) || 0;

    if (userTx > 0) {
      activeUsers++;
    }
    if (nameVal && nameVal !== 'Anonymous' && userNames.length < 15) {
      userNames.push(nameVal);
    }
    totalSessions += sessionsVal;
    totalTxLogged += userTx;
  }
  return { uniqueUsers, activeUsers, totalSessions, totalTxLogged, userNames };
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
    const billSheet = getOrCreateUtilityBillsSheet();
    const utilityBills = readAllUtilityBills(billSheet).filter((b) => !b.deleted);
    const usageSummary = getUsageSummary();
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items, utilityBills, usageSummary, serverTime: Date.now() })
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

    if (Array.isArray(payload.utilityBills)) {
      const billSheet = getOrCreateUtilityBillsSheet();
      const existingBills = readAllUtilityBills(billSheet);
      const billsById = new Map();
      for (const b of existingBills) {
        billsById.set(b.id, b);
      }
      for (const b of payload.utilityBills) {
        if (!b || !b.id) continue;
        const cur = billsById.get(String(b.id));
        const rowData = [
          String(b.id),
          String(b.name || 'Utility Bill'),
          String(b.icon || '⚡'),
          String(b.cadence || 'monthly'),
          Number(b.dayOfMonth) || 12,
          Number(b.annualMonth) || 0,
          Number(b.bimonthlyStartMonth) || 0,
          Number(b.estimatedAmount) || 0,
          String(b.paymentMethod || 'upi'),
          String(b.category || 'bills'),
          Number(b.remindDaysBefore) || 4,
          Boolean(b.notificationsEnabled),
          String(b.lastPaidCycle || ''),
          Number(b.updatedAt) || Date.now(),
          Boolean(b.deleted)
        ];
        if (cur) {
          if ((Number(b.updatedAt) || 0) >= cur.updatedAt) {
            billSheet.getRange(cur.rowIndex, 1, 1, UTILITY_BILLS_HEADERS.length).setValues([rowData]);
          }
        } else {
          billSheet.appendRow(rowData);
        }
      }
    }

    const updatedItems = readAllRows(sheet).filter((item) => !item.deleted);
    const billSheet = getOrCreateUtilityBillsSheet();
    const updatedUtilityBills = readAllUtilityBills(billSheet).filter((b) => !b.deleted);
    return ContentService.createTextOutput(
      JSON.stringify({ ok: true, items: updatedItems, utilityBills: updatedUtilityBills, usageSummary: getUsageSummary(), serverTime: Date.now() })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
