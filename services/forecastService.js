/**
 * Servicio de Pronóstico Bursátil e Inteligencia de Algoritmo de Trading
 * Evalúa las posiciones abiertas para determinar la recomendación (Vender, Mantener, Acumular)
 * y el horizonte de tiempo estimado (Días, Semanas, Meses) para maximizar la rentabilidad.
 */

function analyzePositionForecast(pos) {
  const symbol = pos.symbol;
  const buyPrice = pos.buy_price;
  const livePrice = pos.livePrice || buyPrice;
  const returnPercent = pos.unrealizedGainPercent || 0;
  const daysHeld = pos.daysHeld || 0;
  const stopLoss = pos.stop_loss;

  // Variables de decisión
  let action = 'MANTENER'; // 'VENDER', 'MANTENER', 'ACUMULAR'
  let actionColor = 'success'; // 'danger', 'success', 'warning'
  let horizon = 'Semanas'; // 'Días', 'Semanas', 'Meses'
  let targetPrice = Number((livePrice * 1.12).toFixed(2));
  let targetReturn = 12.0;
  let reason = '';
  let confidence = 'Alta';

  // Reglas algorítmicas de trading basadas en comportamiento histórico del portafolio (Win rate de Mauricio 90.5%)

  // 1. Caso Stop Loss alcanzado o Pérdida Significativa (> -8%)
  if ((stopLoss && livePrice <= stopLoss) || returnPercent < -8.0) {
    action = 'VENDER';
    actionColor = 'danger';
    horizon = 'Inmediato (Hoy)';
    targetPrice = livePrice;
    targetReturn = returnPercent;
    reason = `La posición ha alcanzado el nivel crítico de riesgo (${returnPercent.toFixed(1)}%). Se recomienda cortar la pérdida para proteger el capital e invertirlo en activos con mejor momentum.`;
    confidence = 'Alta';
  }
  // 2. Caso Tomar Ganancias (Ganancia > +15% o periodo corto muy rentable)
  else if (returnPercent >= 15.0 || (returnPercent >= 8.0 && daysHeld <= 5)) {
    action = 'VENDER';
    actionColor = 'success';
    horizon = '1 a 3 Días';
    targetPrice = Number((livePrice * 1.03).toFixed(2));
    targetReturn = returnPercent + 3.0;
    reason = `Excelente rendimiento acumulado (+${returnPercent.toFixed(1)}%). El activo muestra zona de toma de beneficios. Se recomienda asegurar las ganancias en los próximos 1-3 días.`;
    confidence = 'Alta';
  }
  // 3. Caso Ligera Pérdida o Consolidación (-0% a -8%): Oportunidad de esperar recuperación o acumular
  else if (returnPercent < 0) {
    if (daysHeld > 45) {
      action = 'MANTENER';
      actionColor = 'warning';
      horizon = '1 a 2 Meses';
      targetPrice = Number((buyPrice * 1.05).toFixed(2));
      targetReturn = 5.0;
      reason = `Posición en consolidación prolongada (${daysHeld} días). La estructura técnica sugiere esperar recuperación hacia el precio de entrada ($${buyPrice.toFixed(2)}) en un horizonte de 1 a 2 meses.`;
    } else {
      action = 'ACUMULAR / MEJORAR';
      actionColor = 'warning';
      horizon = '2 a 4 Semanas';
      targetPrice = Number((buyPrice * 1.08).toFixed(2));
      targetReturn = 8.0;
      reason = `La corrección actual (-${Math.abs(returnPercent).toFixed(1)}%) ofrece una oportunidad para mejorar el precio promedio de compra. Se recomienda esperar de 2 a 4 semanas para alcanzar rentabilidad positiva.`;
    }
  }
  // 4. Caso Ganancia Moderada (0% a +15%): Mantener impulso
  else {
    if (daysHeld <= 14) {
      action = 'MANTENER';
      actionColor = 'success';
      horizon = '3 a 7 Días';
      targetPrice = Number((buyPrice * 1.12).toFixed(2));
      targetReturn = 12.0;
      reason = `Fuerte impulso inicial (+${returnPercent.toFixed(1)}%). La tendencia de corto plazo favorece mantener la posición durante los próximos días para buscar el objetivo de $${targetPrice.toFixed(2)}.`;
    } else if (daysHeld <= 45) {
      action = 'MANTENER';
      actionColor = 'success';
      horizon = '2 a 3 Semanas';
      targetPrice = Number((buyPrice * 1.15).toFixed(2));
      targetReturn = 15.0;
      reason = `Tendencia ascendente estable (+${returnPercent.toFixed(1)}%). Se sugiere mantener la posición en un horizonte de 2 a 3 semanas para maximizar la rentabilidad del portafolio.`;
    } else {
      action = 'MANTENER';
      actionColor = 'success';
      horizon = '1 a 3 Meses';
      targetPrice = Number((buyPrice * 1.18).toFixed(2));
      targetReturn = 18.0;
      reason = `Posición madura en terreno positivo (+${returnPercent.toFixed(1)}%). Para alcanzar la rentabilidad objetivo del 18% se recomienda mantener durante 1 a 3 meses.`;
    }
  }

  return {
    symbol,
    action,
    actionColor,
    horizon,
    currentPrice: livePrice,
    buyPrice,
    returnPercent: Number(returnPercent.toFixed(2)),
    daysHeld,
    targetPrice,
    targetReturn: Number(targetReturn.toFixed(1)),
    reason,
    confidence
  };
}

module.exports = { analyzePositionForecast };
