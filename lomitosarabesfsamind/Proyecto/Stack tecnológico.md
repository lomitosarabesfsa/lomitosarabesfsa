# Stack Tecnológico

## Frontend

| Tecnología | Uso |
|-----------|-----|
| **HTML/CSS/JS vanilla** | Landing page sin framework, máxima performance |
| **CSS custom properties** | Variables de colores para theming (dark/light) |
| **Service Worker** | PWA: cache offline, navigación cacheada |
| **JSON-LD** | SEO: schema.org para Restaurant |
| **Fetch API** | Consumo de la API del Worker |

## Backend

| Tecnología | Uso |
|-----------|-----|
| **Cloudflare Workers** | API serverless (JavaScript, no Node.js) |
| **Cloudflare D1** | Base de datos SQLite serverless |
| **Cloudflare R2** | Almacenamiento de imágenes (S3-compatible) |
| **WebCrypto API** | HMAC-SHA256 para tokens de sesión |

## Hosting

| Servicio | Uso |
|----------|-----|
| **Cloudflare Pages** | Hosting de la landing page estática |
| **Cloudflare Workers** | API y lógica de negocio |

## Herramientas

| Herramienta | Uso |
|------------|-----|
| **Wrangler CLI** | Deploy de Workers, Pages, D1 y R2 |
| **Obsidian** | Documentación del proyecto (este vault) |
| **Git** | Control de versiones |
| **GitHub** | Repositorio remoto |

## API del Worker (dependencias)

**Cero dependencias externas.** Todo usa APIs nativas de Cloudflare Workers:
- `crypto.subtle` → HMAC-SHA256 para tokens
- `request.json()` → parsing de body
- `Response` → respuestas HTTP
- `URL` → routing de rutas

## Por qué NO se usó...

| Alternativa descartada | Razón |
|----------------------|-------|
| Next.js / React | Overkill para una landing estática + API |
| Node.js | Costo en hosting, innecesario para este caso |
| Express / Fastify | Workers no soporta Node.js runtime |
| PostgreSQL / MySQL | D1 es suficiente y gratis |
| CloudFront + S3 | R2 es más barato y está integrado |
