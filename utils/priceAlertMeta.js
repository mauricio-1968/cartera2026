/**
 * Utilidad para almacenar y evaluar Alertas de Precio de Venta por Acción
 * dentro de la columna `notes` sin alterar el esquema de Supabase Cloud ni SQLite.
 * Formato interno: [[SELL_ALERT:{"price":392.48,"condition":"above"}]]
 */

const ALERT_TAG_REGEX = /\s*\[\[SELL_ALERT:(\{[^\]]*\})\]\]\s*/g;

function extractPriceAlert(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') {
    return { cleanNotes: '', sellAlert: null };
  }

  let sellAlert = null;
  let match;
  const regex = new RegExp(ALERT_TAG_REGEX.source, 'g');
  while ((match = regex.exec(rawNotes)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const price = parseFloat(parsed.price);
      if (!isNaN(price) && price > 0) {
        const condition = parsed.condition === 'below' ? 'below' : 'above';
        sellAlert = {
          price: Number(price.toFixed(4)),
          condition
        };
      }
    } catch (e) {
      // Ignorar tag malformado
    }
  }

  const cleanNotes = rawNotes.replace(ALERT_TAG_REGEX, ' ').trim();
  return { cleanNotes, sellAlert };
}

function embedPriceAlert(cleanNotes, sellAlert) {
  const base = extractPriceAlert(cleanNotes || '').cleanNotes;
  if (!sellAlert || !sellAlert.price || isNaN(parseFloat(sellAlert.price)) || parseFloat(sellAlert.price) <= 0) {
    return base;
  }

  const payload = {
    price: Number(parseFloat(sellAlert.price).toFixed(4)),
    condition: sellAlert.condition === 'below' ? 'below' : 'above'
  };
  const tag = `[[SELL_ALERT:${JSON.stringify(payload)}]]`;
  return base ? `${base} ${tag}` : tag;
}

function evaluatePriceAlert(sellAlert, livePrice, buyPrice, quantity) {
  if (!sellAlert || !sellAlert.price || isNaN(sellAlert.price) || sellAlert.price <= 0) {
    return {
      sell_alert_price: null,
      sell_alert_condition: null,
      sell_alert_triggered: false,
      sell_alert_diff_usd: null,
      sell_alert_diff_pct: null,
      sell_alert_return_pct: null,
      sell_alert_est_gain: null
    };
  }

  const target = Number(sellAlert.price);
  const condition = sellAlert.condition === 'below' ? 'below' : 'above';
  const live = Number(livePrice) || 0;
  const buy = Number(buyPrice) || 0;
  const qty = Number(quantity) || 0;

  const triggered = live > 0
    ? (condition === 'above' ? live >= target : live <= target)
    : false;

  const diffUsd = live > 0 ? Number((target - live).toFixed(2)) : null;
  const diffPct = live > 0 ? Number((((target - live) / live) * 100).toFixed(2)) : null;
  const returnPctAtAlert = buy > 0 ? Number((((target - buy) / buy) * 100).toFixed(2)) : null;
  const estGainAtAlert = (buy > 0 && qty > 0) ? Number(((target - buy) * qty).toFixed(2)) : null;

  return {
    sell_alert_price: Number(target.toFixed(2)),
    sell_alert_condition: condition,
    sell_alert_triggered: triggered,
    sell_alert_diff_usd: diffUsd,
    sell_alert_diff_pct: diffPct,
    sell_alert_return_pct: returnPctAtAlert,
    sell_alert_est_gain: estGainAtAlert
  };
}

module.exports = {
  extractPriceAlert,
  embedPriceAlert,
  evaluatePriceAlert
};
