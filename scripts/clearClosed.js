require('dotenv').config();
const axios = require('axios');

const client = axios.create({
  baseURL: `${process.env.SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
});

async function clearClosedTransactions() {
  console.log('🧹 Limpiando todas las ventas cerradas de Supabase...');
  
  // 1. Eliminar todas las transacciones cerradas
  const delRes = await client.delete('/transactions?status=eq.closed');
  console.log(`✅ Ventas cerradas eliminadas: ${delRes.data ? delRes.data.length : 0}`);

  // 2. Verificar que las 8 posiciones abiertas queden intactas
  const openRes = await client.get('/transactions?status=eq.open&select=*&order=buy_date.desc');
  console.log(`🟢 Posiciones abiertas activas preservadas (${openRes.data.length}):`);
  openRes.data.forEach(p => {
    console.log(`  - ID #${p.id}: ${p.symbol} | Cantidad: ${p.quantity} | Precio Compra: $${p.buy_price} | Invertido: $${p.buy_total}`);
  });

  // 3. Verificar conteo cerrado
  const closedRes = await client.get('/transactions?status=eq.closed&select=id');
  console.log(`🔴 Total de Ventas Cerradas actuales en Supabase: ${closedRes.data.length}`);
}

clearClosedTransactions().catch(console.error);
