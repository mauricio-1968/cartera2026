-- ==============================================================================
-- PORTRACK / CARTERA 2026 - ESQUEMA Y MIGRACIÓN COMPLETA A SUPABASE POSTGRESQL
-- ==============================================================================

-- 1. TABLA DE USUARIOS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA DE TRANSACCIONES (POSICIONES ABIERTAS Y CERRADAS)
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER DEFAULT 1,
  symbol VARCHAR(50) NOT NULL,
  original_name VARCHAR(255),
  type VARCHAR(20) DEFAULT 'BUY',
  buy_date VARCHAR(50),
  quantity NUMERIC NOT NULL,
  buy_price NUMERIC NOT NULL,
  buy_total NUMERIC NOT NULL,
  stop_loss NUMERIC,
  status VARCHAR(20) DEFAULT 'open',
  sell_date VARCHAR(50),
  sell_quantity NUMERIC,
  sell_price NUMERIC,
  sell_total NUMERIC,
  realized_gain NUMERIC,
  days_held INTEGER,
  return_percent NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA DE HISTORIAL DE SNAPSHOTS
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER DEFAULT 1,
  snapshot_date VARCHAR(50),
  total_value NUMERIC,
  invested_value NUMERIC,
  unrealized_gain NUMERIC,
  realized_gain NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABLA DE RADAR DE OPORTUNIDADES (WATCHLIST)
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER DEFAULT 1,
  symbol VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- INSERCIÓN DE USUARIO PRINCIPAL
-- ==============================================================================
INSERT INTO users (id, name, email, password_hash)
VALUES (1, 'Mauricio Martinez', 'mauricio@cartera.com', '$2b$10$.SIRSNi1dngb1A1w4o0cYergu.2bawt2pHMurt0KOk2E.usvCOZyy')
ON CONFLICT (email) DO NOTHING;

-- ==============================================================================
-- INSERCIÓN DE LAS 9 POSICIONES ABIERTAS Y LAS 24 CERRADAS
-- ==============================================================================
INSERT INTO transactions (id, user_id, symbol, original_name, type, buy_date, quantity, buy_price, buy_total, stop_loss, status, sell_date, sell_quantity, sell_price, sell_total, realized_gain, days_held, return_percent, notes)
VALUES
(1, 1, 'CSCO', 'CSCO', 'BUY', '2026-07-15', 1.52039444, 111.55, 169.60, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(2, 1, 'IREN', 'IREN', 'BUY', '2026-06-03', 0.65782264, 69.35, 45.62, 70, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Automatica venta a los US70'),
(3, 1, 'LEU', 'LEU', 'BUY', '2026-07-08', 0.31778826, 167.47, 53.22, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(4, 1, 'LNAI', 'LNAI', 'BUY', '2026-06-17', 9.92964824, 3.98, 39.52, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(5, 1, 'NVDA', 'NVDA', 'BUY', '2026-05-11', 0.46718056, 214.05, 100.00, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(6, 1, 'SPCX', 'SPCX', 'BUY', '2026-06-15', 0.59615385, 185.12, 110.36, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(7, 1, 'TSLA', 'TSLA', 'BUY', '2026-07-01', 0.19851855, 426.61, 84.69, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(8, 1, 'XOM', 'XOM', 'BUY', '2026-07-21', 0.4077273, 151.67, 61.84, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ''),
(34, 1, 'DVN', 'Devon Energy Corp (DVN)', 'BUY', '2026-08-05', 1.48981953, 43.22, 64.39, NULL, 'open', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Compra de DVN registrada el 05-08-2026'),
(10, 1, 'AMD', 'AMD', 'BUY', '2026-05-11', 0.35410695, 141.20, 50.00, NULL, 'closed', '2026-05-13', 0.35410695, 160.03, 56.67, 6.67, 2, 13.3, ''),
(11, 1, 'AMZN', 'AMZN', 'BUY', '2026-05-11', 0.2647743, 188.84, 50.00, NULL, 'closed', '2026-05-20', 0.2647743, 183.18, 48.50, -1.50, 9, -3.0, ''),
(12, 1, 'AOCL', 'AOCL', 'BUY', '2026-07-28', 10.36647963, 4.81, 49.86, NULL, 'closed', '2026-07-29', 10.36647963, 5.48, 56.81, 6.95, 1, 13.9, ''),
(13, 1, 'APLD', 'APLD', 'BUY', '2026-06-18', 4.14811568, 14.16, 58.74, NULL, 'closed', '2026-07-29', 4.14811568, 10.74, 44.55, -14.19, 41, -24.2, ''),
(14, 1, 'APP', 'APP', 'BUY', '2026-05-18', 0.53723004, 84.06, 45.16, NULL, 'closed', '2026-05-20', 0.53723004, 83.99, 45.12, -0.04, 2, -0.1, ''),
(32, 1, 'APPS', 'Digital Turbine, Inc. (APPS)', 'BUY', '2026-08-03', 5.72246696, 9.08, 51.96, NULL, 'closed', '2026-08-05', 5.72246696, 13.51, 77.31, 25.35, 2, 48.79, 'Venta efectuada el 05-08-2026 a US$ 13.51'),
(15, 1, 'BLZE', 'BLZE', 'BUY', '2026-05-08', 11.23848056, 4.04, 45.40, NULL, 'closed', '2026-05-13', 11.23848056, 4.48, 50.35, 4.95, 5, 10.9, ''),
(16, 1, 'CUE', 'CUE BIO', 'BUY', '2026-06-18', 38.38461538, 1.30, 49.90, NULL, 'closed', '2026-06-25', 38.38461538, 1.63, 62.57, 12.67, 7, 25.4, ''),
(17, 1, 'FCEL', 'FCEL', 'BUY', '2026-07-17', 2.82950757, 18.84, 53.31, NULL, 'closed', '2026-07-21', 2.82950757, 21.83, 61.77, 8.46, 4, 15.9, ''),
(18, 1, 'GOOGL', 'GOOGLE CA', 'BUY', '2026-05-13', 0.31687676, 170.73, 54.10, NULL, 'closed', '2026-05-20', 0.31687676, 178.69, 56.62, 2.52, 7, 4.7, ''),
(9, 1, 'KOLD', 'KOLD', 'BUY', '2026-07-28', 1.78441558, 30.80, 54.96, NULL, 'closed', '2026-07-30', 1.78441558, 30.80, 54.96, 0.00, 1, 0.0, ''),
(33, 1, 'KVYO', 'Klaviyo, Inc. (KVYO)', 'BUY', '2026-08-05', 5.18134715, 19.30, 100.00, NULL, 'closed', '2026-08-05', 5.18134715, 18.90, 97.93, -2.07, 2, -2.07, 'Compra de KVYO registrada el 05-08-2026'),
(19, 1, 'META', 'META', 'BUY', '2026-06-24', 0.09653026, 560.24, 54.08, NULL, 'closed', '2026-07-01', 0.09653026, 622.40, 60.08, 6.00, 7, 11.1, ''),
(20, 1, 'MSFT', 'MSFT', 'BUY', '2026-05-13', 0.13751524, 404.32, 55.60, NULL, 'closed', '2026-05-29', 0.13751524, 464.97, 63.94, 8.34, 16, 15.0, ''),
(21, 1, 'MU', 'MU', 'BUY', '2026-05-11', 0.08832821, 792.50, 70.00, NULL, 'closed', '2026-07-29', 0.08832821, 877.76, 77.53, 7.53, 79, 10.8, ''),
(22, 1, 'MU', 'MU', 'BUY', '2026-05-06', 0.07568647, 660.62, 50.00, NULL, 'closed', '2026-05-08', 0.07568647, 739.10, 55.94, 5.94, 2, 11.9, ''),
(23, 1, 'NVCR', 'NVCR', 'BUY', '2026-04-30', 2.63137208, 15.27, 40.18, NULL, 'closed', '2026-05-08', 2.63137208, 17.41, 45.81, 5.63, 8, 14.0, ''),
(24, 1, 'OUST', 'OUST', 'BUY', '2026-05-27', 0.86697094, 44.92, 38.94, NULL, 'closed', '2026-06-17', 0.86697094, 43.39, 37.62, -1.33, 21, -3.4, ''),
(25, 1, 'QQQ', 'QQQ', 'BUY', '2026-05-23', 0.06909011, 722.97, 49.95, NULL, 'closed', '2026-06-14', 0.06909011, 735.85, 50.84, 0.89, 22, 1.8, ''),
(26, 1, 'RKLB', 'ROCKET LAB', 'BUY', '2026-05-11', 0.42607693, 117.35, 50.00, NULL, 'closed', '2026-05-13', 0.42607693, 125.34, 53.40, 3.40, 2, 6.8, ''),
(27, 1, 'SOFI', 'SOFI', 'BUY', '2026-06-23', 6.74051756, 17.46, 117.69, NULL, 'closed', '2026-07-01', 6.74051756, 18.45, 124.36, 6.67, 8, 5.7, ''),
(28, 1, 'UEC', 'UEC', 'BUY', '2026-05-26', 5.68116876, 13.65, 77.55, NULL, 'closed', '2026-07-29', 5.68116876, 15.02, 85.33, 7.78, 64, 10.0, ''),
(29, 1, 'VGT', 'VGT', 'BUY', '2026-05-11', 0.68843019, 112.88, 77.71, NULL, 'closed', '2026-07-29', 0.68843019, 116.29, 80.06, 2.35, 79, 3.0, ''),
(30, 1, 'VOO', 'VOO SP&500 ETF', 'BUY', '2026-05-15', 0.08069613, 680.33, 54.90, NULL, 'closed', '2026-07-28', 0.08069613, 680.75, 54.93, 0.03, 74, 0.1, '')
ON CONFLICT (id) DO NOTHING;

-- Sincronizar secuencia de ID para nuevos registros
SELECT setval('transactions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM transactions));

-- ==============================================================================
-- INSERCIÓN DE RADAR DE OPORTUNIDADES
-- ==============================================================================
INSERT INTO watchlist (user_id, symbol)
VALUES (1, 'PLTR'), (1, 'AMD'), (1, 'MARA'), (1, 'SMCI')
ON CONFLICT DO NOTHING;
