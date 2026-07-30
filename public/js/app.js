const app = {
  data: null,
  currentUser: null,
  charts: {},
  refreshInterval: null,
  selectedIntradaySymbol: 'TSLA',

  async init() {
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

    this.fetchAndRenderIntradayChart(this.selectedIntradaySymbol);
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

      const labels = data.points.map(p => p.time);
      const prices = data.points.map(p => p.price);

      const firstPrice = data.prevClose || (prices[0] || 100);
      const lastPrice = data.currentPrice || (prices[prices.length - 1] || firstPrice);
      const isPositive = lastPrice >= firstPrice;

      const strokeColor = isPositive ? '#10b981' : '#ef4444';
      const bgGradient = ctx.createLinearGradient(0, 0, 0, 260);
      if (isPositive) {
        bgGradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
        bgGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
      } else {
        bgGradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        bgGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
      }

      if (this.charts.intraday) this.charts.intraday.destroy();

      this.charts.intraday = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
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
            pointHoverRadius: 7
          }]
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
                callback: function(value) { return '$' + value.toFixed(2); }
              },
              grid: { color: 'rgba(255,255,255,0.04)' }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `Precio: $${context.raw.toFixed(2)}`;
                }
              }
            }
          }
        }
      });
    } catch (err) {
      console.error('Error renderizando gráfico intradiario:', err);
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
