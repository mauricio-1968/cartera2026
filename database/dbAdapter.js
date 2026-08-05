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
  console.log('🔗 Conectado a la base de datos PostgreSQL en la Nube (Persistencia 100% Permanente)');
} else {
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error abriendo SQLite:', err.message);
    else console.log('Base de datos SQLite local conectada en:', dbPath);
  });
}

/**
 * Adaptador de consultas unificado (SQLite + PostgreSQL)
 */
const dbAdapter = {
  isPostgres,
  
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (isPostgres) {
        // Convertir signos de interrogación ? a $1, $2... para PostgreSQL
        let paramIdx = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
        pgPool.query(pgSql, params, (err, res) => {
          if (err) return reject(err);
          resolve(res.rows);
        });
      } else {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      }
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (isPostgres) {
        let paramIdx = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
        pgPool.query(pgSql, params, (err, res) => {
          if (err) return reject(err);
          resolve(res.rows[0] || null);
        });
      } else {
        sqliteDb.get(sql, params, (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      }
    });
  },

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (isPostgres) {
        let paramIdx = 1;
        let pgSql = sql.replace(/\?/g, () => `$${paramIdx++}`);
        if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
          pgSql += ' RETURNING id';
        }
        pgPool.query(pgSql, params, (err, res) => {
          if (err) return reject(err);
          const lastID = res.rows && res.rows[0] ? res.rows[0].id : null;
          resolve({ lastID, changes: res.rowCount });
        });
      } else {
        sqliteDb.run(sql, params, function(err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }
};

module.exports = dbAdapter;
