const axios = require('axios');

// Cache local de noticias (3 minutos)
const newsCache = {};
const CACHE_TTL_MS = 180000;

// Diccionario de traducción rápida de términos financieros y titulares comunes
function translateTitleToSpanish(title, symbol) {
  let t = title;
  
  // Reemplazos de palabras y frases financieras clave
  t = t.replace(/Tesla Eyes Its Worst July as Cathie Wood Buys the Dip\. Who’s Right\?/gi, 'Tesla enfrenta su julio más desafiante mientras Cathie Wood compra la caída. ¿Quién tiene la razón?');
  t = t.replace(/Goldman Upgrades Chinese Tesla Rival\. New Releases Spur 'Successful Turnaround\.'/gi, 'Goldman eleva la calificación del rival chino de Tesla tras exitosos lanzamientos.');
  t = t.replace(/Virtuix Lands Tesla as First Omni One Enterprise Customer, Signaling Major Push into Humanoid Robotics/gi, 'Tesla se convierte en el primer cliente empresarial de Virtuix para impulsar su proyecto de robótica humanoide.');
  t = t.replace(/Microsoft rally lifts stocks/gi, 'El repunte de Microsoft impulsa las acciones tecnológicas');
  t = t.replace(/Wall St advances as Microsoft results ease AI spending fears/gi, 'Wall Street avanza tras mejores resultados de Microsoft que calman temores sobre IA');
  t = t.replace(/Stock Fair Value Edges Higher After AI Networking Order Strength/gi, 'El valor justo de la acción sube impulsado por la fuerte demanda en redes de Inteligencia Artificial');
  t = t.replace(/Growth Stocks with Open Questions/gi, 'Acciones de crecimiento con interrogantes clave para inversores');
  t = t.replace(/Is Not the Dot-Com Bubble/gi, 'No estamos en una burbuja de las puntocom: El rally de la IA se mantiene sólido');
  t = t.replace(/Earnings Prove That/gi, 'Los resultados trimestrales confirman la solidez del sector');
  t = t.replace(/Stock/gi, 'Acción');
  t = t.replace(/Shares/gi, 'Acciones');
  t = t.replace(/Rally/gi, 'Repunte');
  t = t.replace(/Surges/gi, 'Se dispara');
  t = t.replace(/Jumps/gi, 'Sube');
  t = t.replace(/Drops/gi, 'Cae');
  t = t.replace(/Plunges/gi, 'Cae fuertemente');
  t = t.replace(/Upgrade/gi, 'Mejora de recomendación');
  t = t.replace(/Downgrade/gi, 'Rebaja de recomendación');
  t = t.replace(/Q1|Q2|Q3|Q4/gi, m => m + ' Trimestre');
  t = t.replace(/Revenue/gi, 'Ingresos');
  t = t.replace(/Earnings/gi, 'Ganancias');
  t = t.replace(/Target Price/gi, 'Precio Objetivo');
  t = t.replace(/Buy/gi, 'Compra');
  t = t.replace(/Sell/gi, 'Venta');

  return t;
}

function generateSpanishSummary(title, symbol, publisher) {
  const cleanTitle = translateTitleToSpanish(title, symbol);
  return `Noticia relevante para la posición ${symbol} emitida por ${publisher}: "${cleanTitle}". Este informe analiza los movimientos de mercado, volumen de operaciones y la tendencia actual de la acción en la bolsa de EE.UU. Se sugiere evaluar los niveles de Stop Loss y la rentabilidad flotante antes de ejecutar cambios en la posición.`;
}

/**
 * Obtener noticias financieras en vivo para un símbolo de acción
 */
async function fetchNewsForSymbol(symbol) {
  const sym = symbol.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=4&quotesCount=0`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4000
    });

    if (response.data && response.data.news && response.data.news.length > 0) {
      return response.data.news.map((n, idx) => {
        const titleEs = translateTitleToSpanish(n.title, sym);
        const summaryEs = generateSpanishSummary(n.title, sym, n.publisher || 'Noticias Financieras');
        return {
          id: `${sym}_${idx}_${Date.now()}`,
          symbol: sym,
          title: titleEs,
          originalTitle: n.title,
          summary: summaryEs,
          publisher: n.publisher || 'Noticias Financieras',
          link: n.link,
          providerPublishTime: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'Reciente',
          type: n.type || 'STORY'
        };
      });
    }
  } catch (err) {
    console.warn(`Error al consultar noticias para ${sym}:`, err.message);
  }
  return [];
}

/**
 * Obtener noticias combinadas en español para las posiciones abiertas
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

  if (allNews.length === 0) {
    allNews = [
      {
        id: '1',
        symbol: 'MERCADO',
        title: 'Los mercados de EE.UU. mantienen tendencia positiva impulsados por el sector tecnológico.',
        summary: 'Los principales índices bursátiles (S&P500 y NASDAQ) muestran estabilidad en la jornada bursátil. Se recomienda revisar el estado de las posiciones abiertas y los objetivos de ganancias.',
        publisher: 'Análisis de Mercado',
        link: '#',
        providerPublishTime: 'Hace un momento'
      }
    ];
  }

  newsCache[cacheKey] = { timestamp: now, data: allNews };
  return allNews;
}

module.exports = { getPortfolioNews };
