-- Schema D1 para Lomitos Árabes FSA
-- Ejecutar con: wrangler d1 execute lomitos-db --local --file=schema.sql

-- ============================================================
-- TABLAS BASE
-- ============================================================

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  icono TEXT NOT NULL DEFAULT '🍽️',
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT -1,          -- -1 = sin control de stock
  imagen TEXT NOT NULL DEFAULT '',            -- URL pública (R2 o externa)
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activa INTEGER NOT NULL DEFAULT 0,
  icono TEXT NOT NULL DEFAULT '🔥',
  texto TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);


-- ============================================================
-- MODIFIER GROUPS + OPTIONS (nuevo modelo profesional)
-- ============================================================
--
-- modifier_groups: contenedor de opciones (ej: "Extras", "Salsas", "Proteína")
--   · producto_id  → grupo específico de ese producto
--   · categoria_id → grupo compartido por toda la categoría
--   · selection_type: 'single' = radio, 'multiple' = checkbox
--   · required: si es obligatorio elegir (single siempre es required)
--   · min/max: límites de selección (para multiple)
--
-- modifier_options: cada opción dentro de un grupo (ej: "Bacon + Cheddar", "$5000")
--   · price_delta: precio extra (sumado al base del producto)

CREATE TABLE IF NOT EXISTS modifier_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'multiple' CHECK (selection_type IN ('single', 'multiple')),
  required INTEGER NOT NULL DEFAULT 0,
  min_seleccion INTEGER NOT NULL DEFAULT 0,
  max_seleccion INTEGER NOT NULL DEFAULT 99,
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  CHECK (producto_id IS NOT NULL OR categoria_id IS NOT NULL),
  CHECK (NOT (producto_id IS NOT NULL AND categoria_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS modifier_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  price_delta REAL NOT NULL DEFAULT 0,
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- RATE LIMITING (IMP-7)
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_ts ON rate_limits(key, timestamp);

-- ============================================================
-- TOKENS REVOCADOS (logout server-side)
-- ============================================================

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at INTEGER NOT NULL
);

-- ============================================================
-- ÍNDICES
-- ============================================================

-- Modifier groups por producto o categoría
CREATE INDEX IF NOT EXISTS idx_mg_producto ON modifier_groups(producto_id) WHERE activo = 1;
CREATE INDEX IF NOT EXISTS idx_mg_categoria ON modifier_groups(categoria_id) WHERE activo = 1;
-- Options por grupo
CREATE INDEX IF NOT EXISTS idx_mo_group ON modifier_options(group_id) WHERE activo = 1;

-- Queries frecuentes del menú público
CREATE INDEX IF NOT EXISTS idx_productos_activo_orden ON productos(activo, orden);
CREATE INDEX IF NOT EXISTS idx_productos_categoria_orden ON productos(categoria_id, orden);
CREATE INDEX IF NOT EXISTS idx_promos_activa ON promos(activa);

-- ============================================================
-- DATOS INICIALES
-- ============================================================

INSERT OR IGNORE INTO config (clave, valor) VALUES
  ('horarios', '{"0":{"abre":"20:00","cierra":"00:00"},"1":{"abre":"20:00","cierra":"00:00"},"2":{"abre":"20:00","cierra":"00:00"},"3":{"abre":"20:00","cierra":"00:00"},"4":{"abre":"20:00","cierra":"00:00"},"5":{"abre":"20:00","cierra":"01:00"},"6":{"abre":"20:00","cierra":"01:00"}}'),
  ('galeria', '[]'),
  ('whatsapp', '5493704218188');

-- La autenticación se gestiona con secrets de Cloudflare (ADMIN_USER, ADMIN_PASS, AUTH_SECRET).
