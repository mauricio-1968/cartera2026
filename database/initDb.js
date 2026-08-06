const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'portfolio.db');
const excelPath = 'C:\\Users\\mmartinez\\OneDrive - DELLORTO\\Escritorio\\Portafolio 2026.xlsx';

const tickerMap = {
  'AMD': 'AMD',
  'AMZN': 'AMZN',
  'AOCL': 'AOCL',
  'APLD': 'APLD',
  'APP': 'APP',
  'APPS': 'APPS',
  'BLZE': 'BLZE',
  'CSCO': 'CSCO',
  'CUE BIO': 'CUE',
  'FCEL': 'FCEL',
  'GOOGLE CA': 'GOOGL',
  'IREN': 'IREN',
  'KOLD': 'KOLD',
  'KVYO': 'KVYO',
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
    console.log('Base de datos SQLite conectada en:', dbPath);
  });

  db.serialize(() => {
    // 1. Tabla de Usuarios
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabla de Transacciones con user_id
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Migrar tabla existente agregando columna user_id si no existe
    db.run(`ALTER TABLE transactions ADD COLUMN user_id INTEGER DEFAULT 1`, (err) => {
      // Ignorar error si la columna ya existe
    });

    // Crear cuenta de usuario principal Mauricio Martinez por defecto si no existe
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
      if (err) return;
      if (row.count === 0) {
        const passwordHash = bcrypt.hashSync('mauricio2026', 10);
        db.run(
          `INSERT INTO users (id, name, email, password_hash) VALUES (1, 'Mauricio Martinez', 'mauricio@cartera.com', ?)`,
          [passwordHash],
          function(err) {
            if (!err) console.log('Usuario principal creado: Mauricio Martinez (mauricio@cartera.com)');
          }
        );
      }
    });

    // 3. Tabla de Snapshots por usuario
    db.run(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
        snapshot_date TEXT,
        total_value REAL,
        invested_value REAL,
        unrealized_gain REAL,
        realized_gain REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verificar e importar registros históricos iniciales para el usuario 1
    db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = 1', [], (err, row) => {
      if (err) return;

      if (row.count === 0 && fs.existsSync(excelPath)) {
        console.log('Importando registros iniciales para Mauricio Martinez...');
        try {
          const workbook = xlsx.readFile(excelPath, { raw: false, cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

          const dataRows = rows.slice(4);
          let countInserted = 0;

          const stmt = db.prepare(`
            INSERT INTO transactions (
              user_id, notes, symbol, original_name, buy_date, quantity, buy_price, buy_total, stop_loss, status,
              sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          dataRows.forEach((r) => {
            const notes = r[0] ? String(r[0]).trim() : '';
            const rawTicker = r[1] ? String(r[1]).trim() : '';
            if (!rawTicker) return;

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
          console.log(`¡Éxito! Importadas ${countInserted} transacciones para Mauricio Martinez.`);
        } catch (e) {
          console.error('Error procesando el Excel:', e);
        }
      }
    });
  });

  return db;
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, dbPath, tickerMap };
