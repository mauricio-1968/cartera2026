const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

const dbPath = path.join(__dirname, 'portfolio.db');
const excelPath = 'C:\\Users\\mmartinez\\OneDrive - DELLORTO\\Escritorio\\Portafolio 2026.xlsx';

const tickerMap = {
  'AMD': 'AMD',
  'AMZN': 'AMZN',
  'AOCL': 'AOCL',
  'APLD': 'APLD',
  'BLZE': 'BLZE',
  'CSCO': 'CSCO',
  'CUE BIO': 'CUE',
  'FCEL': 'FCEL',
  'GOOGLE CA': 'GOOGL',
  'IREN': 'IREN',
  'KOLD': 'KOLD',
  'LEU': 'LEU',
  'LNAI': 'LNAI',
  'META': 'META',
  'MSFT': 'MSFT',
  'MU': 'MU',
  'NVCR': 'NVCR',
  'NVDA': 'NVDA',
  'OUST': 'OUST',
  'QQQ': 'QQQ',
  'ROCKET LAB ': 'RKLB',
  'ROCKET LAB': 'RKLB',
  'SOFI': 'SOFI',
  'SPCX': 'SPCX',
  'TSLA': 'TSLA',
  'UEC': 'UEC',
  'VGT': 'VGT',
  'VOO SP&500 ETF': 'VOO',
  'XOM': 'XOM'
};

function parseDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const parts = String(val).split('/');
  if (parts.length === 3) {
    let m = parts[0].padStart(2, '0');
    let d = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function initDb() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error abriendo la base de datos:', err.message);
      return;
    }
    console.log('Base de datos SQLite conectada correctamente en:', dbPath);
  });

  db.serialize(() => {
    // 1. Tabla de transacciones
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        original_name TEXT,
        type TEXT DEFAULT 'BUY',
        buy_date TEXT,
        quantity REAL NOT NULL,
        buy_price REAL NOT NULL,
        buy_total REAL NOT NULL,
        stop_loss REAL,
        status TEXT DEFAULT 'open',
        sell_date TEXT,
        sell_quantity REAL,
        sell_price REAL,
        sell_total REAL,
        realized_gain REAL,
        days_held INTEGER,
        return_percent REAL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabla de historial de snapshots
    db.run(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT,
        total_value REAL,
        invested_value REAL,
        unrealized_gain REAL,
        realized_gain REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verificar si ya hay datos cargados
    db.get('SELECT COUNT(*) as count FROM transactions', [], (err, row) => {
      if (err) {
        console.error('Error al consultar transacciones:', err);
        return;
      }

      if (row.count === 0 && fs.existsSync(excelPath)) {
        console.log('Importando registros iniciales desde Portafolio 2026.xlsx...');
        try {
          const workbook = xlsx.readFile(excelPath, { raw: false, cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

          // La fila 4 contiene encabezados, las filas 5 en adelante son los datos
          const dataRows = rows.slice(4);
          let countInserted = 0;

          const stmt = db.prepare(`
            INSERT INTO transactions (
              notes, symbol, original_name, buy_date, quantity, buy_price, buy_total, stop_loss, status,
              sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          dataRows.forEach((r) => {
            const notes = r[0] ? String(r[0]).trim() : '';
            const rawTicker = r[1] ? String(r[1]).trim() : '';
            if (!rawTicker) return; // Saltar filas vacías

            const mappedSymbol = tickerMap[rawTicker] || rawTicker;
            const buyDate = parseDateStr(r[2]);
            const quantity = parseFloat(r[3]) || 0;
            const buyPrice = parseFloat(r[4]) || 0;
            const buyTotal = parseFloat(r[5]) || (quantity * buyPrice);
            const stopLoss = r[6] ? parseFloat(r[6]) : null;
            const rawStatus = r[7] ? String(r[7]).trim().toLowerCase() : 'open';
            const status = (rawStatus === 'cerrada' || rawStatus === 'closed') ? 'closed' : 'open';
            const sellDate = parseDateStr(r[8]);
            const sellQuantity = parseFloat(r[9]) || (status === 'closed' ? quantity : 0);
            const sellPrice = parseFloat(r[10]) || 0;
            const sellTotal = parseFloat(r[11]) || (status === 'closed' ? sellQuantity * sellPrice : 0);
            const realizedGain = parseFloat(r[12]) || (status === 'closed' ? sellTotal - buyTotal : 0);
            const daysHeld = parseInt(r[13]) || 0;
            const returnPercent = parseFloat(r[14]) || (status === 'closed' && buyTotal > 0 ? (realizedGain / buyTotal) * 100 : 0);

            stmt.run([
              notes, mappedSymbol, rawTicker, buyDate, quantity, buyPrice, buyTotal, stopLoss, status,
              sellDate, sellQuantity, sellPrice, sellTotal, realizedGain, daysHeld, returnPercent
            ]);
            countInserted++;
          });

          stmt.finalize();
          console.log(`¡Éxito! Se han importado ${countInserted} transacciones históricas a la base de datos.`);
        } catch (e) {
          console.error('Error al procesar el Excel:', e);
        }
      } else if (row.count > 0) {
        console.log(`La base de datos ya contiene ${row.count} transacciones.`);
      }
    });
  });

  return db;
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, dbPath, tickerMap };
