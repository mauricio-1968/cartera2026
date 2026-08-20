const app = {
  data: null,
  currentUser: null,
  charts: {},
  refreshInterval: null,
  selectedIntradaySymbol: 'TSLA',

  async init() {
    this.initTheme();

    const todayStr = new Date().toISOString().split('T')[0];
    const buyDateElem = document.getElementById('buy-date');
    const sellDateElem = document.getElementById('sell-date');
    if (buyDateElem) buyDateElem.value = todayStr;
    if (sellDateElem) sellDateElem.value = todayStr;

    this.setupDragAndDrop();

    // Verificar si hay usuario/token guardado
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');

    if (token && userJson) {
      try {
        this.currentUser = JSON.parse(userJson);
        this.updateUserBar();
      } catch (e) {}
    } else {
      // Si no hay sesión, iniciar con cuenta Mauricio por defecto
      this.currentUser = { id: 1, name: 'Mauricio Martinez', email: 'mauricio@cartera.com' };
      this.updateUserBar();
    }

    await this.fetchPortfolio();

    this.refreshInterval = setInterval(() => {
      this.fetchPortfolio(true);
    }, 15000);
  },

  getAuthHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  updateUserBar() {
    const nameElem = document.getElementById('current-user-name');
    if (nameElem && this.currentUser) {
      nameElem.innerText = this.currentUser.name;
    }
  },

  // ==========================================
  // AUTENTICACIÓN (LOGIN / REGISTRO / LOGOUT)
  // ==========================================
  openAuthModal() {
    document.getElementById('modal-auth').classList.add('active');
  },
  closeAuthModal() {
    document.getElementById('modal-auth').classList.remove('active');
  },

  switchAuthTab(tab) {
    document.getElementById('auth-tab-login').classList.remove('active');
    document.getElementById('auth-tab-register').classList.remove('active');
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-register').style.display = 'none';

    if (tab === 'login') {
      document.getElementById('auth-tab-login').classList.add('active');
      document.getElementById('form-login').style.display = 'block';
    } else {
      document.getElementById('auth-tab-register').classList.add('active');
      document.getElementById('form-register').style.display = 'block';
    }
  },

  async submitLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en inicio de sesión');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.currentUser = data.user;
      this.updateUserBar();
      this.closeAuthModal();

      await this.fetchPortfolio();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  },

  async submitRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en registro');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      this.currentUser = data.user;
      this.updateUserBar();
      this.closeAuthModal();

      alert(`¡Bienvenido ${data.user.name}! Tu cuenta privada ha sido creada.`);
      await this.fetchPortfolio();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUser = null;
    this.openAuthModal();
  },

  // ==========================================
  // CARGA DE DATOS Y RENDERIZADO
  // ==========================================
  async fetchPortfolio(isSilent = false) {
    if (!isSilent) {
      const spinner = document.getElementById('refresh-spinner');
      if (spinner) spinner.classList.add('spin');
    }

    try {
      const res = await fetch('/api/portfolio/summary', {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        if (res.status === 401) {
          this.openAuthModal();
          return;
        }
        throw new Error('Error al cargar datos');
      }
      const data = await res.json();
      this.data = data;

      this.renderSummary(data.summary);
      this.renderVerticalTickerList(data.openPositions);
      this.renderCharts(data.openPositions);
      this.renderNews(data.news);
      this.renderOpenTable(data.openPositions);
      this.renderClosedTable(data.closedPositions);
      this.populateTickerFilters();
      this.fetchWatchlist();

    } catch (err) {
      console.error('Error cargando portafolio:', err);
    } finally {
      if (!isSilent) {
        const spinner = document.getElementById('refresh-spinner');
        if (spinner) spinner.classList.remove('spin');
      }
    }
  },

  refreshData() {
    this.fetchPortfolio(false);
  },

  renderSummary(s) {
    document.getElementById('stat-total-val').innerText = `$${s.totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-total-sub').innerHTML = `Capital Abierto: <strong>$${s.totalOpenInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>`;

    const unrealizedElem = document.getElementById('stat-unrealized');
    const unrealizedSub = document.getElementById('stat-unrealized-sub');
    const uGain = s.unrealizedGain;
    const uPercent = s.unrealizedGainPercent;

    unrealizedElem.innerText = `${uGain >= 0 ? '+' : ''}$${uGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    unrealizedElem.className = `stat-value ${uGain >= 0 ? 'text-success' : 'text-danger'}`;
    unrealizedSub.innerHTML = `<span class="${uPercent >= 0 ? 'badge-up' : 'badge-down'}">${uPercent >= 0 ? '+' : ''}${uPercent.toFixed(2)}% Flotante</span> (${s.openPositionsCount} posiciones)`;

    document.getElementById('stat-realized').innerText = `+$${s.totalRealizedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-realized-sub').innerText = `+${s.realizedGainPercent.toFixed(1)}% Retorno acumulado`;

    document.getElementById('stat-winrate').innerText = `${s.winRatePercent.toFixed(1)}%`;
    document.getElementById('stat-winrate-sub').innerText = `${s.closedPositionsCount} ventas registradas`;

    document.getElementById('count-open').innerText = s.openPositionsCount;
    document.getElementById('count-closed').innerText = s.closedPositionsCount;
  },

  renderVerticalTickerList(openPositions) {
    const listElem = document.getElementById('vertical-ticker-list');
    if (!listElem) return;

    if (!openPositions || openPositions.length === 0) {
      listElem.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No hay acciones activas en tu cartera.</div>`;
      return;
    }

    let html = '';
    openPositions.forEach(pos => {
      const isUp = pos.change >= 0;
      html += `
        <div class="vertical-ticker-item">
          <div class="v-ticker-info">
            <div class="v-ticker-icon">${pos.symbol.substring(0, 3)}</div>
            <div>
              <div class="v-ticker-symbol">${pos.symbol}</div>
              <div class="v-ticker-name">${pos.original_name || pos.symbol}</div>
            </div>
          </div>
          <div class="v-ticker-pricing">
            <div class="v-ticker-price">$${pos.livePrice.toFixed(2)}</div>
            <div>
              <span class="${isUp ? 'badge-up' : 'badge-down'}">
                ${isUp ? '▲ +' : '▼ '}${pos.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      `;
    });

    listElem.innerHTML = html;
  },

  renderNews(newsItems) {
    const container = document.getElementById('news-feed-container');
    if (!container) return;

    this.currentNews = newsItems || [];

    if (!newsItems || newsItems.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron noticias recientes para tus activos.</div>`;
      return;
    }

    let html = '';
    newsItems.slice(0, 12).forEach((item, idx) => {
      const sentiment = item.sentiment || { type: 'neutral', badge: '🔵 Informativo', color: '#38bdf8' };
      const sentimentBg = sentiment.type === 'bullish' ? 'rgba(16,185,129,0.15)' : (sentiment.type === 'bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.15)');
      const sentimentColor = sentiment.color || '#38bdf8';
      const snippet = (item.summary || '').length > 115 ? (item.summary.substring(0, 115) + '...') : (item.summary || '');

      html += `
        <div class="news-card" onclick="app.openNewsModal(${idx})" style="cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; border-left: 3px solid ${sentimentColor};">
          <div>
            <div class="news-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="news-badge">${item.symbol}</span>
                <span class="news-publisher" style="font-weight: 600;">${item.publisher}</span>
              </div>
              <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${sentimentBg}; color: ${sentimentColor}; font-weight: 700;">
                ${sentiment.type === 'bullish' ? '▲ ALCISTA' : (sentiment.type === 'bearish' ? '▼ PRECAUCIÓN' : '● INFO')}
              </span>
            </div>
            <div class="news-title" style="font-size: 13.5px; font-weight: 700; color: #fff; line-height: 1.35; margin-bottom: 6px;">${item.title}</div>
            <div style="font-size: 11.5px; color: var(--text-muted); line-height: 1.4; margin-bottom: 10px;">${snippet}</div>
          </div>
          <div class="news-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05);">
            <span style="font-size: 11px;">🕒 ${item.providerPublishTime}</span>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px; color: #38bdf8;" onclick="event.stopPropagation(); app.openNewsModal(${idx});">
              Ver Detalles 📑
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  openNewsModal(idx) {
    if (!this.currentNews || !this.currentNews[idx]) return;
    const item = this.currentNews[idx];

    document.getElementById('news-modal-symbol').innerText = item.symbol;
    document.getElementById('news-modal-title').innerText = item.title;
    document.getElementById('news-modal-publisher').innerText = item.publisher || 'Fuente Financiera';
    document.getElementById('news-modal-time').innerText = `${item.providerPublishTime} (${item.pubDateFormatted || 'Hoy'})`;
    document.getElementById('news-modal-summary').innerText = item.summary;

    const sentiment = item.sentiment || { type: 'neutral', badge: '🔵 Informativo', color: '#38bdf8', actionHint: 'Seguimiento general de mercado para activos de renta variable.' };
    
    const sentimentBadgeElem = document.getElementById('news-modal-sentiment-badge');
    if (sentimentBadgeElem) {
      sentimentBadgeElem.innerText = sentiment.badge;
      sentimentBadgeElem.style.background = sentiment.type === 'bullish' ? 'rgba(16,185,129,0.15)' : (sentiment.type === 'bearish' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.15)');
      sentimentBadgeElem.style.color = sentiment.color;
      sentimentBadgeElem.style.border = `1px solid ${sentiment.color}40`;
    }

    const impactContainer = document.getElementById('news-modal-impact-container');
    const impactText = document.getElementById('news-modal-impact-text');
    if (impactContainer && impactText) {
      impactText.innerText = sentiment.actionHint;
      if (sentiment.type === 'bullish') {
        impactContainer.style.background = 'rgba(16,185,129,0.08)';
        impactContainer.style.borderColor = 'rgba(16,185,129,0.3)';
      } else if (sentiment.type === 'bearish') {
        impactContainer.style.background = 'rgba(239,68,68,0.08)';
        impactContainer.style.borderColor = 'rgba(239,68,68,0.3)';
      } else {
        impactContainer.style.background = 'rgba(56,189,248,0.08)';
        impactContainer.style.borderColor = 'rgba(56,189,248,0.3)';
      }
    }

    const linkElem = document.getElementById('news-modal-link');
    if (linkElem) {
      if (item.link && item.link !== '#') {
        linkElem.href = item.link;
        linkElem.style.display = 'inline-flex';
        linkElem.innerHTML = `<span>🌐 Leer Nota Completa en ${item.publisher || 'la Fuente'}</span> ↗`;
      } else {
        linkElem.style.display = 'none';
      }
    }

    document.getElementById('modal-news').classList.add('active');
  },

  closeNewsModal() {
    document.getElementById('modal-news').classList.remove('active');
  },

  theme: 'dark',
  showVolume: true,

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    this.theme = savedTheme;
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      this.updateThemeButton(true);
    } else {
      document.body.classList.remove('light-theme');
      this.updateThemeButton(false);
    }
  },

  toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    this.theme = isLight ? 'light' : 'dark';
    localStorage.setItem('theme', this.theme);
    this.updateThemeButton(isLight);

    if (this.data && this.data.openPositions) {
      this.renderCharts(this.data.openPositions);
    }
  },

  updateThemeButton(isLight) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon && text) {
      if (isLight) {
        icon.innerText = '🌙';
        text.innerText = 'Modo Oscuro';
      } else {
        icon.innerText = '☀️';
        text.innerText = 'Modo Claro';
      }
    }
  },

  toggleVolume() {
    this.showVolume = !this.showVolume;
    const txt = document.getElementById('volume-status-text');
    const btn = document.getElementById('btn-chart-volume');
    if (txt) txt.innerText = this.showVolume ? 'ON' : 'OFF';
    if (btn) {
      btn.style.background = this.showVolume ? 'var(--primary)' : 'transparent';
      btn.style.color = this.showVolume ? '#fff' : 'var(--text-muted)';
    }
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  intradayChartStyle: 'line', // 'line' o 'candle'

  setChartStyle(style) {
    this.intradayChartStyle = style;
    const btnLine = document.getElementById('btn-chart-style-line');
    const btnCandle = document.getElementById('btn-chart-style-candle');

    if (style === 'line') {
      if (btnLine) { btnLine.style.background = 'var(--primary)'; btnLine.style.color = '#fff'; }
      if (btnCandle) { btnCandle.style.background = 'transparent'; btnCandle.style.color = 'var(--text-muted)'; }
    } else {
      if (btnCandle) { btnCandle.style.background = 'var(--primary)'; btnCandle.style.color = '#fff'; }
      if (btnLine) { btnLine.style.background = 'transparent'; btnLine.style.color = 'var(--text-muted)'; }
    }

    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  renderCharts(openPositions) {
    const selectElem = document.getElementById('chart-stock-select');
    if (selectElem && openPositions && openPositions.length > 0) {
      const currentSelected = this.selectedIntradaySymbol;
      let html = '';
      openPositions.forEach(p => {
        const isSel = p.symbol === currentSelected ? 'selected' : '';
        html += `<option value="${p.symbol}" ${isSel}>${p.symbol} ($${p.livePrice.toFixed(2)})</option>`;
      });
      selectElem.innerHTML = html;

      if (!openPositions.some(p => p.symbol === currentSelected)) {
        this.selectedIntradaySymbol = openPositions[0].symbol;
      }
    }

    this.setChartStyle(this.intradayChartStyle);
    this.fetchAndRenderHistoricalChart();
  },

  async changeIntradaySymbol(symbol) {
    this.selectedIntradaySymbol = symbol;
    await this.fetchAndRenderIntradayChart(symbol);
  },

  async fetchAndRenderIntradayChart(symbol) {
    const canvas = document.getElementById('chart-intraday-line');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
      const res = await fetch(`/api/chart/intraday?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error('Error al obtener datos intradiarios');
      const data = await res.json();

      const points = data.points || [];
      const labels = points.map(p => p.time);
      const volumes = points.map(p => p.volume || 0);

      const maxVol = Math.max(...volumes, 1);
      const volColors = points.map(p => p.close >= p.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)');

      if (this.charts.intraday) this.charts.intraday.destroy();

      const isLight = document.body.classList.contains('light-theme');
      const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
      const tickColor = isLight ? '#475569' : '#9ca3af';

      const datasets = [];

      if (this.intradayChartStyle === 'candle') {
        const barRanges = points.map(p => [p.low, p.high]);
        datasets.push({
          type: 'bar',
          label: `${symbol} (Velas)`,
          data: barRanges,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          yAxisID: 'y'
        });
      } else {
        const prices = points.map(p => p.close || p.price);
        const firstPrice = data.prevClose || (prices[0] || 100);
        const lastPrice = data.currentPrice || (prices[prices.length - 1] || firstPrice);
        const isPositive = lastPrice >= firstPrice;

        const strokeColor = isPositive ? (isLight ? '#059669' : '#10b981') : (isLight ? '#dc2626' : '#ef4444');
        const bgGradient = ctx.createLinearGradient(0, 0, 0, 260);
        if (isPositive) {
          bgGradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
          bgGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
        } else {
          bgGradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
          bgGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        }

        datasets.push({
          type: 'line',
          label: `${symbol} (US$)`,
          data: prices,
          borderColor: strokeColor,
          borderWidth: 3,
          backgroundColor: bgGradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: strokeColor,
          pointBorderColor: '#fff',
          pointRadius: 4,
          pointHoverRadius: 7,
          yAxisID: 'y'
        });
      }

      // Dataset de Volumen de Acciones Transadas (Si está activo)
      if (this.showVolume) {
        datasets.push({
          type: 'bar',
          label: 'Volumen Transado',
          data: volumes,
          backgroundColor: volColors,
          borderColor: volColors,
          borderWidth: 1,
          yAxisID: 'yVolume'
        });
      }

      const allLows = points.map(p => p.low || p.price);
      const allHighs = points.map(p => p.high || p.price);
      const minPrice = Math.min(...allLows);
      const maxPrice = Math.max(...allHighs);
      const padding = (maxPrice - minPrice) * 0.05 || 1.0;

      const yMin = Math.floor((minPrice - padding) * 100) / 100;
      const yMax = Math.ceil((maxPrice + padding) * 100) / 100;

      const candlePlugin = {
        id: 'candlePlugin',
        beforeDatasetsDraw(chart) {
          if (app.intradayChartStyle !== 'candle') return;
          const { ctx, scales: { x, y } } = chart;
          points.forEach((p, i) => {
            const xPos = x.getPixelForValue(i);
            const highY = y.getPixelForValue(p.high);
            const lowY = y.getPixelForValue(p.low);
            const openY = y.getPixelForValue(p.open);
            const closeY = y.getPixelForValue(p.close);
            const isGreen = p.close >= p.open;
            const color = isGreen ? '#10b981' : '#ef4444';
            const strokeBorder = isGreen ? '#059669' : '#dc2626';

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xPos, highY);
            ctx.lineTo(xPos, lowY);
            ctx.stroke();

            const topY = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 3);
            const candleWidth = 14;

            ctx.fillStyle = color;
            ctx.fillRect(xPos - candleWidth / 2, topY, candleWidth, bodyHeight);

            ctx.strokeStyle = strokeBorder;
            ctx.lineWidth = 1;
            ctx.strokeRect(xPos - candleWidth / 2, topY, candleWidth, bodyHeight);

            ctx.restore();
          });
        }
      };

      this.charts.intraday = new Chart(ctx, {
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: tickColor, font: { family: 'Outfit', size: 11 } },
              grid: { color: gridColor }
            },
            y: {
              type: 'linear',
              position: 'left',
              min: yMin,
              max: yMax,
              ticks: {
                color: tickColor,
                font: { family: 'Outfit', size: 11 },
                callback: function(v) { return '$' + v.toFixed(2); }
              },
              grid: { color: gridColor }
            },
            yVolume: {
              type: 'linear',
              position: 'right',
              display: false,
              min: 0,
              max: maxVol * 4 // Mantiene las barras de volumen en el 25% inferior del gráfico
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const p = points[context.dataIndex];
                  const volStr = p.volume ? p.volume.toLocaleString('es-ES') + ' acciones' : '0 acciones';
                  if (app.intradayChartStyle === 'candle') {
                    if (context.datasetIndex === 0) {
                      return [
                        `Hora: ${p.time} (NY)`,
                        `Apertura: $${p.open.toFixed(2)}`,
                        `Máximo: $${p.high.toFixed(2)}`,
                        `Mínimo: $${p.low.toFixed(2)}`,
                        `Cierre: $${p.close.toFixed(2)}`,
                        `Volumen Transado: ${volStr}`
                      ];
                    }
                  } else {
                    if (context.datasetIndex === 0) {
                      return [
                        `Hora: ${p.time} (NY)`,
                        `Precio Cierre: $${p.close.toFixed(2)}`,
                        `Volumen Transado: ${volStr}`
                      ];
                    }
                  }
                  return `Volumen Transado: ${volStr}`;
                }
              }
            }
          }
        },
        plugins: [candlePlugin]
      });

    } catch (err) {
      console.error('Error renderizando gráfico intradiario:', err);
    }
  },

  // ==========================================
  // GRÁFICO HISTÓRICO DE VALOR TOTAL DE CARTERA VS TIEMPO
  // ==========================================
  async fetchAndRenderHistoricalChart() {
    const canvas = document.getElementById('chart-historical-line');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
      const res = await fetch('/api/chart/historical-portfolio', {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Error al obtener datos históricos');
      const data = await res.json();
      const timeline = data.timeline || [];

      if (timeline.length === 0) return;

      const labels = timeline.map(t => t.date);
      const totalValues = timeline.map(t => t.totalValue);
      const investedValues = timeline.map(t => t.invested);

      const bgGradient = ctx.createLinearGradient(0, 0, 0, 260);
      bgGradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      bgGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      if (this.charts.historical) this.charts.historical.destroy();

      this.charts.historical = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Valor Total Cartera US$',
              data: totalValues,
              borderColor: '#10b981',
              borderWidth: 3,
              backgroundColor: bgGradient,
              fill: true,
              tension: 0.3,
              pointBackgroundColor: '#10b981',
              pointBorderColor: '#fff',
              pointRadius: 4,
              pointHoverRadius: 7
            },
            {
              label: 'Capital Invertido US$',
              data: investedValues,
              borderColor: '#3b82f6',
              borderWidth: 2,
              borderDash: [6, 4],
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.1,
              pointRadius: 3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 11 } },
              grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
              ticks: {
                color: '#9ca3af',
                font: { family: 'Outfit', size: 11 },
                callback: function(v) { return '$' + v.toLocaleString('en-US'); }
              },
              grid: { color: 'rgba(255,255,255,0.04)' }
            }
          },
          plugins: {
            legend: {
              display: true,
              labels: { color: '#9ca3af', font: { family: 'Outfit', size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const t = timeline[context.dataIndex];
                  if (context.datasetIndex === 0) {
                    const gainSign = t.netGain >= 0 ? '+' : '';
                    return [
                      `Valor Total Cartera: $${t.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      `Ganancia Acumulada Real: ${gainSign}$${t.netGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    ];
                  }
                  return `Capital Invertido: $${t.invested.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error('Error renderizando gráfico histórico de cartera:', err);
    }
  },

  renderOpenTable(openPositions) {
    const tbody = document.getElementById('tbody-open');
    if (!openPositions || openPositions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron posiciones abiertas con el filtro actual.</td></tr>`;
      return;
    }

    let html = '';
    openPositions.forEach(p => {
      const isGain = p.unrealizedGain >= 0;
      html += `
        <tr>
          <td>
            <div class="symbol-cell" onclick="app.openTickerAnalysisModal('${p.symbol}')" style="cursor: pointer;" title="Haz clic para análisis 360° de ${p.symbol}">
              <div class="symbol-avatar">${p.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name" style="color: #38bdf8; text-decoration: underline dotted;">${p.symbol} 🔍</div>
                <div class="symbol-sub">${p.original_name || p.symbol}</div>
              </div>
            </div>
          </td>
          <td>${p.buy_date || '-'}</td>
          <td><strong>${p.quantity}</strong></td>
          <td>$${p.buy_price.toFixed(2)}</td>
          <td>$${p.buy_total.toFixed(2)}</td>
          <td>
            <strong style="color: #fff;">$${p.livePrice.toFixed(2)}</strong>
            <span class="${p.change >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 11px; margin-left: 4px;">
              ${p.change >= 0 ? '+' : ''}${p.changePercent.toFixed(1)}%
            </span>
          </td>
          <td><strong>$${p.currentValue.toFixed(2)}</strong></td>
          <td class="${isGain ? 'text-success' : 'text-danger'}" style="font-weight: 800;">
            ${isGain ? '+' : ''}$${p.unrealizedGain.toFixed(2)}
          </td>
          <td>
            <span class="${isGain ? 'badge-up' : 'badge-down'}">
              ${isGain ? '+' : ''}${p.unrealizedGainPercent.toFixed(2)}%
            </span>
          </td>
          <td>${p.daysHeld}d</td>
          <td>
            <div onclick="app.openForecastModal(${p.id})" style="cursor: pointer;" title="Haz clic para ver el análisis algorítmico completo">
              <span class="${p.forecast.actionColor === 'danger' ? 'badge-down' : (p.forecast.actionColor === 'warning' ? 'badge-status status-open' : 'badge-up')}" style="font-size: 11px; padding: 4px 8px;">
                ${p.forecast.action === 'VENDER' ? '🔴 VENDER' : (p.forecast.action === 'ACUMULAR / MEJORAR' ? '🟡 ACUMULAR' : '🟢 MANTENER')}
              </span>
              <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px; font-weight: 600;">
                ⏳ ${p.forecast.horizon}
              </div>
            </div>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button class="btn btn-success" style="padding: 6px 10px; font-weight: 700; font-size: 11px; box-shadow: 0 0 8px rgba(16,185,129,0.4);" onclick="app.openSellModal(${p.id}, '${p.symbol}', ${p.livePrice})">
                💵 VENDER
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px; color: #38bdf8;" onclick="app.openTickerAnalysisModal('${p.symbol}')" title="Análisis 360°">
                🔍
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px;" onclick="app.openForecastModal(${p.id})" title="Ver Pronóstico">
                🤖
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px;" onclick="app.openEditModal(${p.id})" title="Editar">
                ✏️
              </button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  },

  renderClosedTable(closedPositions) {
    const tbody = document.getElementById('tbody-closed');
    if (!closedPositions || closedPositions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron ventas registradas con el filtro actual.</td></tr>`;
      return;
    }

    let html = '';
    closedPositions.forEach(p => {
      const isWin = (p.realized_gain || 0) >= 0;
      html += `
        <tr>
          <td>
            <div class="symbol-cell" onclick="app.openTickerAnalysisModal('${p.symbol}')" style="cursor: pointer;" title="Haz clic para análisis 360° de ${p.symbol}">
              <div class="symbol-avatar" style="background: rgba(255,255,255,0.05); color: #fff;">${p.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name" style="color: #38bdf8; text-decoration: underline dotted;">${p.symbol} 🔍</div>
                <div class="symbol-sub">${p.original_name || p.symbol}</div>
              </div>
            </div>
          </td>
          <td>${p.buy_date || '-'}</td>
          <td>${p.sell_date || '-'}</td>
          <td>${p.quantity}</td>
          <td>$${p.buy_price ? p.buy_price.toFixed(2) : '0.00'}</td>
          <td>$${p.sell_price ? p.sell_price.toFixed(2) : '0.00'}</td>
          <td>$${p.buy_total ? p.buy_total.toFixed(2) : '0.00'}</td>
          <td>$${p.sell_total ? p.sell_total.toFixed(2) : '0.00'}</td>
          <td class="${isWin ? 'text-success' : 'text-danger'}" style="font-weight: 800;">
            ${isWin ? '+' : ''}$${(p.realized_gain || 0).toFixed(2)}
          </td>
          <td>
            <span class="${isWin ? 'badge-up' : 'badge-down'}">
              ${isWin ? '+' : ''}${(p.return_percent || 0).toFixed(1)}%
            </span>
          </td>
          <td>${p.days_held || 0}d</td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 11px; color: #38bdf8;" onclick="app.openTickerAnalysisModal('${p.symbol}')" title="Análisis 360°">
                🔍
              </button>
              <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 11px;" onclick="app.openEditClosedModal(${p.id})" title="Editar Venta">
                ✏️
              </button>
              <button class="btn btn-danger" style="padding: 5px 8px; font-size: 11px; background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); color: #f87171;" onclick="app.deleteTransaction(${p.id}, '${p.symbol}')" title="Eliminar Registro">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  },

  // ==========================================
  // FILTRADO DE TICKERS (ABIERTAS & CERRADAS)
  // ==========================================

  populateTickerFilters() {
    const openPositions = (this.data && this.data.openPositions) || [];
    const closedPositions = (this.data && this.data.closedPositions) || [];

    // Tickers abiertos
    const openSymbols = [...new Set(openPositions.map(p => p.symbol.trim().toUpperCase()))].sort();
    const openSelect = document.getElementById('filter-open-select');
    if (openSelect) {
      const currentVal = openSelect.value;
      openSelect.innerHTML = '<option value="">-- Todas las Posiciones (' + openPositions.length + ') --</option>' +
        openSymbols.map(s => `<option value="${s}">${s}</option>`).join('');
      if (openSymbols.includes(currentVal)) openSelect.value = currentVal;
    }

    // Tickers cerrados
    const closedSymbols = [...new Set(closedPositions.map(p => p.symbol.trim().toUpperCase()))].sort();
    const closedSelect = document.getElementById('filter-closed-select');
    if (closedSelect) {
      const currentVal = closedSelect.value;
      closedSelect.innerHTML = '<option value="">-- Todos los Tickers (' + closedPositions.length + ' ventas) --</option>' +
        closedSymbols.map(s => `<option value="${s}">${s}</option>`).join('');
      if (closedSymbols.includes(currentVal)) closedSelect.value = currentVal;
    }

    // Selector del Analizador 360°
    const allSymbols = [...new Set([...openSymbols, ...closedSymbols])].sort();
    const analyzerSelect = document.getElementById('t-analyzer-select');
    if (analyzerSelect) {
      analyzerSelect.innerHTML = '<option value="">-- Seleccionar de tu Cartera (' + allSymbols.length + ') --</option>' +
        allSymbols.map(s => `<option value="${s}">${s}</option>`).join('');
    }
  },

  onFilterOpenChange() {
    const term = (document.getElementById('filter-open-input').value || '').trim().toUpperCase();
    const select = document.getElementById('filter-open-select');
    if (select) select.value = term;
    this.applyOpenFilter(term);
  },

  onFilterOpenSelect(val) {
    const input = document.getElementById('filter-open-input');
    if (input) input.value = val;
    this.applyOpenFilter(val);
  },

  applyOpenFilter(term) {
    const openPositions = (this.data && this.data.openPositions) || [];
    if (!term) {
      this.renderOpenTable(openPositions);
      return;
    }
    const filtered = openPositions.filter(p => {
      const sym = p.symbol.trim().toUpperCase();
      const name = (p.original_name || '').trim().toUpperCase();
      return sym.includes(term) || name.includes(term);
    });
    this.renderOpenTable(filtered);
  },

  clearOpenFilter() {
    document.getElementById('filter-open-input').value = '';
    const select = document.getElementById('filter-open-select');
    if (select) select.value = '';
    this.applyOpenFilter('');
  },

  onFilterClosedChange() {
    const term = (document.getElementById('filter-closed-input').value || '').trim().toUpperCase();
    const select = document.getElementById('filter-closed-select');
    if (select) select.value = term;
    this.applyClosedFilter(term);
  },

  onFilterClosedSelect(val) {
    const input = document.getElementById('filter-closed-input');
    if (input) input.value = val;
    this.applyClosedFilter(val);
  },

  applyClosedFilter(term) {
    const closedPositions = (this.data && this.data.closedPositions) || [];
    const banner = document.getElementById('filter-closed-summary-banner');

    if (!term) {
      if (banner) banner.style.display = 'none';
      this.renderClosedTable(closedPositions);
      return;
    }

    const filtered = closedPositions.filter(p => {
      const sym = p.symbol.trim().toUpperCase();
      const name = (p.original_name || '').trim().toUpperCase();
      return sym.includes(term) || name.includes(term);
    });

    this.renderClosedTable(filtered);

    // Calcular estadísticas del ticker filtrado
    if (banner) {
      if (filtered.length > 0) {
        banner.style.display = 'flex';
        let totalInv = 0;
        let totalGain = 0;
        let wins = 0;

        filtered.forEach(p => {
          totalInv += parseFloat(p.buy_total || 0);
          const g = parseFloat(p.realized_gain || 0);
          totalGain += g;
          if (g > 0) wins++;
        });

        const returnPct = totalInv > 0 ? (totalGain / totalInv) * 100 : 0;
        const winRate = (wins / filtered.length) * 100;

        document.getElementById('filter-summary-ticker').innerText = term;
        document.getElementById('filter-summary-count').innerText = `${filtered.length} op.`;
        document.getElementById('filter-summary-invested').innerText = `$${totalInv.toFixed(2)}`;

        const gainElem = document.getElementById('filter-summary-gain');
        gainElem.innerText = `${totalGain >= 0 ? '+' : ''}$${totalGain.toFixed(2)}`;
        gainElem.style.color = totalGain >= 0 ? '#10b981' : '#ef4444';

        const retElem = document.getElementById('filter-summary-return');
        retElem.innerText = `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
        retElem.style.color = returnPct >= 0 ? '#10b981' : '#ef4444';

        const winElem = document.getElementById('filter-summary-winrate');
        winElem.innerText = `${winRate.toFixed(1)}% (${wins}/${filtered.length})`;

        const deepBtn = document.getElementById('btn-deep-analyze-filtered');
        if (deepBtn) {
          deepBtn.onclick = () => app.openTickerAnalysisModal(term);
        }
      } else {
        banner.style.display = 'none';
      }
    }
  },

  clearClosedFilter() {
    document.getElementById('filter-closed-input').value = '';
    const select = document.getElementById('filter-closed-select');
    if (select) select.value = '';
    this.applyClosedFilter('');
  },

  // ==========================================
  // ANALIZADOR PROFUNDO 360° DE TICKER ESPECÍFICO
  // ==========================================
  currentAnalyzedSymbol: 'AMD',

  openTickerAnalysisModal(symbol) {
    const targetSymbol = (symbol || 'AMD').trim().toUpperCase();
    document.getElementById('t-analyzer-input').value = targetSymbol;
    const select = document.getElementById('t-analyzer-select');
    if (select) select.value = targetSymbol;

    document.getElementById('modal-ticker-analysis').classList.add('active');
    this.runTickerAnalysis(targetSymbol);
  },

  closeTickerAnalysisModal() {
    document.getElementById('modal-ticker-analysis').classList.remove('active');
  },

  async runTickerAnalysis(symbol) {
    if (!symbol) symbol = document.getElementById('t-analyzer-input').value;
    if (!symbol) return;

    const cleanSymbol = symbol.trim().toUpperCase();
    this.currentAnalyzedSymbol = cleanSymbol;

    const loadingElem = document.getElementById('t-analyzer-loading');
    const contentElem = document.getElementById('t-analyzer-content');
    loadingElem.style.display = 'block';
    contentElem.style.display = 'none';

    try {
      const res = await fetch(`/api/ticker/analyze?symbol=${encodeURIComponent(cleanSymbol)}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar ticker');

      const tech = data.technical || {};
      const port = data.portfolio || {};

      // 1. Hero
      document.getElementById('t-hero-symbol').innerText = cleanSymbol;
      document.getElementById('t-hero-avatar').innerText = cleanSymbol.substring(0, 3);
      document.getElementById('t-hero-name').innerText = tech.name || cleanSymbol;
      document.getElementById('t-hero-price').innerText = `$${(tech.currentPrice || 0).toFixed(2)}`;

      const changeSign = (tech.change || 0) >= 0 ? '+' : '';
      const changeElem = document.getElementById('t-hero-change');
      changeElem.innerText = `${changeSign}$${(tech.change || 0).toFixed(2)} (${changeSign}${(tech.changePercent || 0).toFixed(2)}%)`;
      changeElem.className = (tech.change || 0) >= 0 ? 'text-success' : 'text-danger';

      const badgeElem = document.getElementById('t-hero-signal-badge');
      badgeElem.innerText = tech.decisionBadge || '🟡 ESPERAR';
      badgeElem.className = tech.decisionColor === 'success' ? 'badge-up' : (tech.decisionColor === 'danger' ? 'badge-down' : 'badge-neutral');

      // 2. Tu Balance Personal
      const openContainer = document.getElementById('t-open-container');
      const noOpenContainer = document.getElementById('t-no-open-container');
      const btnSell = document.getElementById('t-btn-sell');

      if (port.hasOpenPosition && port.openPosition) {
        const op = port.openPosition;
        openContainer.style.display = 'block';
        noOpenContainer.style.display = 'none';
        document.getElementById('t-open-qty').innerText = `${op.quantity} acciones`;
        document.getElementById('t-open-buy-price').innerText = `$${op.buy_price.toFixed(2)}`;
        document.getElementById('t-open-curr-val').innerText = `$${op.currentValue.toFixed(2)}`;

        const openGainElem = document.getElementById('t-open-gain');
        const ogSign = op.unrealizedGain >= 0 ? '+' : '';
        openGainElem.innerText = `${ogSign}$${op.unrealizedGain.toFixed(2)} (${ogSign}${op.unrealizedGainPercent.toFixed(2)}%)`;
        openGainElem.style.color = op.unrealizedGain >= 0 ? '#10b981' : '#ef4444';

        if (btnSell) btnSell.style.display = 'inline-block';
      } else {
        openContainer.style.display = 'none';
        noOpenContainer.style.display = 'block';
        if (btnSell) btnSell.style.display = 'none';
      }

      // Historial Cerrado
      document.getElementById('t-hist-count').innerText = `${port.closedTradesCount} ventas`;
      const histGainElem = document.getElementById('t-hist-gain');
      const hgSign = port.totalRealizedGain >= 0 ? '+' : '';
      histGainElem.innerText = `${hgSign}$${port.totalRealizedGain.toFixed(2)}`;
      histGainElem.style.color = port.totalRealizedGain >= 0 ? '#10b981' : '#ef4444';
      document.getElementById('t-hist-winrate').innerText = `${port.winRatePercent.toFixed(1)}%`;

      // Lista de Ventas
      const tradesListElem = document.getElementById('t-hist-trades-list');
      if (port.closedTrades && port.closedTrades.length > 0) {
        let tHtml = '<table style="width: 100%; border-collapse: collapse; margin-top: 6px;">';
        tHtml += '<tr style="color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left;"><th style="padding: 4px;">Fecha Venta</th><th>Cant.</th><th>P. Compra</th><th>P. Venta</th><th style="text-align: right;">Ganancia</th></tr>';
        port.closedTrades.forEach(tr => {
          const isWin = tr.realized_gain >= 0;
          tHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
              <td style="padding: 4px;">${tr.sell_date || '-'}</td>
              <td>${tr.quantity}</td>
              <td>$${tr.buy_price.toFixed(2)}</td>
              <td>$${tr.sell_price.toFixed(2)}</td>
              <td style="text-align: right; font-weight: bold; color: ${isWin ? '#10b981' : '#ef4444'};">${isWin ? '+' : ''}$${tr.realized_gain.toFixed(2)} (${isWin ? '+' : ''}${tr.return_percent.toFixed(1)}%)</td>
            </tr>
          `;
        });
        tHtml += '</table>';
        tradesListElem.innerHTML = tHtml;
      } else {
        tradesListElem.innerHTML = '<div style="color: var(--text-muted); padding: 8px 0; text-align: center;">No registras ventas previas en este ticker.</div>';
      }

      // 3. Indicadores Técnicos
      document.getElementById('t-tech-rsi').innerText = tech.rsi || '50.0';
      const rsiNum = parseFloat(tech.rsi || 50);
      document.getElementById('t-tech-rsi-status').innerText = rsiNum <= 30 ? '🟢 Sobrevendido (Oportunidad)' : (rsiNum >= 70 ? '🔴 Sobrecomprado (Alerta)' : '🟡 Rango Neutral');
      document.getElementById('t-tech-sma50').innerText = `$${tech.sma50 || '-'}`;
      document.getElementById('t-tech-support').innerText = `$${tech.support || '-'}`;
      document.getElementById('t-tech-resistance').innerText = `$${tech.resistance || '-'}`;
      document.getElementById('t-tech-reason').innerText = tech.reason || 'Sin datos técnicos disponibles para este activo.';

      // 4. Noticias
      const newsContainer = document.getElementById('t-news-container');
      const newsList = data.news || [];
      if (newsList.length > 0) {
        let nHtml = '';
        newsList.slice(0, 3).forEach(n => {
          const sent = n.sentiment || { type: 'neutral', color: '#38bdf8' };
          nHtml += `
            <div style="background: rgba(255,255,255,0.03); border-left: 3px solid ${sent.color}; padding: 10px 14px; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
                <span>🏛️ ${n.publisher}</span>
                <span>🕒 ${n.providerPublishTime}</span>
              </div>
              <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px;">${n.title}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${n.summary ? n.summary.substring(0, 140) + '...' : ''}</div>
            </div>
          `;
        });
        newsContainer.innerHTML = nHtml;
      } else {
        newsContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;">No se encontraron noticias recientes para este ticker.</div>';
      }

    } catch (err) {
      alert('Error analizando ticker: ' + err.message);
    } finally {
      loadingElem.style.display = 'none';
      contentElem.style.display = 'block';
    }
  },

  quickBuyCurrentTicker() {
    this.closeTickerAnalysisModal();
    this.openBuyModal();
    const symInput = document.getElementById('buy-symbol');
    if (symInput) {
      symInput.value = this.currentAnalyzedSymbol;
    }
  },

  quickSellCurrentTicker() {
    this.closeTickerAnalysisModal();
    const openPositions = (this.data && this.data.openPositions) || [];
    const target = openPositions.find(p => p.symbol.trim().toUpperCase() === this.currentAnalyzedSymbol);
    if (target) {
      this.openSellModal(target.id, target.symbol, target.livePrice);
    } else {
      this.openSellModalFromHeader();
    }
  },

  switchTab(tabName, evt) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('section[id^="tab-"]').forEach(sec => sec.style.display = 'none');

    const targetSec = document.getElementById(`tab-${tabName}`);
    if (targetSec) targetSec.style.display = 'block';

    if (evt && evt.target) {
      evt.target.classList.add('active');
    } else {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        const onClickAttr = btn.getAttribute('onclick') || '';
        if (onClickAttr.includes(`'${tabName}'`)) {
          btn.classList.add('active');
        }
      });
    }
  },

  calcBuyQty() {
    const total = parseFloat(document.getElementById('buy-total').value);
    const price = parseFloat(document.getElementById('buy-price').value);
    const qtyInput = document.getElementById('buy-qty');
    if (total > 0 && price > 0) {
      qtyInput.value = (total / price).toFixed(8);
    } else {
      qtyInput.value = '';
    }
  },

  calcEditQty() {
    const total = parseFloat(document.getElementById('edit-total').value);
    const price = parseFloat(document.getElementById('edit-price').value);
    const qtyInput = document.getElementById('edit-qty');
    if (total > 0 && price > 0) {
      qtyInput.value = (total / price).toFixed(8);
    } else {
      qtyInput.value = '';
    }
  },

  openForecastModal(id) {
    const openPositions = this.data ? this.data.openPositions : [];
    const item = openPositions.find(p => Number(p.id) === Number(id));
    if (!item || !item.forecast) return;

    const fc = item.forecast;
    document.getElementById('fc-modal-symbol').innerText = fc.symbol;
    
    const actionElem = document.getElementById('fc-modal-action');
    actionElem.innerText = fc.action;
    actionElem.className = fc.actionColor === 'danger' ? 'text-danger' : (fc.actionColor === 'warning' ? 'text-warning' : 'text-success');

    document.getElementById('fc-modal-horizon').innerText = fc.horizon;
    document.getElementById('fc-modal-target-price').innerText = `$${fc.targetPrice.toFixed(2)}`;
    document.getElementById('fc-modal-target-return').innerText = `+${fc.targetReturn.toFixed(1)}% Retorno Esperado`;
    document.getElementById('fc-modal-current').innerText = `$${fc.currentPrice.toFixed(2)}`;
    document.getElementById('fc-modal-buy').innerText = `Precio Compra: $${fc.buyPrice.toFixed(2)} (${fc.returnPercent >= 0 ? '+' : ''}${fc.returnPercent.toFixed(1)}%)`;
    document.getElementById('fc-modal-reason').innerText = fc.reason;

    document.getElementById('modal-forecast').classList.add('active');
  },
  closeForecastModal() {
    document.getElementById('modal-forecast').classList.remove('active');
  },

  openEditModal(id) {
    const openPositions = this.data ? this.data.openPositions : [];
    const item = openPositions.find(p => Number(p.id) === Number(id));
    if (!item) return;

    const setVal = (elemId, val) => {
      const el = document.getElementById(elemId);
      if (el) el.value = (val !== null && val !== undefined) ? val : '';
    };

    setVal('edit-id', item.id);
    setVal('edit-symbol', item.symbol);
    setVal('edit-date', item.buy_date || '');
    setVal('edit-total', item.buy_total || (item.quantity * item.buy_price));
    setVal('edit-price', item.buy_price);
    setVal('edit-qty', item.quantity);
    setVal('edit-stop', item.stop_loss || '');
    setVal('edit-notes', item.notes || '');

    const modal = document.getElementById('modal-edit');
    if (modal) modal.classList.add('active');
  },
  closeEditModal() {
    document.getElementById('modal-edit').classList.remove('active');
  },
  async saveEdit(e) {
    e.preventDefault();
    const payload = {
      id: parseInt(document.getElementById('edit-id').value),
      buy_date: document.getElementById('edit-date').value,
      quantity: parseFloat(document.getElementById('edit-qty').value),
      buy_price: parseFloat(document.getElementById('edit-price').value),
      stop_loss: document.getElementById('edit-stop').value ? parseFloat(document.getElementById('edit-stop').value) : null,
      notes: document.getElementById('edit-notes').value
    };

    if (!payload.id || isNaN(payload.id)) {
      alert('Error: ID de posición inválido.');
      return;
    }
    if (isNaN(payload.quantity) || payload.quantity <= 0 || isNaN(payload.buy_price) || payload.buy_price <= 0) {
      alert('Error: Cantidad y Precio deben ser números válidos mayores a 0.');
      return;
    }

    try {
      const res = await fetch('/api/transactions/edit', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      this.closeEditModal();
      await this.fetchPortfolio();
    } catch (err) {
      alert('Error guardando los cambios: ' + err.message);
    }
  },

  openBuyModal() {
    document.getElementById('modal-buy').classList.add('active');
  },
  closeBuyModal() {
    document.getElementById('modal-buy').classList.remove('active');
  },

  openSellModalFromHeader() {
    const openPositions = this.data ? this.data.openPositions : [];
    if (!openPositions || openPositions.length === 0) {
      alert('No tienes posiciones abiertas para vender en este momento.');
      return;
    }

    const groupSelect = document.getElementById('group-select-position');
    const selectElem = document.getElementById('sell-select-id');

    let optionsHtml = '';
    openPositions.forEach((p, idx) => {
      optionsHtml += `<option value="${p.id}" data-symbol="${p.symbol}" data-price="${p.livePrice}">${p.symbol} - ${p.quantity} acciones (Compradas a $${p.buy_price.toFixed(2)} - Actual: $${p.livePrice.toFixed(2)})</option>`;
    });
    selectElem.innerHTML = optionsHtml;

    const firstPos = openPositions[0];
    selectElem.value = firstPos.id;
    this.openSellModal(firstPos.id, firstPos.symbol, firstPos.livePrice);
    if (groupSelect) groupSelect.style.display = 'block';
  },

  handlePositionSelectChange(selectElem) {
    const selectedOption = selectElem.options[selectElem.selectedIndex];
    if (!selectedOption) return;

    const id = selectElem.value;
    const symbol = selectedOption.getAttribute('data-symbol');
    const price = selectedOption.getAttribute('data-price');
    
    document.getElementById('sell-id').value = id;
    document.getElementById('sell-symbol').value = symbol || '';
    document.getElementById('sell-price').value = (price && !isNaN(price)) ? parseFloat(price).toFixed(2) : '';
  },

  openSellModal(id, symbol, livePrice) {
    const groupSelect = document.getElementById('group-select-position');
    if (groupSelect) groupSelect.style.display = 'none';

    document.getElementById('sell-id').value = id;
    document.getElementById('sell-symbol').value = symbol || '';
    document.getElementById('sell-price').value = (livePrice !== undefined && livePrice !== null && !isNaN(livePrice)) ? parseFloat(livePrice).toFixed(2) : '';
    document.getElementById('sell-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('sell-notes').value = '';
    
    document.getElementById('modal-sell').classList.add('active');
  },
  closeSellModal() {
    document.getElementById('modal-sell').classList.remove('active');
  },

  async saveBuy(e) {
    e.preventDefault();
    const qty = document.getElementById('buy-qty').value;
    if (!qty || parseFloat(qty) <= 0) {
      alert('Por favor ingresa un Monto Invertido y Precio por Acción válidos.');
      return;
    }

    const payload = {
      symbol: document.getElementById('buy-symbol').value,
      buy_date: document.getElementById('buy-date').value,
      quantity: parseFloat(qty),
      buy_price: parseFloat(document.getElementById('buy-price').value),
      stop_loss: document.getElementById('buy-stop').value ? parseFloat(document.getElementById('buy-stop').value) : null,
      notes: document.getElementById('buy-notes').value
    };

    try {
      const res = await fetch('/api/transactions/buy', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar compra');
      this.closeBuyModal();
      await this.fetchPortfolio();
      this.switchTab('open');
    } catch (err) {
      alert('Error guardando la compra: ' + err.message);
    }
  },

  async saveSell(e) {
    e.preventDefault();
    const groupSelect = document.getElementById('group-select-position');
    const selectElem = document.getElementById('sell-select-id');

    let rawId = document.getElementById('sell-id').value;
    let symbol = document.getElementById('sell-symbol').value;
    const rawPrice = document.getElementById('sell-price').value;
    const rawDate = document.getElementById('sell-date').value;

    const openPositions = (this.data && this.data.openPositions) || [];

    // Si se abrió desde el selector del header, sincronizar con la opción seleccionada
    if (groupSelect && groupSelect.style.display !== 'none' && selectElem && selectElem.value) {
      rawId = selectElem.value;
      const selectedOption = selectElem.options[selectElem.selectedIndex];
      if (selectedOption) {
        symbol = selectedOption.getAttribute('data-symbol') || symbol;
      }
    }

    let targetPos = null;
    if (rawId) {
      targetPos = openPositions.find(p => Number(p.id) === Number(rawId));
    }
    if (!targetPos && symbol) {
      targetPos = openPositions.find(p => p.symbol.trim().toUpperCase() === symbol.trim().toUpperCase());
    }
    if (!targetPos && openPositions.length > 0) {
      targetPos = openPositions[0];
    }

    if (!targetPos) {
      alert('Error: No se encontró una posición abierta para vender.');
      return;
    }

    const cleanPrice = parseFloat(String(rawPrice).replace(',', '.'));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      alert('Error: Por favor ingresa un precio de venta válido mayor a 0.');
      return;
    }

    const payload = {
      id: parseInt(targetPos.id),
      symbol: targetPos.symbol,
      sell_date: rawDate || new Date().toISOString().split('T')[0],
      sell_price: cleanPrice,
      notes: document.getElementById('sell-notes').value
    };

    try {
      const res = await fetch('/api/transactions/sell', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar venta');
      this.closeSellModal();
      alert('✅ ' + (data.message || `Venta de ${targetPos.symbol} registrada con éxito.`));
      await this.fetchPortfolio();
      this.switchTab('closed');
    } catch (err) {
      alert('Error registrando la venta: ' + err.message);
    }
  },

  setupDragAndDrop() {
    const dropzone = document.getElementById('excel-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        this.uploadExcel(files[0]);
      }
    });
  },

  handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
      this.uploadExcel(files[0]);
    }
  },

  async uploadExcel(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/import-excel', {
        method: 'POST',
        headers: headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al importar');
      alert(`¡Éxito! ${data.message}`);
      await this.fetchPortfolio();
      this.switchTab('open');
    } catch (err) {
      alert('Error cargando Excel: ' + err.message);
    }
  },

  async exportExcel() {
    const token = localStorage.getItem('token');
    let url = '/api/export-excel';
    if (token) url += `?token=${token}`;
    window.location.href = url;
  },

  async fetchWatchlist() {
    try {
      const res = await fetch('/api/watchlist', {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      this.watchlist = data.watchlist || [];
      this.renderWatchlistTable(this.watchlist);
    } catch (err) {
      console.error('Error cargando watchlist:', err);
    }
  },

  renderWatchlistTable(watchlist) {
    const tbody = document.getElementById('tbody-watchlist');
    if (!tbody) return;

    if (!watchlist || watchlist.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 15px;">No tienes empresas en tu radar. Agrega un ticker arriba para iniciar el seguimiento.</td></tr>`;
      return;
    }

    let html = '';
    watchlist.forEach(w => {
      const isUp = (w.changePercent || 0) >= 0;
      const badgeClass = w.decisionColor === 'success' ? 'badge-up' : (w.decisionColor === 'danger' ? 'badge-down' : 'badge-neutral');

      html += `
        <tr>
          <td>
            <div class="symbol-cell">
              <div class="symbol-avatar">${w.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name">${w.symbol}</div>
                <div class="symbol-sub">${w.name || w.symbol}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 700; color: #fff;">$${(w.currentPrice || 0).toFixed(2)}</div>
            <div style="font-size: 11px;" class="${isUp ? 'stat-up' : 'stat-down'}">${isUp ? '+' : ''}${(w.changePercent || 0).toFixed(2)}%</div>
          </td>
          <td>
            <span style="font-weight: 800; color: ${w.rsi < 35 ? '#60a5fa' : (w.rsi > 68 ? '#ef4444' : '#10b981')};">
              RSI ${w.rsi || 50}
            </span>
          </td>
          <td>
            <div style="font-size: 11px; color: var(--text-muted);">
              SMA 50: <strong style="color: #38bdf8;">$${w.sma50 || '-'}</strong><br>
              SMA 200: <strong style="color: #a855f7;">$${w.sma200 || '-'}</strong>
            </div>
          </td>
          <td>
            <div style="font-size: 11px; color: var(--text-muted);">
              Soporte: <strong style="color: #10b981;">$${w.support || '-'}</strong><br>
              Resistencia: <strong style="color: #ef4444;">$${w.resistance || '-'}</strong>
            </div>
          </td>
          <td>
            <span class="${badgeClass}" style="cursor: pointer; padding: 5px 10px; font-weight: bold; font-size: 11px;" onclick="app.openTechnicalModal('${w.symbol}')">
              ${w.decisionBadge || '🟡 ESPERAR'}
            </span>
          </td>
          <td style="text-align: center;">
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; color: #ef4444;" title="Quitar del Radar" onclick="app.removeFromWatchlist('${w.symbol}')">
              🗑️ Quitar
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  async addToWatchlist(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('watchlist-input-symbol');
    if (!input || !input.value.trim()) return;

    const symbol = input.value.trim().toUpperCase();
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ symbol })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agregar empresa');

      input.value = '';
      await this.fetchWatchlist();
    } catch (err) {
      alert('Error agregando ticker: ' + err.message);
    }
  },

  async removeFromWatchlist(symbol) {
    if (!confirm(`¿Deseas quitar a ${symbol} de tu radar de análisis técnico?`)) return;

    const cleanSymbol = symbol.trim().toUpperCase();
    try {
      const res = await fetch(`/api/watchlist/${encodeURIComponent(cleanSymbol)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      await this.fetchWatchlist();
    } catch (err) {
      alert('Error eliminando ticker: ' + err.message);
    }
  },

  openTechnicalModal(symbol) {
    const item = (this.watchlist || []).find(w => w.symbol === symbol);
    if (!item) return;

    document.getElementById('ta-modal-symbol').innerText = item.symbol;
    document.getElementById('ta-modal-name').innerText = item.name || item.symbol;
    document.getElementById('ta-modal-price').innerText = `$${(item.currentPrice || 0).toFixed(2)}`;
    
    const badge = document.getElementById('ta-modal-badge');
    badge.innerText = item.decisionBadge || '🟡 ESPERAR';
    badge.className = item.decisionColor === 'success' ? 'badge-up' : (item.decisionColor === 'danger' ? 'badge-down' : 'badge-neutral');

    document.getElementById('ta-modal-rsi').innerText = item.rsi || 50;
    document.getElementById('ta-modal-sma50').innerText = `$${item.sma50 || '-'}`;
    document.getElementById('ta-modal-sma200').innerText = `$${item.sma200 || '-'}`;
    document.getElementById('ta-modal-support').innerText = `$${item.support || '-'}`;
    document.getElementById('ta-modal-resistance').innerText = `$${item.resistance || '-'}`;
    document.getElementById('ta-modal-reason').innerText = item.reason || 'Sin detalles';

    document.getElementById('modal-technical').classList.add('active');
  },

  closeTechnicalModal() {
    document.getElementById('modal-technical').classList.remove('active');
  },

  // ==========================================
  // GESTIÓN DE HISTORIAL DE VENTAS (REINGRESO, EDICIÓN Y ELIMINACIÓN)
  // ==========================================

  openAddHistoricalModal() {
    document.getElementById('hist-symbol').value = '';
    document.getElementById('hist-name').value = '';
    document.getElementById('hist-buy-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('hist-buy-price').value = '';
    document.getElementById('hist-sell-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('hist-sell-price').value = '';
    document.getElementById('hist-qty').value = '';
    document.getElementById('hist-notes').value = '';
    this.calcHistoricalPreview();
    document.getElementById('modal-add-historical').classList.add('active');
  },

  closeAddHistoricalModal() {
    document.getElementById('modal-add-historical').classList.remove('active');
  },

  calcHistoricalPreview() {
    const qty = parseFloat(String(document.getElementById('hist-qty').value).replace(',', '.')) || 0;
    const bPrice = parseFloat(String(document.getElementById('hist-buy-price').value).replace(',', '.')) || 0;
    const sPrice = parseFloat(String(document.getElementById('hist-sell-price').value).replace(',', '.')) || 0;

    const bTotal = qty * bPrice;
    const sTotal = qty * sPrice;
    const gain = sTotal - bTotal;
    const returnPct = bTotal > 0 ? (gain / bTotal) * 100 : 0;

    document.getElementById('hist-prev-buy-total').innerText = `$${bTotal.toFixed(2)}`;
    document.getElementById('hist-prev-sell-total').innerText = `$${sTotal.toFixed(2)}`;

    const gainElem = document.getElementById('hist-prev-gain');
    gainElem.innerText = `${gain >= 0 ? '+' : ''}$${gain.toFixed(2)}`;
    gainElem.style.color = gain >= 0 ? '#10b981' : '#ef4444';

    const retElem = document.getElementById('hist-prev-return');
    retElem.innerText = `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
    retElem.style.color = returnPct >= 0 ? '#10b981' : '#ef4444';
  },

  async saveHistoricalTransaction(e) {
    e.preventDefault();
    const symbol = document.getElementById('hist-symbol').value.trim().toUpperCase();
    const name = document.getElementById('hist-name').value.trim();
    const buy_date = document.getElementById('hist-buy-date').value;
    const buy_price = parseFloat(String(document.getElementById('hist-buy-price').value).replace(',', '.'));
    const sell_date = document.getElementById('hist-sell-date').value;
    const sell_price = parseFloat(String(document.getElementById('hist-sell-price').value).replace(',', '.'));
    const quantity = parseFloat(String(document.getElementById('hist-qty').value).replace(',', '.'));
    const notes = document.getElementById('hist-notes').value.trim();

    if (!symbol || isNaN(buy_price) || isNaN(sell_price) || isNaN(quantity) || quantity <= 0) {
      alert('Por favor completa los campos requeridos con valores válidos.');
      return;
    }

    const payload = { symbol, original_name: name || symbol, buy_date, buy_price, sell_date, sell_price, quantity, notes };

    try {
      const res = await fetch('/api/transactions/historical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar venta histórica');

      this.closeAddHistoricalModal();
      alert('✅ ' + (data.message || `Operación de ${symbol} registrada con éxito en el historial.`));
      await this.fetchPortfolio();
      this.switchTab('closed');
    } catch (err) {
      alert('Error registrando venta histórica: ' + err.message);
    }
  },

  openEditClosedModal(id) {
    const closedPositions = (this.data && this.data.closedPositions) || [];
    const item = closedPositions.find(p => Number(p.id) === Number(id));
    if (!item) {
      alert('No se encontró el registro seleccionado.');
      return;
    }

    document.getElementById('edit-closed-id').value = item.id;
    document.getElementById('edit-closed-symbol').value = item.symbol || '';
    document.getElementById('edit-closed-name').value = item.original_name || item.symbol || '';
    document.getElementById('edit-closed-buy-date').value = item.buy_date || '';
    document.getElementById('edit-closed-buy-price').value = item.buy_price || '';
    document.getElementById('edit-closed-sell-date').value = item.sell_date || '';
    document.getElementById('edit-closed-sell-price').value = item.sell_price || '';
    document.getElementById('edit-closed-qty').value = item.quantity || '';
    document.getElementById('edit-closed-notes').value = item.notes || '';

    this.calcEditClosedPreview();
    document.getElementById('modal-edit-closed').classList.add('active');
  },

  closeEditClosedModal() {
    document.getElementById('modal-edit-closed').classList.remove('active');
  },

  calcEditClosedPreview() {
    const qty = parseFloat(String(document.getElementById('edit-closed-qty').value).replace(',', '.')) || 0;
    const bPrice = parseFloat(String(document.getElementById('edit-closed-buy-price').value).replace(',', '.')) || 0;
    const sPrice = parseFloat(String(document.getElementById('edit-closed-sell-price').value).replace(',', '.')) || 0;

    const bTotal = qty * bPrice;
    const sTotal = qty * sPrice;
    const gain = sTotal - bTotal;
    const returnPct = bTotal > 0 ? (gain / bTotal) * 100 : 0;

    document.getElementById('edit-closed-prev-buy-total').innerText = `$${bTotal.toFixed(2)}`;
    document.getElementById('edit-closed-prev-sell-total').innerText = `$${sTotal.toFixed(2)}`;

    const gainElem = document.getElementById('edit-closed-prev-gain');
    gainElem.innerText = `${gain >= 0 ? '+' : ''}$${gain.toFixed(2)}`;
    gainElem.style.color = gain >= 0 ? '#10b981' : '#ef4444';

    const retElem = document.getElementById('edit-closed-prev-return');
    retElem.innerText = `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
    retElem.style.color = returnPct >= 0 ? '#10b981' : '#ef4444';
  },

  async saveEditClosedTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('edit-closed-id').value;
    const symbol = document.getElementById('edit-closed-symbol').value.trim().toUpperCase();
    const name = document.getElementById('edit-closed-name').value.trim();
    const buy_date = document.getElementById('edit-closed-buy-date').value;
    const buy_price = parseFloat(String(document.getElementById('edit-closed-buy-price').value).replace(',', '.'));
    const sell_date = document.getElementById('edit-closed-sell-date').value;
    const sell_price = parseFloat(String(document.getElementById('edit-closed-sell-price').value).replace(',', '.'));
    const quantity = parseFloat(String(document.getElementById('edit-closed-qty').value).replace(',', '.'));
    const notes = document.getElementById('edit-closed-notes').value.trim();

    if (!id || !symbol || isNaN(buy_price) || isNaN(sell_price) || isNaN(quantity) || quantity <= 0) {
      alert('Por favor completa los campos requeridos con valores válidos.');
      return;
    }

    const payload = { id, symbol, original_name: name || symbol, buy_date, buy_price, sell_date, sell_price, quantity, notes };

    try {
      const res = await fetch('/api/transactions/edit-closed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar el registro');

      this.closeEditClosedModal();
      alert('✅ ' + (data.message || `Registro de ${symbol} actualizado con éxito.`));
      await this.fetchPortfolio();
      this.switchTab('closed');
    } catch (err) {
      alert('Error actualizando registro: ' + err.message);
    }
  },

  async deleteTransaction(id, symbol) {
    if (!confirm(`⚠️ ¿Estás seguro de eliminar el registro de ${symbol || 'esta transacción'} (ID #${id}) de la base de datos?\n\nEsta acción eliminará el registro de forma permanente de tu historial.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar registro');

      alert(`🗑️ Registro #${id} (${symbol}) eliminado con éxito.`);
      await this.fetchPortfolio();
    } catch (err) {
      alert('Error eliminando la transacción: ' + err.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
