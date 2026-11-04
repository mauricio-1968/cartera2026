/**
 * Servicio Cuantitativo de Pronóstico Bursátil e Inteligencia de Decisión (Estilo Kalshi)
 * Combina:
 *  1) Estado real de la posición abierta (Precio compra, P&L %, Días en cartera, Stop manual)
 *  2) Indicadores Técnicos Multifactoriales en Vivo (RSI 14, MACD 12/26/9, SMA 20/50/200, ATR 14, RVOL, Soportes)
 *  3) Historial personal del inversor en ese mismo ticker (Win Rate histórico y retorno promedio)
 */

function analyzePositionForecast(pos, ta = null, tickerHistory = null) {
  const symbol = pos.symbol;
  const buyPrice = Number(pos.buy_price) || 1;
  const livePrice = Number(pos.livePrice || (ta && ta.currentPrice) || buyPrice);
  const shares = Number(pos.shares) || 0;
  const invested = Number(pos.invested) || Number((shares * buyPrice).toFixed(2));
  const returnPercent = pos.unrealizedGainPercent !== undefined
    ? Number(pos.unrealizedGainPercent)
    : ((livePrice - buyPrice) / buyPrice) * 100;
  const daysHeld = Number(pos.daysHeld) || 0;
  const manualStopLoss = pos.stop_loss ? Number(pos.stop_loss) : null;

  // Extraer métricas técnicas reales o usar estimaciones conservadoras
  const atr = (ta && ta.atr) ? Number(ta.atr) : Number((livePrice * 0.025).toFixed(2));
  const atrPercent = (ta && ta.atrPercent) ? Number(ta.atrPercent) : 2.5;
  const rsi = (ta && ta.rsi) ? Number(ta.rsi) : 52.0;
  const sma20 = (ta && ta.sma20) ? Number(ta.sma20) : Number((livePrice * 0.99).toFixed(2));
  const sma50 = (ta && ta.sma50) ? Number(ta.sma50) : Number((livePrice * 0.97).toFixed(2));
  const sma200 = (ta && ta.sma200) ? Number(ta.sma200) : Number((livePrice * 0.92).toFixed(2));
  const support = (ta && ta.support) ? Number(ta.support) : Number((livePrice - 2.0 * atr).toFixed(2));
  const resistance = (ta && ta.resistance) ? Number(ta.resistance) : Number((livePrice + 2.8 * atr).toFixed(2));
  const volumeRatio = (ta && ta.volumeRatio) ? Number(ta.volumeRatio) : 1.0;
  const macdState = (ta && ta.macd && ta.macd.state) ? ta.macd.state : 'NEUTRAL';
  const expectedLow5d = (ta && ta.expectedLow5d) ? Number(ta.expectedLow5d) : Number(Math.max(0.01, livePrice - atr * 2.236).toFixed(2));
  const expectedHigh5d = (ta && ta.expectedHigh5d) ? Number(ta.expectedHigh5d) : Number((livePrice + atr * 2.236).toFixed(2));

  // Score base técnico Kalshi (0 - 100%)
  let kalshiProb = (ta && ta.kalshiProb) ? Number(ta.kalshiProb) : 58;

  // Ajustar probabilidad con el historial personal del usuario en este ticker
  const personalWinRate = (tickerHistory && tickerHistory.tradesCount > 0) ? Number(tickerHistory.winRate) : null;
  const personalTrades = (tickerHistory && tickerHistory.tradesCount) ? Number(tickerHistory.tradesCount) : 0;
  if (personalWinRate !== null) {
    if (personalWinRate >= 75) kalshiProb = Math.min(94, Math.round(kalshiProb + 5));
    else if (personalWinRate < 40) kalshiProb = Math.max(15, Math.round(kalshiProb - 5));
  }

  // Cálculo de Stop Loss Dinámico por Volatilidad (ATR) o Trailing Stop si ya está en ganancia
  let isTrailingStop = false;
  let suggestedStopLoss = manualStopLoss || Number(Math.max(0.01, Math.min(support * 0.995, livePrice - 1.8 * atr)).toFixed(2));

  if (returnPercent >= 4.5) {
    // Activar Trailing Stop Dinámico para asegurar ganancias (nunca por debajo de break-even + 1%)
    const trailingCandidate = Number(Math.max(buyPrice * 1.012, livePrice - 1.65 * atr).toFixed(2));
    if (trailingCandidate > suggestedStopLoss && trailingCandidate < livePrice) {
      suggestedStopLoss = trailingCandidate;
      isTrailingStop = true;
    }
  }

  // Cálculo de Precio Objetivo Dinámico basado en Resistencia + Expansión ATR
  let rawTarget = Math.max(resistance, livePrice + 2.6 * atr, buyPrice * 1.08);
  let targetPrice = Number(rawTarget.toFixed(2));

  // Variables de decisión
  let action = 'MANTENER';
  let actionColor = 'success';
  let horizon = '2 a 3 Semanas';
  let confidence = kalshiProb >= 68 ? 'Alta' : kalshiProb >= 48 ? 'Media' : 'Moderada';
  let reason = '';

  // Señales técnicas resumidas
  const signals = (ta && Array.isArray(ta.signals) && ta.signals.length > 0)
    ? [...ta.signals]
    : [`RSI ${rsi}`, `ATR $${atr}`, `RVOL ${volumeRatio}x`];

  if (isTrailingStop) {
    signals.unshift(`Trailing Stop $${suggestedStopLoss}`);
  }
  if (personalTrades > 0 && personalWinRate !== null) {
    signals.push(`Tu WinRate ${symbol}: ${personalWinRate.toFixed(0)}% (${personalTrades} ops)`);
  }

  // --- REGLAS CUANTITATIVAS MULTIFACTORIALES ---

  // 1. Stop Loss vulnerado o ruptura bajista severa con baja probabilidad de rebote
  if ((manualStopLoss && livePrice <= manualStopLoss) || (returnPercent < -8.5 && kalshiProb < 42 && rsi >= 33)) {
    action = 'CORTAR PÉRDIDA / VENDER';
    actionColor = 'danger';
    horizon = 'Inmediato (1-2 Sesiones)';
    targetPrice = Number(Math.max(livePrice, sma20).toFixed(2));
    confidence = 'Alta';
    reason = `Ruptura de nivel de protección (${returnPercent.toFixed(1)}%) con débil probabilidad alcista (${kalshiProb}%) y MACD en estado ${macdState}. Se sugiere preservar capital o rotar hacia activos con mayor fuerza relativa.`;
  }
  // 2. Toma de Ganancias por Sobrecompra Técnica (RSI > 70 o Ganancia fuerte cerca de Resistencia)
  else if ((returnPercent >= 14.0 && rsi >= 67) || (returnPercent >= 8.0 && rsi >= 72)) {
    action = 'TOMAR GANANCIA / TRAILING';
    actionColor = 'success';
    horizon = '1 a 3 Días';
    targetPrice = Number(Math.max(livePrice * 1.025, resistance).toFixed(2));
    confidence = 'Alta';
    reason = `Excelente plusvalía (+${returnPercent.toFixed(1)}%) entrando en zona de sobrecompra técnica (RSI ${rsi}) cerca de la resistencia de $${resistance}. Se recomienda asegurar beneficios parciales o ajustar el Trailing Stop a $${suggestedStopLoss}.`;
  }
  // 3. Posición Ganadora con Tendencia Alcista Fuerte -> Subir Trailing Stop y Dejar Correr
  else if (returnPercent >= 4.5 && kalshiProb >= 55) {
    action = 'MANTENER / SUBIR STOP';
    actionColor = 'success';
    horizon = daysHeld <= 15 ? '1 a 2 Semanas' : '2 a 4 Semanas';
    targetPrice = Number(Math.max(resistance, livePrice + 2.8 * atr, buyPrice * 1.14).toFixed(2));
    confidence = 'Alta';
    reason = `Impulso ganador (+${returnPercent.toFixed(1)}%) respaldado por ${kalshiProb}% de probabilidad alcista Kalshi (MACD: ${macdState}, RVOL: ${volumeRatio}x). Sube tu Trailing Stop a $${suggestedStopLoss} para blindar ganancias mientras buscas $${targetPrice}.`;
  }
  // 4. Posición en retroceso pero en Soporte o Sobreventa (Oportunidad de Promediar / DCA inteligente)
  else if (returnPercent < 0 && (rsi < 38 || livePrice <= support * 1.03 || kalshiProb >= 56)) {
    action = 'ACUMULAR EN SOPORTE (DCA)';
    actionColor = 'warning';
    horizon = '2 a 4 Semanas';
    targetPrice = Number(Math.max(buyPrice * 1.06, sma50, livePrice + 2.5 * atr).toFixed(2));
    confidence = kalshiProb >= 60 ? 'Alta' : 'Media';
    reason = `El retroceso actual (${returnPercent.toFixed(1)}%) sitúa al activo cerca del soporte clave de $${support} (RSI ${rsi}, ATR $${atr}). La estructura ofrece una ventana favorable para promediar a la baja (DCA) buscando recuperación hacia $${targetPrice}.`;
  }
  // 5. Posición en consolidación o retroceso moderado sin señal de compra aún
  else if (returnPercent < 0) {
    action = 'MANTENER / VIGILAR STOP';
    actionColor = 'warning';
    horizon = daysHeld > 35 ? '3 a 6 Semanas' : '2 a 4 Semanas';
    targetPrice = Number(Math.max(buyPrice * 1.04, sma20, livePrice + 2.0 * atr).toFixed(2));
    reason = `Activo en fase de consolidación (${returnPercent.toFixed(1)}%) con volatilidad diaria ATR de $${atr} (${atrPercent}%). Mantener vigilancia sobre el soporte de $${support} y stop sugerido en $${suggestedStopLoss} esperando cruce alcista en MACD.`;
  }
  // 6. Ganancia moderada (0% a +4.5%)
  else {
    action = 'MANTENER IMPULSO';
    actionColor = 'success';
    horizon = '1 a 3 Semanas';
    targetPrice = Number(Math.max(resistance, buyPrice * 1.12, livePrice + 2.5 * atr).toFixed(2));
    reason = `Posición en terreno positivo (+${returnPercent.toFixed(1)}%) con probabilidad alcista del ${kalshiProb}% y rango esperado a 5 días entre $${expectedLow5d} y $${expectedHigh5d}. Mantener rumbo al objetivo técnico de $${targetPrice}.`;
  }

  // Cálculos de retorno proyectado y relación Riesgo / Beneficio desde el precio actual
  const targetReturn = Number((((targetPrice - buyPrice) / buyPrice) * 100).toFixed(1));
  const upsideFromCurrent = Math.max(0.01, targetPrice - livePrice);
  const downsideToStop = Math.max(0.01, livePrice - suggestedStopLoss);
  const upsidePercent = Number(((upsideFromCurrent / livePrice) * 100).toFixed(1));
  const downsidePercent = Number(((downsideToStop / livePrice) * 100).toFixed(1));
  const riskRewardRatio = Number((upsideFromCurrent / downsideToStop).toFixed(2));

  return {
    symbol,
    action,
    actionColor,
    horizon,
    currentPrice: Number(livePrice.toFixed(2)),
    buyPrice: Number(buyPrice.toFixed(2)),
    shares,
    invested,
    returnPercent: Number(returnPercent.toFixed(2)),
    daysHeld,
    targetPrice,
    targetReturn,
    upsidePercent,
    downsidePercent,
    suggestedStopLoss,
    isTrailingStop,
    riskRewardRatio,
    kalshiProb,
    atr,
    atrPercent,
    expectedLow5d,
    expectedHigh5d,
    support,
    resistance,
    rsi,
    macdState,
    sma20,
    sma50,
    sma200,
    volumeRatio,
    personalWinRate,
    personalTrades,
    signals: signals.slice(0, 5),
    reason,
    confidence
  };
}

module.exports = { analyzePositionForecast };
