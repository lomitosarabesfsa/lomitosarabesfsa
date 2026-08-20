# Arquitectura

## Visión general

Lomitos Árabes FSA es una aplicación web serverless compuesta por tres capas:

```
┌─────────────────────────────────────────────────────┐
│                  CLIENTE (navegador)                 │
│                                                     │
│  ┌─────────────────┐    ┌────────────────────────┐  │
│  │  Landing Page    │    │  Panel Admin           │  │
│  │  (Cloudflare     │    │  (HTML estático)       │  │
│  │   Pages)         │    │                        │  │
│  └────────┬─────────┘    └───────────┬────────────┘  │
│           │ GET /api/menu            │ /api/admin/*  │
└───────────┼──────────────────────────┼───────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────┐
│           CLOUDFLARE WORKER (API)                    │
│           lomitos-api                               │
│                                                     │
│  Rutas:                                             │
│  · GET  /api/menu      → menú público               │
│  · POST /api/login     → autenticación               │
│  · CRUD /api/admin/*   → productos, categorías,      │
│                           promos, config, imágenes   │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│   D1 (SQLite)    │  │   R2 (storage)   │
│                  │  │                  │
│  · categorias    │  │  · fotos de      │
│  · productos     │  │    productos     │
│  · promos        │  │                  │
│  · config        │  │  URL pública:    │
│  · usuarios      │  │  pub-*.r2.dev    │
└──────────────────┘  └──────────────────┘
```

## Datos de flujo

1. **Público**: El cliente abre la landing → `index.html` se carga desde Pages → fetch a `/api/menu` → Worker consulta D1 → devuelve JSON → se renderiza el menú.

2. **Admin**: El dueño abre `panel/index.html` → login con credenciales → obtiene token HMAC → CRUD sobre `/api/admin/*` → Worker protege con token → consulta D1 y R2.

3. **Imágenes**: El admin sube una foto → base64 se envía al Worker → Worker guarda en R2 → devuelve URL pública → se guarda en D1.

## Decisiones de arquitectura

| Decisión | Razón |
|----------|-------|
| Cloudflare Workers (no Node.js) | Costo $0, sin servidor, escalado automático |
| D1 (SQLite) | Integrado con Workers, sin configuración extra |
| R2 (storage) | Almacenamiento de imágenes con acceso público |
| Pages (hosting estático) | CDN global, deploy instantáneo, SSL incluido |
| Panel admin como HTML estático | Sin dependencias, funciona desde cualquier hosting |
| Auth con HMAC (no JWT lib) | Sin dependencias externas, usa WebCrypto nativo |
| CORS restrictivo | Solo acepta `lomitosarabesfsa.pages.dev` y `localhost:8787` |

## Costo estimado

**$0/mes** con los planes gratuitos de Cloudflare:
- Workers: 100,000 requests/día gratis
- D1: 5 GB storage, 5M lecturas/día gratis
- R2: 10 GB storage, 1M Class A/B operaciones/mes gratis
- Pages: 500 builds/mes, bandwidth ilimitado gratis
