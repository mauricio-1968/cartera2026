const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'portfolio.db');
const isPostgres = !!process.env.DATABASE_URL;

let sqliteDb = null;
let pgPool = null;

if (isPostgres) {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log('🔗 Base de Datos Cloud PostgreSQL Activada (Persistencia 100% Permanente)');
} else {
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error abriendo SQLite:', err.message);
    else console.log('Base de Datos SQLite Local Conectada en:', dbPath);
  });
}

/**
 * Adaptador DB unificado que soporta llamadas por Callback (compatibilidad 100% con SQLite/Express)
 * y ejecuta sobre PostgreSQL en la nube o SQLite localmente.
 */
const db = {
  isPostgres,

  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];

    if (isPostgres) {
      let paramIdx = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err, null);
        callback(null, res.rows);
      });
    } else {
      sqliteDb.all(sql, params, callback);
    }
  },

  get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];

    if (isPostgres) {
      let paramIdx = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err, null);
        callback(null, res.rows[0] || null);
      });
    } else {
      sqliteDb.get(sql, params, callback);
    }
  },

  run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];
    callback = callback || function() {};

    if (isPostgres) {
      let paramIdx = 1;
      let pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);

      // Auto-retornar ID en INSERT para PostgreSQL
      if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }

      pgPool.query(pgSql, params, (err, res) => {
        if (err) return callback(err);
        const lastID = res && res.rows && res.rows[0] ? res.rows[0].id : null;
        const context = { lastID, changes: res ? res.rowCount : 0 };
        callback.call(context, null);
      });
    } else {
      sqliteDb.run(sql, params, callback);
    }
  },

  serialize(fn) {
    if (isPostgres) {
      fn();
    } else {
      sqliteDb.serialize(fn);
    }
  }
};

module.exports = db;
