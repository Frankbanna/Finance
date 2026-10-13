/**
 * PERSONAL FINANCE MANAGER PRO
 * Live Google Sheets Runtime & Static Server (`tools/live-sheets-server.js`)
 *
 * Executes the exact Google Apps Script files in `backend/*.gs` against the REAL
 * Google Spreadsheet (`15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A`) using the authenticated
 * Google Sheets OAuth2 token, and serves the Standalone Frontend at http://localhost:3000.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A';
const TOKEN_PATH = 'C:\\Users\\fang0\\.gemini\\antigravity\\plugin_data\\gsheets\\token.json';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

// In-memory mirror of the real Google Spreadsheet, synced directly from and written directly to Google Sheets API
let sheetStore = {
  id: SPREADSHEET_ID,
  name: 'Personal Finance Manager Pro - Database',
  sheets: {} // sheetName -> 2D array of values
};

const scriptProperties = {
  SPREADSHEET_ID: SPREADSHEET_ID,
  AUTH_PEPPER_SECRET: 'pfm_pro_default_pepper_' + SPREADSHEET_ID
};

const scriptCache = new Map();

/**
 * Reads valid OAuth access token from gsheets plugin token file (refreshes via gsheets CLI if needed).
 */
function getAccessToken() {
  const raw = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  return raw.access_token;
}

/**
 * Makes an HTTPS request to Google Sheets v4 REST API.
 */
function googleSheetsApiRequest(method, apiPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const token = getAccessToken();
    const payloadStr = bodyObj ? JSON.stringify(bodyObj) : null;
    const options = {
      hostname: 'sheets.googleapis.com',
      port: 443,
      path: apiPath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    };
    if (payloadStr) {
      options.headers['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(chunks ? JSON.parse(chunks) : {});
          } catch (e) {
            resolve({});
          }
        } else {
          reject(new Error(`Google Sheets API HTTP ${res.statusCode}: ${chunks}`));
        }
      });
    });
    req.on('error', reject);
    if (payloadStr) req.write(payloadStr);
    req.end();
  });
}

/**
 * Pulls all 16 sheets from the real Google Spreadsheet into memory before handling requests.
 */
async function syncFromRealGoogleSheets() {
  const meta = await googleSheetsApiRequest(
    'GET',
    `/v4/spreadsheets/${SPREADSHEET_ID}?includeGridData=false`
  );
  sheetStore.name = (meta.properties && meta.properties.title) || sheetStore.name;
  const sheetTitles = (meta.sheets || []).map(s => s.properties.title);

  if (sheetTitles.length === 0) return;

  const rangesQuery = sheetTitles.map(t => `ranges=${encodeURIComponent(t + '!A1:ZZ5000')}`).join('&');
  const batchRes = await googleSheetsApiRequest(
    'GET',
    `/v4/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${rangesQuery}&valueRenderOption=UNFORMATTED_VALUE`
  );

  const valueRanges = batchRes.valueRanges || [];
  for (let i = 0; i < sheetTitles.length; i++) {
    const title = sheetTitles[i];
    const vr = valueRanges[i];
    sheetStore.sheets[title] = (vr && vr.values) ? vr.values : [];
  }
}

/**
 * Flushes pending write operations directly to the real Google Spreadsheet.
 */
async function flushPendingWritesToGoogleSheets(pendingOps) {
  if (!pendingOps || pendingOps.length === 0) return;

  for (const op of pendingOps) {
    if (op.type === 'append') {
      const encodedRange = encodeURIComponent(`${op.sheetName}!A1`);
      await googleSheetsApiRequest(
        'POST',
        `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { values: op.rows }
      );
    } else if (op.type === 'update') {
      const endColLetter = columnNumberToLetter(op.startCol + op.numCols - 1);
      const startColLetter = columnNumberToLetter(op.startCol);
      const endRow = op.startRow + op.numRows - 1;
      const rangeA1 = `${op.sheetName}!${startColLetter}${op.startRow}:${endColLetter}${endRow}`;
      await googleSheetsApiRequest(
        'PUT',
        `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(rangeA1)}?valueInputOption=USER_ENTERED`,
        { values: op.rows }
      );
    }
  }
}

function columnNumberToLetter(colNum) {
  let temp;
  let letter = '';
  while (colNum > 0) {
    temp = (colNum - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colNum = (colNum - temp - 1) / 26;
  }
  return letter;
}

/**
 * Builds the GAS V8 Sandbox and loads all `backend/*.gs` files in order.
 */
function createGasSandbox(pendingOps) {
  const sandbox = {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    RegExp: RegExp,
    Error: Error,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,

    Logger: {
      log: (msg) => console.log('[GAS Logger]', msg)
    },

    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => scriptProperties[k] || null,
        setProperty: (k, v) => { scriptProperties[k] = String(v); }
      })
    },

    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const item = scriptCache.get(k);
          if (!item) return null;
          if (Date.now() > item.expiresAt) {
            scriptCache.delete(k);
            return null;
          }
          return item.value;
        },
        put: (k, v, ttlSec) => {
          scriptCache.set(k, {
            value: String(v),
            expiresAt: Date.now() + (Number(ttlSec || 120) * 1000)
          });
        },
        removeAll: (keys) => {
          (keys || []).forEach(k => scriptCache.delete(k));
        }
      })
    },

    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {}
      })
    },

    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (value, key) => {
        const buf = crypto.createHmac('sha256', String(key)).update(String(value), 'utf8').digest();
        return Array.from(buf);
      },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algo, value) => {
        const buf = crypto.createHash('sha256').update(String(value), 'utf8').digest();
        return Array.from(buf);
      },
      formatDate: (dateObj, tz, formatStr) => {
        const d = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
        // Offset to Asia/Bangkok (+07:00) for consistent date formatting
        const bangkokMs = d.getTime() + (7 * 3600 * 1000);
        const bd = new Date(bangkokMs);
        const yyyy = bd.getUTCFullYear();
        const mm = ('0' + (bd.getUTCMonth() + 1)).slice(-2);
        const dd = ('0' + bd.getUTCDate()).slice(-2);
        const hh = ('0' + bd.getUTCHours()).slice(-2);
        const mi = ('0' + bd.getUTCMinutes()).slice(-2);
        if (formatStr === 'HH:mm') return `${hh}:${mi}`;
        return `${yyyy}-${mm}-${dd}`;
      }
    },

    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        _text: text,
        _mime: 'text/plain',
        setMimeType: function(m) { this._mime = m; return this; },
        getContent: function() { return this._text; }
      })
    },

    SpreadsheetApp: {
      flush: () => {},
      openById: (id) => ({
        getId: () => id,
        getName: () => sheetStore.name,
        getSheets: () => Object.keys(sheetStore.sheets).map(name => sandbox.SpreadsheetApp._makeSheet(name)),
        getSheetByName: (name) => {
          if (!sheetStore.sheets[name]) return null;
          return sandbox.SpreadsheetApp._makeSheet(name);
        },
        insertSheet: (name) => {
          sheetStore.sheets[name] = [];
          return sandbox.SpreadsheetApp._makeSheet(name);
        },
        deleteSheet: () => {}
      }),
      _makeSheet: (sheetName) => ({
        getName: () => sheetName,
        getLastRow: () => (sheetStore.sheets[sheetName] ? sheetStore.sheets[sheetName].length : 0),
        getLastColumn: () => {
          const rows = sheetStore.sheets[sheetName] || [];
          return rows.reduce((max, r) => Math.max(max, r.length), 0);
        },
        setFrozenRows: () => {},
        appendRow: (rowArray) => {
          if (!sheetStore.sheets[sheetName]) sheetStore.sheets[sheetName] = [];
          sheetStore.sheets[sheetName].push(rowArray);
          pendingOps.push({
            type: 'append',
            sheetName: sheetName,
            rows: [rowArray]
          });
        },
        getRange: (startRow, startCol, numRows, numCols) => ({
          getValues: () => {
            const rows = sheetStore.sheets[sheetName] || [];
            const result = [];
            for (let r = 0; r < numRows; r++) {
              const srcRow = rows[startRow - 1 + r] || [];
              const outRow = [];
              for (let c = 0; c < numCols; c++) {
                const v = srcRow[startCol - 1 + c];
                outRow.push(v === undefined || v === null ? '' : v);
              }
              result.push(outRow);
            }
            return result;
          },
          setValues: (newValues) => {
            if (!sheetStore.sheets[sheetName]) sheetStore.sheets[sheetName] = [];
            const rows = sheetStore.sheets[sheetName];
            for (let r = 0; r < newValues.length; r++) {
              const targetRowIdx = startRow - 1 + r;
              while (rows.length <= targetRowIdx) rows.push([]);
              for (let c = 0; c < newValues[r].length; c++) {
                rows[targetRowIdx][startCol - 1 + c] = newValues[r][c];
              }
            }
            pendingOps.push({
              type: 'update',
              sheetName: sheetName,
              startRow: startRow,
              startCol: startCol,
              numRows: numRows,
              numCols: numCols,
              rows: newValues
            });
          },
          setFontWeight: () => {},
          setBackground: () => {},
          setFontColor: () => {}
        })
      })
    }
  };

  vm.createContext(sandbox);
  const gsFiles = [
    'Config.gs',
    'Utils.gs',
    'Setup.gs',
    'AuthService.gs',
    'CategoryService.gs',
    'AccountService.gs',
    'TransactionService.gs',
    'DashboardService.gs',
    'SystemService.gs',
    'Code.gs'
  ];

  for (const file of gsFiles) {
    const code = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return sandbox;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

let writeQueue = Promise.resolve();

const server = http.createServer((req, res) => {
  // Enable CORS for Standalone Frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // API Endpoint (`/api` or `/macros/s/live/exec`)
  if (parsedUrl.pathname === '/api' || parsedUrl.pathname === '/macros/s/live/exec') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      writeQueue = writeQueue.then(async () => {
        try {
          await syncFromRealGoogleSheets();
          const pendingOps = [];
          const sandbox = createGasSandbox(pendingOps);

          let output;
          if (req.method === 'GET') {
            const params = Object.fromEntries(parsedUrl.searchParams.entries());
            output = sandbox.doGet({ parameter: params });
          } else {
            output = sandbox.doPost({ postData: { contents: body } });
          }

          await flushPendingWritesToGoogleSheets(pendingOps);

          const jsonText = output.getContent();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(jsonText);
        } catch (err) {
          console.error('[API Bridge Error]', err);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            error: { code: 'BRIDGE_ERROR', message: err.message }
          }));
        }
      });
    });
    return;
  }

  // Static Frontend Serving
  let relPath = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;
  const safePath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(FRONTEND_DIR, safePath);

  if (!filePath.startsWith(FRONTEND_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

syncFromRealGoogleSheets()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`================================================================`);
      console.log(`Personal Finance Manager Pro — Live Google Sheets Server Running`);
      console.log(`Frontend URL : http://localhost:${PORT}`);
      console.log(`Live GAS API : http://localhost:${PORT}/api`);
      console.log(`Spreadsheet  : https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
      console.log(`================================================================`);
    });
  })
  .catch((err) => {
    console.error('Failed initial sync with Google Sheets:', err);
    process.exit(1);
  });

