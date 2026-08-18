require('dotenv').config();
const path = require('path');
const fs = require('fs');

const isSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
const isPostgres = !isSupabase && !!process.env.DATABASE_URL;

if (isSupabase) {
  const supabaseDb = require('./supabaseAdapter');
  module.exports = supabaseDb;
} else if (isPostgres) {
  const { Pool } = require('pg');
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('🔗 Base de Datos Cloud PostgreSQL Activada (Persistencia 100% Permanente)');

  const db = {
    isPostgres: true,

    all(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      params = params || [];
      let paramIdx = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err, null);
        callback(null, res.rows);
      });
    },

    get(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      params = params || [];
      let paramIdx = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err, null);
        callback(null, res.rows[0] || null);
      });
    },

    run(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      params = params || [];
      callback = callback || function() {};
      let paramIdx = 1;
      let pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
      if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }
      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err);
        const lastID = res && res.rows && res.rows[0] ? res.rows[0].id : null;
        const context = { lastID, changes: res ? res.rowCount : 0 };
        callback.call(context, null);
      });
    },

    serialize(fn) {
      fn();
    }
  };

  module.exports = db;
} else {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'portfolio.db');
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error abriendo SQLite:', err.message);
    else console.log('Base de Datos SQLite Local Conectada en:', dbPath);
  });

  const db = {
    isPostgres: false,
    all(sql, params, callback) {
      sqliteDb.all(sql, params, callback);
    },
    get(sql, params, callback) {
      sqliteDb.get(sql, params, callback);
    },
    run(sql, params, callback) {
      sqliteDb.run(sql, params, callback);
    },
    serialize(fn) {
      sqliteDb.serialize(fn);
    }
  };

  module.exports = db;
}
