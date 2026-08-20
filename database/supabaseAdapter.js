require('dotenv').config();
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL || 'https://hjbbahrmfmfejwamihvy.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqYmJhaHJtZm1mZWp3YW1paHZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA3MDcwNiwiZXhwIjoyMTAyNjQ2NzA2fQ.X_2X0T1wfJ5o3sBgTr1uuFPGl60f1dSw4nM1WFKdcvg';

let client = null;
if (supabaseUrl && supabaseKey) {
  client = axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    timeout: 10000
  });
  console.log('⚡ Conectado a Base de Datos Supabase Cloud (Persistencia Global 100% Sincronizada):', supabaseUrl);
}

/**
 * Adaptador universal Supabase REST que traduce llamadas SQL a PostgREST
 */
const supabaseDb = {
  isSupabase: !!client,

  async all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];
    callback = callback || function() {};

    try {
      const cleanSql = sql.trim();
      const upperSql = cleanSql.toUpperCase();

      // 1. Transactions del usuario
      if (upperSql.includes('FROM TRANSACTIONS')) {
        let endpoint = '/transactions?select=*';
        if (upperSql.includes('USER_ID = ?') || upperSql.includes('USER_ID=')) {
          const userId = params[0] || 1;
          endpoint += `&user_id=eq.${userId}`;
        }
        if (upperSql.includes('STATUS = ?')) {
          const status = params[params.length - 1] || 'open';
          endpoint += `&status=eq.${status}`;
        }
        if (upperSql.includes('ORDER BY BUY_DATE DESC')) {
          endpoint += '&order=buy_date.desc&order=id.desc';
        } else if (upperSql.includes('ORDER BY BUY_DATE ASC')) {
          endpoint += '&order=buy_date.asc&order=id.asc';
        } else {
          endpoint += '&order=id.desc';
        }

        const res = await client.get(endpoint);
        return callback(null, res.data || []);
      }

      // 2. Watchlist del usuario
      if (upperSql.includes('FROM WATCHLIST')) {
        let endpoint = '/watchlist?select=*';
        if (upperSql.includes('SYMBOL')) {
          const sym = String(params[params.length - 1] || '').trim().toUpperCase();
          endpoint += `&symbol=eq.${encodeURIComponent(sym)}`;
        } else if (params.length > 0) {
          const userId = parseInt(params[0]) || 1;
          endpoint += `&user_id=eq.${userId}`;
        }
        endpoint += '&order=id.asc';
        const res = await client.get(endpoint);
        return callback(null, res.data || []);
      }

      // 3. Usuarios
      if (upperSql.includes('FROM USERS')) {
        const res = await client.get('/users?select=*');
        return callback(null, res.data || []);
      }

      // 4. Snapshots
      if (upperSql.includes('FROM PORTFOLIO_SNAPSHOTS')) {
        let endpoint = '/portfolio_snapshots?select=*';
        if (params.length > 0) {
          endpoint += `&user_id=eq.${params[0]}`;
        }
        endpoint += '&order=created_at.asc';
        const res = await client.get(endpoint);
        return callback(null, res.data || []);
      }

      callback(null, []);
    } catch (err) {
      console.error('Supabase all error:', err.message);
      callback(err, null);
    }
  },

  async get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];
    callback = callback || function() {};

    try {
      const cleanSql = sql.trim();
      const upperSql = cleanSql.toUpperCase();

      // 1. SELECT COUNT(*) as count FROM transactions
      if (upperSql.includes('COUNT') && upperSql.includes('FROM TRANSACTIONS')) {
        const res = await client.get('/transactions?select=id&limit=1', { headers: { 'Prefer': 'count=exact' } });
        const count = res.headers['content-range'] ? parseInt(res.headers['content-range'].split('/')[1]) : (res.data ? res.data.length : 0);
        return callback(null, { count: isNaN(count) ? 0 : count });
      }

      // 2. SELECT COUNT(*) as count FROM users
      if (upperSql.includes('COUNT') && upperSql.includes('FROM USERS')) {
        const res = await client.get('/users?select=id&limit=1', { headers: { 'Prefer': 'count=exact' } });
        const count = res.headers['content-range'] ? parseInt(res.headers['content-range'].split('/')[1]) : (res.data ? res.data.length : 0);
        return callback(null, { count: isNaN(count) ? 0 : count });
      }

      // 3. SELECT COUNT(*) as count FROM watchlist
      if (upperSql.includes('COUNT') && upperSql.includes('FROM WATCHLIST')) {
        const res = await client.get('/watchlist?select=id&limit=1', { headers: { 'Prefer': 'count=exact' } });
        const count = res.headers['content-range'] ? parseInt(res.headers['content-range'].split('/')[1]) : (res.data ? res.data.length : 0);
        return callback(null, { count: isNaN(count) ? 0 : count });
      }

      // 4. SELECT * FROM users WHERE email = ?
      if (upperSql.includes('FROM USERS') && upperSql.includes('EMAIL')) {
        const email = String(params[0] || '').trim().toLowerCase();
        const res = await client.get(`/users?select=*&email=eq.${encodeURIComponent(email)}`);
        return callback(null, res.data && res.data[0] ? res.data[0] : null);
      }

      // 5. SELECT * FROM users WHERE id = ?
      if (upperSql.includes('FROM USERS') && (upperSql.includes('WHERE ID =') || upperSql.includes('WHERE ID='))) {
        const id = params[0];
        const res = await client.get(`/users?select=*&id=eq.${id}`);
        return callback(null, res.data && res.data[0] ? res.data[0] : null);
      }

      // 6. SELECT * FROM transactions WHERE id = ?
      if (upperSql.includes('FROM TRANSACTIONS') && (upperSql.includes('WHERE ID =') || upperSql.includes('WHERE ID='))) {
        const id = params[0];
        const res = await client.get(`/transactions?select=*&id=eq.${id}`);
        return callback(null, res.data && res.data[0] ? res.data[0] : null);
      }

      // 7. SELECT * FROM transactions WHERE UPPER(symbol) = ? AND status = 'open'
      if (upperSql.includes('FROM TRANSACTIONS') && (upperSql.includes('SYMBOL') || upperSql.includes('STATUS'))) {
        const sym = String(params[0] || '').trim().toUpperCase();
        const res = await client.get(`/transactions?select=*&symbol=eq.${encodeURIComponent(sym)}&status=eq.open&order=id.desc&limit=1`);
        return callback(null, res.data && res.data[0] ? res.data[0] : null);
      }

      // 8. SELECT * FROM watchlist WHERE user_id = ? AND UPPER(symbol) = ?
      if (upperSql.includes('FROM WATCHLIST')) {
        const sym = String(params[params.length - 1] || '').trim().toUpperCase();
        const res = await client.get(`/watchlist?select=*&symbol=eq.${encodeURIComponent(sym)}`);
        return callback(null, res.data && res.data[0] ? res.data[0] : null);
      }

      callback(null, null);
    } catch (err) {
      console.error('Supabase get error:', err.message);
      callback(err, null);
    }
  },

  async run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    params = params || [];
    callback = callback || function() {};

    try {
      const cleanSql = sql.trim();
      const upperSql = cleanSql.toUpperCase();

      // 1. INSERT INTO transactions
      if (upperSql.startsWith('INSERT INTO TRANSACTIONS')) {
        let record = {};
        if (params.length === 9) {
          record = {
            user_id: params[0] || 1,
            symbol: params[1],
            original_name: params[2],
            type: 'BUY',
            buy_date: params[3],
            quantity: params[4],
            buy_price: params[5],
            buy_total: params[6],
            stop_loss: params[7] || null,
            status: 'open',
            notes: params[8] || ''
          };
        } else if (params.length === 15) {
          record = {
            user_id: params[0] || 1,
            symbol: params[1],
            original_name: params[2],
            type: 'BUY',
            buy_date: params[3],
            quantity: params[4],
            buy_price: params[5],
            buy_total: params[6],
            stop_loss: null,
            status: 'closed',
            sell_date: params[7],
            sell_quantity: params[8],
            sell_price: params[9],
            sell_total: params[10],
            realized_gain: params[11],
            days_held: params[12],
            return_percent: params[13],
            notes: params[14] || ''
          };
        } else if (params.length >= 17) {
          record = {
            user_id: params[0] || 1,
            symbol: params[1],
            original_name: params[2],
            type: params[3] || 'BUY',
            buy_date: params[4],
            quantity: params[5],
            buy_price: params[6],
            buy_total: params[7],
            stop_loss: params[8] || null,
            status: params[9] || 'open',
            sell_date: params[10] || null,
            sell_quantity: params[11] || null,
            sell_price: params[12] || null,
            sell_total: params[13] || null,
            realized_gain: params[14] !== undefined ? params[14] : null,
            days_held: params[15] !== undefined ? params[15] : null,
            return_percent: params[16] !== undefined ? params[16] : null,
            notes: params[17] || ''
          };
        }

        const res = await client.post('/transactions', record);
        const lastID = res.data && res.data[0] ? res.data[0].id : 1;
        return callback.call({ lastID, changes: 1 }, null);
      }

      // 2. UPDATE transactions (VENTA O EDICIÓN)
      if (upperSql.startsWith('UPDATE TRANSACTIONS')) {
        if (params.length >= 14) {
          // Edición completa de transacción cerrada:
          // [cleanSymbol, original_name, bDate, numQty, numBuyPrice, buyTotal, sDate, numQty, numSellPrice, sellTotal, realizedGain, daysHeld, returnPercent, notes, targetId, userId?]
          const targetId = params[14];
          const updateData = {
            symbol: params[0],
            original_name: params[1],
            buy_date: params[2],
            quantity: params[3],
            buy_price: params[4],
            buy_total: params[5],
            sell_date: params[6],
            sell_quantity: params[7],
            sell_price: params[8],
            sell_total: params[9],
            realized_gain: params[10],
            days_held: params[11],
            return_percent: params[12],
            notes: params[13] || ''
          };

          const res = await client.patch(`/transactions?id=eq.${targetId}`, updateData);
          return callback.call({ changes: res.data ? res.data.length : 1 }, null);
        } else if (upperSql.includes("STATUS = 'CLOSED'") || upperSql.includes('STATUS = ?') || upperSql.includes('REALIZED_GAIN = ?')) {
          // Venta de posición abierta: [sDate, sQty, sPrice, sellTotal, realizedGain, daysHeld, returnPercent, finalNotes, posId]
          const posId = params[params.length - 1];
          const updateData = {
            status: 'closed',
            sell_date: params[0],
            sell_quantity: params[1],
            sell_price: params[2],
            sell_total: params[3],
            realized_gain: params[4],
            days_held: params[5],
            return_percent: params[6],
            notes: params[7] || ''
          };

          const res = await client.patch(`/transactions?id=eq.${posId}`, updateData);
          return callback.call({ changes: res.data ? res.data.length : 1 }, null);
        } else {
          // Edición de posición abierta: [buy_date, numQty, numPrice, buyTotal, numStopLoss, notes, targetId, userId]
          const targetId = params[params.length - 2] || params[params.length - 1];
          const updateData = {
            buy_date: params[0],
            quantity: params[1],
            buy_price: params[2],
            buy_total: params[3],
            stop_loss: params[4] || null,
            notes: params[5] || ''
          };

          const res = await client.patch(`/transactions?id=eq.${targetId}`, updateData);
          return callback.call({ changes: res.data ? res.data.length : 1 }, null);
        }
      }

      // 3. DELETE FROM transactions
      if (upperSql.startsWith('DELETE FROM TRANSACTIONS')) {
        const targetId = params[0];
        const res = await client.delete(`/transactions?id=eq.${targetId}`);
        return callback.call({ changes: 1 }, null);
      }

      // 4. INSERT INTO watchlist
      if (upperSql.startsWith('INSERT INTO WATCHLIST')) {
        let userId = 1;
        let sym = '';
        if (params.length === 1) {
          sym = String(params[0] || '').trim().toUpperCase();
        } else if (params.length >= 2) {
          userId = parseInt(params[0]) || 1;
          sym = String(params[1] || '').trim().toUpperCase();
        }
        const res = await client.post('/watchlist', { user_id: userId, symbol: sym });
        return callback.call({ changes: 1 }, null);
      }

      // 5. DELETE FROM watchlist
      if (upperSql.startsWith('DELETE FROM WATCHLIST')) {
        const cleanSymbol = String(params[params.length - 1] || '').trim().toUpperCase();
        const res = await client.delete(`/watchlist?symbol=eq.${encodeURIComponent(cleanSymbol)}`);
        return callback.call({ changes: 1 }, null);
      }

      // 6. INSERT INTO users
      if (upperSql.startsWith('INSERT INTO USERS')) {
        let record = {};
        if (params.length === 1) {
          record = { id: 1, name: 'Mauricio Martinez', email: 'mauricio@cartera.com', password_hash: params[0] };
        } else if (params.length === 3) {
          record = { name: params[0], email: params[1], password_hash: params[2] };
        }
        const res = await client.post('/users', record);
        const lastID = res.data && res.data[0] ? res.data[0].id : 1;
        return callback.call({ lastID, changes: 1 }, null);
      }

      // 7. CREATE TABLE u otros comandos DDL (ignorados en REST)
      if (upperSql.startsWith('CREATE TABLE')) {
        return callback.call({ changes: 0 }, null);
      }

      callback.call({ changes: 0 }, null);
    } catch (err) {
      console.error('Supabase run error:', err.message, err.response ? err.response.data : '');
      callback(err);
    }
  },

  serialize(fn) {
    fn();
  }
};

module.exports = supabaseDb;
