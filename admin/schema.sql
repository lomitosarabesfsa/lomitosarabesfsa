-- Schema D1 para Lomitos Árabes FSA
-- Ejecutar con: wrangler d1 execute lomitos-db --local --file=schema.sql

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

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL
);

-- Adicionales: extras que el comensal puede agregar al producto
-- producto_id  → aplica solo a ese producto (adicional individual)
-- categoria_id → aplica a TODOS los productos de la categoría
-- Nunca ambos a la vez (CHECK constraint)
CREATE TABLE IF NOT EXISTS adicionales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  precio REAL NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  CHECK (producto_id IS NOT NULL OR categoria_id IS NOT NULL),
  CHECK (NOT (producto_id IS NOT NULL AND categoria_id IS NOT NULL))
);

-- Datos de configuración inicial (se ajustan luego desde el panel)
INSERT OR IGNORE INTO config (clave, valor) VALUES
  ('horarios', '{"0":{"abre":"20:00","cierra":"00:00"},"1":{"abre":"20:00","cierra":"00:00"},"2":{"abre":"20:00","cierra":"00:00"},"3":{"abre":"20:00","cierra":"00:00"},"4":{"abre":"20:00","cierra":"00:00"},"5":{"abre":"20:00","cierra":"01:00"},"6":{"abre":"20:00","cierra":"01:00"}}'),
  ('galeria', '[]'),
  ('whatsapp', '5493704218188');

-- Índices para adicionales (JOIN por producto o categoría)
CREATE INDEX IF NOT EXISTS idx_adicionales_producto ON adicionales(producto_id) WHERE activo = 1;
CREATE INDEX IF NOT EXISTS idx_adicionales_categoria ON adicionales(categoria_id) WHERE activo = 1;

-- Índices para queries frecuentes
-- getMenu(): SELECT WHERE activo=1 ORDER BY orden (la query más visitada)
CREATE INDEX IF NOT EXISTS idx_productos_activo_orden ON productos(activo, orden);
-- listarProductos(): JOIN productos ON categoria_id + ORDER BY orden
CREATE INDEX IF NOT EXISTS idx_productos_categoria_orden ON productos(categoria_id, orden);
-- getMenu(): SELECT WHERE activa=1 (promos visibles)
CREATE INDEX IF NOT EXISTS idx_promos_activa ON promos(activa);

-- Usuario admin por defecto: admin / admin123 (¡CAMBIAR CLAVE en el primer ingreso!)
INSERT OR IGNORE INTO usuarios (usuario, clave_hash) VALUES
  ('admin', 'admin123');
