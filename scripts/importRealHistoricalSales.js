require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const client = axios.create({
  baseURL: `${process.env.SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
});

// Mapeo de nombres a Tickers estándar
const symbolMapping = {
  'CUE BIO': 'CUE',
  'GOOGLE CA': 'GOOGL',
  'ROCKET LAB': 'RKLB',
  'ROCKET LAB ': 'RKLB',
  'VOO SP&500 ETF': 'VOO',
  'VOO SP&500': 'VOO'
};

const rawData = [
  { rawSymbol: 'AMD', buyDate: '08-06-2026', qty: '0,11053834', buyPrice: '492,5', buyTotal: '54,44', sellDate: '20-08-2026', sellPrice: '537,19', sellTotal: '59,38', gain: '4,939958415', days: 73, returnPct: '9,074111675' },
  { rawSymbol: 'AMD', buyDate: '06-05-2026', qty: '0,26065586', buyPrice: '411,54', buyTotal: '107,27', sellDate: '08-05-2026', sellPrice: '445,72', sellTotal: '116,18', gain: '8,909217295', days: 2, returnPct: '8,305389513' },
  { rawSymbol: 'AMZN', buyDate: '01-07-2026', qty: '0,40921754', buyPrice: '244,37', buyTotal: '100,00', sellDate: '20-08-2026', sellPrice: '255,32', sellTotal: '104,48', gain: '4,480932063', days: 50, returnPct: '4,480910095' },
  { rawSymbol: 'AOCL', buyDate: '20-04-2026', qty: '0,91136737', buyPrice: '37,22', buyTotal: '33,92', sellDate: '04-05-2026', sellPrice: '41,9', sellTotal: '38,19', gain: '4,265199292', days: 14, returnPct: '12,57388501' },
  { rawSymbol: 'APLD', buyDate: '24-04-2026', qty: '1,01984282', buyPrice: '38,08', buyTotal: '38,84', sellDate: '11-05-2026', sellPrice: '45,41', sellTotal: '46,31', gain: '7,475447871', days: 17, returnPct: '19,24894958' },
  { rawSymbol: 'APPS', buyDate: '03-08-2026', qty: '5,72246696', buyPrice: '9,08', buyTotal: '51,96', sellDate: '05-08-2026', sellPrice: '13,51', sellTotal: '77,31', gain: '25,35052863', days: 2, returnPct: '48,78854625' },
  { rawSymbol: 'BLZE', buyDate: '05-05-2026', qty: '6,51041666', buyPrice: '7,68', buyTotal: '50,00', sellDate: '22-05-2026', sellPrice: '7,67', sellTotal: '49,93', gain: '-0,065104167', days: 17, returnPct: '-0,130208333' },
  { rawSymbol: 'CUE BIO', rawName: 'CUE BIO', buyDate: '28-04-2026', qty: '2,48629732', buyPrice: '13,37', buyTotal: '33,24', sellDate: '02-05-2026', sellPrice: '30,2', sellTotal: '75,09', gain: '41,8443839', days: 4, returnPct: '125,8788332' },
  { rawSymbol: 'FCEL', buyDate: '17-07-2026', qty: '2,82950757', buyPrice: '18,84', buyTotal: '53,31', sellDate: '21-07-2026', sellPrice: '21,83', sellTotal: '61,77', gain: '8,460227634', days: 4, returnPct: '15,87048832' },
  { rawSymbol: 'GOOGLE CA', rawName: 'Alphabet Inc (Google)', buyDate: '01-06-2026', qty: '0,17453731', buyPrice: '366,34', buyTotal: '63,94', sellDate: '20-08-2026', sellPrice: '373,1', sellTotal: '65,12', gain: '1,179872216', days: 80, returnPct: '1,845280341' },
  { rawSymbol: 'KOLD', buyDate: '28-07-2026', qty: '1,78441558', buyPrice: '30,8', buyTotal: '54,96', sellDate: '20-08-2026', sellPrice: '29,12', sellTotal: '51,96', gain: '-2,997818174', days: 23, returnPct: '-5,454545455' },
  { rawSymbol: 'KVYO', buyDate: '05-08-2026', qty: '3,97193611', buyPrice: '19,4', buyTotal: '77,06', sellDate: '20-08-2026', sellPrice: '18,9', sellTotal: '75,07', gain: '-1,985968055', days: 15, returnPct: '-2,577173631' },
  { rawSymbol: 'META', buyDate: '24-06-2026', qty: '0,09653026', buyPrice: '560,24', buyTotal: '54,08', sellDate: '01-07-2026', sellPrice: '622,4', sellTotal: '60,08', gain: '6,000320962', days: 7, returnPct: '11,0952449' },
  { rawSymbol: 'MSFT', buyDate: '13-05-2026', qty: '0,13751524', buyPrice: '404,32', buyTotal: '55,60', sellDate: '29-05-2026', sellPrice: '464,97', sellTotal: '63,94', gain: '8,340299306', days: 16, returnPct: '15,00049466' },
  { rawSymbol: 'MU', buyDate: '11-05-2026', qty: '0,08832821', buyPrice: '792,5', buyTotal: '70,00', sellDate: '20-08-2026', sellPrice: '877,76', sellTotal: '77,53', gain: '7,530863185', days: 101, returnPct: '10,75835962' },
  { rawSymbol: 'MU', buyDate: '06-05-2026', qty: '0,07568647', buyPrice: '660,62', buyTotal: '50,00', sellDate: '08-05-2026', sellPrice: '739,1', sellTotal: '55,94', gain: '5,939874166', days: 2, returnPct: '11,87974933' },
  { rawSymbol: 'NVCR', buyDate: '30-04-2026', qty: '2,63137208', buyPrice: '15,27', buyTotal: '40,18', sellDate: '08-05-2026', sellPrice: '17,41', sellTotal: '45,81', gain: '5,631136251', days: 8, returnPct: '14,01440733' },
  { rawSymbol: 'OUST', buyDate: '27-05-2026', qty: '0,86697094', buyPrice: '44,92', buyTotal: '38,94', sellDate: '17-06-2026', sellPrice: '43,39', sellTotal: '37,62', gain: '-1,326465538', days: 21, returnPct: '-3,406055209' },
  { rawSymbol: 'QQQ', buyDate: '23-05-2026', qty: '0,06909011', buyPrice: '722,97', buyTotal: '49,95', sellDate: '14-06-2026', sellPrice: '735,85', sellTotal: '50,84', gain: '0,889880617', days: 22, returnPct: '1,781540036' },
  { rawSymbol: 'ROCKET LAB', rawName: 'Rocket Lab USA', buyDate: '11-05-2026', qty: '0,42607693', buyPrice: '117,35', buyTotal: '50,00', sellDate: '13-05-2026', sellPrice: '125,34', sellTotal: '53,40', gain: '3,404354671', days: 2, returnPct: '6,808691947' },
  { rawSymbol: 'SOFI', buyDate: '23-06-2026', qty: '6,74051756', buyPrice: '17,46', buyTotal: '117,69', sellDate: '01-07-2026', sellPrice: '18,45', sellTotal: '124,36', gain: '6,673112384', days: 8, returnPct: '5,670103093' },
  { rawSymbol: 'UEC', buyDate: '26-05-2026', qty: '5,68116876', buyPrice: '13,65', buyTotal: '77,55', sellDate: '20-08-2026', sellPrice: '15,02', sellTotal: '85,33', gain: '7,783201201', days: 86, returnPct: '10,03663004' },
  { rawSymbol: 'VGT', buyDate: '11-05-2026', qty: '0,68843019', buyPrice: '112,88', buyTotal: '77,71', sellDate: '20-08-2026', sellPrice: '116,29', sellTotal: '80,06', gain: '2,347546948', days: 101, returnPct: '3,020907158' },
  { rawSymbol: 'VOO SP&500 ETF', rawName: 'Vanguard S&P 500 ETF', buyDate: '15-05-2026', qty: '0,08069613', buyPrice: '680,33', buyTotal: '54,90', sellDate: '28-07-2026', sellPrice: '680,75', sellTotal: '54,93', gain: '0,033892375', days: 74, returnPct: '0,061734746' }
];

function parseDate(dStr) {
  if (!dStr) return null;
  // Convert DD-MM-YYYY to YYYY-MM-DD
  const parts = dStr.trim().split('-');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dStr;
}

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  return parseFloat(String(val).replace(',', '.').trim());
}

async function runImport() {
  console.log('🚀 Iniciando importación de las 24 ventas históricas reales a Supabase...');

  // 1. Limpiar ventas cerradas existentes
  await client.delete('/transactions?status=eq.closed');
  console.log('🧹 Historial cerrado anterior limpiado.');

  const recordsToInsert = [];

  for (const item of rawData) {
    const symbol = symbolMapping[item.rawSymbol.trim()] || item.rawSymbol.trim().toUpperCase();
    const original_name = item.rawName || item.rawSymbol.trim();
    const bDate = parseDate(item.buyDate);
    const sDate = parseDate(item.sellDate);
    const quantity = parseNum(item.qty);
    const buyPrice = parseNum(item.buyPrice);
    const buyTotal = parseNum(item.buyTotal) || Number((quantity * buyPrice).toFixed(2));
    const sellPrice = parseNum(item.sellPrice);
    const sellTotal = parseNum(item.sellTotal) || Number((quantity * sellPrice).toFixed(2));
    const realizedGain = parseNum(item.gain) || Number((sellTotal - buyTotal).toFixed(2));
    const returnPercent = parseNum(item.returnPct) || (buyTotal > 0 ? Number(((realizedGain / buyTotal) * 100).toFixed(2)) : 0);
    const daysHeld = parseInt(item.days) || 1;

    recordsToInsert.push({
      user_id: 1,
      symbol: symbol,
      original_name: original_name,
      type: 'BUY',
      buy_date: bDate,
      quantity: quantity,
      buy_price: buyPrice,
      buy_total: buyTotal,
      stop_loss: null,
      status: 'closed',
      sell_date: sDate,
      sell_quantity: quantity,
      sell_price: sellPrice,
      sell_total: sellTotal,
      realized_gain: realizedGain,
      days_held: daysHeld,
      return_percent: returnPercent,
      notes: `Venta cerrada el ${sDate} a $${sellPrice}`
    });
  }

  // Ordenar cronológicamente por fecha de venta DESC antes de insertar
  recordsToInsert.sort((a, b) => new Date(b.sell_date) - new Date(a.sell_date));

  // Inserción en bloque en Supabase
  const insertRes = await client.post('/transactions', recordsToInsert);
  console.log(`✅ ${recordsToInsert.length} ventas históricas insertadas con éxito en Supabase!`);

  // Validar conteos y métricas
  const allTx = await client.get('/transactions?select=*&order=sell_date.desc');
  const openList = allTx.data.filter(t => t.status === 'open');
  const closedList = allTx.data.filter(t => t.status === 'closed');

  let totalClosedGain = 0;
  let totalClosedInvested = 0;
  let winCount = 0;

  closedList.forEach(t => {
    const g = parseFloat(t.realized_gain || 0);
    const inv = parseFloat(t.buy_total || 0);
    totalClosedGain += g;
    totalClosedInvested += inv;
    if (g > 0) winCount++;
  });

  const winRate = closedList.length > 0 ? (winCount / closedList.length) * 100 : 0;
  const totalReturnPct = totalClosedInvested > 0 ? (totalClosedGain / totalClosedInvested) * 100 : 0;

  console.log('\n======================================================');
  console.log('🎉 RESUMEN DE LA CARTERA REAL ACTUALIZADA');
  console.log('======================================================');
  console.log(`🟢 Posiciones Abiertas Activas: ${openList.length}`);
  console.log(`🔴 Ventas Históricas Cerradas: ${closedList.length}`);
  console.log(`💵 Ganancia Realizada Total: +$${totalClosedGain.toFixed(2)} USD`);
  console.log(`📈 Rentabilidad Acumulada: +${totalReturnPct.toFixed(2)}%`);
  console.log(`🏆 Efectividad (Win Rate): ${winRate.toFixed(1)}% (${winCount} de ${closedList.length} operaciones ganadoras)`);
  console.log('======================================================\n');
}

runImport().catch(console.error);
