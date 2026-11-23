const app = {
  data: null,
  currentUser: null,
  charts: {},
  refreshInterval: null,
  selectedIntradaySymbol: 'LLY',
  hasInitializedChartSymbol: false,
  intradayReqId: 0,

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
      const res = await fetch(`/api/portfolio/summary?_t=${Date.now()}`, {
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
      this.renderOpenPositionsCards(data.openPositions);
      this.renderVerticalTickerList(data.openPositions);
      this.renderCharts(data.openPositions, isSilent);
      this.renderNews(data.news);
      this.renderOpenTable(data.openPositions);
      this.renderClosedTable(data.closedPositions);
      this.populateTickerFilters();
      this.fetchWatchlist();
      this.updateMarketStatusBadge();

    } catch (err) {
      console.error('Error cargando portafolio:', err);
    } finally {
      if (!isSilent) {
        const spinner = document.getElementById('refresh-spinner');
        if (spinner) spinner.classList.remove('spin');
      }
    }
  },

  updateMarketStatusBadge() {
    const dot = document.getElementById('market-status-dot');
    const text = document.getElementById('market-status-text');
    if (!dot || !text) return;

    const now = new Date();
    
    // Obtener componentes de hora oficial de Wall Street (New York / EDT / EST)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
      weekday: 'short'
    });

    const parts = formatter.formatToParts(now);
    let weekday = '', hour = 0, minute = 0, second = 0;
    parts.forEach(p => {
      if (p.type === 'weekday') weekday = p.value;
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
      if (p.type === 'second') second = parseInt(p.value, 10);
    });
    if (hour === 24) hour = 0;

    const totalMinutes = hour * 60 + minute;
    const isWeekend = (weekday === 'Sat' || weekday === 'Sun');
    const nyTimeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} NY`;
    const localTimeFormatted = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (isWeekend) {
      dot.style.background = '#dc2626';
      dot.style.boxShadow = '0 0 6px #dc2626';
      text.innerHTML = `🔴 Fin de Semana • <span style="font-weight: 700;">${localTimeFormatted}</span> (${nyTimeFormatted})`;
      return;
    }

    // 1. Pre-Market (Pre-Apertura): 04:00 AM a 09:30 AM NY
    if (totalMinutes >= 240 && totalMinutes < 570) {
      const minsToOpen = 570 - totalMinutes;
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 6px #f59e0b';
      text.innerHTML = `🟡 Pre-Market (${nyTimeFormatted}) • Abre en ${minsToOpen} min • <span style="font-weight: 700;">${localTimeFormatted}</span>`;
      return;
    }

    // 2. Regular Session (Mercado Abierto Wall Street): 09:30 AM a 16:00 PM NY
    if (totalMinutes >= 570 && totalMinutes < 960) {
      dot.style.background = '#059669';
      dot.style.boxShadow = '0 0 6px #059669';
      text.innerHTML = `🟢 Mercado Abierto (${nyTimeFormatted}) • <span style="font-weight: 700;">${localTimeFormatted}</span>`;
      return;
    }

    // 3. After-Hours (Post-Cierre): 16:00 PM a 20:00 PM NY
    if (totalMinutes >= 960 && totalMinutes < 1200) {
      dot.style.background = '#3b82f6';
      dot.style.boxShadow = '0 0 6px #3b82f6';
      text.innerHTML = `🔵 After-Hours (${nyTimeFormatted}) • <span style="font-weight: 700;">${localTimeFormatted}</span>`;
      return;
    }

    // 4. Mercado Cerrado de Noche
    dot.style.background = '#dc2626';
    dot.style.boxShadow = '0 0 6px #dc2626';
    text.innerHTML = `🔴 Mercado Cerrado (${nyTimeFormatted}) • <span style="font-weight: 700;">${localTimeFormatted}</span>`;
  },

  refreshData() {
    this.fetchPortfolio(false);
  },

  renderSummary(s) {
    const heroFloatingVal = document.getElementById('hero-floating-val');
    const heroFloatingPct = document.getElementById('hero-floating-pct');
    const heroTotal = document.getElementById('hero-total-portfolio');
    const heroOpenInv = document.getElementById('hero-open-invested');
    const heroDaily = document.getElementById('hero-daily-change');
    const heroClosed = document.getElementById('hero-closed-realized');
    const heroWinrate = document.getElementById('hero-winrate');
    const heroCount = document.getElementById('hero-open-count');

    const uGain = s.unrealizedGain || 0;
    const uPct = s.unrealizedGainPercent || 0;
    const isPos = uGain >= 0;

    if (heroFloatingVal) {
      heroFloatingVal.innerText = `${isPos ? '+' : ''}$${uGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
      heroFloatingVal.className = `hero-value ${isPos ? '' : 'negative'}`;
    }
    if (heroFloatingPct) {
      heroFloatingPct.innerText = `${isPos ? '▲ +' : '▼ '}${uPct.toFixed(2)}% Flotante`;
      heroFloatingPct.className = `hero-floating-pct-badge ${isPos ? 'pill-up' : 'pill-down'}`;
    }
    const heroPulseDot = document.querySelector('.hero-pulse-dot');
    if (heroPulseDot) {
      if (isPos) {
        heroPulseDot.classList.remove('negative');
      } else {
        heroPulseDot.classList.add('negative');
      }
    }
    if (heroTotal) heroTotal.innerText = `$${s.totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (heroOpenInv) heroOpenInv.innerText = `$${s.totalOpenInvested.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (heroDaily) {
      const dailyVal = s.dailyChangeDollar !== undefined ? s.dailyChangeDollar : (s.totalDailyChangeDollar || 0);
      const dSign = dailyVal >= 0 ? '+' : '';
      heroDaily.innerText = `${dSign}$${dailyVal.toFixed(2)}`;
    }
    if (heroClosed) heroClosed.innerText = `+$${s.totalRealizedGain.toLocaleString('en-US', { minimumFractionDigits: 2 })} (+${s.realizedGainPercent.toFixed(1)}%)`;
    if (heroWinrate) heroWinrate.innerText = `${s.winRatePercent.toFixed(1)}% (${s.winningTradesCount || 0} de ${s.closedPositionsCount})`;
    if (heroCount) heroCount.innerText = `${s.openPositionsCount} acciones`;

    const countOpen = document.getElementById('count-open');
    const countClosed = document.getElementById('count-closed');
    if (countOpen) countOpen.innerText = s.openPositionsCount;
    if (countClosed) countClosed.innerText = s.closedPositionsCount;

    // Actualizar Barra Cuantitativa Kalshi (Probabilidad Alcista, Convicción, Concentración y Salud)
    const probValEl = document.getElementById('kq-portfolio-prob');
    const probBarEl = document.getElementById('kq-portfolio-prob-bar');
    const topConvEl = document.getElementById('kq-top-conviction');
    const topConvProbEl = document.getElementById('kq-top-conviction-prob');
    const maxConcSymEl = document.getElementById('kq-max-conc-symbol');
    const maxConcPctEl = document.getElementById('kq-max-conc-pct');
    const healthBadgeEl = document.getElementById('kq-health-badge');

    const avgProb = s.avgKalshiProb !== undefined ? s.avgKalshiProb : 62;
    if (probValEl) probValEl.innerText = `${avgProb}%`;
    if (probBarEl) probBarEl.style.width = `${Math.max(10, Math.min(100, avgProb))}%`;

    if (topConvEl) topConvEl.innerText = s.topConvictionSymbol || '-';
    if (topConvProbEl) {
      topConvProbEl.innerText = `${s.topConvictionProb || 0}% Prob.`;
      topConvProbEl.className = `kalshi-quant-pill ${(s.topConvictionProb || 0) >= 60 ? 'pill-up' : 'pill-warn'}`;
    }

    if (maxConcSymEl) maxConcSymEl.innerText = s.maxConcentrationSymbol || '-';
    if (maxConcPctEl) {
      const concPct = s.maxConcentrationPct || 0;
      maxConcPctEl.innerText = `${concPct.toFixed(1)}% Cartera`;
      maxConcPctEl.className = `kalshi-quant-pill ${s.concentrationAlert ? 'pill-warn' : 'pill-up'}`;
    }

    if (healthBadgeEl) {
      const hStatus = s.healthStatus || 'ÓPTIMA';
      if (s.healthColor === 'warning') {
        healthBadgeEl.innerText = `🟡 ${hStatus}`;
        healthBadgeEl.className = 'kalshi-quant-pill pill-warn';
      } else if (s.healthColor === 'danger') {
        healthBadgeEl.innerText = `🔴 ${hStatus}`;
        healthBadgeEl.className = 'kalshi-quant-pill pill-down';
      } else {
        healthBadgeEl.innerText = `🟢 ${hStatus}`;
        healthBadgeEl.className = 'kalshi-quant-pill pill-up';
      }
    }
  },

  activeRacionalFilter: 'ALL',

  filterCardsByRacional(actionType) {
    this.activeRacionalFilter = actionType || 'ALL';
    const mapBtn = {
      'ALL': 'btn-rac-all',
      'COMPRAR+': 'btn-rac-buy',
      'VENDER': 'btn-rac-sell',
      'MANTENER POSICIÓN': 'btn-rac-hold'
    };
    Object.keys(mapBtn).forEach(k => {
      const btn = document.getElementById(mapBtn[k]);
      if (btn) {
        if (k === this.activeRacionalFilter) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
    if (this.data && this.data.openPositions) {
      this.renderOpenPositionsCards(this.data.openPositions);
    }
  },

  renderOpenPositionsCards(openPositions) {
    const grid = document.getElementById('holdings-cards-grid');
    const badge = document.getElementById('badge-holdings-count');
    if (badge) badge.innerText = `${openPositions ? openPositions.length : 0} activas`;
    if (!grid) return;

    const allList = openPositions || [];
    let countBuy = 0, countSell = 0, countHold = 0;
    allList.forEach(p => {
      const rAct = (p.forecast && p.forecast.racionalAction) ? p.forecast.racionalAction : 'MANTENER POSICIÓN';
      if (rAct === 'COMPRAR+') countBuy++;
      else if (rAct === 'VENDER') countSell++;
      else countHold++;
    });

    const elAll = document.getElementById('rac-count-all');
    const elBuy = document.getElementById('rac-count-buy');
    const elSell = document.getElementById('rac-count-sell');
    const elHold = document.getElementById('rac-count-hold');
    if (elAll) elAll.innerText = allList.length;
    if (elBuy) elBuy.innerText = countBuy;
    if (elSell) elSell.innerText = countSell;
    if (elHold) elHold.innerText = countHold;

    if (!openPositions || openPositions.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; background: var(--bg-card); border-radius: 14px; border: 1px solid var(--border-color); color: var(--text-muted);">
          No tienes posiciones abiertas activas actualmente. Usa el botón <strong>➕ Nueva Compra</strong> para registrar una acción.
        </div>
      `;
      return;
    }

    const filteredPositions = this.activeRacionalFilter === 'ALL'
      ? allList
      : allList.filter(p => ((p.forecast && p.forecast.racionalAction) || 'MANTENER POSICIÓN') === this.activeRacionalFilter);

    if (filteredPositions.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 24px; background: var(--bg-card); border-radius: 14px; border: 1px solid var(--border-color); color: var(--text-muted);">
          Ninguna posición abierta tiene hoy la señal <strong>${this.activeRacionalFilter}</strong> para Racional.
          <button type="button" class="btn btn-secondary" style="margin-left: 10px; padding: 4px 10px; font-size: 11px;" onclick="app.filterCardsByRacional('ALL')">Ver Todas</button>
        </div>
      `;
      return;
    }

    let html = '';
    filteredPositions.forEach((pos, idx) => {
      const uGain = pos.unrealizedGain || 0;
      const uPct = pos.unrealizedGainPercent || 0;
      const isPositive = uGain >= 0;
      const pillClass = isPositive ? 'pill-up' : 'pill-down';
      const statusCardClass = isPositive ? 'card-status-profit' : 'card-status-loss';
      const dayChangeClass = (pos.change || 0) >= 0 ? 'text-success' : 'text-danger';
      const dayChangeSign = (pos.change || 0) >= 0 ? '+' : '';
      const fc = pos.forecast || {};
      const kProb = fc.kalshiProb || 60;
      const stopLbl = fc.isTrailingStop ? 'Trailing Stop' : 'Stop Loss';
      const stopNum = fc.suggestedStopLoss || (pos.buy_price * 0.92);
      const targetNum = fc.targetPrice || (pos.buy_price * 1.15);
      const liveNum = pos.livePrice || pos.buy_price;
      const buyNum = parseFloat(pos.buy_price) || liveNum;

      const stopVal = stopNum ? `${stopNum.toFixed(2)}` : '-';
      const targetVal = targetNum ? `${targetNum.toFixed(2)}` : '-';

      // Cálculo de posición porcentual en la barra termómetro (Stop ── Compra ── Hoy ── Meta)
      const minRange = Math.min(stopNum, buyNum, liveNum) * 0.98;
      const maxRange = Math.max(targetNum, buyNum, liveNum) * 1.02;
      const spanRange = Math.max(0.01, maxRange - minRange);
      const nowPosPct = Math.min(96, Math.max(4, ((liveNum - minRange) / spanRange) * 100));
      const buyPosPct = Math.min(96, Math.max(4, ((buyNum - minRange) / spanRange) * 100));

      const rAction = fc.racionalAction || 'MANTENER POSICIÓN';
      const rSub = fc.racionalSubtext || 'Mantener en Racional';
      let bannerClass = 'rac-banner-hold';
      let rIcon = '🔵';
      if (rAction === 'COMPRAR+') {
        bannerClass = 'rac-banner-buy';
        rIcon = '🟢';
      } else if (rAction === 'VENDER') {
        bannerClass = 'rac-banner-sell';
        rIcon = '🔴';
      }

      html += `
        <div class="holding-card ${statusCardClass}" onclick="app.openTickerAnalysisModal('${pos.symbol}')">
          <!-- 1. CABECERA CLARA: ÍNDICE DE POSICIÓN + TICKER + PRECIO HOY -->
          <div class="holding-card-top">
            <div class="holding-avatar-info">
              <div class="holding-avatar">${pos.symbol.substring(0, 3)}</div>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="holding-index-badge">Posición #${idx + 1}</span>
                  <span class="holding-symbol">${pos.symbol}</span>
                </div>
                <div class="holding-name">${pos.original_name || pos.symbol} • ${pos.daysHeld || 0} días</div>
              </div>
            </div>
            <div class="holding-price-badge">
              <div class="holding-live-price">${liveNum.toFixed(2)}</div>
              <div class="holding-day-change ${dayChangeClass}">${dayChangeSign}${(pos.changePercent || 0).toFixed(2)}% hoy</div>
            </div>
          </div>

          <!-- 2. COMPARATIVA VISUAL EN 2 COLUMNAS: TU INVERSIÓN VS RESULTADO HOY -->
          <div class="holding-metrics-split">
            <div class="holding-metric-col">
              <span class="holding-metric-col-label">💼 Tu Inversión <span class="info-help-badge" onclick="event.stopPropagation(); app.showIndicatorHelp('open_invested')" onmouseenter="app.showIndicatorTooltip(event, 'open_invested')" onmouseleave="app.hideIndicatorTooltip()">ⓘ</span></span>
              <span class="holding-metric-col-main">${(pos.buy_total || (pos.quantity * buyNum)).toFixed(2)}</span>
              <span class="holding-metric-col-sub">${pos.quantity} acc a <strong>${buyNum.toFixed(2)}</strong></span>
            </div>
            <div class="holding-metric-col">
              <span class="holding-metric-col-label">📊 Valor & Ganancia <span class="info-help-badge" onclick="event.stopPropagation(); app.showIndicatorHelp('unrealized_gain')" onmouseenter="app.showIndicatorTooltip(event, 'unrealized_gain')" onmouseleave="app.hideIndicatorTooltip()">ⓘ</span></span>
              <span class="holding-metric-col-main">${(pos.currentValue || 0).toFixed(2)}</span>
              <div>
                <span class="holding-profit-pill ${pillClass}" style="font-size: 11.5px; padding: 2px 8px;">
                  ${isPositive ? '▲ +' : '▼ '}${Math.abs(uGain).toFixed(2)} (${isPositive ? '+' : ''}${uPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          <!-- 3. TERMÓMETRO VISUAL DE PRECIO: STOP ── COMPRA ── HOY ── META -->
          <div class="holding-range-box" onclick="event.stopPropagation(); app.openForecastModal(${pos.id})" title="Haz clic para ver el detalle de Stop Loss y Precio Objetivo">
            <div class="holding-range-labels">
              <span style="color: var(--danger);">🛡️ ${stopLbl}: ${stopVal}</span>
              <span style="color: var(--text-muted); font-size: 10px;">Termómetro de Rango <span class="info-help-badge" onclick="event.stopPropagation(); app.showIndicatorHelp('stop_target')" onmouseenter="app.showIndicatorTooltip(event, 'stop_target')" onmouseleave="app.hideIndicatorTooltip()">ⓘ</span></span>
              <span style="color: var(--primary-hover);">🎯 Meta: ${targetVal}</span>
            </div>
            <div class="holding-range-track">
              <div class="holding-range-fill" style="width: ${nowPosPct}%;"></div>
              <div class="holding-range-marker-buy" style="left: ${buyPosPct}%;" title="Precio Compra: ${buyNum.toFixed(2)}"></div>
              <div class="holding-range-marker-now" style="left: ${nowPosPct}%; border-color: ${isPositive ? 'var(--primary)' : 'var(--danger)'};" title="Precio Hoy: ${liveNum.toFixed(2)}"></div>
            </div>
            <div class="holding-range-foot">
              <span>Compra: ${buyNum.toFixed(2)}</span>
              <span style="font-weight: 800; color: var(--text-main);">● Hoy: ${liveNum.toFixed(2)}</span>
              <span>Potencial: ${fc.upsidePercent >= 0 ? '+' : ''}${(fc.upsidePercent || 0).toFixed(1)}%</span>
            </div>
          </div>

          <!-- 4. BANNER DE ACCIÓN EN RACIONAL PREMIUM -->
          <div class="racional-card-banner ${bannerClass}" onclick="event.stopPropagation(); app.openForecastModal(${pos.id})" title="Haz clic para ver instrucción detallada para Racional y Simulador DCA">
            <div>
              <div style="font-size: 9.5px; font-weight: 800; color: var(--text-muted); letter-spacing: 0.4px; text-transform: uppercase;">
                📲 ACCIÓN EN RACIONAL <span class="info-help-badge" onclick="event.stopPropagation(); app.showIndicatorHelp('racional_signals')" onmouseenter="app.showIndicatorTooltip(event, 'racional_signals')" onmouseleave="app.hideIndicatorTooltip()">ⓘ</span>
              </div>
              <div class="racional-action-title">${rIcon} ${rAction}</div>
              <div class="racional-action-sub">${rSub}</div>
            </div>
            <div style="text-align: right; font-family: var(--font-mono);">
              <div style="font-size: 12.5px; font-weight: 800; color: ${kProb >= 60 ? 'var(--primary-hover)' : (kProb < 42 ? 'var(--danger)' : 'var(--warning)')};">
                ⚡ ${kProb}% Prob. <span class="info-help-badge" onclick="event.stopPropagation(); app.showIndicatorHelp('kalshi_prob')" onmouseenter="app.showIndicatorTooltip(event, 'kalshi_prob')" onmouseleave="app.hideIndicatorTooltip()">ⓘ</span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">Riesgo/Ben. 1:${fc.riskRewardRatio || 2.0}</div>
            </div>
          </div>

          <!-- 5. BOTONES DE OPERACIÓN RÁPIDA -->
          <div class="holding-card-actions" style="grid-template-columns: 1fr 1fr auto auto;" onclick="event.stopPropagation()">
            <button type="button" class="btn-card-action btn-card-buy" onclick="app.quickBuyCurrentTicker('${pos.symbol}', ${liveNum})">
              ➕ Comprar+
            </button>
            <button type="button" class="btn-card-action btn-card-sell" onclick="app.quickSellCurrentTicker('${pos.symbol}', ${pos.quantity}, ${liveNum})">
              💵 Vender
            </button>
            <button type="button" class="btn-card-action" style="background: var(--bg-surface-elevated); color: var(--text-main); border: 1px solid var(--border-color); padding: 7px 10px;" onclick="app.openForecastModal(${pos.id})" title="Ver Instrucción Racional y Simulador DCA">
              📲 Racional
            </button>
            <button type="button" class="btn-card-action" style="background: var(--bg-surface-elevated); color: var(--accent-blue); border: 1px solid var(--border-color); padding: 7px 10px;" onclick="app.selectTickerOnChart('${pos.symbol}')" title="Ver ${pos.symbol} en el Gráfico Kalshi">
              📈
            </button>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
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

  theme: 'slate',
  showVolume: true,

  initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'slate';
    this.theme = savedTheme;
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
      this.updateThemeButton(true);
    } else {
      document.body.classList.remove('dark-theme');
      this.updateThemeButton(false);
    }
  },

  toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    this.theme = isDark ? 'dark' : 'slate';
    localStorage.setItem('theme', this.theme);
    this.updateThemeButton(isDark);

    if (this.data && this.data.openPositions) {
      this.renderCharts(this.data.openPositions);
    }
  },

  updateThemeButton(isDark) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon && text) {
      if (isDark) {
        icon.innerText = '☀️';
        text.innerText = 'Modo Slate';
      } else {
        icon.innerText = '🌙';
        text.innerText = 'Modo Oscuro';
      }
    }
  },

  intradayChartStyle: 'step', // 'step' (Kalshi), 'line' (Curva) o 'candle' (Velas)
  currentTimeframe: '15m',    // '10m', '15m', '30m', '1d', '1w', '1m'
  showVolume: true,
  showChartLevels: true,

  timeframeConfigs: {
    '10m': { interval: '10m', range: '1d', label: '10 Minutos' },
    '15m': { interval: '15m', range: '1d', label: '15 Minutos' },
    '30m': { interval: '30m', range: '1d', label: '30 Minutos' },
    '1d':  { interval: '5m',  range: '1d', label: '1 Día' },
    '1w':  { interval: '15m', range: '5d', label: '1 Semana' },
    '1m':  { interval: '1d',  range: '1mo', label: '1 Mes' }
  },

  setTimeframe(tf) {
    if (!this.timeframeConfigs[tf]) tf = '15m';
    this.currentTimeframe = tf;
    this.updateChartButtons();
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  // Métodos de compatibilidad hacia atrás
  setChartRange(range) {
    if (range === '5d') this.setTimeframe('1w');
    else if (range === '1mo') this.setTimeframe('1m');
    else this.setTimeframe('1d');
  },
  setChartInterval(interval) {
    if (interval === '10m') this.setTimeframe('10m');
    else if (interval === '30m') this.setTimeframe('30m');
    else this.setTimeframe('15m');
  },

  setChartStyle(style) {
    this.intradayChartStyle = style;
    this.updateChartButtons();
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  toggleChartLevels() {
    this.showChartLevels = !this.showChartLevels;
    this.updateChartButtons();
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  toggleVolume() {
    this.showVolume = !this.showVolume;
    this.updateChartButtons();
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
  },

  updateChartButtons() {
    // 1. Selector único de temporalidad inferior (solo uno activo a la vez)
    Object.keys(this.timeframeConfigs).forEach(tf => {
      const btn = document.getElementById(`btn-tf-${tf}`);
      if (btn) {
        if (this.currentTimeframe === tf) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    // 2. Estilo (step, line, candle)
    ['step', 'line', 'candle'].forEach(st => {
      const btn = document.getElementById(`btn-chart-style-${st}`);
      if (btn) {
        if (this.intradayChartStyle === st) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    // 3. Niveles Operativos (Compra / Target / Stop)
    const btnLvl = document.getElementById('btn-chart-levels');
    const txtLvl = document.getElementById('levels-status-text');
    if (txtLvl) txtLvl.innerText = this.showChartLevels ? 'ON' : 'OFF';
    if (btnLvl) {
      if (this.showChartLevels) btnLvl.classList.add('active');
      else btnLvl.classList.remove('active');
    }

    // 4. Volumen
    const btnVol = document.getElementById('btn-chart-volume');
    const txtVol = document.getElementById('volume-status-text');
    if (txtVol) txtVol.innerText = this.showVolume ? 'ON' : 'OFF';
    if (btnVol) {
      if (this.showVolume) btnVol.classList.add('active');
      else btnVol.classList.remove('active');
    }

    // 5. Badge informativo de temporalidad activa
    const badge = document.getElementById('chart-info-badge');
    if (badge) {
      const config = this.timeframeConfigs[this.currentTimeframe] || this.timeframeConfigs['15m'];
      badge.innerText = config.label;
    }
  },

  updateIntradayKalshiHeader(symbol, currentPrice, basePrice, timeLabel) {
    const titleEl = document.getElementById('kalshi-intraday-ticker-title');
    const priceEl = document.getElementById('kalshi-live-price');
    const deltaEl = document.getElementById('kalshi-live-delta');
    const timeEl = document.getElementById('kalshi-hover-timestamp');
    const dotEl = document.getElementById('kalshi-intraday-dot');

    if (titleEl) titleEl.innerText = `${symbol} • EVOLUCIÓN DE MERCADO`;
    if (priceEl) priceEl.innerText = `$${Number(currentPrice || 0).toFixed(2)}`;

    const diff = (currentPrice || 0) - (basePrice || currentPrice || 1);
    const pct = basePrice > 0 ? (diff / basePrice) * 100 : 0;
    const isPos = diff >= 0;

    if (deltaEl) {
      const sign = isPos ? '+' : '';
      deltaEl.innerText = `${isPos ? '▲ ' : '▼ '}${sign}$${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
      deltaEl.className = `kalshi-price-delta ${isPos ? 'pill-up' : 'pill-down'}`;
    }
    if (dotEl) {
      dotEl.style.background = isPos ? 'var(--primary)' : 'var(--danger)';
      dotEl.style.boxShadow = `0 0 8px ${isPos ? 'var(--primary)' : 'var(--danger)'}`;
    }
    if (timeEl) {
      timeEl.innerText = timeLabel || 'En vivo (NY)';
    }
  },

  renderCharts(openPositions, isSilent = false) {
    const selectElem = document.getElementById('chart-stock-select');
    const pillsContainer = document.getElementById('kalshi-chart-ticker-pills');

    // Construir lista única de símbolos abiertos
    const seen = new Set();
    const uniqueOpen = [];
    (openPositions || []).forEach(p => {
      const sym = (p.symbol || '').trim().toUpperCase();
      if (sym && !seen.has(sym)) {
        seen.add(sym);
        uniqueOpen.push({ symbol: sym, livePrice: Number(p.livePrice || p.buy_price || 0) });
      }
    });

    if (uniqueOpen.length > 0) {
      if (!this.hasInitializedChartSymbol || !this.selectedIntradaySymbol) {
        this.selectedIntradaySymbol = uniqueOpen[0].symbol;
        this.hasInitializedChartSymbol = true;
      }

      const currentSelected = (this.selectedIntradaySymbol || uniqueOpen[0].symbol).trim().toUpperCase();
      // Si el usuario seleccionó un símbolo desde el Analizador o Radar que no está en abiertas, incluirlo también
      const listForSelector = [...uniqueOpen];
      if (!listForSelector.some(item => item.symbol === currentSelected)) {
        listForSelector.unshift({ symbol: currentSelected, livePrice: 0 });
      }

      // Actualizar <select> solo si el usuario no lo tiene desplegado en este instante
      if (selectElem && document.activeElement !== selectElem) {
        let html = '';
        listForSelector.forEach(item => {
          const isSel = item.symbol === currentSelected ? 'selected' : '';
          const priceTxt = item.livePrice > 0 ? ` (${item.livePrice.toFixed(2)})` : '';
          html += `<option value="${item.symbol}" ${isSel}>${item.symbol}${priceTxt}</option>`;
        });
        selectElem.innerHTML = html;
        selectElem.value = currentSelected;
      }

      // Renderizar píldoras 1-clic de acciones encima del gráfico
      if (pillsContainer) {
        pillsContainer.innerHTML = listForSelector.map(item => {
          const isAct = item.symbol === currentSelected ? 'active' : '';
          return `<button type="button" class="kalshi-ticker-pill ${isAct}" data-symbol="${item.symbol}" onclick="app.changeIntradaySymbol('${item.symbol}')">${item.symbol}</button>`;
        }).join('');
      }
    }

    this.updateChartButtons();
    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
    this.fetchAndRenderHistoricalChart();
  },

  selectTickerOnChart(symbol) {
    const cleanSym = (symbol || '').trim().toUpperCase();
    if (!cleanSym) return;
    this.changeIntradaySymbol(cleanSym);
    const chartCard = document.getElementById('chart-intraday-line');
    if (chartCard) {
      chartCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  async changeIntradaySymbol(symbol) {
    const cleanSym = (symbol || '').trim().toUpperCase();
    if (!cleanSym) return;
    this.selectedIntradaySymbol = cleanSym;
    this.hasInitializedChartSymbol = true;

    // Sincronizar selector desplegable y barra de píldoras inmediatamente
    const selectElem = document.getElementById('chart-stock-select');
    if (selectElem && selectElem.value !== cleanSym) {
      selectElem.value = cleanSym;
    }
    const pillsContainer = document.getElementById('kalshi-chart-ticker-pills');
    if (pillsContainer) {
      pillsContainer.querySelectorAll('.kalshi-ticker-pill').forEach(btn => {
        if (btn.getAttribute('data-symbol') === cleanSym || btn.innerText.trim() === cleanSym) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    const titleEl = document.getElementById('kalshi-intraday-ticker-title');
    if (titleEl) {
      titleEl.innerText = `${cleanSym} • CARGANDO GRÁFICO...`;
    }

    await this.fetchAndRenderIntradayChart(cleanSym);
  },

  async fetchAndRenderIntradayChart(symbol) {
    const canvas = document.getElementById('chart-intraday-line');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const cleanSym = (symbol || this.selectedIntradaySymbol || 'TSLA').trim().toUpperCase();
    const reqId = ++this.intradayReqId;
    const config = this.timeframeConfigs[this.currentTimeframe] || this.timeframeConfigs['15m'];

    try {
      const res = await fetch(`/api/chart/intraday?symbol=${encodeURIComponent(cleanSym)}&interval=${config.interval}&range=${config.range}&_t=${Date.now()}`);
      if (!res.ok) throw new Error('Error al obtener datos intradiarios');
      const data = await res.json();
      // Si el usuario cambió a otra acción mientras esta petición estaba en curso, descartar respuesta antigua
      if (reqId !== this.intradayReqId) return;
      symbol = cleanSym;

      const points = data.points || [];
      const labels = points.map(p => p.time);
      const volumes = points.map(p => p.volume || 0);
      const prices = points.map(p => p.close || p.price);

      const firstPrice = data.prevClose || (prices[0] || 100);
      const lastPrice = data.currentPrice || (prices[prices.length - 1] || firstPrice);
      const isPositive = lastPrice >= firstPrice;

      // Buscar posición abierta activa y su pronóstico cuantitativo para este símbolo
      const activePos = (this.data && this.data.openPositions)
        ? this.data.openPositions.find(p => (p.symbol || '').trim().toUpperCase() === (symbol || '').trim().toUpperCase())
        : null;
      const fc = activePos && activePos.forecast ? activePos.forecast : null;

      // Actualizar badge de probabilidad Kalshi y leyenda de niveles operativos
      const probBadgeEl = document.getElementById('kalshi-intraday-prob-badge');
      const legendEl = document.getElementById('kalshi-levels-legend');
      if (fc) {
        if (probBadgeEl) {
          probBadgeEl.style.display = 'inline-block';
          probBadgeEl.innerText = `⚡ ${fc.kalshiProb || 60}% Prob. Alcista`;
        }
        if (legendEl) {
          legendEl.style.display = this.showChartLevels ? 'flex' : 'none';
          const chipBuy = document.getElementById('kl-chip-buy');
          const chipTarget = document.getElementById('kl-chip-target');
          const chipStop = document.getElementById('kl-chip-stop');
          const chipAtr = document.getElementById('kl-chip-atr');
          if (chipBuy) chipBuy.innerText = `🔵 Compra: $${(activePos.buy_price || 0).toFixed(2)}`;
          if (chipTarget) chipTarget.innerText = `🟢 Objetivo: $${(fc.targetPrice || 0).toFixed(2)}`;
          if (chipStop) chipStop.innerText = `🔴 ${fc.isTrailingStop ? 'Trailing Stop' : 'Stop ATR'}: $${(fc.suggestedStopLoss || 0).toFixed(2)}`;
          if (chipAtr) chipAtr.innerText = `📐 Rango 5D (ATR $${fc.atr || 0}): $${fc.expectedLow5d || 0} - $${fc.expectedHigh5d || 0}`;
        }
      } else {
        if (probBadgeEl) probBadgeEl.style.display = 'none';
        if (legendEl) legendEl.style.display = 'none';
      }

      // Inicializar el Header estilo Kalshi con el precio en vivo actual
      this.updateIntradayKalshiHeader(symbol, lastPrice, firstPrice, `En vivo • ${points[points.length - 1]?.time || ''} NY`);

      const maxVol = Math.max(...volumes, 1);
      const isDark = document.body.classList.contains('dark-theme');
      const greenHex = isDark ? '#28CC95' : '#00B87C';
      const redHex = isDark ? '#F24E4E' : '#E53935';
      const strokeColor = isPositive ? greenHex : redHex;

      const volColors = points.map(p => p.close >= p.open ? 'rgba(0, 184, 124, 0.22)' : 'rgba(229, 57, 53, 0.22)');

      if (this.charts.intraday) this.charts.intraday.destroy();

      const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(13, 16, 23, 0.06)';
      const tickColor = isDark ? '#8A94A6' : '#5A6577';

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
        const bgGradient = ctx.createLinearGradient(0, 0, 0, 290);
        if (isPositive) {
          bgGradient.addColorStop(0, isDark ? 'rgba(40, 204, 149, 0.28)' : 'rgba(0, 184, 124, 0.22)');
          bgGradient.addColorStop(0.75, isDark ? 'rgba(40, 204, 149, 0.04)' : 'rgba(0, 184, 124, 0.03)');
          bgGradient.addColorStop(1, 'rgba(0, 184, 124, 0.0)');
        } else {
          bgGradient.addColorStop(0, isDark ? 'rgba(242, 78, 78, 0.28)' : 'rgba(229, 57, 53, 0.20)');
          bgGradient.addColorStop(0.75, isDark ? 'rgba(242, 78, 78, 0.04)' : 'rgba(229, 57, 53, 0.03)');
          bgGradient.addColorStop(1, 'rgba(229, 57, 53, 0.0)');
        }

        const isStep = this.intradayChartStyle === 'step';
        const pointRadii = prices.map((_, idx) => (idx === prices.length - 1 ? 5 : 0));

        datasets.push({
          type: 'line',
          label: `${symbol} (US$)`,
          data: prices,
          borderColor: strokeColor,
          borderWidth: 2.5,
          backgroundColor: bgGradient,
          fill: true,
          stepped: isStep ? 'before' : false,
          tension: isStep ? 0 : 0.25,
          pointBackgroundColor: strokeColor,
          pointBorderColor: isDark ? '#12161C' : '#FFFFFF',
          pointBorderWidth: 2.5,
          pointRadius: pointRadii,
          pointHoverRadius: 6.5,
          pointHoverBackgroundColor: strokeColor,
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2.5,
          yAxisID: 'y'
        });
      }

      if (this.showVolume) {
        datasets.push({
          type: 'bar',
          label: 'Volumen Transado',
          data: volumes,
          backgroundColor: volColors,
          borderColor: 'transparent',
          borderRadius: 2,
          barPercentage: 0.7,
          categoryPercentage: 0.85,
          yAxisID: 'yVolume'
        });
      }

      const allLows = points.map(p => p.low || p.price);
      const allHighs = points.map(p => p.high || p.price);
      let minPrice = Math.min(...allLows, firstPrice);
      let maxPrice = Math.max(...allHighs, firstPrice);

      // Si Niveles (ON) está activo y los niveles operativos están relativamente cerca (dentro del 16% del precio actual), expandir eje Y para visualizarlos directamente en el lienzo
      if (this.showChartLevels && activePos && fc) {
        const candidateLevels = [activePos.buy_price, fc.targetPrice, fc.suggestedStopLoss].filter(Boolean);
        candidateLevels.forEach(lvl => {
          const distRatio = Math.abs(lvl - lastPrice) / Math.max(1, lastPrice);
          if (distRatio <= 0.16) {
            minPrice = Math.min(minPrice, lvl);
            maxPrice = Math.max(maxPrice, lvl);
          }
        });
      }

      const padding = (maxPrice - minPrice) * 0.08 || 1.0;
      const yMin = Math.floor((minPrice - padding) * 100) / 100;
      const yMax = Math.ceil((maxPrice + padding) * 100) / 100;

      const kalshiChartPlugin = {
        id: 'kalshiChartPlugin',
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea, scales: { x, y } } = chart;
          if (!chartArea) return;

          // 1. Línea de Referencia Punteada del Cierre Anterior (Estilo Kalshi Baseline)
          if (firstPrice >= yMin && firstPrice <= yMax) {
            const baseY = y.getPixelForValue(firstPrice);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(chartArea.left, baseY);
            ctx.lineTo(chartArea.right, baseY);
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(13, 16, 23, 0.18)';
            ctx.stroke();
            ctx.restore();
          }

          // 2. Líneas Horizontales de Niveles Operativos (Compra, Objetivo, Stop/Trailing)
          if (app.showChartLevels && activePos && fc) {
            const drawLevelLine = (priceVal, labelText, colorHex) => {
              if (!priceVal || priceVal < yMin || priceVal > yMax) return;
              const py = y.getPixelForValue(priceVal);
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(chartArea.left, py);
              ctx.lineTo(chartArea.right, py);
              ctx.lineWidth = 1.25;
              ctx.setLineDash([6, 4]);
              ctx.strokeStyle = colorHex;
              ctx.stroke();

              // Etiqueta lateral izquierda sobre la línea
              ctx.font = '700 10px "JetBrains Mono", Inter, sans-serif';
              const fullTxt = `${labelText}: $${priceVal.toFixed(2)}`;
              const txtWidth = ctx.measureText(fullTxt).width;
              ctx.fillStyle = isDark ? 'rgba(18, 22, 28, 0.88)' : 'rgba(255, 255, 255, 0.90)';
              ctx.fillRect(chartArea.left + 6, py - 9, txtWidth + 10, 16);
              ctx.fillStyle = colorHex;
              ctx.fillText(fullTxt, chartArea.left + 11, py + 3);
              ctx.restore();
            };

            drawLevelLine(activePos.buy_price, 'COMPRA', '#2563EB');
            drawLevelLine(fc.targetPrice, 'OBJETIVO', greenHex);
            drawLevelLine(fc.suggestedStopLoss, fc.isTrailingStop ? 'TRAILING' : 'STOP', redHex);
          }

          // 3. Renderizado de Velas si está en modo Velas
          if (app.intradayChartStyle !== 'candle') return;
          const candleWidth = Math.max(4, Math.min(12, Math.floor((chartArea.width / Math.max(points.length, 1)) * 0.6)));
          points.forEach((p, i) => {
            const xPos = x.getPixelForValue(i);
            const highY = y.getPixelForValue(p.high);
            const lowY = y.getPixelForValue(p.low);
            const openY = y.getPixelForValue(p.open);
            const closeY = y.getPixelForValue(p.close);
            const isGreen = p.close >= p.open;
            const color = isGreen ? greenHex : redHex;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(xPos, highY);
            ctx.lineTo(xPos, lowY);
            ctx.stroke();

            const topY = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 2.5);

            ctx.fillStyle = color;
            ctx.fillRect(xPos - candleWidth / 2, topY, candleWidth, bodyHeight);
            ctx.restore();
          });
        },
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales: { x, y } } = chart;
          if (!chartArea || points.length === 0) return;

          // Halo Luminoso en el último punto en vivo (Kalshi Live Endpoint Glow)
          if (app.intradayChartStyle !== 'candle') {
            const lastIdx = points.length - 1;
            const lastX = x.getPixelForValue(lastIdx);
            const lastY = y.getPixelForValue(points[lastIdx].close);

            ctx.save();
            ctx.beginPath();
            ctx.arc(lastX, lastY, 10, 0, Math.PI * 2);
            ctx.fillStyle = isPositive ? 'rgba(0, 184, 124, 0.22)' : 'rgba(229, 57, 53, 0.22)';
            ctx.fill();
            ctx.restore();
          }
        },
        afterDraw(chart) {
          // Crosshair Vertical + Actualización en Tiempo Real del Header Kalshi al pasar el mouse
          if (chart.tooltip?._active?.length) {
            const activePoint = chart.tooltip._active[0];
            const idx = activePoint.index;
            const p = points[idx];
            const ctx = chart.ctx;
            const xPos = activePoint.element.x;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xPos, topY);
            ctx.lineTo(xPos, bottomY);
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(13, 16, 23, 0.35)';
            ctx.stroke();
            ctx.restore();

            if (p) {
              app.updateIntradayKalshiHeader(symbol, p.close, firstPrice, `🕒 ${p.time} NY • Vol: ${(p.volume || 0).toLocaleString('es-ES')}`);
            }
          } else {
            // Al sacar el cursor del gráfico, vuelve al precio en vivo actual
            app.updateIntradayKalshiHeader(symbol, lastPrice, firstPrice, `En vivo • ${points[points.length - 1]?.time || ''} NY`);
          }
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
          interaction: {
            mode: 'index',
            intersect: false
          },
          scales: {
            x: {
              border: { display: false },
              ticks: {
                color: tickColor,
                maxTicksLimit: 7,
                font: { family: 'Inter', size: 11, weight: '600' }
              },
              grid: { display: false }
            },
            y: {
              type: 'linear',
              position: 'right',
              min: yMin,
              max: yMax,
              border: { display: false },
              ticks: {
                color: tickColor,
                maxTicksLimit: 6,
                font: { family: 'JetBrains Mono, Inter', size: 11, weight: '600' },
                callback: function(v) { return '$' + v.toFixed(2); }
              },
              grid: {
                color: gridColor,
                borderDash: [3, 3]
              }
            },
            yVolume: {
              type: 'linear',
              position: 'left',
              display: false,
              min: 0,
              max: maxVol * 4.5
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isDark ? 'rgba(18, 22, 28, 0.96)' : 'rgba(13, 16, 23, 0.94)',
              titleFont: { family: 'Inter', size: 11, weight: '700' },
              bodyFont: { family: 'JetBrains Mono, Inter', size: 12, weight: '600' },
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: function(items) {
                  if (!items.length) return '';
                  return `${symbol} • ${items[0].label} (NY)`;
                },
                label: function(context) {
                  const p = points[context.dataIndex];
                  const volStr = p.volume ? p.volume.toLocaleString('es-ES') : '0';
                  if (app.intradayChartStyle === 'candle') {
                    if (context.datasetIndex === 0) {
                      return [
                        `O: $${p.open.toFixed(2)}   C: $${p.close.toFixed(2)}`,
                        `H: $${p.high.toFixed(2)}   L: $${p.low.toFixed(2)}`,
                        `Vol: ${volStr} acc`
                      ];
                    }
                  } else {
                    if (context.datasetIndex === 0) {
                      return [
                        `Precio: $${p.close.toFixed(2)}`,
                        `Volumen: ${volStr} acc`
                      ];
                    }
                  }
                  return null;
                }
              }
            }
          }
        },
        plugins: [kalshiChartPlugin]
      });

    } catch (err) {
      console.error('Error renderizando gráfico intradiario:', err);
    }
  },

  // ==========================================
  // GRÁFICO HISTÓRICO DE VALOR TOTAL DE CARTERA VS BENCHMARK S&P 500 (ESTILO KALSHI)
  // ==========================================
  updateHistoricalKalshiHeader(totalVal, netGain, dateLabel) {
    const valEl = document.getElementById('kalshi-hist-total-val');
    const gainEl = document.getElementById('kalshi-hist-net-gain');
    const dateEl = document.getElementById('kalshi-hist-hover-date');

    if (valEl) valEl.innerText = `$${Number(totalVal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (gainEl) {
      const isPos = (netGain || 0) >= 0;
      const sign = isPos ? '+' : '';
      gainEl.innerText = `${isPos ? '▲ ' : '▼ '}${sign}$${Number(netGain || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} Realizado`;
      gainEl.className = `kalshi-price-delta ${isPos ? 'pill-up' : 'pill-down'}`;
    }
    if (dateEl) dateEl.innerText = dateLabel || 'Histórico Completo';
  },

  async fetchAndRenderHistoricalChart() {
    const canvas = document.getElementById('chart-historical-line');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    try {
      const res = await fetch(`/api/chart/historical-portfolio?_t=${Date.now()}`, {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) throw new Error('Error al obtener datos históricos');
      const data = await res.json();
      const timeline = data.timeline || [];

      if (timeline.length === 0) return;

      const labels = timeline.map(t => t.date);
      const totalValues = timeline.map(t => t.totalValue);
      const investedValues = timeline.map(t => t.invested);
      const spyValues = timeline.map(t => t.spyBenchmarkValue || t.invested);

      const lastItem = timeline[timeline.length - 1];
      this.updateHistoricalKalshiHeader(lastItem.totalValue, lastItem.netGain, `Actualizado • ${lastItem.date}`);

      // Actualizar badge de Alpha vs S&P 500
      const alphaBadge = document.getElementById('kalshi-hist-alpha-badge');
      if (alphaBadge && lastItem.alphaPct !== undefined) {
        const aSign = lastItem.alphaPct >= 0 ? '+' : '';
        alphaBadge.innerText = `Alpha vs S&P 500: ${aSign}${lastItem.alphaPct.toFixed(1)}%`;
        alphaBadge.style.background = lastItem.alphaPct >= 0 ? 'var(--primary-light)' : 'var(--danger-bg)';
        alphaBadge.style.color = lastItem.alphaPct >= 0 ? 'var(--primary-hover)' : 'var(--danger)';
      }

      const isDark = document.body.classList.contains('dark-theme');
      const greenHex = isDark ? '#28CC95' : '#00B87C';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(13, 16, 23, 0.06)';
      const tickColor = isDark ? '#8A94A6' : '#5A6577';

      const bgGradient = ctx.createLinearGradient(0, 0, 0, 290);
      bgGradient.addColorStop(0, isDark ? 'rgba(40, 204, 149, 0.28)' : 'rgba(0, 184, 124, 0.22)');
      bgGradient.addColorStop(0.8, isDark ? 'rgba(40, 204, 149, 0.03)' : 'rgba(0, 184, 124, 0.02)');
      bgGradient.addColorStop(1, 'rgba(0, 184, 124, 0.0)');

      if (this.charts.historical) this.charts.historical.destroy();

      const pointRadii = totalValues.map((_, idx) => (idx === totalValues.length - 1 ? 5 : 0));

      const kalshiHistPlugin = {
        id: 'kalshiHistPlugin',
        afterDraw(chart) {
          if (chart.tooltip?._active?.length) {
            const activePoint = chart.tooltip._active[0];
            const idx = activePoint.index;
            const t = timeline[idx];
            const ctx = chart.ctx;
            const xPos = activePoint.element.x;
            const topY = chart.scales.y.top;
            const bottomY = chart.scales.y.bottom;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xPos, topY);
            ctx.lineTo(xPos, bottomY);
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(13, 16, 23, 0.35)';
            ctx.stroke();
            ctx.restore();

            if (t) {
              app.updateHistoricalKalshiHeader(t.totalValue, t.netGain, `📅 Fecha: ${t.date}`);
            }
          } else {
            app.updateHistoricalKalshiHeader(lastItem.totalValue, lastItem.netGain, `Actualizado • ${lastItem.date}`);
          }
        }
      };

      this.charts.historical = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Valor Total Cartera US$',
              data: totalValues,
              borderColor: greenHex,
              borderWidth: 2.5,
              backgroundColor: bgGradient,
              fill: true,
              stepped: 'before',
              pointBackgroundColor: greenHex,
              pointBorderColor: isDark ? '#12161C' : '#FFFFFF',
              pointBorderWidth: 2.5,
              pointRadius: pointRadii,
              pointHoverRadius: 6.5
            },
            {
              label: 'Benchmark S&P 500 (SPY) US$',
              data: spyValues,
              borderColor: '#8B5CF6',
              borderWidth: 2,
              borderDash: [3, 3],
              backgroundColor: 'transparent',
              fill: false,
              stepped: 'before',
              pointRadius: 0,
              pointHoverRadius: 4
            },
            {
              label: 'Capital Invertido US$',
              data: investedValues,
              borderColor: '#1D6FF2',
              borderWidth: 1.6,
              borderDash: [6, 5],
              backgroundColor: 'transparent',
              fill: false,
              stepped: 'before',
              pointRadius: 0,
              pointHoverRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false
          },
          scales: {
            x: {
              border: { display: false },
              ticks: { color: tickColor, font: { family: 'Inter', size: 11, weight: '600' } },
              grid: { display: false }
            },
            y: {
              position: 'right',
              border: { display: false },
              ticks: {
                color: tickColor,
                font: { family: 'JetBrains Mono, Inter', size: 11, weight: '600' },
                callback: function(v) { return '$' + v.toLocaleString('en-US'); }
              },
              grid: { color: gridColor, borderDash: [3, 3] }
            }
          },
          plugins: {
            legend: {
              display: true,
              labels: { color: tickColor, font: { family: 'Inter', size: 12, weight: '600' }, boxWidth: 12, usePointStyle: true }
            },
            tooltip: {
              backgroundColor: isDark ? 'rgba(18, 22, 28, 0.96)' : 'rgba(13, 16, 23, 0.94)',
              padding: 10,
              cornerRadius: 8,
              callbacks: {
                label: function(context) {
                  const t = timeline[context.dataIndex];
                  if (context.datasetIndex === 0) {
                    const gainSign = t.netGain >= 0 ? '+' : '';
                    return [
                      `Valor Cartera: $${t.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                      `Ganancia Real: ${gainSign}$${t.netGain.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                    ];
                  }
                  if (context.datasetIndex === 1) {
                    return `Benchmark S&P 500: $${(t.spyBenchmarkValue || t.invested).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                  }
                  return `Invertido: $${t.invested.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          }
        },
        plugins: [kalshiHistPlugin]
      });
    } catch (err) {
      console.error('Error renderizando gráfico histórico de cartera:', err);
    }
  },

  renderOpenTable(openPositions) {
    const tbody = document.getElementById('tbody-open');
    if (!openPositions || openPositions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">No se encontraron posiciones abiertas con el filtro actual.</td></tr>`;
      return;
    }

    let html = '';
    openPositions.forEach((p, idx) => {
      const isGain = p.unrealizedGain >= 0;
      const fc = p.forecast || {};
      const stopPrice = fc.suggestedStopLoss || (p.buy_price * 0.92);
      const targetPrice = fc.targetPrice || (p.buy_price * 1.15);
      const liveNum = p.livePrice || p.buy_price;
      const minR = Math.min(stopPrice, p.buy_price, liveNum) * 0.98;
      const maxR = Math.max(targetPrice, p.buy_price, liveNum) * 1.02;
      const pctNow = Math.min(95, Math.max(5, ((liveNum - minR) / Math.max(0.01, maxR - minR)) * 100));

      html += `
        <tr class="${isGain ? 'row-profit' : 'row-loss'}">
          <td>
            <div class="symbol-cell" onclick="app.openTickerAnalysisModal('${p.symbol}')" style="cursor: pointer;" title="Haz clic para análisis 360° de ${p.symbol}">
              <div class="symbol-avatar">${p.symbol.substring(0, 3)}</div>
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="holding-index-badge">#${idx + 1}</span>
                  <span class="symbol-name" style="color: var(--accent-blue); text-decoration: underline dotted; font-size: 14px;">${p.symbol} 🔍</span>
                </div>
                <div class="symbol-sub">${p.original_name || p.symbol} • <strong>${p.daysHeld} días</strong></div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight: 800; color: var(--text-main); font-family: var(--font-mono);">${p.quantity} acc a ${p.buy_price.toFixed(2)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">📅 Compra: ${p.buy_date || '-'}</div>
          </td>
          <td>
            <div style="font-size: 14.5px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">${liveNum.toFixed(2)}</div>
            <div class="${p.change >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 11.5px; font-weight: 700;">
              ${p.change >= 0 ? '▲ +' : '▼ '}${p.changePercent.toFixed(2)}% hoy
            </div>
          </td>
          <td>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Invertido: <strong>${p.buy_total.toFixed(2)}</strong></div>
            <div style="font-size: 14px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">Hoy: ${p.currentValue.toFixed(2)}</div>
          </td>
          <td>
            <div class="${isGain ? 'text-success' : 'text-danger'}" style="font-weight: 800; font-size: 14.5px; font-family: var(--font-mono);">
              ${isGain ? '+' : ''}${p.unrealizedGain.toFixed(2)}
            </div>
            <span class="${isGain ? 'badge-up' : 'badge-down'}" style="display: inline-block; margin-top: 3px;">
              ${isGain ? '+' : ''}${p.unrealizedGainPercent.toFixed(2)}%
            </span>
          </td>
          <td style="min-width: 175px;">
            <div style="display: flex; justify-content: space-between; font-size: 10.5px; font-family: var(--font-mono); font-weight: 700; margin-bottom: 4px;">
              <span style="color: var(--danger);">🛡️ ${stopPrice.toFixed(2)}</span>
              <span style="color: var(--primary-hover);">🎯 ${targetPrice.toFixed(2)}</span>
            </div>
            <div class="holding-range-track" style="height: 6px;">
              <div class="holding-range-fill" style="width: ${pctNow}%;"></div>
              <div class="holding-range-marker-now" style="left: ${pctNow}%; width: 11px; height: 11px; top: -3px;"></div>
            </div>
          </td>
          <td>
            <div onclick="app.openForecastModal(${p.id})" style="cursor: pointer;" title="Haz clic para ver la instrucción para Racional Premium y Simulador DCA">
              <span class="${fc.racionalAction === 'VENDER' ? 'badge-down' : (fc.racionalAction === 'COMPRAR+' ? 'badge-up' : 'badge-neutral')}" style="font-size: 11.5px; padding: 5px 10px; font-weight: 800; display: inline-block;">
                📲 ${fc.racionalBadge || '🔵 MANTENER POSICIÓN'}
              </span>
              <div style="font-size: 10.5px; color: var(--text-muted); margin-top: 4px; font-weight: 700; font-family: var(--font-mono);">
                ⚡ ${fc.kalshiProb || 60}% Prob • R/R 1:${fc.riskRewardRatio || 2.0}
              </div>
            </div>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center;">
              <button class="btn btn-success" style="padding: 6px 10px; font-weight: 700; font-size: 11px;" onclick="app.openSellModal(${p.id}, '${p.symbol}', ${liveNum})">
                💵 Vender
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px; color: var(--accent-blue);" onclick="app.openTickerAnalysisModal('${p.symbol}')" title="Análisis 360°">
                🔍
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px;" onclick="app.openForecastModal(${p.id})" title="Ver Pronóstico y Simulador DCA">
                📲
              </button>
              <button class="btn btn-secondary" style="padding: 6px 8px; font-size: 11px;" onclick="app.openEditModal(${p.id})" title="Editar Posición">
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
              <div class="symbol-avatar">${p.symbol.substring(0, 3)}</div>
              <div>
                <div class="symbol-name" style="color: var(--accent-blue); text-decoration: underline dotted;">${p.symbol} 🔍</div>
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
              <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 11px; color: var(--accent-blue);" onclick="app.openTickerAnalysisModal('${p.symbol}')" title="Análisis 360°">
                🔍
              </button>
              <button class="btn btn-secondary" style="padding: 5px 8px; font-size: 11px;" onclick="app.openEditClosedModal(${p.id})" title="Editar Venta">
                ✏️
              </button>
              <button class="btn btn-danger" style="padding: 5px 8px; font-size: 11px; background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger);" onclick="app.deleteTransaction(${p.id}, '${p.symbol}')" title="Eliminar Registro">
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
      const res = await fetch(`/api/ticker/analyze?symbol=${encodeURIComponent(cleanSymbol)}&_t=${Date.now()}`, {
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

      const kProbElem = document.getElementById('t-hero-kalshi-prob');
      if (kProbElem) {
        kProbElem.innerText = `⚡ ${tech.kalshiProb || 60}% Prob. Kalshi`;
      }

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
        tHtml += '<tr style="color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); text-align: left;"><th style="padding: 4px;">Fecha Venta</th><th>Cant.</th><th>P. Compra</th><th>P. Venta</th><th style="text-align: right;">Ganancia</th></tr>';
        port.closedTrades.forEach(tr => {
          const isWin = tr.realized_gain >= 0;
          tHtml += `
            <tr style="border-bottom: 1px solid var(--border-subtle);">
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

      // 3. Indicadores Técnicos Multifactoriales
      document.getElementById('t-tech-rsi').innerText = tech.rsi || '50.0';
      const rsiNum = parseFloat(tech.rsi || 50);
      document.getElementById('t-tech-rsi-status').innerText = rsiNum <= 32 ? '🟢 Sobreventa' : (rsiNum >= 70 ? '🔴 Sobrecompra' : '🟡 Zona Fuerte');
      const macdEl = document.getElementById('t-tech-macd');
      if (macdEl) {
        const mState = (tech.macd && tech.macd.state) ? tech.macd.state : 'NEUTRAL';
        macdEl.innerText = mState;
        macdEl.style.color = mState.includes('ALCISTA') ? 'var(--primary-hover)' : (mState.includes('BAJISTA') ? 'var(--danger)' : 'var(--text-secondary)');
      }
      const rvolEl = document.getElementById('t-tech-rvol');
      if (rvolEl) rvolEl.innerText = `RVOL ${tech.volumeRatio || 1.0}x`;
      const atrEl = document.getElementById('t-tech-atr');
      if (atrEl) atrEl.innerText = `$${tech.atr || 0}`;
      const rrEl = document.getElementById('t-tech-rr');
      if (rrEl) rrEl.innerText = `R/R 1:${tech.riskRewardRatio || 2.0}`;

      document.getElementById('t-tech-sma50').innerText = `$${tech.sma50 || '-'}`;
      document.getElementById('t-tech-support').innerText = `$${tech.atrStopLoss || tech.support || '-'}`;
      document.getElementById('t-tech-resistance').innerText = `$${tech.atrTakeProfit || tech.resistance || '-'}`;
      document.getElementById('t-tech-reason').innerText = tech.reason || 'Sin datos técnicos disponibles para este activo.';

      // 4. Noticias
      const newsContainer = document.getElementById('t-news-container');
      const newsList = data.news || [];
      if (newsList.length > 0) {
        let nHtml = '';
        newsList.slice(0, 3).forEach(n => {
          const sent = n.sentiment || { type: 'neutral', color: '#38bdf8' };
          nHtml += `
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-left: 3px solid ${sent.color}; padding: 10px 14px; border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
                <span>🏛️ ${n.publisher}</span>
                <span>🕒 ${n.providerPublishTime}</span>
              </div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">${n.title}</div>
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

  quickBuyCurrentTicker(symbol, livePrice) {
    const targetSym = (symbol || this.currentAnalyzedSymbol || '').trim().toUpperCase();
    this.closeTickerAnalysisModal();
    this.openBuyModal();
    const symInput = document.getElementById('buy-symbol');
    if (symInput && targetSym) {
      symInput.value = targetSym;
    }
    const priceInput = document.getElementById('buy-price');
    if (priceInput && livePrice && !isNaN(livePrice)) {
      priceInput.value = parseFloat(livePrice).toFixed(2);
    }
  },

  quickSellCurrentTicker(symbol, qty, livePrice) {
    const targetSym = (symbol || this.currentAnalyzedSymbol || '').trim().toUpperCase();
    this.closeTickerAnalysisModal();
    const openPositions = (this.data && this.data.openPositions) || [];
    const target = openPositions.find(p => p.symbol.trim().toUpperCase() === targetSym);
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

  currentForecastPos: null,

  openForecastModal(id) {
    const openPositions = this.data ? this.data.openPositions : [];
    const item = openPositions.find(p => Number(p.id) === Number(id));
    if (!item || !item.forecast) return;

    this.currentForecastPos = item;
    const fc = item.forecast;
    document.getElementById('fc-modal-symbol').innerText = fc.symbol;

    // Score de Probabilidad Kalshi y Señales
    const probValEl = document.getElementById('fc-modal-prob-val');
    const probBarEl = document.getElementById('fc-modal-prob-bar');
    const signalsEl = document.getElementById('fc-modal-signals');
    const rrEl = document.getElementById('fc-modal-rr');
    const kProb = fc.kalshiProb || 62;

    if (probValEl) {
      probValEl.innerText = `${kProb}%`;
      probValEl.style.color = kProb >= 60 ? 'var(--primary)' : (kProb < 42 ? 'var(--danger)' : 'var(--warning)');
    }
    if (probBarEl) {
      probBarEl.style.width = `${kProb}%`;
    }
    if (rrEl) {
      rrEl.innerText = `1 : ${fc.riskRewardRatio || 2.0}`;
    }
    if (signalsEl) {
      const sigs = Array.isArray(fc.signals) ? fc.signals : [];
      signalsEl.innerHTML = sigs.map(s => `<span class="kalshi-signal-tag">${s}</span>`).join('');
    }

    const actionElem = document.getElementById('fc-modal-action');
    const racSubElem = document.getElementById('fc-modal-racional-sub');
    const racInstElem = document.getElementById('fc-modal-racional-instruction');
    const racBoxElem = document.getElementById('fc-modal-racional-box');

    const rAction = fc.racionalAction || fc.action || 'MANTENER POSICIÓN';
    actionElem.innerText = fc.racionalBadge || `🔵 ${rAction}`;
    actionElem.style.color = rAction === 'VENDER' ? 'var(--danger)' : (rAction === 'COMPRAR+' ? 'var(--primary-hover)' : 'var(--accent-blue)');

    if (racSubElem) {
      racSubElem.innerText = fc.racionalSubtext || '';
    }
    if (racInstElem) {
      racInstElem.innerText = fc.racionalInstruction || fc.reason || '';
    }
    if (racBoxElem) {
      if (rAction === 'VENDER') {
        racBoxElem.style.background = 'var(--danger-bg)';
        racBoxElem.style.borderColor = 'rgba(217, 45, 32, 0.45)';
      } else if (rAction === 'COMPRAR+') {
        racBoxElem.style.background = 'var(--primary-light)';
        racBoxElem.style.borderColor = 'rgba(10, 194, 133, 0.45)';
      } else {
        racBoxElem.style.background = 'rgba(37, 99, 235, 0.10)';
        racBoxElem.style.borderColor = 'rgba(37, 99, 235, 0.35)';
      }
    }

    document.getElementById('fc-modal-horizon').innerText = fc.horizon;
    const atrRangeEl = document.getElementById('fc-modal-atr-range');
    if (atrRangeEl) {
      atrRangeEl.innerText = `Rango 5D (ATR $${fc.atr || 0}): $${fc.expectedLow5d || 0} - $${fc.expectedHigh5d || 0}`;
    }

    document.getElementById('fc-modal-target-price').innerText = `$${(fc.targetPrice || 0).toFixed(2)}`;
    document.getElementById('fc-modal-target-return').innerText = `${fc.targetReturn >= 0 ? '+' : ''}${fc.targetReturn.toFixed(1)}% vs Compra (+${(fc.upsidePercent || 0).toFixed(1)}% hoy)`;
    document.getElementById('fc-modal-current').innerText = `$${(fc.currentPrice || 0).toFixed(2)}`;
    document.getElementById('fc-modal-buy').innerText = `Compra: $${(fc.buyPrice || 0).toFixed(2)} (${fc.returnPercent >= 0 ? '+' : ''}${fc.returnPercent.toFixed(1)}%)`;

    const stopLblEl = document.getElementById('fc-modal-stop-label');
    const stopPriceEl = document.getElementById('fc-modal-stop-price');
    const stopDistEl = document.getElementById('fc-modal-stop-dist');
    if (stopLblEl) {
      stopLblEl.innerText = fc.isTrailingStop ? '🔒 Trailing Stop (Protege Ganancia)' : '🛡️ Stop Loss Dinámico (ATR)';
    }
    if (stopPriceEl) {
      stopPriceEl.innerText = `$${(fc.suggestedStopLoss || 0).toFixed(2)}`;
    }
    if (stopDistEl) {
      stopDistEl.innerText = `-${(fc.downsidePercent || 0).toFixed(1)}% desde precio actual`;
    }

    document.getElementById('fc-modal-reason').innerText = fc.reason;

    // Inicializar Simulador DCA con +$100
    const dcaInput = document.getElementById('fc-dca-input');
    if (dcaInput) dcaInput.value = 100;
    this.updateDcaSimulation();

    document.getElementById('modal-forecast').classList.add('active');
  },

  setDcaAmount(amount) {
    const dcaInput = document.getElementById('fc-dca-input');
    if (dcaInput) {
      dcaInput.value = amount;
      this.updateDcaSimulation();
    }
  },

  updateDcaSimulation() {
    const pos = this.currentForecastPos;
    if (!pos) return;
    const fc = pos.forecast || {};

    const addUsd = Math.max(0, parseFloat(document.getElementById('fc-dca-input')?.value) || 0);
    const livePrice = parseFloat(pos.livePrice || fc.currentPrice || pos.buy_price || 1);
    const oldShares = parseFloat(pos.quantity || 0);
    const oldInvested = parseFloat(pos.buy_total || (oldShares * pos.buy_price) || 0);
    const oldAvg = parseFloat(pos.buy_price || livePrice);
    const targetPrice = parseFloat(fc.targetPrice || livePrice * 1.12);

    const addedShares = livePrice > 0 ? addUsd / livePrice : 0;
    const newTotalShares = oldShares + addedShares;
    const newTotalInvested = oldInvested + addUsd;
    const newAvgPrice = newTotalShares > 0 ? newTotalInvested / newTotalShares : oldAvg;

    const avgDiff = newAvgPrice - oldAvg;
    const breakEvenDistPct = livePrice > 0 ? ((newAvgPrice - livePrice) / livePrice) * 100 : 0;
    const valueAtTarget = newTotalShares * targetPrice;
    const gainAtTarget = valueAtTarget - newTotalInvested;
    const gainAtTargetPct = newTotalInvested > 0 ? (gainAtTarget / newTotalInvested) * 100 : 0;

    const addedShEl = document.getElementById('fc-dca-added-shares');
    const newAvgEl = document.getElementById('fc-dca-new-avg');
    const avgDiffEl = document.getElementById('fc-dca-avg-diff');
    const bePctEl = document.getElementById('fc-dca-breakeven-pct');
    const tGainEl = document.getElementById('fc-dca-target-gain');
    const tPctEl = document.getElementById('fc-dca-target-pct');

    if (addedShEl) addedShEl.innerText = `+${addedShares.toFixed(4)} acc nuevas (Total: ${newTotalShares.toFixed(4)})`;
    if (newAvgEl) newAvgEl.innerText = `$${newAvgPrice.toFixed(2)}`;
    if (avgDiffEl) {
      if (Math.abs(avgDiff) < 0.01) {
        avgDiffEl.innerText = `Sin cambio vs $${oldAvg.toFixed(2)}`;
      } else {
        avgDiffEl.innerText = `${avgDiff < 0 ? 'Baja ' : 'Sube '}${avgDiff >= 0 ? '+' : ''}$${avgDiff.toFixed(2)} (era $${oldAvg.toFixed(2)})`;
      }
    }
    if (bePctEl) {
      if (breakEvenDistPct <= 0) {
        bePctEl.innerText = `En Ganancia (+${Math.abs(breakEvenDistPct).toFixed(1)}%)`;
        bePctEl.style.color = 'var(--primary-hover)';
      } else {
        bePctEl.innerText = `+${breakEvenDistPct.toFixed(1)}% requerido`;
        bePctEl.style.color = 'var(--accent-blue)';
      }
    }
    if (tGainEl) {
      const gSign = gainAtTarget >= 0 ? '+' : '';
      tGainEl.innerText = `${gSign}$${gainAtTarget.toFixed(2)}`;
    }
    if (tPctEl) {
      const pSign = gainAtTargetPct >= 0 ? '+' : '';
      tPctEl.innerText = `${pSign}${gainAtTargetPct.toFixed(1)}% en $${targetPrice.toFixed(2)}`;
    }
  },

  viewCurrentForecastOnChart() {
    const pos = this.currentForecastPos;
    this.closeForecastModal();
    if (!pos) return;
    this.switchTab('dashboard');
    this.showChartLevels = true;
    const selectElem = document.getElementById('chart-stock-select');
    if (selectElem) selectElem.value = pos.symbol;
    this.changeIntradaySymbol(pos.symbol);
    const chartCard = document.getElementById('chart-intraday-line');
    if (chartCard) chartCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  async exportOpenPositionsXls() {
    try {
      if (!this.data || !Array.isArray(this.data.openPositions)) {
        await this.fetchPortfolio();
      }
      const openPositions = (this.data && this.data.openPositions) || [];
      if (openPositions.length === 0) {
        alert('No hay posiciones abiertas en la cartera para exportar.');
        return;
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      const userName = (this.user && this.user.name) ? this.user.name : 'Mauricio Martinez';

      // Calcular totales de todas las posiciones abiertas
      let totalInvested = 0;
      let totalCurrentValue = 0;
      let totalUnrealizedGain = 0;
      let totalDailyChange = 0;

      openPositions.forEach(p => {
        const inv = parseFloat(p.buy_total || (p.quantity * p.buy_price) || 0);
        const cur = parseFloat(p.currentValue || (p.quantity * (p.livePrice || p.buy_price)) || 0);
        const gain = parseFloat(p.unrealizedGain !== undefined ? p.unrealizedGain : (cur - inv));
        const dChg = parseFloat(p.dailyChange || 0);
        totalInvested += inv;
        totalCurrentValue += cur;
        totalUnrealizedGain += gain;
        totalDailyChange += dChg;
      });

      const totalReturnPct = totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0;
      const esc = (val) => String(val === null || val === undefined ? '' : val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      let rowsHtml = '';
      openPositions.forEach((p, idx) => {
        const fc = p.forecast || {};
        const qty = parseFloat(p.quantity || 0);
        const buyPrice = parseFloat(p.buy_price || 0);
        const buyTotal = parseFloat(p.buy_total || (qty * buyPrice) || 0);
        const livePrice = parseFloat(p.livePrice || buyPrice || 0);
        const changePct = parseFloat(p.changePercent || 0);
        const dailyChangeUsd = parseFloat(p.dailyChange || 0);
        const currentValue = parseFloat(p.currentValue || (qty * livePrice) || 0);
        const uGain = parseFloat(p.unrealizedGain !== undefined ? p.unrealizedGain : (currentValue - buyTotal));
        const uPct = parseFloat(p.unrealizedGainPercent !== undefined ? p.unrealizedGainPercent : (buyTotal > 0 ? (uGain / buyTotal) * 100 : 0));
        const stopPrice = parseFloat(fc.suggestedStopLoss || p.stop_loss || (buyPrice * 0.92));
        const targetPrice = parseFloat(fc.targetPrice || (buyPrice * 1.15));
        const kalshiProb = parseInt(fc.kalshiProb || 60, 10);
        const rrRatio = parseFloat(fc.riskRewardRatio || 2.0);
        const rAction = fc.racionalAction || 'MANTENER POSICIÓN';
        const rInstruction = fc.racionalInstruction || fc.reason || '';

        const isGain = uGain >= 0;
        const isDayUp = changePct >= 0;
        const gainColor = isGain ? '#065f46' : '#991b1b';
        const gainBg = isGain ? '#d1fae5' : '#fee2e2';
        const dayColor = isDayUp ? '#065f46' : '#991b1b';

        let actionBg = '#dbeafe';
        let actionColor = '#1e40af';
        if (rAction === 'COMPRAR+') {
          actionBg = '#d1fae5';
          actionColor = '#065f46';
        } else if (rAction === 'VENDER') {
          actionBg = '#fee2e2';
          actionColor = '#991b1b';
        }

        rowsHtml += `
          <tr>
            <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
            <td style="font-weight:bold; color:#1d4ed8;">${esc(p.symbol)}</td>
            <td>${esc(p.original_name || p.symbol)}</td>
            <td style="text-align:center;">${esc(p.buy_date || '-')}</td>
            <td style="text-align:center;" x:num="${p.daysHeld || 0}">${p.daysHeld || 0}</td>
            <td class="num-qty" x:num="${qty}">${qty.toFixed(4)}</td>
            <td class="num-usd" x:num="${buyPrice}">${buyPrice.toFixed(2)}</td>
            <td class="num-usd" style="font-weight:bold;" x:num="${buyTotal}">${buyTotal.toFixed(2)}</td>
            <td class="num-usd" style="font-weight:bold;" x:num="${livePrice}">${livePrice.toFixed(2)}</td>
            <td class="num-pct" style="color:${dayColor}; font-weight:bold;" x:num="${changePct}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</td>
            <td class="num-usd" style="color:${dayColor};" x:num="${dailyChangeUsd}">${dailyChangeUsd.toFixed(2)}</td>
            <td class="num-usd" style="font-weight:bold;" x:num="${currentValue}">${currentValue.toFixed(2)}</td>
            <td class="num-usd" style="font-weight:bold; color:${gainColor}; background:${gainBg};" x:num="${uGain}">${uGain.toFixed(2)}</td>
            <td class="num-pct" style="font-weight:bold; color:${gainColor}; background:${gainBg};" x:num="${uPct}">${uPct >= 0 ? '+' : ''}${uPct.toFixed(2)}%</td>
            <td class="num-usd" style="color:#991b1b;" x:num="${stopPrice}">${stopPrice.toFixed(2)}</td>
            <td class="num-usd" style="color:#065f46;" x:num="${targetPrice}">${targetPrice.toFixed(2)}</td>
            <td style="text-align:center; font-weight:bold;" x:num="${kalshiProb}">${kalshiProb}%</td>
            <td style="text-align:center;">1:${rrRatio.toFixed(1)}</td>
            <td style="text-align:center; font-weight:bold; background:${actionBg}; color:${actionColor};">${esc(rAction)}</td>
            <td>${esc(rInstruction)}</td>
            <td>${esc(p.notes || '')}</td>
          </tr>
        `;
      });

      const totGainColor = totalUnrealizedGain >= 0 ? '#065f46' : '#991b1b';
      const totGainBg = totalUnrealizedGain >= 0 ? '#a7f3d0' : '#fecaca';
      const totDayColor = totalDailyChange >= 0 ? '#065f46' : '#991b1b';

      const excelDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Posiciones Abiertas</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, Calibri, sans-serif; font-size: 11pt; color: #0f172a; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 10px; vertical-align: middle; }
          th { background-color: #0f172a; color: #ffffff; font-weight: bold; text-align: center; }
          .title-row { background-color: #064e3b; color: #ffffff; font-size: 14pt; font-weight: bold; text-align: left; padding: 10px; }
          .sub-row { background-color: #f1f5f9; color: #334155; font-size: 10pt; font-weight: bold; }
          .num-usd { mso-number-format:"\#\,\#\#0\.00"; text-align: right; }
          .num-qty { mso-number-format:"0\.0000"; text-align: right; }
          .num-pct { text-align: right; }
          .total-row td { background-color: #e2e8f0; font-weight: bold; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
        </style>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="21" class="title-row">📈 PORTRACK - INFORME COMPLETO DE POSICIONES ABIERTAS (BOLSA EE.UU.)</td>
          </tr>
          <tr>
            <td colspan="21" class="sub-row">
              Titular: ${esc(userName)} &nbsp;|&nbsp; Fecha de Informe: ${dateStr} (${timeStr}) &nbsp;|&nbsp; Total Posiciones Activas: ${openPositions.length} acciones
            </td>
          </tr>
          <tr>
            <td colspan="4" style="background:#f8fafc; font-weight:bold;">Capital Invertido Abierto (US$):</td>
            <td colspan="2" class="num-usd" style="background:#f8fafc; font-weight:bold;" x:num="${totalInvested}">${totalInvested.toFixed(2)}</td>
            <td colspan="3" style="background:#f8fafc; font-weight:bold;">Valor Actual Portafolio (US$):</td>
            <td colspan="2" class="num-usd" style="background:#f8fafc; font-weight:bold;" x:num="${totalCurrentValue}">${totalCurrentValue.toFixed(2)}</td>
            <td colspan="3" style="background:${totGainBg}; color:${totGainColor}; font-weight:bold;">Ganancia/Pérdida Flotante (US$):</td>
            <td colspan="2" class="num-usd" style="background:${totGainBg}; color:${totGainColor}; font-weight:bold;" x:num="${totalUnrealizedGain}">${totalUnrealizedGain.toFixed(2)} (${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%)</td>
            <td colspan="5" style="background:#f8fafc;"></td>
          </tr>
          <tr><td colspan="21" style="border:none; height:8px;"></td></tr>
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Empresa / Acción</th>
              <th>Fecha Compra</th>
              <th>Días</th>
              <th>Cantidad Acciones</th>
              <th>Precio Compra (US$)</th>
              <th>Capital Invertido (US$)</th>
              <th>Cotización Hoy (US$)</th>
              <th>Variación Hoy (%)</th>
              <th>Variación Hoy (US$)</th>
              <th>Valor Actual Hoy (US$)</th>
              <th>Ganancia Flotante (US$)</th>
              <th>Rentabilidad (%)</th>
              <th>Stop Loss / Trailing (US$)</th>
              <th>Precio Meta / Objetivo (US$)</th>
              <th>Prob. Kalshi (%)</th>
              <th>Riesgo / Beneficio</th>
              <th>Acción en Racional</th>
              <th>Fundamento &amp; Recomendación Técnica</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="7" style="text-align:right;">TOTALES CARTERA ABIERTA (${openPositions.length} POSICIONES):</td>
              <td class="num-usd" x:num="${totalInvested}">${totalInvested.toFixed(2)}</td>
              <td></td>
              <td></td>
              <td class="num-usd" style="color:${totDayColor};" x:num="${totalDailyChange}">${totalDailyChange.toFixed(2)}</td>
              <td class="num-usd" x:num="${totalCurrentValue}">${totalCurrentValue.toFixed(2)}</td>
              <td class="num-usd" style="color:${totGainColor}; background:${totGainBg};" x:num="${totalUnrealizedGain}">${totalUnrealizedGain.toFixed(2)}</td>
              <td class="num-pct" style="color:${totGainColor}; background:${totGainBg};" x:num="${totalReturnPct}">${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%</td>
              <td colspan="7"></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>`;

      const blob = new Blob(['\uFEFF', excelDoc], { type: 'application/vnd.ms-excel;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Portrack_Informe_Posiciones_Abiertas_${dateStr}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      alert('Error generando el archivo Excel (.xls): ' + err.message);
    }
  },


  async fetchWatchlist() {
    try {
      const res = await fetch(`/api/watchlist?_t=${Date.now()}`, {
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
            <div style="font-weight: 700; color: var(--text-main);">$${(w.currentPrice || 0).toFixed(2)}</div>
            <div style="font-size: 11px;" class="${isUp ? 'stat-up' : 'stat-down'}">${isUp ? '+' : ''}${(w.changePercent || 0).toFixed(2)}%</div>
          </td>
          <td>
            <span style="font-weight: 800; color: ${w.rsi < 35 ? 'var(--accent-blue)' : (w.rsi > 68 ? 'var(--danger)' : 'var(--success)')};">
              RSI ${w.rsi || 50}
            </span>
          </td>
          <td>
            <div style="font-size: 11px; color: var(--text-muted);">
              SMA 50: <strong style="color: var(--accent-blue);">$${w.sma50 || '-'}</strong><br>
              SMA 200: <strong style="color: #8b5cf6;">$${w.sma200 || '-'}</strong>
            </div>
          </td>
          <td>
            <div style="font-size: 11px; color: var(--text-muted);">
              Soporte: <strong style="color: var(--success);">$${w.support || '-'}</strong><br>
              Resistencia: <strong style="color: var(--danger);">$${w.resistance || '-'}</strong>
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
  },

  // ============================================================================
  // DICCIONARIO Y SISTEMA INTERACTIVO DE EXPLICACIÓN DE INDICADORES Y FÓRMULAS
  // ============================================================================
  indicatorExplanations: {
    unrealized_gain: {
      title: 'Ganancia / Pérdida Flotante (No Realizada)',
      summary: 'Muestra cuánto dinero vas ganando o perdiendo en tus acciones actualmente abiertas si decidieras venderlas hoy al precio de mercado en EE.UU.',
      formula: 'Ganancia ($) = (Precio Hoy - Precio Compra) × Cantidad de Acciones  |  Retorno (%) = ((Valor Hoy - Capital Invertido) / Capital Invertido) × 100',
      source: '📡 Origen: Cotización en vivo de Yahoo Finance NY vs tu precio de compra registrado en la base de datos.'
    },
    portfolio_value: {
      title: 'Valor Actual del Portafolio',
      summary: 'Es el valor total de mercado en dólares (USD) que suman todas tus posiciones abiertas en este instante.',
      formula: 'Valor Portafolio = Σ (Cantidad de Acciones de cada posición × Precio Actual en Vivo)',
      source: '📡 Origen: Suma en tiempo real (cada 15 seg) de tus acciones multiplicadas por su cotización en Wall Street.'
    },
    open_invested: {
      title: 'Capital Abierto Invertido (Costo Base)',
      summary: 'Es el dinero total que desembolsaste originalmente para comprar las acciones que hoy mantienes abiertas.',
      formula: 'Capital Abierto = Σ (Cantidad Comprada × Precio de Compra Unitario)',
      source: '📡 Origen: Registro exacto de tus compras activas guardadas en tu cartera.'
    },
    daily_change: {
      title: 'Variación del Día (Cambio Intradía)',
      summary: 'Indica cuánto ha subido o bajado tu cartera (o una acción) únicamente durante la sesión bursátil de hoy respecto al cierre de ayer.',
      formula: 'Cambio Hoy ($) = (Precio Actual - Precio Cierre Ayer) × Acciones  |  Cambio Hoy (%) = ((Precio Actual - Cierre Ayer) / Cierre Ayer) × 100',
      source: '📡 Origen: Comparación directa contra el cierre oficial del día hábil anterior en NYSE / NASDAQ.'
    },
    realized_gain: {
      title: 'Ganancias Cerradas (Ventas Ejecutadas)',
      summary: 'Es la utilidad o pérdida real ya asegurada en dólares por todas las ventas históricas que has cerrado.',
      formula: 'Ganancia Realizada = Σ ((Precio de Venta - Precio de Compra) × Acciones Vendidas)',
      source: '📡 Origen: Historial acumulado de tus operaciones cerradas en la pestaña Historial de Ventas.'
    },
    win_rate: {
      title: 'Efectividad Histórica (Win Rate %)',
      summary: 'Porcentaje de tus ventas históricas que terminaron con ganancia positiva (en verde) sobre el total de ventas realizadas.',
      formula: 'Win Rate (%) = (Número de Ventas con Ganancia > $0 / Total de Ventas Cerradas) × 100',
      source: '📡 Origen: Estadística calculada sobre todas tus operaciones cerradas.'
    },
    kalshi_prob: {
      title: 'Probabilidad Alcista Multifactorial (Kalshi Score 5%-95%)',
      summary: 'Inspirado en los mercados predictivos de Kalshi, estima la probabilidad técnica de que la acción suba en el corto/mediano plazo combinando 5 factores cuantitativos.',
      formula: 'Score = Base 50% + Tendencia SMA50/200 (±15%) + Momentum RSI 14d (±12%) + Cruce MACD (±10%) + Flujo Volumen RVOL (±8%) + Posición en Rango (±8%)',
      source: '📡 Origen: Motor cuantitativo propio sobre velas históricas diarias de Yahoo Finance.'
    },
    top_conviction: {
      title: 'Mayor Convicción Técnica de la Cartera',
      summary: 'Identifica automáticamente cuál de tus acciones abiertas tiene hoy el Kalshi Score más alto y la mejor relación Riesgo/Beneficio.',
      formula: 'Máximo (Kalshi Probabilidad % × Factor Tendencia Alcista) entre tus posiciones activas',
      source: '📡 Origen: Ranking automático en tiempo real de tus posiciones abiertas.'
    },
    concentration: {
      title: 'Exposición Máxima / Riesgo de Concentración',
      summary: 'Mide qué porcentaje de todo tu dinero está concentrado en una sola acción. Si supera el 35%-40%, el riesgo específico de esa empresa domina tu cartera.',
      formula: 'Concentración (%) = (Valor Actual de tu Mayor Posición / Valor Total del Portafolio) × 100',
      source: '📡 Origen: Ponderación porcentual del valor de mercado actual de cada posición.'
    },
    portfolio_health: {
      title: 'Semáforo de Salud Cuantitativa',
      summary: 'Evalúa el equilibrio general de tu cartera combinando la probabilidad media alcista, la diversificación y cuántas posiciones están sobre su media móvil.',
      formula: 'Salud = Promedio Ponderado(Kalshi Score Cartera) - Penalización si Concentración > 40% o si >50% de acciones están bajo Stop',
      source: '📡 Origen: Diagnóstico integral de riesgo de tu portafolio.'
    },
    racional_signals: {
      title: 'Señal de Ejecución para Racional (Comprar+, Vender o Mantener)',
      summary: 'Traduce todos los indicadores técnicos a una instrucción clara para ejecutar en tu cuenta de Racional: COMPRAR+ (acumular), VENDER (tomar ganancia o proteger stop) o MANTENER.',
      formula: '🟢 COMPRAR+: Kalshi ≥ 62% y R/R ≥ 1.6  |  🔴 VENDER: Precio ≤ Stop Loss o RSI > 76 con agotamiento  |  🔵 MANTENER: En zona neutral o rumbo a la meta',
      source: '📡 Origen: Reglas de decisión del motor de pronósticos cruzadas con tu precio promedio de compra.'
    },
    alpha_sp500: {
      title: 'Comparativa vs Benchmark S&P 500 (Alpha)',
      summary: 'Compara el rendimiento porcentual de tu cartera contra el índice S&P 500 (ETF SPY) en el mismo período. Si tu línea verde supera a la azul, estás batiendo al mercado.',
      formula: 'Alpha (%) = Retorno Cartera (%) - Retorno S&P 500 (SPY) (%) en el período seleccionado',
      source: '📡 Origen: Serie histórica normalizada Base 100 de tus posiciones vs cotización oficial de SPY.'
    },
    rsi: {
      title: 'RSI de 14 Días (Índice de Fuerza Relativa)',
      summary: 'Mide la velocidad de las subidas y caídas en una escala de 0 a 100. Detecta si una acción está "barata/sobrevendida" (≤32, posible rebote) o "cara/sobrecomprada" (≥70, riesgo de toma de ganancias).',
      formula: 'RSI = 100 - [100 / (1 + (Promedio Ganancias 14d / Promedio Pérdidas 14d))]',
      source: '📡 Origen: Calculado sobre los últimos 14 cierres diarios de la acción en EE.UU.'
    },
    macd: {
      title: 'MACD (12, 26, 9) - Convergencia/Divergencia de Medias',
      summary: 'Detecta cambios en el impulso (momentum) de la tendencia. Cuando la línea rápida cruza por encima de la línea de señal, genera un impulso ALCISTA.',
      formula: 'Línea MACD = EMA(12 días) - EMA(26 días)  |  Señal = EMA(9 días del MACD)  |  Histograma = MACD - Señal',
      source: '📡 Origen: Medias móviles exponenciales de los cierres históricos.'
    },
    atr: {
      title: 'ATR de 14 Días (Average True Range / Volatilidad)',
      summary: 'Mide cuántos dólares se mueve en promedio la acción cada día. Sirve para proyectar el rango de los próximos 5 días y colocar un Stop Loss que no te saque por ruido normal.',
      formula: 'TR = Máx[(Alto - Bajo), |Alto - Cierre Ayer|, |Bajo - Cierre Ayer|]  |  ATR = Promedio de 14 días del TR',
      source: '📡 Origen: Rango diario de precios máximos, mínimos y cierres de las últimas 3 semanas.'
    },
    sma: {
      title: 'Medias Móviles Simples (SMA 50d y SMA 200d)',
      summary: 'Representan el precio promedio de los últimos 50 días (tendencia intermedia) y 200 días (tendencia de largo plazo). Si el precio actual está por encima, la estructura es alcista.',
      formula: 'SMA(N) = (Suma de los Precios de Cierre de los últimos N días) / N',
      source: '📡 Origen: Historial de cierres diarios del último año bursátil.'
    },
    support_resistance: {
      title: 'Soporte (Piso) y Resistencia (Techo)',
      summary: 'El Soporte es la zona de precio inferior donde históricamente entran compradores a frenar caídas. La Resistencia es el techo reciente donde suelen aparecer vendedores.',
      formula: 'Soporte = Mínimo relevante de las últimas 20 sesiones / Banda ATR inferior  |  Resistencia = Máximo de 20 sesiones / Proyección ATR superior',
      source: '📡 Origen: Acción del precio y bandas de volatilidad de los últimos 20-50 días.'
    },
    stop_loss: {
      title: 'Stop Loss Dinámico / Trailing Stop (Protección)',
      summary: 'Es el precio límite sugerido para vender y proteger tu capital si el mercado se da vuelta. Si ya llevas buena ganancia, se convierte en Trailing Stop para asegurar utilidades.',
      formula: 'Stop Dinámico = Precio Actual - (2.0 × ATR 14d)  (ajustado sobre soporte técnico o protección de ganancia)',
      source: '📡 Origen: Calculado dinámicamente según la volatilidad ATR de cada acción.'
    },
    target_price: {
      title: 'Precio Objetivo (Meta / Take Profit)',
      summary: 'Es la meta de precio proyectada donde la acción alcanzaría su techo técnico o completaría su movimiento alcista esperado.',
      formula: 'Precio Meta = Máximo entre (Resistencia de 20d) y (Precio Actual + 3.2 × ATR 14d)',
      source: '📡 Origen: Proyección cuantitativa de volatilidad y techos históricos.'
    },
    stop_target: {
      title: 'Termómetro Visual de Rango (Stop ── Compra ── Hoy ── Meta)',
      summary: 'Te permite ver de un solo vistazo dónde está parado el precio de hoy respecto a tu precio de compra, tu piso de protección (Stop) y tu meta de ganancia.',
      formula: 'Posición (%) = ((Precio Hoy - Precio Stop) / (Precio Meta - Precio Stop)) × 100',
      source: '📡 Origen: Comparativa visual en vivo entre tu Stop Loss, tu Compra, el Precio Actual y la Meta.'
    },
    risk_reward: {
      title: 'Relación Riesgo / Beneficio (Ratio R/R)',
      summary: 'Compara cuántos dólares puedes ganar hasta la Meta por cada $1 dólar que arriesgas hasta el Stop Loss. Un ratio de 1:2.0 o superior significa que el potencial duplica al riesgo.',
      formula: 'Ratio R/R = (Precio Meta - Precio Actual) / (Precio Actual - Precio Stop Loss)',
      source: '📡 Origen: División entre el potencial alcista (Upside) y el riesgo hasta el Stop (Downside).'
    },
    dca_simulator: {
      title: 'Simulador de Promediar / Acumular (DCA - Dollar Cost Averaging)',
      summary: 'Calcula cómo cambiaría tu precio promedio por acción si decides invertir dólares adicionales hoy en Racional, y cuánto ganarías cuando la acción llegue a su Precio Meta.',
      formula: 'Nuevo Precio Promedio = (Capital Invertido Actual + Nuevos USD) / (Acciones Actuales + (Nuevos USD / Precio Hoy))',
      source: '📡 Origen: Simulación matemática instantánea con el precio en vivo de la acción.'
    }
  },

  showIndicatorTooltip(evt, key) {
    const info = this.indicatorExplanations[key];
    const tooltip = document.getElementById('indicator-floating-tooltip');
    if (!info || !tooltip) return;

    document.getElementById('ift-title').innerText = info.title;
    document.getElementById('ift-summary').innerText = info.summary;
    document.getElementById('ift-formula').innerText = info.formula;
    document.getElementById('ift-source').innerText = info.source;

    tooltip.style.display = 'block';

    const rect = evt.currentTarget.getBoundingClientRect();
    const ttWidth = 350;
    let left = rect.left + (rect.width / 2) - (ttWidth / 2);
    if (left < 12) left = 12;
    if (left + ttWidth > window.innerWidth - 12) {
      left = window.innerWidth - ttWidth - 12;
    }

    let top = rect.bottom + 10;
    if (top + 230 > window.innerHeight) {
      top = Math.max(12, rect.top - 225);
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  },

  hideIndicatorTooltip() {
    const tooltip = document.getElementById('indicator-floating-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  showIndicatorHelp(key) {
    this.hideIndicatorTooltip();
    this.openIndicatorGuideModal(key);
  },

  openIndicatorGuideModal(selectedKey = null) {
    const modal = document.getElementById('modal-indicator-guide');
    const spotBox = document.getElementById('ig-selected-spotlight');
    const grid = document.getElementById('ig-all-cards-grid');
    if (!modal || !grid) return;

    if (selectedKey && this.indicatorExplanations[selectedKey]) {
      const sel = this.indicatorExplanations[selectedKey];
      spotBox.style.display = 'block';
      document.getElementById('ig-spot-title').innerText = sel.title;
      document.getElementById('ig-spot-desc').innerText = sel.summary;
      document.getElementById('ig-spot-formula').innerText = '📐 Fórmula: ' + sel.formula;
      document.getElementById('ig-spot-decision').innerText = sel.source;
    } else {
      spotBox.style.display = 'none';
    }

    let cardsHtml = '';
    Object.entries(this.indicatorExplanations).forEach(([k, item]) => {
      const isSelected = k === selectedKey;
      cardsHtml += `
        <div class="indicator-guide-card ${isSelected ? 'active-guide-card' : ''}">
          <div style="font-size: 14px; font-weight: 800; color: var(--text-main);">${item.title}</div>
          <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.45;">${item.summary}</div>
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-left: 3px solid var(--accent-blue); border-radius: 6px; padding: 7px 10px; font-family: var(--font-mono); font-size: 11px; color: var(--accent-blue); font-weight: 700;">
            ${item.formula}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">${item.source}</div>
        </div>
      `;
    });

    grid.innerHTML = cardsHtml;
    modal.classList.add('active');
  },

  closeIndicatorGuideModal() {
    const modal = document.getElementById('modal-indicator-guide');
    if (modal) modal.classList.remove('active');
  },

};

document.addEventListener('DOMContentLoaded', () => app.init());
