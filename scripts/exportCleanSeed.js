require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const client = axios.create({
  baseURL: `${process.env.SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
  }
});

async function exportSeed() {
  const res = await client.get('/transactions?select=*&order=id.asc');
  const cleanData = res.data.map(t => ({
    symbol: t.symbol,
    original_name: t.original_name,
    type: t.type || 'BUY',
    buy_date: t.buy_date,
    quantity: parseFloat(t.quantity),
    buy_price: parseFloat(t.buy_price),
    buy_total: parseFloat(t.buy_total),
    stop_loss: t.stop_loss ? parseFloat(t.stop_loss) : null,
    status: t.status,
    sell_date: t.sell_date || null,
    sell_quantity: t.sell_quantity ? parseFloat(t.sell_quantity) : null,
    sell_price: t.sell_price ? parseFloat(t.sell_price) : null,
    sell_total: t.sell_total ? parseFloat(t.sell_total) : null,
    realized_gain: t.realized_gain !== null && t.realized_gain !== undefined ? parseFloat(t.realized_gain) : null,
    days_held: t.days_held !== null && t.days_held !== undefined ? parseInt(t.days_held) : null,
    return_percent: t.return_percent !== null && t.return_percent !== undefined ? parseFloat(t.return_percent) : null,
    notes: t.notes || ''
  }));

  const fileContent = `/**
 * Datos semilla iniciales verificados de la Cartera de Mauricio Martinez (9 abiertas + 24 cerradas reales)
 */
const initialTransactions = ${JSON.stringify(cleanData, null, 2)};

module.exports = initialTransactions;
`;

  const seedPath = path.join(__dirname, '..', 'database', 'seedData.js');
  fs.writeFileSync(seedPath, fileContent, 'utf-8');
  console.log(`✅ database/seedData.js actualizado con ${cleanData.length} transacciones verificadas.`);
}

exportSeed().catch(console.error);
