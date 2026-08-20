# Cloudflare Workers

## Datos del Worker

| Campo | Valor |
|-------|-------|
| Nombre | `lomitos-api` |
| URL | `https://lomitos-api.gapersingula97.workers.dev` |
| Runtime | Cloudflare Workers (V8 isolates) |
| Archivo principal | `admin/worker/src/index.js` |

## Deploy

```bash
cd admin
npx wrangler deploy
```

Resultado:
```
✨ Successfully deployed your script to
   https://lomitos-api.gapersingula97.workers.dev
```

## Configuración (`wrangler.toml`)

```toml
name = "lomitos-api"
main = "worker/src/index.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "lomitos-db"
database_id = "f03410c3-0771-472b-bcc5-c0188468153c"

[[r2_buckets]]
binding = "IMAGENES"
bucket_name = "lomitosarabesfsar2"

[vars]
R2_PUBLIC_URL = "https://pub-c8b21a7042f64b0387a78407a11c934f.r2.dev"
```

### Bindings

| Binding | Tipo | Servicio | Uso |
|---------|------|----------|-----|
| `DB` | D1 | SQLite serverless | Consultas SQL |
| `IMAGENES` | R2 | Object storage | Subida de fotos |

## Rutas del Worker

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/menu` | No | Menú público |
| `POST` | `/api/login` | No | Login → token |
| `GET` | `/api/admin/productos` | Sí | Listar productos |
| `POST` | `/api/admin/productos` | Sí | Crear producto |
| `PUT` | `/api/admin/productos/:id` | Sí | Actualizar producto |
| `DELETE` | `/api/admin/productos/:id` | Sí | Eliminar producto |
| `GET` | `/api/admin/categorias` | Sí | Listar categorías |
| `POST` | `/api/admin/categorias` | Sí | Crear categoría |
| `DELETE` | `/api/admin/categorias/:id` | Sí | Eliminar categoría |
| `GET` | `/api/admin/promos` | Sí | Listar promos |
| `PUT` | `/api/admin/promos` | Sí | Guardar promos |
| `GET` | `/api/admin/config` | Sí | Obtener config |
| `PUT` | `/api/admin/config` | Sí | Guardar config |
| `POST` | `/api/admin/imagen` | Sí | Subir imagen a R2 |

## Autenticación

El Worker usa HMAC-SHA256 (WebCrypto) para firmar tokens:

1. Admin hace `POST /api/login` con `{ usuario, clave }`
2. Worker verifica credenciales (case-insensitive para usuario)
3. Genera token: `payload_base64.hmac_signature`
4. Token dura 12 horas
5. Admin envía token en header `Authorization: Bearer <token>`

## CORS

El Worker tiene CORS restrictivo — solo acepta requests de:

| Origen | Uso |
|--------|-----|
| `https://lomitosarabesfsa.pages.dev` | Landing page |
| `http://localhost:8787` | Desarrollo local (wrangler dev) |
| Sin Origin (`*`) | Archivos locales (panel admin), curl |

> Para agregar otro origen, editar `ALLOWED_ORIGINS` en `worker/src/index.js`.

## Probar el Worker

```bash
# Menú público
curl https://lomitos-api.gapersingula97.workers.dev/api/menu

# Login
curl -X POST https://lomitos-api.gapersingula97.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"usuario":"admin","clave":"TU_CLAVE"}'

# Ver logs en tiempo real
npx wrangler tail
```

## Local development

```bash
cd admin
npx wrangler dev --local
```

Esto crea un Worker local con D1 y R2 simulados en memoria.
