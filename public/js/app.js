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
      html += `
        <div class="news-card" onclick="app.openNewsModal(${idx})" style="cursor: pointer;">
          <div class="news-header">
            <span class="news-badge">${item.symbol}</span>
            <span class="news-publisher">${item.publisher}</span>
          </div>
          <div class="news-title">${item.title}</div>
          <div class="news-footer">
            <span>🕒 ${item.providerPublishTime}</span>
            <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="event.stopPropagation(); app.openNewsModal(${idx});">
              Ver Resumen 📑
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
    document.getElementById('news-modal-publisher').innerText = item.publisher;
    document.getElementById('news-modal-time').innerText = item.providerPublishTime;
    document.getElementById('news-modal-summary').innerText = item.summary;

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
      tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--text-muted);">No tienes posiciones abiertas en este momento.</td></tr>`;
      return;
    }

    let html = '';
    openPositions.forEach(p => {
      const isGain = p.unrealizedGain >= 0;
      html += `
        <tr>
          <td>
            <div class="symbol-cell">
              <div class="symbol-avatar">${p.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name">${p.symbol}</div>
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
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted);">No hay ventas registradas en el historial.</td></tr>`;
      return;
    }

    let html = '';
    closedPositions.forEach(p => {
      const isWin = (p.realized_gain || 0) >= 0;
      html += `
        <tr>
          <td>
            <div class="symbol-cell">
              <div class="symbol-avatar" style="background: rgba(255,255,255,0.05); color: #fff;">${p.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name">${p.symbol}</div>
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
        </tr>
      `;
    });
    tbody.innerHTML = html;
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
      id: document.getElementById('edit-id').value,
      buy_date: document.getElementById('edit-date').value,
      quantity: document.getElementById('edit-qty').value,
      buy_price: document.getElementById('edit-price').value,
      stop_loss: document.getElementById('edit-stop').value,
      notes: document.getElementById('edit-notes').value
    };

    try {
      const res = await fetch('/api/transactions/edit', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al actualizar');
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

    groupSelect.style.display = 'block';
    let optionsHtml = '';
    openPositions.forEach(p => {
      optionsHtml += `<option value="${p.id}" data-symbol="${p.symbol}" data-price="${p.livePrice}">${p.symbol} - ${p.quantity} acciones (Compradas a $${p.buy_price.toFixed(2)} - Actual: $${p.livePrice.toFixed(2)})</option>`;
    });
    selectElem.innerHTML = optionsHtml;

    const firstPos = openPositions[0];
    this.openSellModal(firstPos.id, firstPos.symbol, firstPos.livePrice);
  },

  handlePositionSelectChange(selectElem) {
    const selectedOption = selectElem.options[selectElem.selectedIndex];
    const id = selectElem.value;
    const symbol = selectedOption.getAttribute('data-symbol');
    const price = selectedOption.getAttribute('data-price');
    
    document.getElementById('sell-id').value = id;
    document.getElementById('sell-symbol').value = symbol;
    document.getElementById('sell-price').value = price;
  },

  openSellModal(id, symbol, livePrice) {
    document.getElementById('group-select-position').style.display = 'none';
    document.getElementById('sell-id').value = id;
    document.getElementById('sell-symbol').value = symbol;
    document.getElementById('sell-price').value = livePrice;
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
      quantity: qty,
      buy_price: document.getElementById('buy-price').value,
      stop_loss: document.getElementById('buy-stop').value,
      notes: document.getElementById('buy-notes').value
    };

    try {
      const res = await fetch('/api/transactions/buy', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al registrar compra');
      this.closeBuyModal();
      await this.fetchPortfolio();
      this.switchTab('open');
    } catch (err) {
      alert('Error guardando la compra: ' + err.message);
    }
  },

  async saveSell(e) {
    e.preventDefault();
    const payload = {
      id: document.getElementById('sell-id').value,
      sell_date: document.getElementById('sell-date').value,
      sell_price: document.getElementById('sell-price').value,
      notes: document.getElementById('sell-notes').value
    };

    try {
      const res = await fetch('/api/transactions/sell', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al registrar venta');
      this.closeSellModal();
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
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
