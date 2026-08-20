# Variables de Entorno y Secrets

## Secrets configurados en Cloudflare

Los secrets se configuran con `wrangler secret put` y quedan encriptados en Cloudflare. **No se pueden leer**, solo sobrescribir.

```bash
cd admin

# Usuario del panel admin
npx wrangler secret put ADMIN_USER
→ Valor: admin

# Clave del panel admin
npx wrangler secret put ADMIN_PASS
→ Valor: (la que elijas)

# Secreto para firmar tokens de sesión
npx wrangler secret put AUTH_SECRET
→ Valor: (generar con: openssl rand -hex 32)
```

### Variables visibles en `wrangler.toml`

| Variable | Valor | Uso |
|----------|-------|-----|
| `R2_PUBLIC_URL` | `https://pub-c8b21a7042f64b0387a78407a11c934f.r2.dev` | URL base para imágenes públicas |

## Variables en `.env` (local)

| Variable | Uso |
|----------|-----|
| `CLOUDFLARE_ACCOUNT_ID` | ID de cuenta Cloudflare |
| `R2_BUCKET` | Nombre del bucket R2 (`lomitosarabesfsar2`) |
| `R2_ENDPOINT` | Endpoint R2 |
| `R2_ACCESS_KEY_ID` | Access key para R2 |
| `R2_SECRET_ACCESS_KEY` | Secret key para R2 |

> ⚠️ El archivo `.env` está en `.gitignore` y **nunca se sube a Git**.

## Variables en el frontend (`index.html`)

| Variable | Uso |
|----------|-----|
| `CONFIG.API_URL` | URL de la API (`/api/menu`) |
| `CONFIG.WHATSAPP` | Se carga desde D1 (`config.whatsapp`) |

## Variables en el panel admin (`admin/panel/index.html`)

```javascript
const API_BASE = 'https://lomitos-api.gapersingula97.workers.dev';
```

## Rotación de credenciales

Si alguna credencial se ve comprometida:

```bash
# Cambiar clave del admin
npx wrangler secret put ADMIN_PASS
→ Ingresar nueva clave

# Regenerar AUTH_SECRET (invalida todas las sesiones activas)
npx wrangler secret put AUTH_SECRET
→ Pegar nueva clave aleatoria

# Generar clave aleatoria segura
openssl rand -hex 32
```
