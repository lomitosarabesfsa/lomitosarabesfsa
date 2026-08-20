# Schema D1

**Base de datos**: `lomitos-db`
**ID**: `f03410c3-0771-472b-bcc5-c0188468153c`
**Motor**: Cloudflare D1 (SQLite serverless)

---

## Tablas

### `categorias`
```sql
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  icono TEXT NOT NULL DEFAULT '🍽️',
  orden INTEGER NOT NULL DEFAULT 0
);
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK autoincremental |
| `nombre` | TEXT | Nombre único (ej: "Lomitos") |
| `icono` | TEXT | Emoji del icono |
| `orden` | INTEGER | Posición en el menú |

---

### `productos`
```sql
CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT -1,
  imagen TEXT NOT NULL DEFAULT '',
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0
);
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK autoincremental |
| `categoria_id` | INTEGER | FK → categorias.id |
| `nombre` | TEXT | Nombre del producto |
| `descripcion` | TEXT | Descripción (puede estar vacía) |
| `precio` | REAL | Precio en pesos argentinos |
| `stock` | INTEGER | `-1` = sin control, `0` = agotado, `>0` = disponible |
| `imagen` | TEXT | URL pública (R2 o externa) |
| `activo` | INTEGER | `1` = visible, `0` = oculto |
| `orden` | INTEGER | Posición dentro de la categoría |

---

### `promos`
```sql
CREATE TABLE IF NOT EXISTS promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activa INTEGER NOT NULL DEFAULT 0,
  icono TEXT NOT NULL DEFAULT '🔥',
  texto TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT ''
);
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | INTEGER | PK autoincremental |
| `activa` | INTEGER | `1` = se muestra, `0` = oculta |
| `icono` | TEXT | Emoji |
| `texto` | TEXT | Texto principal (ej: "3 Lomitos por $40.000") |
| `descripcion` | TEXT | Detalle (ej: "Lunes, Martes y Miércoles") |

---

### `config`
```sql
CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
```

Almacena configuración clave-valor:

| Clave | Tipo del valor | Ejemplo |
|-------|---------------|---------|
| `horarios` | JSON | `{"0":{"abre":"20:00","cierra":"00:00"},...}` |
| `whatsapp` | String | `"5493704218188"` |
| `galeria` | JSON array | `["url1","url2"]` |

---

### `usuarios`
```sql
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  clave_hash TEXT NOT NULL
);
```

> **Nota**: Actualmente el auth usa secrets de Cloudflare (`ADMIN_USER`/`ADMIN_PASS`), no esta tabla. Se mantiene por si se migra a auth en la DB.

---

## Relaciones

```
categorias (1) ──→ (N) productos
    │                     │
    │ ON DELETE CASCADE   │
    │                     │
    └─────────────────────┘
```

Si se elimina una categoría, todos sus productos se eliminan automáticamente.

## Índices recomendados (futuro)

```sql
-- Para búsquedas frecuentes
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);
CREATE INDEX idx_productos_orden ON productos(categoria_id, orden);
```
