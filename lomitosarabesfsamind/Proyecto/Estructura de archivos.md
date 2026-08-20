# Estructura de Archivos

```
lomitosarabesfsa/
│
├── index.html                    # Landing page pública (HTML/CSS/JS vanilla)
├── sw.js                         # Service Worker (PWA + cache offline)
├── manifest.json                 # PWA manifest
├── robots.txt                    # SEO: instrucciones para crawlers
├── sitemap.xml                   # SEO: mapa del sitio
├── .env                          # ⚠️ Variables de entorno (NO subir a git)
├── .gitignore                    # Archivos ignorados por Git
│
├── assets/                       # Imágenes estáticas
│   ├── background.jpeg           # Imagen de fondo
│   ├── icon.svg                  # Icono SVG
│   ├── ilustrativo.jpeg          # Imagen ilustrativa
│   └── logoheader.jpeg           # Logo para el header
│
├── admin/                        # Backend Cloudflare Workers
│   ├── package.json              # Dependencias (solo wrangler)
│   ├── wrangler.toml             # Configuración del Worker
│   ├── schema.sql                # Schema de D1 (tablas)
│   ├── seed.sql                  # Datos iniciales (productos)
│   ├── README.md                 # Documentación del deploy
│   │
│   ├── worker/
│   │   └── src/
│   │       └── index.js          # ← API principal (router + handlers)
│   │
│   └── panel/
│       └── index.html            # Panel de administración (CRUD)
│
└── lomitosarabesfsamind/         # Este vault de Obsidian
    ├── Inicio.md                 # Hub principal
    ├── Proyecto/                 # Documentación del proyecto
    ├── Infraestructura/          # Configuración de Cloudflare
    ├── API/                      # Referencia de la API
    ├── Base de datos/            # Schema y seed
    └── Guías/                    # Guías paso a paso
```

## Archivos clave

### `index.html`
La landing page completa. Incluye:
- HTML semántico con SEO optimizado
- CSS inline con variables de colores (dark/light mode)
- JavaScript vanilla para:
  - Consumo de API (`/api/menu`)
  - Renderizado dinámico del menú con chips de categorías sticky
  - Carrito de compras (localStorage)
  - Pedidos por WhatsApp
  - Filtros de categoría (scroll-spy)
  - Búsqueda de productos
  - Horarios dinámicos (abierto/cerrado)
  - Galería horizontal
  - Modales de producto

### `admin/worker/src/index.js`
El Worker de Cloudflare. Maneja:
- Routing de rutas (`/api/menu`, `/api/login`, `/api/admin/*`)
- Autenticación con HMAC-SHA256
- CRUD de productos, categorías, promos, config
- Subida de imágenes a R2
- CORS restrictivo (solo dominios permitidos)

### `admin/panel/index.html`
Panel de administración. Funcionalidades:
- Login con token
- ABM de productos (crear, editar, eliminar)
- Gestión de categorías
- Promociones
- Configuración de horarios y WhatsApp
- Subida de fotos de productos

## Archivos excluidos del repo

| Archivo | Razón |
|---------|-------|
| `.env` | Credenciales sensibles (R2 keys) |
| `node_modules/` | Dependencias npm |
| `.wrangler/` | Cache local de Wrangler |
