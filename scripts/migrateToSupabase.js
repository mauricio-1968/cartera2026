const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const initialTransactions = require('../database/seedData');

async function runMigration(connectionString) {
  if (!connectionString) {
    console.error('❌ Debes proporcionar una cadena de conexión a Supabase válida.');
    return;
  }

  console.log('🚀 Iniciando migración de Cartera 2026 hacia Supabase PostgreSQL...');
  console.log('🔗 Conectando a:', connectionString.replace(/:([^:@]+)@/, ':****@'));

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Probar conexión
    const testRes = await pool.query('SELECT NOW() as now, current_database() as db');
    console.log('✅ Conexión establecida con Supabase! Base de datos:', testRes.rows[0].db, 'Hora:', testRes.rows[0].now);

    // 2. Crear Tablas en Supabase
    console.log('📦 Creando esquema de tablas...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
      );

      CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        snapshot_date VARCHAR(50),
        total_value NUMERIC,
        invested_value NUMERIC,
        unrealized_gain NUMERIC,
        realized_gain NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        user_id INTEGER DEFAULT 1,
        symbol VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tablas creadas / verificadas en Supabase.');

    // 3. Crear Usuario Principal
    const userCheck = await pool.query('SELECT COUNT(*) as count FROM users WHERE email = $1', ['mauricio@cartera.com']);
    if (parseInt(userCheck.rows[0].count) === 0) {
      const passwordHash = bcrypt.hashSync('mauricio2026', 10);
      await pool.query(
        'INSERT INTO users (id, name, email, password_hash) VALUES (1, $1, $2, $3)',
        ['Mauricio Martinez', 'mauricio@cartera.com', passwordHash]
      );
      console.log('👤 Usuario principal creado: Mauricio Martinez (mauricio@cartera.com)');
    }

    // 4. Migrar Transacciones
    const txCheck = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE user_id = 1');
    const existingCount = parseInt(txCheck.rows[0].count);
    console.log(`📊 Transacciones existentes en Supabase: ${existingCount}`);

    if (existingCount === 0) {
      console.log(`🌱 Insertando ${initialTransactions.length} transacciones iniciales en Supabase...`);
      for (const t of initialTransactions) {
        await pool.query(
          `INSERT INTO transactions (
            user_id, symbol, original_name, type, buy_date, quantity, buy_price, buy_total, stop_loss, status, sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent, notes
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            t.symbol,
            t.original_name || t.symbol,
            t.type || 'BUY',
            t.buy_date,
            t.quantity,
            t.buy_price,
            t.buy_total,
            t.stop_loss || null,
            t.status || 'open',
            t.sell_date || null,
            t.sell_quantity || null,
            t.sell_price || null,
            t.sell_total || null,
            t.realized_gain !== undefined ? t.realized_gain : null,
            t.days_held !== undefined ? t.days_held : null,
            t.return_percent !== undefined ? t.return_percent : null,
            t.notes || ''
          ]
        );
      }
      console.log('✅ Transacciones migradas exitosamente!');
    }

    // 5. Migrar Watchlist por Defecto
    const wlCheck = await pool.query('SELECT COUNT(*) as count FROM watchlist WHERE user_id = 1');
    if (parseInt(wlCheck.rows[0].count) === 0) {
      const defaultWatchlist = ['PLTR', 'AMD', 'MARA', 'SMCI'];
      for (const sym of defaultWatchlist) {
        await pool.query('INSERT INTO watchlist (user_id, symbol) VALUES (1, $1)', [sym]);
      }
      console.log('🎯 Radar de oportunidades inicializado con: PLTR, AMD, MARA, SMCI');
    }

    // 6. Resumen de Verificación
    const openCount = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE status = 'open' AND user_id = 1");
    const closedCount = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE status = 'closed' AND user_id = 1");
    console.log('\n========================================');
    console.log('🎉 MIGRACIÓN A SUPABASE COMPLETADA CON ÉXITO!');
    console.log(`🟢 Posiciones Abiertas en Supabase: ${openCount.rows[0].count}`);
    console.log(`🔴 Posiciones Cerradas en Supabase: ${closedCount.rows[0].count}`);
    console.log('========================================\n');

  } catch (err) {
    console.error('❌ Error durante la migración:', err);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const connStr = process.argv[2] || process.env.DATABASE_URL;
  runMigration(connStr);
}

module.exports = runMigration;
