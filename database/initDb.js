const db = require('./dbAdapter');
const bcrypt = require('bcryptjs');

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

function initDb() {
  db.serialize(() => {
    // 1. Tabla de Usuarios
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Tabla de Transacciones
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        symbol VARCHAR(50) NOT NULL,
        original_name VARCHAR(255),
        type VARCHAR(20) DEFAULT 'BUY',
        buy_date VARCHAR(50),
        quantity NUMERIC NOT NULL,
        buy_price NUMERIC NOT NULL,
        buy_total NUMERIC NOT NULL,
        stop_loss NUMERIC,
        status VARCHAR(20) DEFAULT 'open',
        sell_date VARCHAR(50),
        sell_quantity NUMERIC,
        sell_price NUMERIC,
        sell_total NUMERIC,
        realized_gain NUMERIC,
        days_held INTEGER,
        return_percent NUMERIC,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Tabla de Snapshots
    db.run(`
      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        snapshot_date VARCHAR(50),
        total_value NUMERIC,
        invested_value NUMERIC,
        unrealized_gain NUMERIC,
        realized_gain NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear cuenta principal para Mauricio Martinez por defecto si no existe
    db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
      if (err) return;
      const count = row ? (row.count || row.COUNT || 0) : 0;
      if (parseInt(count) === 0) {
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
  });

  return db;
}

if (require.main === module) {
  initDb();
}

module.exports = { initDb, tickerMap };
