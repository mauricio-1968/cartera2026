const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./database/dbAdapter');
const { initDb, tickerMap } = require('./database/initDb');
const { getStockPrices, getIntradayChartData } = require('./services/stockPriceService');
const { getPortfolioNews } = require('./services/newsService');
const { analyzePositionForecast } = require('./services/forecastService');
const { getTechnicalAnalysis } = require('./services/technicalAnalysisService');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'cartera_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar la base de datos (PostgreSQL Cloud o SQLite Local)
initDb();

// Configurar multer para subida de archivos Excel
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// ==========================================
// MIDDLEWARE DE AUTENTICACIÓN
// ==========================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
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

  const sql = 'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)';
  db.run(sql, [name.trim(), cleanEmail, passwordHash], function(err) {
    if (err) {
      if (String(err.message).includes('UNIQUE') || String(err.message).includes('unique')) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado. Intenta iniciar sesión.' });
      }
      return res.status(500).json({ error: err.message });
    }

    const userId = this.lastID || 1;
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

    rows = rows || [];
    const openRows = rows.filter(r => r.status === 'open');
    const closedRows = rows.filter(r => r.status === 'closed');

    const openSymbols = openRows.map(r => r.symbol);
    const livePrices = await getStockPrices(openSymbols);

    let totalOpenInvested = 0;
    let currentPortfolioValue = 0;
    let totalDailyChangeDollar = 0;

    const openPositions = openRows.map(row => {
      const live = livePrices[row.symbol] || { price: parseFloat(row.buy_price), change: 0, changePercent: 0, prevClose: parseFloat(row.buy_price) };
      const currentPrice = parseFloat(live.price);
      const buyTotal = parseFloat(row.buy_total);
      const quantity = parseFloat(row.quantity);

      const currentValue = quantity * currentPrice;
      const unrealizedGain = currentValue - buyTotal;
      const unrealizedGainPercent = buyTotal > 0 ? (unrealizedGain / buyTotal) * 100 : 0;
      const dailyChange = quantity * (currentPrice - parseFloat(live.prevClose || currentPrice));

      totalOpenInvested += buyTotal;
      currentPortfolioValue += currentValue;
      totalDailyChangeDollar += dailyChange;

      let daysHeld = 0;
      if (row.buy_date) {
        const bDate = new Date(row.buy_date);
        const today = new Date();
        const diffTime = Math.abs(today - bDate);
        daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      }

      const forecast = analyzePositionForecast({
        symbol: row.symbol,
        buy_price: parseFloat(row.buy_price),
        livePrice: currentPrice,
        unrealizedGainPercent: unrealizedGainPercent,
        daysHeld: daysHeld,
        stop_loss: row.stop_loss ? parseFloat(row.stop_loss) : null
      });

      return {
        ...row,
        quantity: parseFloat(row.quantity),
        buy_price: parseFloat(row.buy_price),
        buy_total: parseFloat(row.buy_total),
        livePrice: currentPrice,
        prevClose: parseFloat(live.prevClose || currentPrice),
        change: parseFloat(live.change || 0),
        changePercent: parseFloat(live.changePercent || 0),
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

    // Ordenar posiciones cerradas por fecha de venta DESC (las ventas más recientes arriba de todo)
    const sortedClosedRows = [...closedRows].sort((a, b) => {
      const dateA = a.sell_date ? new Date(a.sell_date).getTime() : (a.buy_date ? new Date(a.buy_date).getTime() : 0);
      const dateB = b.sell_date ? new Date(b.sell_date).getTime() : (b.buy_date ? new Date(b.buy_date).getTime() : 0);
      return (dateB - dateA) || ((b.id || 0) - (a.id || 0));
    });

    const formattedClosedRows = sortedClosedRows.map(row => {
      const buyTotal = parseFloat(row.buy_total || 0);
      const sQty = parseFloat(row.sell_quantity || row.quantity || 0);
      const sPrice = parseFloat(row.sell_price || 0);
      const sellTotal = parseFloat(row.sell_total || (sQty * sPrice));
      const gain = row.realized_gain !== undefined && row.realized_gain !== null ? parseFloat(row.realized_gain) : (sellTotal - buyTotal);

      totalClosedInvested += buyTotal;
      totalClosedReturned += sellTotal;
      totalRealizedGain += gain;
      if (gain > 0) winningTrades++;

      return {
        ...row,
        quantity: parseFloat(row.quantity),
        buy_price: parseFloat(row.buy_price || 0),
        buy_total: Number(buyTotal.toFixed(2)),
        sell_date: row.sell_date || '',
        sell_quantity: sQty,
        sell_price: Number(sPrice.toFixed(2)),
        sell_total: Number(sellTotal.toFixed(2)),
        realized_gain: Number(gain.toFixed(2)),
        return_percent: Number((row.return_percent !== undefined && row.return_percent !== null ? parseFloat(row.return_percent) : (buyTotal > 0 ? (gain / buyTotal) * 100 : 0)).toFixed(2))
      };
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
      closedPositions: formattedClosedRows,
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

  const sql = `
    INSERT INTO transactions (
      user_id, symbol, original_name, type, buy_date, quantity, buy_price, buy_total, stop_loss, status, notes
    ) VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, ?, 'open', ?)
  `;

  db.run(sql, [userId, cleanSymbol, original_name || cleanSymbol, bDate, numQty, numPrice, buyTotal, numStopLoss, notes || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Compra registrada con éxito', id: this ? this.lastID : 1 });
  });
});

// 4. Registrar una Venta (SELL)
app.post('/api/transactions/sell', authenticateToken, (req, res) => {
  let { id, symbol, sell_date, sell_price, notes } = req.body;

  if (sell_price !== undefined && sell_price !== null && sell_price !== '') {
    sell_price = parseFloat(String(sell_price).replace(',', '.').trim());
  }

  if (!sell_price || isNaN(sell_price) || sell_price <= 0) {
    return res.status(400).json({ error: 'Por favor ingresa un precio de venta válido mayor a 0.' });
  }

  const sPrice = sell_price;
  const sDate = sell_date || new Date().toISOString().split('T')[0];
  const targetId = (id !== undefined && id !== null && String(id).trim() !== '') ? parseInt(id) : null;
  const cleanSymbol = symbol ? symbol.trim().toUpperCase() : null;

  let findSql = '';
  let findParams = [];

  if (targetId && !isNaN(targetId)) {
    findSql = 'SELECT * FROM transactions WHERE id = ?';
    findParams = [targetId];
  } else if (cleanSymbol) {
    findSql = "SELECT * FROM transactions WHERE UPPER(symbol) = ? AND status = 'open' ORDER BY id DESC LIMIT 1";
    findParams = [cleanSymbol];
  } else {
    return res.status(400).json({ error: 'ID de transacción o símbolo de acción es requerido.' });
  }

  db.get(findSql, findParams, (err, row) => {
    if (err) return res.status(500).json({ error: 'Error consultando base de datos: ' + err.message });
    if (!row) return res.status(404).json({ error: `Posición ${cleanSymbol || '#' + targetId} no encontrada entre las posiciones abiertas.` });

    const posId = row.id;
    const sQty = parseFloat(row.quantity || 0);
    const buyPrice = parseFloat(row.buy_price || 0);
    const buyTotal = parseFloat(row.buy_total || (sQty * buyPrice));
    const sellTotal = Number((sQty * sPrice).toFixed(2));
    const realizedGain = Number((sellTotal - buyTotal).toFixed(2));
    const returnPercent = buyTotal > 0 ? Number(((realizedGain / buyTotal) * 100).toFixed(2)) : 0;

    let daysHeld = 1;
    if (row.buy_date) {
      try {
        const bDate = new Date(row.buy_date);
        const sDateObj = new Date(sDate);
        const diffTime = Math.abs(sDateObj - bDate);
        daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      } catch (e) {
        daysHeld = 1;
      }
    }

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
      WHERE id = ?
    `;

    const finalNotes = notes !== undefined && notes !== null ? notes : (row.notes || '');

    db.run(sql, [sDate, sQty, sPrice, sellTotal, realizedGain, daysHeld, returnPercent, finalNotes, posId], function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar transacción: ' + err.message });
      res.json({
        message: `Venta de ${row.symbol} registrada con éxito. Ganancia: ${realizedGain >= 0 ? '+' : ''}$${realizedGain} (${returnPercent}%)`,
        id: posId,
        symbol: row.symbol,
        realizedGain,
        returnPercent
      });
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

  const targetId = parseInt(id);
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

  db.run(sql, [buy_date, numQty, numPrice, buyTotal, numStopLoss, notes || '', targetId, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Transacción actualizada con éxito', id: targetId });
  });
});

// 5b. Registrar una Venta Histórica directamente (o Reingreso de Registro)
app.post('/api/transactions/historical', authenticateToken, (req, res) => {
  const userId = req.user.id;
  let { symbol, original_name, buy_date, quantity, buy_price, sell_date, sell_price, notes } = req.body;

  if (!symbol || !quantity || !buy_price || !sell_price) {
    return res.status(400).json({ error: 'Ticker, cantidad, precio de compra y precio de venta son requeridos.' });
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  const numQty = parseFloat(String(quantity).replace(',', '.'));
  const numBuyPrice = parseFloat(String(buy_price).replace(',', '.'));
  const numSellPrice = parseFloat(String(sell_price).replace(',', '.'));

  if (isNaN(numQty) || numQty <= 0 || isNaN(numBuyPrice) || numBuyPrice <= 0 || isNaN(numSellPrice) || numSellPrice <= 0) {
    return res.status(400).json({ error: 'Por favor ingresa valores numéricos válidos mayores a 0.' });
  }

  const bDate = buy_date || new Date().toISOString().split('T')[0];
  const sDate = sell_date || new Date().toISOString().split('T')[0];
  const buyTotal = Number((numQty * numBuyPrice).toFixed(2));
  const sellTotal = Number((numQty * numSellPrice).toFixed(2));
  const realizedGain = Number((sellTotal - buyTotal).toFixed(2));
  const returnPercent = buyTotal > 0 ? Number(((realizedGain / buyTotal) * 100).toFixed(2)) : 0;

  let daysHeld = 1;
  try {
    const diffTime = Math.abs(new Date(sDate) - new Date(bDate));
    daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  } catch (e) {
    daysHeld = 1;
  }

  const sql = `
    INSERT INTO transactions (
      user_id, symbol, original_name, type, buy_date, quantity, buy_price, buy_total, stop_loss, status, sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent, notes
    ) VALUES (?, ?, ?, 'BUY', ?, ?, ?, ?, NULL, 'closed', ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      userId,
      cleanSymbol,
      original_name || cleanSymbol,
      bDate,
      numQty,
      numBuyPrice,
      buyTotal,
      sDate,
      numQty,
      numSellPrice,
      sellTotal,
      realizedGain,
      daysHeld,
      returnPercent,
      notes || ''
    ],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error al registrar venta histórica: ' + err.message });
      res.json({
        message: `Venta histórica de ${cleanSymbol} registrada con éxito. Ganancia: ${realizedGain >= 0 ? '+' : ''}$${realizedGain} (${returnPercent}%)`,
        id: this ? this.lastID : 1
      });
    }
  );
});

// 5c. Editar una Venta Histórica existente (Cerrada)
app.post('/api/transactions/edit-closed', authenticateToken, (req, res) => {
  const userId = req.user.id;
  let { id, symbol, original_name, buy_date, quantity, buy_price, sell_date, sell_price, notes } = req.body;

  if (!id || !symbol || !quantity || !buy_price || !sell_price) {
    return res.status(400).json({ error: 'ID, Ticker, cantidad, precio de compra y precio de venta son requeridos.' });
  }

  const targetId = parseInt(id);
  const cleanSymbol = symbol.trim().toUpperCase();
  const numQty = parseFloat(String(quantity).replace(',', '.'));
  const numBuyPrice = parseFloat(String(buy_price).replace(',', '.'));
  const numSellPrice = parseFloat(String(sell_price).replace(',', '.'));

  if (isNaN(numQty) || numQty <= 0 || isNaN(numBuyPrice) || numBuyPrice <= 0 || isNaN(numSellPrice) || numSellPrice <= 0) {
    return res.status(400).json({ error: 'Por favor ingresa valores numéricos válidos mayores a 0.' });
  }

  const bDate = buy_date || new Date().toISOString().split('T')[0];
  const sDate = sell_date || new Date().toISOString().split('T')[0];
  const buyTotal = Number((numQty * numBuyPrice).toFixed(2));
  const sellTotal = Number((numQty * numSellPrice).toFixed(2));
  const realizedGain = Number((sellTotal - buyTotal).toFixed(2));
  const returnPercent = buyTotal > 0 ? Number(((realizedGain / buyTotal) * 100).toFixed(2)) : 0;

  let daysHeld = 1;
  try {
    const diffTime = Math.abs(new Date(sDate) - new Date(bDate));
    daysHeld = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  } catch (e) {
    daysHeld = 1;
  }

  const sql = `
    UPDATE transactions SET
      symbol = ?,
      original_name = ?,
      buy_date = ?,
      quantity = ?,
      buy_price = ?,
      buy_total = ?,
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

  db.run(
    sql,
    [
      cleanSymbol,
      original_name || cleanSymbol,
      bDate,
      numQty,
      numBuyPrice,
      buyTotal,
      sDate,
      numQty,
      numSellPrice,
      sellTotal,
      realizedGain,
      daysHeld,
      returnPercent,
      notes || '',
      targetId,
      userId
    ],
    function(err) {
      if (err) return res.status(500).json({ error: 'Error al actualizar venta histórica: ' + err.message });
      res.json({
        message: `Venta histórica de ${cleanSymbol} (#${targetId}) actualizada con éxito.`,
        id: targetId,
        realizedGain,
        returnPercent
      });
    }
  );
});

// 6. Eliminar una transacción (abierta o cerrada)
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const targetId = parseInt(req.params.id);
  db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [targetId, userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Registro eliminado con éxito de la base de datos', id: targetId });
  });
});

// 7. Consultar precios en tiempo real
app.get('/api/prices', async (req, res) => {
  const symbols = req.query.symbols ? req.query.symbols.split(',') : ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META'];
  const prices = await getStockPrices(symbols);
  res.json(prices);
});

// 8. Endpoint de gráfico intradiario (cada 30 min)
app.get('/api/chart/intraday', async (req, res) => {
  const symbol = req.query.symbol || 'TSLA';
  const data = await getIntradayChartData(symbol);
  res.json(data);
});

// ==========================================
// ENDPOINTS DE RADAR DE OPORTUNIDADES & ANÁLISIS TÉCNICO (WATCHLIST)
// ==========================================

// 8b. Obtener la Watchlist del usuario con Análisis Técnico en tiempo real
app.get('/api/watchlist', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all('SELECT * FROM watchlist WHERE user_id = ? ORDER BY id ASC', [userId], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows = rows || [];
    if (rows.length === 0) {
      return res.json({ watchlist: [] });
    }

    const symbols = [...new Set(rows.map(r => r.symbol.trim().toUpperCase()))];
    const taPromises = symbols.map(sym => getTechnicalAnalysis(sym));
    const taResults = await Promise.all(taPromises);

    const watchlistWithTA = rows.map(r => {
      const sym = r.symbol.trim().toUpperCase();
      const ta = taResults.find(t => t.symbol === sym) || {};
      return {
        id: r.id,
        user_id: r.user_id,
        symbol: sym,
        created_at: r.created_at,
        ...ta
      };
    });

    res.json({ watchlist: watchlistWithTA });
  });
});

// 8c. Agregar un símbolo al Radar del usuario
app.post('/api/watchlist', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ error: 'El símbolo del ticker es requerido' });
  }

  const cleanSymbol = symbol.trim().toUpperCase();

  db.get('SELECT * FROM watchlist WHERE user_id = ? AND UPPER(symbol) = ?', [userId, cleanSymbol], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) return res.status(400).json({ error: `La empresa ${cleanSymbol} ya está en tu radar.` });

    db.run('INSERT INTO watchlist (user_id, symbol) VALUES (?, ?)', [userId, cleanSymbol], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: `Empresa ${cleanSymbol} agregada al radar de análisis técnico con éxito.`, symbol: cleanSymbol });
    });
  });
});

// 8d. Eliminar un símbolo del Radar del usuario
app.delete('/api/watchlist/:symbol', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const cleanSymbol = req.params.symbol.trim().toUpperCase();

  db.run('DELETE FROM watchlist WHERE user_id = ? AND UPPER(symbol) = ?', [userId, cleanSymbol], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: `Empresa ${cleanSymbol} eliminada del radar.`, symbol: cleanSymbol });
  });
});

// 9. Endpoint de gráfico histórico de la cartera (Valor Total vs Tiempo)
app.get('/api/chart/historical-portfolio', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY buy_date ASC, id ASC', [userId], async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows = rows || [];
    if (rows.length === 0) {
      return res.json({ timeline: [] });
    }

    const openSymbols = [...new Set(rows.filter(r => r.status === 'open').map(r => r.symbol))];
    const livePrices = await getStockPrices(openSymbols);

    const dateMap = {};
    rows.forEach(r => {
      const dStr = r.buy_date || new Date().toISOString().split('T')[0];
      if (!dateMap[dStr]) {
        dateMap[dStr] = { date: dStr, invested: 0, closedGain: 0, items: [] };
      }
      dateMap[dStr].items.push(r);
    });

    const datesSorted = Object.keys(dateMap).sort();
    const timeline = [];

    let currentInvested = 0;
    let currentRealized = 0;
    const activeHoldings = {};

    datesSorted.forEach(dStr => {
      const dayData = dateMap[dStr];

      dayData.items.forEach(item => {
        const qty = parseFloat(item.quantity);
        const buyTotal = parseFloat(item.buy_total);
        const gain = parseFloat(item.realized_gain || 0);

        if (item.status === 'open') {
          currentInvested += buyTotal;
          if (!activeHoldings[item.symbol]) {
            activeHoldings[item.symbol] = { qty: 0, total: 0 };
          }
          activeHoldings[item.symbol].qty += qty;
          activeHoldings[item.symbol].total += buyTotal;
        } else if (item.status === 'closed') {
          currentRealized += gain;
        }
      });

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

// 10. Importar archivo Excel o CSV para el usuario autenticado
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
        const sql = `
          INSERT INTO transactions (
            user_id, notes, symbol, original_name, buy_date, quantity, buy_price, buy_total, stop_loss, status,
            sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.run(sql, [
          userId, notes, symbol, rawTicker, buyDate, quantity, buyPrice, buyTotal, stopLoss, status,
          sellDate, sellQuantity, sellPrice, sellTotal, realizedGain, daysHeld, returnPercent
        ]);
        count++;
      }
    });

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: `Se importaron ${count} operaciones correctamente desde el Excel.`, count });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Error al procesar el archivo Excel: ' + err.message });
  }
});

// 11. Exportar base de datos del usuario a Excel
app.get('/api/export-excel', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY buy_date DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    rows = rows || [];
    const exportData = rows.map(r => ({
      'ID': r.id,
      'Ticker (Símbolo)': r.symbol,
      'Nombre Original': r.original_name,
      'Tipo': r.type,
      'Fecha Compra': r.buy_date,
      'Cantidad Acciones': r.quantity,
      'Precio Compra US$': parseFloat(r.buy_price),
      'Inversión Total US$': parseFloat(r.buy_total),
      'Stop Loss US$': r.stop_loss || '',
      'Estado': r.status === 'open' ? 'Abierta' : 'Cerrada',
      'Fecha Venta': r.sell_date || '',
      'Cantidad Vendida': r.sell_quantity || '',
      'Precio Venta US$': r.sell_price || '',
      'Total Venta US$': r.sell_total || '',
      'Ganancia Realizada US$': r.realized_gain || '',
      'Días en Cartera': r.days_held || '',
      'Rentabilidad %': r.return_percent ? `${parseFloat(r.return_percent).toFixed(2)}%` : '',
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

const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor Portrack corriendo exitosamente en: http://${HOST}:${PORT}`);
  console.log(`====================================================`);
});
