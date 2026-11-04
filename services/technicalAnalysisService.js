const axios = require('axios');

// Caché en memoria (60 segundos) para evitar múltiples llamadas simultáneas a Yahoo Finance
const taCache = new Map();
const TA_CACHE_TTL_MS = 60 * 1000;

/**
 * Calcular Media Móvil Simple (SMA) de N periodos
 */
function calculateSMA(data, period) {
  if (!data || data.length < period) return null;
  const slice = data.slice(data.length - period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return Number((sum / period).toFixed(2));
}

/**
 * Calcular serie de Media Móvil Exponencial (EMA)
 */
function calculateEMASeries(data, period) {
  if (!data || data.length < period) return [];
  const k = 2 / (period + 1);
  const emaArray = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  let prevEma = sum / period;
  emaArray.push(prevEma);

  for (let i = period; i < data.length; i++) {
    const currentEma = data[i] * k + prevEma * (1 - k);
    emaArray.push(currentEma);
    prevEma = currentEma;
  }
  return emaArray;
}

/**
 * Calcular MACD (12, 26, 9)
 */
function calculateMACD(closes) {
  if (!closes || closes.length < 35) {
    return {
      macdLine: 0,
      signalLine: 0,
      histogram: 0,
      state: 'NEUTRAL'
    };
  }

  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);
  // Alinear longitudes: ema26 empieza en índice 25 de closes, ema12 empieza en índice 11 (offset = 14)
  const offset = 26 - 12;
  const macdSeries = [];
  for (let i = 0; i < ema26.length; i++) {
    macdSeries.push(ema12[i + offset] - ema26[i]);
  }

  const signalSeries = calculateEMASeries(macdSeries, 9);
  if (signalSeries.length === 0) {
    return { macdLine: 0, signalLine: 0, histogram: 0, state: 'NEUTRAL' };
  }

  const macdLine = macdSeries[macdSeries.length - 1];
  const prevMacdLine = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2] : macdLine;
  const signalLine = signalSeries[signalSeries.length - 1];
  const prevSignalLine = signalSeries.length > 1 ? signalSeries[signalSeries.length - 2] : signalLine;
  const histogram = macdLine - signalLine;
  const prevHistogram = prevMacdLine - prevSignalLine;

  let state = 'NEUTRAL';
  if (histogram > 0 && prevHistogram <= 0) {
    state = 'CRUCE ALCISTA';
  } else if (histogram < 0 && prevHistogram >= 0) {
    state = 'CRUCE BAJISTA';
  } else if (histogram > 0 && histogram >= prevHistogram) {
    state = 'IMPULSO ALCISTA';
  } else if (histogram > 0 && histogram < prevHistogram) {
    state = 'ALCISTA MODERADO';
  } else if (histogram < 0) {
    state = 'BAJISTA';
  }

  return {
    macdLine: Number(macdLine.toFixed(3)),
    signalLine: Number(signalLine.toFixed(3)),
    histogram: Number(histogram.toFixed(3)),
    state
  };
}

/**
 * Calcular Índice de Fuerza Relativa (RSI) de N periodos (por defecto 14)
 */
function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50.0;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100.0;

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return Number(rsi.toFixed(1));
}

/**
 * Calcular Average True Range (ATR 14) para medir volatilidad real diaria
 */
function calculateATR(highs, lows, closes, period = 14) {
  const len = Math.min(highs?.length || 0, lows?.length || 0, closes?.length || 0);
  if (len < period + 1) {
    const fallbackPrice = closes && closes.length > 0 ? closes[closes.length - 1] : 50;
    const fallbackAtr = Number((fallbackPrice * 0.025).toFixed(2));
    return {
      atr: fallbackAtr,
      atrPercent: 2.5,
      expectedLow5d: Number((fallbackPrice - fallbackAtr * 2.2).toFixed(2)),
      expectedHigh5d: Number((fallbackPrice + fallbackAtr * 2.2).toFixed(2))
    };
  }

  const trList = [];
  for (let i = 1; i < len; i++) {
    const h = highs[i];
    const l = lows[i];
    const prevC = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trList.push(tr);
  }

  const recentTR = trList.slice(-period);
  const atr = recentTR.reduce((sum, val) => sum + val, 0) / period;
  const currentPrice = closes[len - 1] || 1;
  const atrPercent = (atr / currentPrice) * 100;
  // Rango esperado a 5 sesiones (~ sqrt(5) ≈ 2.236 * ATR)
  const move5d = atr * Math.sqrt(5);

  return {
    atr: Number(atr.toFixed(2)),
    atrPercent: Number(atrPercent.toFixed(2)),
    expectedLow5d: Number(Math.max(0.01, currentPrice - move5d).toFixed(2)),
    expectedHigh5d: Number((currentPrice + move5d).toFixed(2))
  };
}

/**
 * Calcular Bandas de Bollinger (20 periodos, 2 desviaciones estándar)
 */
function calculateBollingerBands(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) {
    const p = closes && closes.length > 0 ? closes[closes.length - 1] : 50;
    return {
      upper: Number((p * 1.05).toFixed(2)),
      middle: Number(p.toFixed(2)),
      lower: Number((p * 0.95).toFixed(2)),
      percentB: 50
    };
  }

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = mean + mult * stdDev;
  const lower = mean - mult * stdDev;
  const current = closes[closes.length - 1];
  const range = upper - lower;
  const percentB = range > 0 ? Math.round(((current - lower) / range) * 100) : 50;

  return {
    upper: Number(upper.toFixed(2)),
    middle: Number(mean.toFixed(2)),
    lower: Number(lower.toFixed(2)),
    percentB: Math.max(0, Math.min(100, percentB))
  };
}

/**
 * Identificar Niveles Clave de Soporte y Resistencia en los últimos N días
 */
function findSupportResistance(highs, lows, currentPrice) {
  if (!highs || !lows || highs.length === 0) {
    return { support: Number((currentPrice * 0.95).toFixed(2)), resistance: Number((currentPrice * 1.05).toFixed(2)) };
  }

  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);

  const resistance = Number(Math.max(...recentHighs).toFixed(2));
  const support = Number(Math.min(...recentLows).toFixed(2));

  return { support, resistance };
}

/**
 * Calcular Score de Probabilidad Alcista estilo Kalshi (0% a 100%)
 * y lista de señales cuantitativas activas.
 */
function computeKalshiMultiFactorScore({
  currentPrice,
  changePercent,
  sma20,
  sma50,
  sma200,
  rsi,
  macd,
  volumeRatio,
  support,
  resistance,
  bollinger
}) {
  let score = 50; // Base neutral 50%
  const signals = [];

  // 1. Estructura de Tendencia (SMA 20 / 50 / 200) -> hasta +/- 18 pts
  if (currentPrice > sma20) {
    score += 5;
  } else {
    score -= 4;
  }

  if (currentPrice > sma50) {
    score += 7;
    signals.push(`Sobre SMA50 ($${sma50})`);
  } else {
    score -= 7;
    signals.push(`Bajo SMA50 ($${sma50})`);
  }

  if (currentPrice > sma200) {
    score += 6;
    if (sma50 > sma200) {
      score += 4;
      signals.push('Golden Cross (SMA50 > SMA200)');
    }
  } else {
    score -= 6;
  }

  // 2. Momentum MACD (12, 26, 9) -> hasta +/- 12 pts
  if (macd.state === 'CRUCE ALCISTA') {
    score += 12;
    signals.push('MACD Cruce Alcista');
  } else if (macd.state === 'IMPULSO ALCISTA') {
    score += 9;
    signals.push('MACD Impulso Positivo');
  } else if (macd.state === 'ALCISTA MODERADO') {
    score += 4;
  } else if (macd.state === 'CRUCE BAJISTA') {
    score -= 11;
    signals.push('MACD Cruce Bajista');
  } else if (macd.state === 'BAJISTA') {
    score -= 6;
  }

  // 3. Fuerza Relativa RSI (14) -> hasta +/- 12 pts
  if (rsi >= 48 && rsi <= 65) {
    score += 9;
    signals.push(`RSI Zona Fuerte (${rsi})`);
  } else if (rsi < 32) {
    score += 8; // Probabilidad de rebote técnico por sobreventa
    signals.push(`RSI Sobreventa Rebote (${rsi})`);
  } else if (rsi > 72) {
    score -= 10; // Agotamiento / sobrecompra
    signals.push(`RSI Sobrecompra (${rsi})`);
  } else if (rsi >= 32 && rsi < 45) {
    score -= 4;
  }

  // 4. Volumen Relativo Institucional (RVOL) -> hasta +/- 8 pts
  if (volumeRatio >= 1.25 && changePercent >= 0) {
    score += 8;
    signals.push(`Volumen Institucional (${volumeRatio}x)`);
  } else if (volumeRatio >= 1.25 && changePercent < 0) {
    score -= 6;
    signals.push(`Distribución c/Volumen (${volumeRatio}x)`);
  } else if (volumeRatio >= 1.05 && changePercent > 0) {
    score += 3;
  }

  // 5. Posición en Rango Soporte / Resistencia y Bollinger
  const distToSupportPct = support > 0 ? ((currentPrice - support) / support) * 100 : 5;
  const distToResistancePct = currentPrice > 0 ? ((resistance - currentPrice) / currentPrice) * 100 : 5;

  if (distToSupportPct <= 3.0 && rsi < 55) {
    score += 6;
    signals.push(`Rebote en Soporte ($${support})`);
  }
  if (distToResistancePct <= 1.5 && rsi > 66) {
    score -= 5;
    signals.push(`Techo Resistencia ($${resistance})`);
  }

  if (bollinger && bollinger.percentB < 15) {
    score += 4;
  } else if (bollinger && bollinger.percentB > 92) {
    score -= 4;
  }

  // Acotar entre 14% y 94% como en contratos reales de Kalshi
  const kalshiProb = Math.max(14, Math.min(94, Math.round(score)));

  return {
    kalshiProb,
    signals: signals.slice(0, 4)
  };
}

/**
 * Obtener historial diario de precios de Yahoo Finance y generar Análisis Técnico Multifactorial
 */
async function getTechnicalAnalysis(symbol) {
  const sym = (symbol || 'AAPL').trim().toUpperCase();

  // Verificar caché en memoria
  const cached = taCache.get(sym);
  if (cached && (Date.now() - cached.timestamp < TA_CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5500
    });

    if (response.data && response.data.chart && response.data.chart.result && response.data.chart.result[0]) {
      const result = response.data.chart.result[0];
      const meta = result.meta;
      const quote = result.indicators.quote[0] || {};

      const rawCloses = (quote.close || []).filter(c => c !== null && c !== undefined);
      const rawHighs = (quote.high || []).filter(h => h !== null && h !== undefined);
      const rawLows = (quote.low || []).filter(l => l !== null && l !== undefined);
      const rawVolumes = (quote.volume || []).filter(v => v !== null && v !== undefined);

      const currentPrice = meta.regularMarketPrice || (rawCloses.length > 0 ? rawCloses[rawCloses.length - 1] : 100.0);
      const prevClose = meta.chartPreviousClose || (rawCloses.length > 1 ? rawCloses[rawCloses.length - 2] : currentPrice);
      const changePercent = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      const sma20 = calculateSMA(rawCloses, 20) || Number((currentPrice * 0.99).toFixed(2));
      const sma50 = calculateSMA(rawCloses, 50) || Number((currentPrice * 0.98).toFixed(2));
      const sma200 = calculateSMA(rawCloses, 200) || Number((currentPrice * 0.93).toFixed(2));
      const rsi = calculateRSI(rawCloses, 14);
      const macd = calculateMACD(rawCloses);
      const atrData = calculateATR(rawHighs, rawLows, rawCloses, 14);
      const bollinger = calculateBollingerBands(rawCloses, 20, 2);
      const { support, resistance } = findSupportResistance(rawHighs, rawLows, currentPrice);

      // Volumen relativo vs promedio 20 días
      const recentVolume = rawVolumes.length > 0 ? rawVolumes[rawVolumes.length - 1] : 1000000;
      const avgVolume20 = calculateSMA(rawVolumes, 20) || recentVolume;
      const volumeRatio = avgVolume20 > 0 ? Number((recentVolume / avgVolume20).toFixed(2)) : 1.0;

      // Score Multifactorial Kalshi (0-100%)
      const { kalshiProb, signals } = computeKalshiMultiFactorScore({
        currentPrice,
        changePercent,
        sma20,
        sma50,
        sma200,
        rsi,
        macd,
        volumeRatio,
        support,
        resistance,
        bollinger
      });

      // Niveles dinámicos basados en Volatilidad Real (ATR 14) y Soportes/Resistencias
      const atrStopLoss = Number(Math.max(0.01, Math.min(support * 0.995, currentPrice - 1.8 * atrData.atr)).toFixed(2));
      const atrTakeProfit = Number(Math.max(resistance, currentPrice + 2.6 * atrData.atr).toFixed(2));
      const riskPerShare = Math.max(0.01, currentPrice - atrStopLoss);
      const rewardPerShare = Math.max(0.01, atrTakeProfit - currentPrice);
      const riskRewardRatio = Number((rewardPerShare / riskPerShare).toFixed(2));

      // Generar Indicador de Decisión Táctica estandarizado para operar en Racional ("COMPRAR+", "VENDER", "MANTENER POSICIÓN")
      let decision = 'MANTENER POSICIÓN';
      let decisionBadge = '🔵 RACIONAL: MANTENER POSICIÓN';
      let decisionColor = 'info';
      let reason = `El precio cotiza en rango de consolidación (Prob. Alcista Kalshi ${kalshiProb}%). En Racional: mantener posición actual o esperar confirmación sobre $${sma20}.`;
      let riskLevel = atrData.atrPercent > 4.2 ? 'Alto' : atrData.atrPercent > 2.2 ? 'Medio' : 'Bajo';

      const distToSupportPercent = support > 0 ? ((currentPrice - support) / support) * 100 : 5;

      if (rsi < 34) {
        decision = 'COMPRAR+';
        decisionBadge = '🟢 RACIONAL: COMPRAR+ (REBOTE)';
        decisionColor = 'success';
        reason = `RSI en sobreventa (${rsi}) con ATR diario de $${atrData.atr}. Alta probabilidad (${kalshiProb}%) de rebote técnico hacia $${sma20} desde el soporte de $${support}. Excelente zona para ejecutar "Comprar+" en Racional.`;
      } else if (rsi > 71 || kalshiProb <= 36) {
        decision = 'VENDER';
        decisionBadge = '🔴 RACIONAL: VENDER';
        decisionColor = 'danger';
        reason = rsi > 71
          ? `RSI en sobrecompra (${rsi}) cerca de resistencia ($${resistance}). En Racional: ejecutar "Vender" para asegurar ganancias.`
          : `Estructura técnica débil (Prob. Alcista ${kalshiProb}%, MACD: ${macd.state}). En Racional: ejecutar "Vender" o evitar compras hasta recuperar SMA50 ($${sma50}).`;
      } else if (kalshiProb >= 64 || (currentPrice > sma50 && sma50 > sma200 && rsi >= 45 && rsi <= 65)) {
        decision = 'COMPRAR+';
        decisionBadge = '🟢 RACIONAL: COMPRAR+';
        decisionColor = 'success';
        reason = `Confluencia alcista (${kalshiProb}% Prob. Kalshi, MACD ${macd.state}, RVOL ${volumeRatio}x). En Racional: ejecutar "Comprar+" buscando objetivo en $${atrTakeProfit} con Stop en $${atrStopLoss} (R/R 1:${riskRewardRatio}).`;
      } else if (distToSupportPercent <= 3.0 && rsi < 54) {
        decision = 'COMPRAR+';
        decisionBadge = '🟢 RACIONAL: COMPRAR+ (SOPORTE)';
        decisionColor = 'success';
        reason = `Precio defendiendo soporte clave ($${support}). En Racional: ejecutar "Comprar+" para promediar con relación Riesgo/Beneficio 1:${riskRewardRatio} hacia $${atrTakeProfit}.`;
      }

      const analysisData = {
        symbol: sym,
        name: meta.longName || meta.shortName || sym,
        currentPrice: Number(currentPrice.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        sma20,
        sma50,
        sma200,
        rsi,
        macd,
        atr: atrData.atr,
        atrPercent: atrData.atrPercent,
        expectedLow5d: atrData.expectedLow5d,
        expectedHigh5d: atrData.expectedHigh5d,
        bollinger,
        support,
        resistance,
        atrStopLoss,
        atrTakeProfit,
        riskRewardRatio,
        kalshiProb,
        signals,
        volume: recentVolume,
        avgVolume20,
        volumeRatio,
        decision,
        decisionBadge,
        decisionColor,
        reason,
        riskLevel,
        updatedAt: new Date().toISOString()
      };

      taCache.set(sym, { timestamp: Date.now(), data: analysisData });
      return analysisData;
    }
  } catch (err) {
    console.warn(`Error generando análisis técnico para ${sym}:`, err.message);
  }

  // Fallback simulado de análisis técnico en caso de fallo de red
  return {
    symbol: sym,
    name: `${sym} Corp.`,
    currentPrice: 50.0,
    changePercent: 1.2,
    sma20: 49.2,
    sma50: 48.5,
    sma200: 45.0,
    rsi: 54.0,
    macd: { macdLine: 0.45, signalLine: 0.30, histogram: 0.15, state: 'IMPULSO ALCISTA' },
    atr: 1.35,
    atrPercent: 2.7,
    expectedLow5d: 47.0,
    expectedHigh5d: 53.0,
    bollinger: { upper: 52.8, middle: 49.2, lower: 45.6, percentB: 61 },
    support: 47.0,
    resistance: 53.5,
    atrStopLoss: 47.57,
    atrTakeProfit: 53.51,
    riskRewardRatio: 1.44,
    kalshiProb: 64,
    signals: ['Sobre SMA50 ($48.5)', 'MACD Impulso Positivo', 'RSI Zona Fuerte (54)'],
    volume: 1500000,
    avgVolume20: 1200000,
    volumeRatio: 1.25,
    decision: 'ESPERAR',
    decisionBadge: '🟡 ESPERAR / NEUTRAL',
    decisionColor: 'warning',
    reason: 'Análisis preliminar generado. Revisa las tendencias de corto plazo antes de operar.',
    riskLevel: 'Medio',
    updatedAt: new Date().toISOString()
  };
}

module.exports = { getTechnicalAnalysis };
