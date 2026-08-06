// ============================================================
//  Building the Backlog — Google Apps Script backend
//
//  Setup:
//  1. Open your Google Sheet → Extensions → Apps Script
//  2. Paste this entire file, replacing any existing code
//  3. Project Settings (⚙) → Script Properties → add key "BTB_TOKEN" with a
//     random value (e.g. `openssl rand -hex 24`) — this is the shared
//     secret every request must present; see isAuthorized() below
//  4. Deploy → New deployment → Web app
//       Execute as: Me
//       Who has access: Anyone
//  5. Copy the deployment URL and paste it into app.js as SHEET_URL, and
//     the same BTB_TOKEN value as SHEET_TOKEN
// ============================================================

const SHEET_NAME = 'Games';
const META_SHEET = 'Meta';
const PLAT_STORES_SHEET = 'PlatformStores';
const RATE_LOG_SHEET = 'RateLog';
const GAME_PRICES_SHEET = 'GamePrices';
const PRICE_HISTORY_SHEET = 'PriceHistory';

// ── Auth: shared-secret token check ──────────────────────────
// The deployment URL alone is not a secret — it ships in the public app
// bundle. Set Project Settings → Script Properties → key "BTB_TOKEN" to a
// random string (e.g. output of `openssl rand -hex 24`), then pass the same
// value as window.BTB_SHEET_TOKEN in the app. Every request must include a
// matching ?token=... or it's rejected. Until BTB_TOKEN is set, all requests
// are rejected — this fails closed, not open.
function isAuthorized(params) {
  const expected = PropertiesService.getScriptProperties().getProperty('BTB_TOKEN');
  return !!expected && params.token === expected;
}

// ── Entry point ──────────────────────────────────────────────
function doGet(e) {
  const params = e.parameter;
  const action = params.action || '';
  const callback = params.callback || '';

  let result;
  if (!isAuthorized(params)) {
    result = { error: 'Unauthorized' };
  } else {
    try {
      switch (action) {
        case 'getAll':      result = getAll();      break;
        case 'getMeta':     result = getMeta();     break;
        case 'getPlatStores': result = getPlatStores(); break;
        case 'getRateLog':    result = getRateLog();      break;
        case 'getGamePrices': result = getGamePrices();   break;
        case 'getPriceHistory': result = getPriceHistory(params.appid); break;
        case 'getLatestFetchDiffs': result = getLatestFetchDiffs(); break;
        default:              result = { error: 'Unknown action: ' + action };
      }
    } catch (err) {
      result = { error: err.message };
    }
  }

  const json = JSON.stringify(result);
  const output = callback
    ? ContentService.createTextOutput(callback + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT)
    : ContentService.createTextOutput(json)
        .setMimeType(ContentService.MimeType.JSON);

  return output;
}

function doPost(e) {
  const params = e.parameter;
  const action = params.action || '';

  let result;
  if (!isAuthorized(params)) {
    result = { error: 'Unauthorized' };
  } else {
    try {
      switch (action) {
        case 'setRows':   result = setRows(JSON.parse(e.postData.contents));   break;
        case 'setAll':    result = setAll(JSON.parse(e.postData.contents));    break;
        case 'deleteRow': result = deleteRow(params.id);                       break;
        case 'upsertGamePrices':  result = upsertGamePrices(JSON.parse(e.postData.contents));  break;
        case 'appendPriceHistory': result = appendPriceHistory(JSON.parse(e.postData.contents)); break;
        case 'logFetch':  result = logFetch(JSON.parse(e.postData.contents));  break;
        default:         result = { error: 'Unknown action: ' + action };
      }
    } catch (err) {
      result = { error: err.message };
    }
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Read all games ───────────────────────────────────────────
function getAll() {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
    return obj;
  });
}

// ── Read metadata (genres / tags) ────────────────────────────
function getMeta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const tz = ss.getSpreadsheetTimeZone();
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
    return obj;
  });
}

// ── Read platform → store mappings ──────────────────────────
function getPlatStores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PLAT_STORES_SHEET);
  if (!sheet) return {};

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};

  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const platform = String(rows[i][0]).trim();
    const store    = String(rows[i][1]).trim();
    if (!platform || !store) continue;
    if (!result[platform]) result[platform] = [];
    result[platform].push(store);
  }
  return result;
}

// ── Serialise a record value to a sheet-safe scalar ─────────
function toCell(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v) || (typeof v === 'object')) return JSON.stringify(v);
  return v;
}

// ── Write one or more rows (upsert by id) ────────────────────
function setRows(records) {
  if (!Array.isArray(records)) records = [records];
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String);
  const rdCol = headers.indexOf('releaseDate');

  records.forEach(record => {
    const idCol = headers.indexOf('id');
    const existingRow = rows.findIndex((r, i) => i > 0 && String(r[idCol]) === String(record.id));
    const targetRow = existingRow > 0 ? existingRow + 1 : sheet.getLastRow() + 1;

    const rowData = headers.map(h => toCell(record[h]));
    // releaseDate can be an intentionally imprecise string like "November 2026"
    // (day unknown). Sheets' default "Automatic" cell format silently
    // reparses any date-looking text into a real Date value — defaulting
    // the missing day to the 1st — which permanently destroys that
    // precision the moment it's written. Forcing the cell to plain-text
    // format *before* the write is the only way to stop Sheets from doing
    // this; fixing it after the fact can't recover the lost day.
    if (rdCol > -1) sheet.getRange(targetRow, rdCol + 1).setNumberFormat('@');
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
  });

  return { ok: true };
}

// ── Overwrite the entire sheet ───────────────────────────────
function setAll(records) {
  const sheet = getSheet(SHEET_NAME);
  if (!Array.isArray(records) || records.length === 0) return { ok: true };

  // Preserve existing header row or build one from the first record
  const existing = sheet.getDataRange().getValues();
  let headers = existing.length > 0 ? existing[0].map(String) : Object.keys(records[0]);

  // Add any new fields from records not already in headers
  const headerSet = new Set(headers);
  records.forEach(r => Object.keys(r).forEach(k => {
    if (!headerSet.has(k)) { headers.push(k); headerSet.add(k); }
  }));

  const rows = [headers, ...records.map(r => headers.map(h => toCell(r[h])))];
  sheet.clearContents();
  // See setRows() above for why releaseDate must be forced to plain text
  // before the values land — clearContents() doesn't reset cell format, so
  // a column Sheets previously auto-converted to Date stays Date-formatted
  // and would re-corrupt "November 2026"-style values right back.
  const rdCol = headers.indexOf('releaseDate');
  if (rdCol > -1 && rows.length > 1) sheet.getRange(2, rdCol + 1, rows.length - 1, 1).setNumberFormat('@');
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

  return { ok: true };
}

// ── Delete a row by id ───────────────────────────────────────
function deleteRow(id) {
  if (!id) return { error: 'No id provided' };
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(String);
  const idCol = headers.indexOf('id');

  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { error: 'Row not found: ' + id };
}

// ── GG.deals rate-limit log: read entries from last hour ────
function getRateLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(RATE_LOG_SHEET);
  if (!sheet) return { entries: [] };
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return { entries: [] };
  const oneHourAgo = Date.now() - 3600000;
  const entries = rows.slice(1)
    .filter(r => Number(r[0]) >= oneHourAgo)
    .map(r => ({ ts: Number(r[0]), count: Number(r[1]) }));
  return { entries };
}

// ── Read saved game prices ───────────────────────────────────────
function getGamePrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(GAME_PRICES_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// ── Read one game's price history, oldest → newest ──────────────
function getPriceHistory(appid) {
  if (!appid) return { error: 'Missing appid' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PRICE_HISTORY_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  const c = h => headers.indexOf(h);
  const key = String(appid);
  return rows.slice(1)
    .filter(r => String(r[c('appid')]) === key)
    .map(r => ({
      fetched_at: r[c('fetched_at')],
      retail: r[c('retail')],
      keyshop: r[c('keyshop')],
      currency: r[c('currency')],
    }))
    .sort((a, b) => Number(a.fetched_at) - Number(b.fetched_at));
}

// ── Reconstruct the most recent live-price fetch run's results, so any
//    device can view "what changed last time" without having been the one
//    that ran it — batches inside one run land ~61s apart, so a 30-minute
//    gap between rows marks the boundary of a new run. ──────────────────
function getLatestFetchDiffs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const histSheet = ss.getSheetByName(PRICE_HISTORY_SHEET);
  if (!histSheet) return [];
  const rows = histSheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  const c = h => headers.indexOf(h);

  const all = rows.slice(1).map(r => ({
    appid: String(r[c('appid')]),
    title: r[c('title')],
    fetched_at: Number(r[c('fetched_at')]) || 0,
    retail: parseFloat(r[c('retail')]) || 0,
    keyshop: parseFloat(r[c('keyshop')]) || 0,
    currency: r[c('currency')],
  })).sort((a, b) => a.fetched_at - b.fetched_at);
  if (!all.length) return [];

  const RUN_GAP_MS = 30 * 60 * 1000;
  const distinctTs = [...new Set(all.map(r => r.fetched_at))].sort((a, b) => a - b);
  let runStartTs = distinctTs[distinctTs.length - 1];
  for (let i = distinctTs.length - 1; i > 0; i--) {
    if (distinctTs[i] - distinctTs[i - 1] <= RUN_GAP_MS) runStartTs = distinctTs[i - 1];
    else break;
  }

  // Group each appid's own rows (ascending) so the diff baseline is always
  // "this game's own previous fetch" — not clipped at the run boundary,
  // which would skip past a same-session recheck (e.g. an interrupted run
  // resumed a few minutes later, landing inside the same 30-min window as
  // its own earlier attempt) and wrongly diff against a much older price.
  const byAppid = {};
  all.forEach(r => { (byAppid[r.appid] = byAppid[r.appid] || []).push(r); });

  const lowsByAppid = {};
  const gpSheet = ss.getSheetByName(GAME_PRICES_SHEET);
  if (gpSheet) {
    const gpRows = gpSheet.getDataRange().getValues();
    if (gpRows.length > 1) {
      const gpHeaders = gpRows[0].map(String);
      const gc = h => gpHeaders.indexOf(h);
      gpRows.slice(1).forEach(r => {
        lowsByAppid[String(r[gc('appid')])] = {
          retail: parseFloat(r[gc('personal_low_retail')]) || 0,
          keyshop: parseFloat(r[gc('personal_low_keyshop')]) || 0,
        };
      });
    }
  }

  return Object.keys(byAppid)
    .filter(appid => byAppid[appid][byAppid[appid].length - 1].fetched_at >= runStartTs)
    .map(appid => {
      const arr = byAppid[appid];
      const cur = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : null;
      const low = lowsByAppid[appid] || { retail: 0, keyshop: 0 };
      return {
        appid: appid,
        title: cur.title,
        fetched_at: cur.fetched_at,
        retail: cur.retail,
        keyshop: cur.keyshop,
        prevRetail: prev ? prev.retail : 0,
        prevKeyshop: prev ? prev.keyshop : 0,
        lowRetail: low.retail,
        lowKeyshop: low.keyshop,
      };
    }).sort((a, b) => b.fetched_at - a.fetched_at);
}

// ── GG.deals rate-limit log: append + prune rows older than 1h ──
function logFetch(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RATE_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RATE_LOG_SHEET);
    sheet.appendRow(['ts', 'count']);
  }
  const rows = sheet.getDataRange().getValues();
  const oneHourAgo = Date.now() - 3600000;
  const keep = rows.slice(1).filter(r => Number(r[0]) >= oneHourAgo);
  keep.push([entry.ts, entry.count]);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([rows[0] || ['ts', 'count']]);
  if (keep.length) sheet.getRange(2, 1, keep.length, 2).setValues(keep);
  return { ok: true };
}

// ── Upsert GamePrices + compute personal lows ────────────────
function upsertGamePrices(entries) {
  if (!Array.isArray(entries) || !entries.length) return { ok: true, newLows: [] };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(GAME_PRICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(GAME_PRICES_SHEET);
    sheet.appendRow(['appid','title','last_retail','last_keyshop','personal_low_retail','personal_low_keyshop','last_fetched']);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(String);
  const c = h => headers.indexOf(h);

  // Index existing rows by appid
  const idx = {};
  for (let i = 1; i < data.length; i++) idx[String(data[i][c('appid')])] = i;

  const newLows = [];
  const lows = {}; // appid -> { retail, keyshop } personal-low AFTER this upsert
  const now = Date.now();

  entries.forEach(entry => {
    const retail  = parseFloat(entry.retail)  || 0;
    const keyshop = parseFloat(entry.keyshop) || 0;
    const key = String(entry.appid);

    if (key in idx) {
      const i = idx[key];
      const prevLowR = parseFloat(data[i][c('personal_low_retail')])  || Infinity;
      const prevLowK = parseFloat(data[i][c('personal_low_keyshop')]) || Infinity;
      data[i][c('title')]        = entry.title;
      data[i][c('last_retail')]  = retail  || '';
      data[i][c('last_keyshop')] = keyshop || '';
      data[i][c('last_fetched')] = now;
      if (retail  > 0 && retail  <= prevLowR) { data[i][c('personal_low_retail')]  = retail;  newLows.push(key); }
      if (keyshop > 0 && keyshop <= prevLowK)   data[i][c('personal_low_keyshop')] = keyshop;
      lows[key] = {
        retail:  parseFloat(data[i][c('personal_low_retail')])  || 0,
        keyshop: parseFloat(data[i][c('personal_low_keyshop')]) || 0,
      };
    } else {
      const row = new Array(headers.length).fill('');
      row[c('appid')]                = entry.appid;
      row[c('title')]                = entry.title;
      row[c('last_retail')]          = retail  || '';
      row[c('last_keyshop')]         = keyshop || '';
      row[c('personal_low_retail')]  = retail  || '';
      row[c('personal_low_keyshop')] = keyshop || '';
      row[c('last_fetched')]         = now;
      idx[key] = data.length;
      data.push(row);
      if (retail > 0) newLows.push(key);
      lows[key] = { retail: retail || 0, keyshop: keyshop || 0 };
    }
  });

  // Write back entire range in one call (new rows already appended to data)
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);

  return { ok: true, newLows, lows };
}

// ── Append rows to PriceHistory ──────────────────────────────
function appendPriceHistory(entries) {
  if (!Array.isArray(entries) || !entries.length) return { ok: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PRICE_HISTORY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PRICE_HISTORY_SHEET);
    sheet.appendRow(['id','appid','title','fetched_at','retail','keyshop','currency']);
  }
  const lastRow = sheet.getLastRow();
  const rows = entries.map((e, i) => [
    lastRow + i, e.appid, e.title, e.fetched_at, e.retail, e.keyshop, e.currency
  ]);
  sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
  return { ok: true };
}

// ── Helper: get or create sheet tab ─────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Seed the header row — columns match the game data model
    sheet.appendRow([
      'id','title','status','steamAppId','genres',
      'priority','hotness','releaseDate','price',
      'developer','publisher','cover','storeLink','type','parentAppId',
      'myRating','myReview','steamWishlist','added','removeNote','notes',
      'purchases','tags','shortDescription','delisted','skipGGFetch'
    ]);
  }
  return sheet;
}
