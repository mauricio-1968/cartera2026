const axios = require('axios');

// Cache local de noticias (5 minutos para mantener datos frescos)
const newsCache = {};
const CACHE_TTL_MS = 300000;

/**
 * Limpia entidades HTML y tags
 */
function cleanHtml(text) {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Diccionario y traductor contextual de términos y oraciones financieras a español
 */
function translateFinancialText(text, symbol = '') {
  if (!text) return '';
  let t = cleanHtml(text);

  // Diccionario de frases y patrones financieros comunes
  const phraseMap = [
    [/Shares of\s+/gi, 'Las acciones de '],
    [/Stock in focus/gi, 'Acción en foco'],
    [/reported fourth-quarter fiscal/gi, 'reportó el cuarto trimestre fiscal'],
    [/reported third-quarter fiscal/gi, 'reportó el tercer trimestre fiscal'],
    [/reported second-quarter fiscal/gi, 'reportó el segundo trimestre fiscal'],
    [/reported first-quarter fiscal/gi, 'reportó el primer trimestre fiscal'],
    [/reported quarterly/gi, 'reportó resultados trimestrales'],
    [/earnings call transcript/gi, 'transcripción de resultados'],
    [/beat Wall Street('s)? expectations for both revenue and profit/gi, 'superó las expectativas de Wall Street tanto en ingresos como en beneficios'],
    [/beat Wall Street('s)? expectations/gi, 'superó las expectativas de Wall Street'],
    [/beat analyst estimates/gi, 'superó las estimaciones de los analistas'],
    [/missed analyst estimates/gi, 'quedó por debajo de las estimaciones de los analistas'],
    [/consensus forecasts/gi, 'pronósticos de consenso'],
    [/revenue surged/gi, 'los ingresos se dispararon'],
    [/revenue fell/gi, 'los ingresos cayeron'],
    [/backlog hit/gi, 'la cartera de pedidos acumulados alcanzó'],
    [/faces uncertainty/gi, 'enfrenta incertidumbre'],
    [/reaches final investment decision/gi, 'alcanza la decisión final de inversión'],
    [/announces \d+-year agreements/gi, (m) => m.replace(/announces/i, 'anuncia').replace(/agreements/i, 'acuerdos')],
    [/gearing up for a public launch/gi, 'preparándose para un lanzamiento público'],
    [/all-time high/gi, 'máximo histórico'],
    [/52-week high/gi, 'máximo de 52 semanas'],
    [/52-week low/gi, 'mínimo de 52 semanas'],
    [/year over year/gi, 'interanual'],
    [/quarter over quarter/gi, 'intertrimestral'],
    [/free cash flow/gi, 'flujo de caja libre'],
    [/operating income/gi, 'ingreso operativo'],
    [/net income/gi, 'beneficio neto'],
    [/price target/gi, 'precio objetivo'],
    [/price target raised to/gi, 'precio objetivo elevado a'],
    [/price target cut to/gi, 'precio objetivo rebajado a'],
    [/upgraded to/gi, 'recomendación elevada a'],
    [/downgraded to/gi, 'recomendación rebajada a'],
    [/buy rating/gi, 'calificación de COMPRA'],
    [/hold rating/gi, 'calificación de MANTENER'],
    [/sell rating/gi, 'calificación de VENTA'],
    [/outperform/gi, 'superar al mercado'],
    [/underperform/gi, 'rendimiento inferior al mercado'],
    [/Wall Street/gi, 'Wall Street'],
    [/Investors/gi, 'Inversionistas'],
    [/investor/gi, 'inversionista'],
    [/Treasury yields/gi, 'rendimientos del Tesoro'],
    [/Federal Reserve|the Fed/gi, 'la Reserva Federal'],
    [/Interest rates/gi, 'tasas de interés'],
    [/Inflation/gi, 'inflación'],
    [/Stock market today/gi, 'Mercado bursátil hoy'],
    [/Markets inch lower/gi, 'Los mercados retroceden levemente'],
    [/Markets jump/gi, 'Los mercados repuntan'],
    [/Stock/gi, 'Acción'],
    [/Stocks/gi, 'Acciones'],
    [/Shares/gi, 'Acciones'],
    [/Rallies|Rally/gi, 'Repunta'],
    [/Surges|Surge/gi, 'Se dispara'],
    [/Jumps|Jumped/gi, 'Sube'],
    [/Soars|Soaring/gi, 'Sube con fuerza'],
    [/Drops|Dropped/gi, 'Cae'],
    [/Plunges|Plunging/gi, 'Cae fuertemente'],
    [/Sinks|Sinking/gi, 'Retrocede con fuerza'],
    [/Earnings/gi, 'Ganancias trimestrales'],
    [/Revenue/gi, 'Ingresos'],
    [/Profit/gi, 'Beneficios']
  ];

  for (const [pattern, rep] of phraseMap) {
    if (typeof rep === 'function') {
      t = t.replace(pattern, rep);
    } else {
      t = t.replace(pattern, rep);
    }
  }

  return t;
}

/**
 * Detectar la fuente / editorial exacta de la noticia
 */
function identifyPublisher(url, title = '', rawSource = '') {
  if (rawSource && rawSource.trim().length > 1) {
    return rawSource.trim();
  }

  const u = (url || '').toLowerCase();
  if (u.includes('fool.com')) return 'The Motley Fool';
  if (u.includes('reuters.com')) return 'Reuters';
  if (u.includes('bloomberg.com')) return 'Bloomberg';
  if (u.includes('barrons.com')) return "Barron's";
  if (u.includes('investors.com')) return "Investor's Business Daily";
  if (u.includes('zacks.com')) return 'Zacks Research';
  if (u.includes('theinformation.com')) return 'The Information';
  if (u.includes('cnbc.com')) return 'CNBC';
  if (u.includes('marketwatch.com')) return 'MarketWatch';
  if (u.includes('wsj.com')) return 'Wall Street Journal';
  if (u.includes('seekingalpha.com')) return 'Seeking Alpha';
  if (u.includes('stocktwits.com')) return 'StockTwits';
  if (u.includes('trefis.com')) return 'Trefis';
  if (u.includes('investing.com')) return 'Investing.com';
  if (u.includes('eleconomista.es') || u.includes('eleconomista')) return 'El Economista';
  if (u.includes('cincodias.elpais.com')) return 'Cinco Días';
  if (u.includes('forbes.com') || u.includes('forbes')) return 'Forbes';
  if (u.includes('simplywall.st')) return 'Simply Wall St';
  if (u.includes('tradingkey.com')) return 'TradingKey';
  if (u.includes('finance.yahoo.com') || u.includes('finanzas.yahoo')) return 'Yahoo Finanzas';

  // Si en el título viene " - Fuente" al final
  const dashMatch = title.match(/-\s*([A-Za-z0-9\.\s]+)$/);
  if (dashMatch && dashMatch[1] && dashMatch[1].length < 30) {
    return dashMatch[1].trim();
  }

  return 'Agencia Financiera';
}

/**
 * Calcular el tiempo relativo transcurrido
 */
function getRelativeTimeSpan(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return 'Reciente';
  const now = new Date();
  const diffMs = now - dateObj;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 5) return 'Hace unos minutos';
  if (diffMins < 60) return `Hace ${diffMins} minutos`;
  if (diffHours === 1) return 'Hace 1 hora';
  if (diffHours < 24) return `Hace ${diffHours} horas`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

/**
 * Analizar el impacto financiero (sentimiento) de la noticia
 */
function analyzeSentiment(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  
  const bullishKeywords = [
    'superó', 'beat', 'surge', 'surged', 'sube', 'repunte', 'rally', 'record', 'récord',
    'crecimiento', 'growth', 'alza', 'máximo', 'upgrade', 'elevación', 'ganancias sólidas',
    'contrato', 'agreement', 'dividendo', 'optimista', 'buy rating', 'outperform'
  ];
  
  const bearishKeywords = [
    'cae', 'fell', 'drop', 'dropped', 'plunge', 'quedó por debajo', 'missed', 'pérdida',
    'loss', 'downgrade', 'rebaja', 'demanda', 'lawsuit', 'investigación', 'baja', 'alerta',
    'warning', 'sinks', 'sell-off', 'retraso', 'delay', 'incertidumbre'
  ];

  let bullScore = 0;
  let bearScore = 0;

  bullishKeywords.forEach(k => { if (combined.includes(k)) bullScore++; });
  bearishKeywords.forEach(k => { if (combined.includes(k)) bearScore++; });

  if (bullScore > bearScore) {
    return {
      type: 'bullish',
      badge: '🟢 Impacto Favorable / Alcista',
      color: '#10b981',
      actionHint: 'Catalizador positivo: respalda el valor o recuperación de la posición.'
    };
  } else if (bearScore > bullScore) {
    return {
      type: 'bearish',
      badge: '🔴 Impacto de Precaución / Bajista',
      color: '#ef4444',
      actionHint: 'Presión de corto plazo: monitorear soportes técnicos y nivel de Stop Loss.'
    };
  }
  return {
    type: 'neutral',
    badge: '🔵 Impacto Informativo / Seguimiento',
    color: '#38bdf8',
    actionHint: 'Reporte corporativo: evolución estándar del sector y mercado bursátil.'
  };
}

/**
 * Consultar noticias RSS en tiempo real para un símbolo combinando Yahoo Finance y Google News
 */
async function fetchNewsForSymbol(symbol) {
  const sym = symbol.trim().toUpperCase();
  const items = [];
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // 1. Fuente 1: Yahoo Finance RSS (Titulares rápidos con descripción exacta de Wall Street)
  try {
    const yUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}`;
    const response = await axios.get(yUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });

    const xmlData = response.data || '';
    const itemMatches = xmlData.match(/<item>[\s\S]*?<\/item>/g) || [];

    itemMatches.slice(0, 4).forEach((itemXml, idx) => {
      const titleMatch = itemXml.match(/<title>(.*?)<\/title>/);
      const descMatch = itemXml.match(/<description>(.*?)<\/description>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);

      if (titleMatch && titleMatch[1]) {
        const rawTitle = cleanHtml(titleMatch[1]);
        const rawDesc = descMatch ? cleanHtml(descMatch[1]) : '';
        const rawPubDate = pubDateMatch ? pubDateMatch[1] : '';
        const pubDateObj = rawPubDate ? new Date(rawPubDate) : new Date();
        const link = linkMatch ? cleanHtml(linkMatch[1]) : '#';

        if ((now - pubDateObj.getTime()) <= SEVEN_DAYS_MS || items.length === 0) {
          const publisher = identifyPublisher(link, rawTitle);
          const titleEs = translateFinancialText(rawTitle, sym);
          const descEs = rawDesc ? translateFinancialText(rawDesc, sym) : `Reporte corporativo y financiero reciente sobre ${sym} publicado por ${publisher}.`;
          const sentiment = analyzeSentiment(titleEs, descEs);

          items.push({
            id: `y_${sym}_${idx}_${pubDateObj.getTime()}`,
            symbol: sym,
            title: titleEs,
            originalTitle: rawTitle,
            summary: descEs,
            publisher: publisher,
            link: link,
            providerPublishTime: getRelativeTimeSpan(pubDateObj),
            pubTimestamp: pubDateObj.getTime(),
            pubDateFormatted: pubDateObj.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
            sentiment: sentiment
          });
        }
      }
    });
  } catch (err) {
    console.warn(`[Yahoo News] Advertencia consultando ${sym}:`, err.message);
  }

  // 2. Fuente 2: Google News en Español (Artículos nativos en español)
  try {
    const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(sym + ' stock OR accion ' + sym)}&hl=es-419&gl=US&ceid=US:es-419`;
    const gRes = await axios.get(gUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });

    const gXml = gRes.data || '';
    const gItemMatches = gXml.match(/<item>[\s\S]*?<\/item>/g) || [];

    gItemMatches.slice(0, 3).forEach((itemXml, idx) => {
      const titleMatch = itemXml.match(/<title>(.*?)<\/title>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
      const sourceMatch = itemXml.match(/<source[^>]*>(.*?)<\/source>/);

      if (titleMatch && titleMatch[1]) {
        let rawTitle = cleanHtml(titleMatch[1]);
        const rawSource = sourceMatch ? cleanHtml(sourceMatch[1]) : '';
        const publisher = identifyPublisher('', rawTitle, rawSource);

        // Remover el sufijo "- Fuente" del título si viene incluido
        rawTitle = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim();

        const rawPubDate = pubDateMatch ? pubDateMatch[1] : '';
        const pubDateObj = rawPubDate ? new Date(rawPubDate) : new Date();
        const link = linkMatch ? cleanHtml(linkMatch[1]) : '#';

        // Evitar duplicados con títulos muy similares
        const isDuplicate = items.some(it => it.title.toLowerCase().substring(0, 30) === rawTitle.toLowerCase().substring(0, 30));

        if (!isDuplicate && ((now - pubDateObj.getTime()) <= SEVEN_DAYS_MS || items.length === 0)) {
          const descEs = `Análisis y reporte de mercado sobre ${sym} publicado por ${publisher}. Proporciona cobertura de cotización, catalizadores bursátiles y contexto para inversionistas.`;
          const sentiment = analyzeSentiment(rawTitle, descEs);

          items.push({
            id: `g_${sym}_${idx}_${pubDateObj.getTime()}`,
            symbol: sym,
            title: rawTitle,
            originalTitle: rawTitle,
            summary: descEs,
            publisher: publisher,
            link: link,
            providerPublishTime: getRelativeTimeSpan(pubDateObj),
            pubTimestamp: pubDateObj.getTime(),
            pubDateFormatted: pubDateObj.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
            sentiment: sentiment
          });
        }
      }
    });
  } catch (err) {
    console.warn(`[Google News] Advertencia consultando ${sym}:`, err.message);
  }

  // Ordenar de más reciente a más antigua
  items.sort((a, b) => b.pubTimestamp - a.pubTimestamp);
  return items.slice(0, 5);
}

/**
 * Obtener noticias combinadas y exactas para todas las posiciones de la cartera
 */
async function getPortfolioNews(symbols = []) {
  if (!symbols || symbols.length === 0) return [];

  const uniqueSymbols = [...new Set(symbols.map(s => s.trim().toUpperCase()))].slice(0, 8);
  const cacheKey = uniqueSymbols.sort().join(',');
  const now = Date.now();

  if (newsCache[cacheKey] && (now - newsCache[cacheKey].timestamp < CACHE_TTL_MS)) {
    return newsCache[cacheKey].data;
  }

  const promises = uniqueSymbols.map(sym => fetchNewsForSymbol(sym));
  const resultsArray = await Promise.all(promises);

  let allNews = [];
  resultsArray.forEach(newsList => {
    allNews = allNews.concat(newsList);
  });

  // Ordenar por las noticias más recientes
  allNews.sort((a, b) => b.pubTimestamp - a.pubTimestamp);

  // Fallback si la cartera está vacía o sin noticias
  if (allNews.length === 0) {
    allNews = [
      {
        id: 'news_general_1',
        symbol: 'MERCADO EE.UU.',
        title: 'Jornada bursátil en Wall Street: Estabilidad en los principales sectores de la Bolsa de EE.UU.',
        originalTitle: 'Wall Street Market Overview',
        summary: 'Los principales índices bursátiles de Nueva York operan con atención puesta en reportes corporativos trimestrales y proyecciones de tipos de interés de la Reserva Federal.',
        publisher: 'Mercado de Nueva York',
        link: 'https://finance.yahoo.com',
        providerPublishTime: 'Hoy',
        pubTimestamp: now,
        pubDateFormatted: new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }),
        sentiment: {
          type: 'neutral',
          badge: '🔵 Impacto Informativo / Seguimiento',
          color: '#38bdf8',
          actionHint: 'Seguimiento general de mercado para activos de renta variable.'
        }
      }
    ];
  }

  newsCache[cacheKey] = { timestamp: now, data: allNews };
  return allNews;
}

module.exports = { getPortfolioNews };
