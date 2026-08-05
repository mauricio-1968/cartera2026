const express = require('express');
// Portrack Server v1.0.5 - Clean Open Positions Sync
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { initDb, dbPath, tickerMap } = require('./database/initDb');
const { getStockPrices, getIntradayChartData } = require('./services/stockPriceService');
const { getPortfolioNews } = require('./services/newsService');
const { analyzePositionForecast } = require('./services/forecastService');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cartera_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar la base de datos
const db = initDb();

// Configurar multer para subida de archivos Excel
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ==========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Si no hay token, usar usuario por defecto ID 1 (Mauricio Martinez)
    req.user = { id: 1, name: 'Mauricio Martinez', email: 'mauricio@cartera.com' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = { id: 1, name: 'Mauricio Martinez', email: 'mauricio@cartera.com' };
      return next();
    }
    req.user = user;
    next();
  });
}

// ==========================================
// ENDPOINTS DE AUTENTICACIÓN
// ==========================================

// 1. Registro de nuevo usuario
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 10);

  const stmt = db.prepare(`
    INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)
  `);

  stmt.run([name.trim(), cleanEmail, passwordHash], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado. Intenta iniciar sesión.' });
      }
      return res.status(500).json({ error: err.message });
    }

    const userId = this.lastID;
    const userPayload = { id: userId, name: name.trim(), email: cleanEmail };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Cuenta creada con éxito',
      token,
      user: userPayload
    });
  });
});

// 2. Inicio de sesión (Login)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son requeridos' });
  }

  const cleanEmail = email.trim().toLowerCase();

  db.get('SELECT * FROM users WHERE email = ?', [cleanEmail], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    const userPayload = { id: user.id, name: user.name, email: user.email };
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: userPayload
    });
  });
});

// 3. Obtener usuario actual en sesión
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ==========================================
// ENDPOINTS DE PORTAFOLIO Y TRANSACCIONES
// ==========================================

// 1. Resumen General del Portafolio del usuario autenticado
app.get('/api/portfolio/summary', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY buy_date DESC, id DESC', [userId], async (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Filtrado estricto de las 8 posiciones abiertas (excluyendo transacciones cerradas como APPS)
    const openRows = rows.filter(r => r.status === 'open' && r.id !== 32 && r.symbol !== 'APPS');
    const closedRows = rows.filter(r => r.status === 'closed' || r.id === 32 || r.symbol === 'APPS');

    const openSymbols = openRows.map(r => r.symbol);
    const livePrices = await getStockPrices(openSymbols);

    let totalOpenInvested = 0;
    let currentPortfolioValue = 0;
    let totalDailyChangeDollar = 0;

    const openPositions = openRows.map(row => {
      const live = livePrices[row.symbol] || { price: row.buy_price, change: 0, changePercent: 0, prevClose: row.buy_price };
      const currentPrice = live.price;
      const currentValue = row.quantity * currentPrice;
      const unrealizedGain = currentValue - row.buy_total;
      const unrealizedGainPercent = row.buy_total > 0 ? (unrealizedGain / row.buy_total) * 100 : 0;
      const dailyChange = row.quantity * (currentPrice - live.prevClose);

      totalOpenInvested += row.buy_total;
      currentPortfolioValue += currentValue;
      totalDailyChangeDollar += dailyChange;

      let daysHeld = 0;
      if (row.buy_date) {
        const bDate = new Date(row.buy_date);
        const today = new Date();
        const diffTime = Math.abs(today - bDate);
        daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const forecast = analyzePositionForecast({
        symbol: row.symbol,
        buy_price: row.buy_price,
        livePrice: currentPrice,
        unrealizedGainPercent: unrealizedGainPercent,
        daysHeld: daysHeld,
        stop_loss: row.stop_loss
      });

      return {
        ...row,
        livePrice: currentPrice,
        prevClose: live.prevClose,
        change: live.change,
        changePercent: live.changePercent,
        currentValue: Number(currentValue.toFixed(2)),
        unrealizedGain: Number(unrealizedGain.toFixed(2)),
        unrealizedGainPercent: Number(unrealizedGainPercent.toFixed(2)),
        dailyChange: Number(dailyChange.toFixed(2)),
        daysHeld: daysHeld,
        forecast: forecast
      };
    });

    const unrealizedGainTotal = currentPortfolioValue - totalOpenInvested;
    const unrealizedGainPercentTotal = totalOpenInvested > 0 ? (unrealizedGainTotal / totalOpenInvested) * 100 : 0;

    let totalClosedInvested = 0;
    let totalClosedReturned = 0;
    let totalRealizedGain = 0;
    let winningTrades = 0;

    closedRows.forEach(row => {
      totalClosedInvested += (row.buy_total || 0);
      totalClosedReturned += (row.sell_total || 0);
      totalRealizedGain += (row.realized_gain || 0);
      if ((row.realized_gain || 0) > 0) winningTrades++;
    });

    const realizedGainPercentTotal = totalClosedInvested > 0 ? (totalRealizedGain / totalClosedInvested) * 100 : 0;
    const winRatePercent = closedRows.length > 0 ? (winningTrades / closedRows.length) * 100 : 0;

    const allocationMap = {};
    openPositions.forEach(p => {
      allocationMap[p.symbol] = (allocationMap[p.symbol] || 0) + p.currentValue;
    });

    const allocation = Object.keys(allocationMap).map(sym => ({
      symbol: sym,
      value: Number(allocationMap[sym].toFixed(2)),
      percentage: currentPortfolioValue > 0 ? Number(((allocationMap[sym] / currentPortfolioValue) * 100).toFixed(2)) : 0
    }));

    const news = await getPortfolioNews(openSymbols);

    res.json({
      summary: {
        totalPortfolioValue: Number(currentPortfolioValue.toFixed(2)),
        totalOpenInvested: Number(totalOpenInvested.toFixed(2)),
        unrealizedGain: Number(unrealizedGainTotal.toFixed(2)),
        unrealizedGainPercent: Number(unrealizedGainPercentTotal.toFixed(2)),
        dailyChangeDollar: Number(totalDailyChangeDollar.toFixed(2)),
        totalClosedInvested: Number(totalClosedInvested.toFixed(2)),
        totalClosedReturned: Number(totalClosedReturned.toFixed(2)),
        totalRealizedGain: Number(totalRealizedGain.toFixed(2)),
        realizedGainPercent: Number(realizedGainPercentTotal.toFixed(2)),
        openPositionsCount: openPositions.length,
        closedPositionsCount: closedRows.length,
        totalTransactionsCount: rows.length,
        winRatePercent: Number(winRatePercent.toFixed(1)),
        updatedAt: new Date().toISOString()
      },
      openPositions,
      closedPositions: closedRows,
      allocation,
      news
    });
  });
});

// 2. Obtener lista de transacciones del usuario
app.get('/api/transactions', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const status = req.query.status;

  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY buy_date DESC, id DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 3. Registrar una nueva Compra (BUY) para el usuario
app.post('/api/transactions/buy', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { symbol, original_name, buy_date, quantity, buy_price, stop_loss, notes } = req.body;

  if (!symbol || !quantity || !buy_price) {
    return res.status(400).json({ error: 'Símbolo, cantidad y precio de compra son requeridos' });
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  const numQty = parseFloat(quantity);
  const numPrice = parseFloat(buy_price);
  const buyTotal = numQty * numPrice;
  const numStopLoss = stop_loss ? parseFloat(stop_loss) : null;
  const bDate = buy_date || new Date().toISOString().split('T')[0];

  const stmt = db.prepare(`
    INSERT INTO transactions (
      user_id, symbol, original_name, type, buy_date, quantity, buy_price, buy_total, stop_loss, status, notes
    ) VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, 'open', ?)
  `);

  stmt.run([userId, cleanSymbol, original_name || cleanSymbol, bDate, numQty, numPrice, buyTotal, numStopLoss, notes || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compra registrada con éxito', id: this.lastID });
  });
});

// 4. Registrar una Venta (SELL)
app.post('/api/transactions/sell', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { id, sell_date, sell_price, notes } = req.body;

  if (!id || !sell_price) {
    return res.status(400).json({ error: 'ID de transacción y precio de venta son requeridos' });
  }

  const targetId = parseInt(id);
  const sPrice = parseFloat(sell_price);
  const sDate = sell_date || new Date().toISOString().split('T')[0];

  db.get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [targetId, userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Posición no encontrada' });

    const sQty = row.quantity;
    const sellTotal = sQty * sPrice;
    const realizedGain = sellTotal - row.buy_total;
    const returnPercent = row.buy_total > 0 ? (realizedGain / row.buy_total) * 100 : 0;

    const bDate = new Date(row.buy_date || Date.now());
    const sDateObj = new Date(sDate);
    const diffTime = Math.abs(sDateObj - bDate);
    const daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    const sql = `
      UPDATE transactions SET
        status = 'closed',
        sell_date = ?,
        sell_quantity = ?,
        sell_price = ?,
        sell_total = ?,
        realized_gain = ?,
        days_held = ?,
        return_percent = ?,
        notes = ?
      WHERE id = ? AND user_id = ?
    `;

    db.run(sql, [sDate, sQty, sPrice, sellTotal, realizedGain, daysHeld, returnPercent, notes || row.notes, targetId, userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Venta realizada y posición cerrada con éxito', id: targetId });
    });
  });
});

// 5. Editar una transacción
app.post('/api/transactions/edit', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { id, buy_date, quantity, buy_price, stop_loss, notes } = req.body;

  if (!id || !buy_price || !quantity) {
    return res.status(400).json({ error: 'ID, precio y cantidad son requeridos' });
  }

  const numQty = parseFloat(quantity);
  const numPrice = parseFloat(buy_price);
  const buyTotal = numQty * numPrice;
  const numStopLoss = stop_loss ? parseFloat(stop_loss) : null;

  const sql = `
    UPDATE transactions SET
      buy_date = ?,
      quantity = ?,
      buy_price = ?,
      buy_total = ?,
      stop_loss = ?,
      notes = ?
    WHERE id = ? AND user_id = ?
  `;

  db.run(sql, [buy_date, numQty, numPrice, buyTotal, numStopLoss, notes || '', id, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Transacción actualizada con éxito', id });
  });
});

// 6. Eliminar una transacción
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Registro eliminado', changes: this.changes });
  });
});

// 7. Consultar precios en tiempo real
app.get('/api/prices', async (req, res) => {
  const symbols = req.query.symbols ? req.query.symbols.split(',') : ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META'];
  const prices = await getStockPrices(symbols);
  res.json(prices);
});

// 6b. Endpoint de gráfico intradiario (cada 30 min)
app.get('/api/chart/intraday', async (req, res) => {
  const symbol = req.query.symbol || 'TSLA';
  const data = await getIntradayChartData(symbol);
  res.json(data);
});

// 6c. Endpoint de gráfico histórico de la cartera (Valor Total vs Tiempo)
app.get('/api/chart/historical-portfolio', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY buy_date ASC, id ASC', [userId], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!rows || rows.length === 0) {
      return res.json({ timeline: [] });
    }

    const openSymbols = [...new Set(rows.filter(r => r.status === 'open').map(r => r.symbol))];
    const livePrices = await getStockPrices(openSymbols);

    // Agrupar operaciones por fecha
    const dateMap = {};
    let cumInvested = 0;
    let cumRealizedGain = 0;

    rows.forEach(r => {
      const dStr = r.buy_date || new Date().toISOString().split('T')[0];
      if (!dateMap[dStr]) {
        dateMap[dStr] = { date: dStr, invested: 0, closedGain: 0, items: [] };
      }
      dateMap[dStr].items.push(r);
    });

    const datesSorted = Object.keys(dateMap).sort();
    const timeline = [];

    // Calcular valuaciones evolutivas
    let currentInvested = 0;
    let currentRealized = 0;
    const activeHoldings = {}; // symbol -> { qty, buyTotal }

    datesSorted.forEach(dStr => {
      const dayData = dateMap[dStr];

      dayData.items.forEach(item => {
        if (item.status === 'open') {
          currentInvested += (item.buy_total || 0);
          if (!activeHoldings[item.symbol]) {
            activeHoldings[item.symbol] = { qty: 0, total: 0 };
          }
          activeHoldings[item.symbol].qty += item.quantity;
          activeHoldings[item.symbol].total += item.buy_total;
        } else if (item.status === 'closed') {
          currentRealized += (item.realized_gain || 0);
        }
      });

      // Calcular valor de las posiciones abiertas a la fecha o precio actual
      let valAtDate = 0;
      Object.keys(activeHoldings).forEach(sym => {
        const holding = activeHoldings[sym];
        const live = livePrices[sym];
        const price = live ? live.price : (holding.qty > 0 ? holding.total / holding.qty : 100);
        valAtDate += holding.qty * price;
      });

      timeline.push({
        date: dStr,
        invested: Number(currentInvested.toFixed(2)),
        realizedGain: Number(currentRealized.toFixed(2)),
        totalValue: Number((valAtDate + currentRealized).toFixed(2)),
        netGain: Number((valAtDate + currentRealized - currentInvested).toFixed(2))
      });
    });

    // Agregar hito final (Hoy) si la última fecha no es hoy
    const todayStr = new Date().toISOString().split('T')[0];
    if (timeline.length > 0 && timeline[timeline.length - 1].date !== todayStr) {
      let finalVal = 0;
      Object.keys(activeHoldings).forEach(sym => {
        const holding = activeHoldings[sym];
        const live = livePrices[sym];
        const price = live ? live.price : (holding.qty > 0 ? holding.total / holding.qty : 100);
        finalVal += holding.qty * price;
      });

      timeline.push({
        date: todayStr + ' (Hoy)',
        invested: Number(currentInvested.toFixed(2)),
        realizedGain: Number(currentRealized.toFixed(2)),
        totalValue: Number((finalVal + currentRealized).toFixed(2)),
        netGain: Number((finalVal + currentRealized - currentInvested).toFixed(2))
      });
    }

    res.json({ timeline });
  });
});

// 9. Importar archivo Excel o CSV para el usuario autenticado
app.post('/api/import-excel', authenticateToken, upload.single('file'), (req, res) => {
  const userId = req.user.id;
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ningún archivo' });
  }

  const filePath = req.file.path;
  try {
    const workbook = xlsx.readFile(filePath, { raw: false, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });

    let count = 0;
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const rStr = rows[i].join(' ').toLowerCase();
      if (rStr.includes('accion') || rStr.includes('ticker') || rStr.includes('compras') || rStr.includes('symbol')) {
        headerIdx = i;
        break;
      }
    }

    const dataRows = headerIdx !== -1 ? rows.slice(headerIdx + 1) : rows;

    const stmt = db.prepare(`
      INSERT INTO transactions (
        user_id, notes, symbol, original_name, buy_date, quantity, buy_price, buy_total, stop_loss, status,
        sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    dataRows.forEach(r => {
      if (!r || r.length < 2) return;
      const notes = r[0] ? String(r[0]).trim() : '';
      const rawTicker = r[1] ? String(r[1]).trim() : '';
      if (!rawTicker || rawTicker.toLowerCase().includes('acciones')) return;

      const symbol = tickerMap[rawTicker] || rawTicker;
      const buyDate = r[2] ? String(r[2]).trim() : new Date().toISOString().split('T')[0];
      const quantity = parseFloat(r[3]) || 0;
      const buyPrice = parseFloat(r[4]) || 0;
      const buyTotal = parseFloat(r[5]) || (quantity * buyPrice);
      const stopLoss = r[6] ? parseFloat(r[6]) : null;
      const rawStatus = r[7] ? String(r[7]).trim().toLowerCase() : 'open';
      const status = (rawStatus === 'cerrada' || rawStatus === 'closed') ? 'closed' : 'open';
      const sellDate = r[8] ? String(r[8]).trim() : null;
      const sellQuantity = parseFloat(r[9]) || (status === 'closed' ? quantity : 0);
      const sellPrice = parseFloat(r[10]) || 0;
      const sellTotal = parseFloat(r[11]) || (status === 'closed' ? sellQuantity * sellPrice : 0);
      const realizedGain = parseFloat(r[12]) || (status === 'closed' ? sellTotal - buyTotal : 0);
      const daysHeld = parseInt(r[13]) || 0;
      const returnPercent = parseFloat(r[14]) || (status === 'closed' && buyTotal > 0 ? (realizedGain / buyTotal) * 100 : 0);

      if (symbol && quantity > 0) {
        stmt.run([
          userId, notes, symbol, rawTicker, buyDate, quantity, buyPrice, buyTotal, stopLoss, status,
          sellDate, sellQuantity, sellPrice, sellTotal, realizedGain, daysHeld, returnPercent
        ]);
        count++;
      }
    });

    stmt.finalize();
    fs.unlinkSync(filePath);
    res.json({ message: `Se importaron ${count} operaciones correctamente desde el Excel.`, count });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Error al procesar el archivo Excel: ' + err.message });
  }
});

// 10. Exportar base de datos del usuario a Excel
app.get('/api/export-excel', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY buy_date DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const exportData = rows.map(r => ({
      'ID': r.id,
      'Ticker (Símbolo)': r.symbol,
      'Nombre Original': r.original_name,
      'Tipo': r.type,
      'Fecha Compra': r.buy_date,
      'Cantidad Acciones': r.quantity,
      'Precio Compra US$': r.buy_price,
      'Inversión Total US$': r.buy_total,
      'Stop Loss US$': r.stop_loss || '',
      'Estado': r.status === 'open' ? 'Abierta' : 'Cerrada',
      'Fecha Venta': r.sell_date || '',
      'Cantidad Vendida': r.sell_quantity || '',
      'Precio Venta US$': r.sell_price || '',
      'Total Venta US$': r.sell_total || '',
      'Ganancia Realizada US$': r.realized_gain || '',
      'Días en Cartera': r.days_held || '',
      'Rentabilidad %': r.return_percent ? `${r.return_percent.toFixed(2)}%` : '',
      'Notas': r.notes || ''
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Cartera de Acciones');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Portrack_Cartera_Export.xlsx"');
    res.send(buffer);
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor Portrack corriendo LOCALMENTE en: http://127.0.0.1:${PORT}`);
  console.log(`====================================================`);
});
