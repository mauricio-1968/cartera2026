/**
 * Servicio Cuantitativo de Pronóstico Bursátil e Inteligencia de Decisión (Estilo Kalshi + Ejecución en Racional Premium)
 * Combina:
 *  1) Estado real de la posición abierta (Precio compra, P&L %, Días en cartera, Stop manual)
 *  2) Indicadores Técnicos Multifactoriales en Vivo (RSI 14, MACD 12/26/9, SMA 20/50/200, ATR 14, RVOL, Soportes)
 *  3) Historial personal del inversor en ese mismo ticker (Win Rate histórico y retorno promedio)
 *
 * Entrega claramente las 3 acciones operativas para ejecutar en Racional (Chile):
 *  - "COMPRAR+"
 *  - "VENDER"
 *  - "MANTENER POSICIÓN"
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

  // Variables de decisión principales (Estandarizadas para Racional: "COMPRAR+", "VENDER", "MANTENER POSICIÓN")
  let action = 'MANTENER POSICIÓN';
  let actionColor = 'info'; // 'success' -> COMPRAR+, 'danger' -> VENDER, 'info' -> MANTENER POSICIÓN
  let racionalAction = 'MANTENER POSICIÓN';
  let racionalBadge = '🔵 MANTENER POSICIÓN';
  let racionalSubtext = 'No operar hoy en Racional • Dejar correr';
  let racionalInstruction = '';
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

  // --- REGLAS CUANTITATIVAS MULTIFACTORIALES PARA OPERAR EN RACIONAL ---

  // 1. CASO VENDER (Por Stop Loss vulnerado o ruptura bajista severa)
  if ((manualStopLoss && livePrice <= manualStopLoss) || (returnPercent < -8.5 && kalshiProb < 42 && rsi >= 33)) {
    action = 'VENDER';
    actionColor = 'danger';
    racionalAction = 'VENDER';
    racionalBadge = '🔴 VENDER';
    racionalSubtext = 'Cortar pérdida en Racional • Proteger capital';
    horizon = 'Inmediato (Hoy en Racional)';
    targetPrice = Number(Math.max(livePrice, sma20).toFixed(2));
    confidence = 'Alta';
    reason = `Ruptura de nivel de protección (${returnPercent.toFixed(1)}%) con baja probabilidad alcista (${kalshiProb}%) y MACD en estado ${macdState}. Conviene cerrar en Racional para preservar liquidez en USD.`;
    racionalInstruction = `En tu cuenta Racional Premium: Entra a ${symbol} y selecciona "Vender" (Orden a Mercado o Límite en ~$${livePrice.toFixed(2)}) para liberar capital en dólares y evitar mayor deterioro.`;
  }
  // 2. CASO VENDER (Toma de Ganancias por Sobrecompra Técnica o Meta alcanzada cerca de resistencia)
  else if ((returnPercent >= 14.0 && rsi >= 66) || (returnPercent >= 8.0 && rsi >= 70) || (returnPercent >= 10.0 && livePrice >= resistance * 0.99)) {
    action = 'VENDER';
    actionColor = 'danger';
    racionalAction = 'VENDER';
    racionalBadge = '🔴 VENDER';
    racionalSubtext = `Tomar ganancia (+${returnPercent.toFixed(1)}%) en Racional`;
    horizon = '1 a 3 Días';
    targetPrice = Number(Math.max(livePrice * 1.02, resistance).toFixed(2));
    confidence = 'Alta';
    reason = `Excelente ganancia acumulada (+${returnPercent.toFixed(1)}%) entrando en zona de agotamiento técnico (RSI ${rsi}) junto a la resistencia de $${resistance}. Momento óptimo para asegurar utilidades en Racional.`;
    racionalInstruction = `En tu cuenta Racional Premium: Entra a ${symbol} y selecciona "Vender" (puedes vender el 100% o asegurar al menos el 50% de tus ${shares} acciones a ~$${livePrice.toFixed(2)}) para cristalizar tu ganancia.`;
  }
  // 3. CASO COMPRAR+ (Retroceso en Soporte / Sobreventa o Oportunidad clara de Promediar DCA)
  else if (returnPercent < 0 && (rsi < 42 || livePrice <= support * 1.035 || kalshiProb >= 54)) {
    action = 'COMPRAR+';
    actionColor = 'success';
    racionalAction = 'COMPRAR+';
    racionalBadge = '🟢 COMPRAR+';
    racionalSubtext = `Promediar a $${livePrice.toFixed(2)} en Racional (DCA)`;
    horizon = '2 a 4 Semanas';
    targetPrice = Number(Math.max(buyPrice * 1.06, sma50, livePrice + 2.5 * atr).toFixed(2));
    confidence = kalshiProb >= 60 ? 'Alta' : 'Media';
    reason = `El retroceso actual (${returnPercent.toFixed(1)}%) acerca a ${symbol} al soporte clave de $${support} con RSI en ${rsi} y probabilidad alcista Kalshi de ${kalshiProb}%. Excelente punto para comprar más en Racional y bajar tu precio promedio ($${buyPrice.toFixed(2)}).`;
    racionalInstruction = `En tu cuenta Racional Premium: Entra a ${symbol} y selecciona "Comprar" (Orden Límite sugerida máx. $${livePrice.toFixed(2)}) para promediar a la baja buscando el rebote hacia $${targetPrice.toFixed(2)}. Usa el Simulador DCA abajo para elegir el monto exacto.`;
  }
  // 4. CASO COMPRAR+ (Acción con Fuerte Impulso Alcista y Alta Probabilidad Kalshi, aún lejos de sobrecompra)
  else if (returnPercent >= 0 && returnPercent < 6.0 && kalshiProb >= 66 && rsi <= 63) {
    action = 'COMPRAR+';
    actionColor = 'success';
    racionalAction = 'COMPRAR+';
    racionalBadge = '🟢 COMPRAR+';
    racionalSubtext = `Sumar a tendencia alcista (${kalshiProb}% Prob.)`;
    horizon = '1 a 3 Semanas';
    targetPrice = Number(Math.max(resistance, buyPrice * 1.12, livePrice + 2.6 * atr).toFixed(2));
    confidence = 'Alta';
    reason = `Confluencia técnica muy fuerte (${kalshiProb}% Prob. Alcista Kalshi, MACD ${macdState}, RVOL ${volumeRatio}x) sin estar sobrecomprada (RSI ${rsi}). Ventana favorable para incrementar posición en Racional rumbo a $${targetPrice.toFixed(2)}.`;
    racionalInstruction = `En tu cuenta Racional Premium: Si tienes poder de compra disponible, entra a ${symbol} y ejecuta "Comprar" a ~$${livePrice.toFixed(2)} para ampliar posición aprovechando el momentum alcista hacia $${targetPrice.toFixed(2)}.`;
  }
  // 5. CASO MANTENER POSICIÓN (Ganancia corriendo con buen impulso -> Dejar correr y vigilar Trailing Stop)
  else if (returnPercent >= 0) {
    action = 'MANTENER POSICIÓN';
    actionColor = 'info';
    racionalAction = 'MANTENER POSICIÓN';
    racionalBadge = '🔵 MANTENER POSICIÓN';
    racionalSubtext = `Dejar correr ganancia • Stop $${suggestedStopLoss.toFixed(2)}`;
    horizon = daysHeld <= 15 ? '1 a 2 Semanas' : '2 a 4 Semanas';
    targetPrice = Number(Math.max(resistance, livePrice + 2.6 * atr, buyPrice * 1.14).toFixed(2));
    confidence = kalshiProb >= 58 ? 'Alta' : 'Media';
    reason = `Posición rentable (+${returnPercent.toFixed(1)}%) con probabilidad alcista del ${kalshiProb}% (MACD: ${macdState}). No vendas aún en Racional; deja correr la ganancia rumbo al objetivo de $${targetPrice.toFixed(2)} vigilando el piso de protección en $${suggestedStopLoss.toFixed(2)}.`;
    racionalInstruction = `En tu cuenta Racional Premium: No realices compras ni ventas hoy en ${symbol}. Mantén tus ${shares} acciones trabajando rumbo a $${targetPrice.toFixed(2)} (con orden Stop o alerta de salida en $${suggestedStopLoss.toFixed(2)}).`;
  }
  // 6. CASO MANTENER POSICIÓN (En consolidación negativa moderada pero esperando confirmación técnica)
  else {
    action = 'MANTENER POSICIÓN';
    actionColor = 'info';
    racionalAction = 'MANTENER POSICIÓN';
    racionalBadge = '🔵 MANTENER POSICIÓN';
    racionalSubtext = `Esperar confirmación • Piso $${suggestedStopLoss.toFixed(2)}`;
    horizon = daysHeld > 35 ? '3 a 6 Semanas' : '2 a 4 Semanas';
    targetPrice = Number(Math.max(buyPrice * 1.04, sma20, livePrice + 2.0 * atr).toFixed(2));
    reason = `Activo en consolidación (${returnPercent.toFixed(1)}%) con volatilidad diaria ATR de $${atr} (${atrPercent}%). Conviene mantener la posición actual en Racional sin agregar más capital hasta que confirme rebote sobre $${sma20.toFixed(2)}.`;
    racionalInstruction = `En tu cuenta Racional Premium: Mantén tu posición actual en ${symbol} sin vender en pérdida ni agregar capital todavía. Vigila el soporte en $${support.toFixed(2)} y el nivel de control en $${suggestedStopLoss.toFixed(2)}.`;
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
    racionalAction,
    racionalBadge,
    racionalSubtext,
    racionalInstruction,
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
