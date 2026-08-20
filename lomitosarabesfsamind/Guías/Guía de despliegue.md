# Guía de Despliegue

Paso a paso para deployar Lomitos Árabes FSA desde cero.

---

## Prerrequisitos

- Cuenta de [Cloudflare](https://dash.cloudflare.com) (gratis)
- [Node.js](https://nodejs.org) instalado
- Wrangler CLI (`npm install -g wrangler`)

---

## 1. Autenticarse en Cloudflare

```bash
cd admin
npx wrangler login
```

Se abre el navegador. Autorizar la sesión.

---

## 2. Crear la base de datos D1

```bash
npx wrangler d1 create lomitos-db
```

Copiar el `database_id` que imprime. Pegarlo en `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "lomitos-db"
database_id = "AQUÍ_EL_ID"
```

---

## 3. Crear las tablas

```bash
npx wrangler d1 execute lomitos-db --remote --file=schema.sql
```

---

## 4. Cargar productos iniciales

```bash
npx wrangler d1 execute lomitos-db --remote --file=seed.sql
```

---

## 5. Configurar secrets

```bash
npx wrangler secret put ADMIN_USER      # → admin
npx wrangler secret put ADMIN_PASS      # → (la que elijas)
npx wrangler secret put AUTH_SECRET     # → (generar con: openssl rand -hex 32)
```

> ⚠️ En Windows, usar **modo interactivo** (sin tuberías). El comando te pide el valor y lo tipeás vos.

---

## 6. Deploy del Worker (API)

```bash
npx wrangler deploy
```

Resultado:
```
✨ https://lomitos-api.gapersingula97.workers.dev
```

---

## 7. Crear el proyecto en Cloudflare Pages

```bash
cd ..
npx wrangler pages project create lomitosarabesfsa --production-branch main
```

Resultado:
```
✨ https://lomitosarabesfsa.pages.dev
```

---

## 8. Deployar la landing page

```bash
npx wrangler pages deploy . --project-name lomitosarabesfsa --branch main
```

Resultado:
```
✨ https://lomitosarabesfsa.pages.dev
```

---

## 9. Verificar

| Servicio | URL | Probar |
|----------|-----|--------|
| Landing | `https://lomitosarabesfsa.pages.dev` | Abrir en navegador |
| API | `https://lomitos-api.gapersingula97.workers.dev/api/menu` | Abrir en navegador |
| Panel Admin | Abrir `admin/panel/index.html` | Login con admin |

---

## 10. (Opcional) Conectar dominio propio

1. Dashboard Cloudflare → Pages → lomitosarabesfsa → Custom domains
2. Agregar `lomitosarabes.com` (o el que sea)
3. Configurar DNS (Cloudflare te da los registros)

---

## Comandos útiles

```bash
# Redeployar la landing
npx wrangler pages deploy . --project-name lomitosarabesfsa --branch main

# Redeployar el Worker (API)
cd admin && npx wrangler deploy

# Probar el Worker local (D1/R2 simulados)
npx wrangler dev --local

# Verificar productos
npx wrangler d1 execute lomitos-db --remote --command "SELECT COUNT(*) FROM productos"

# Ejecutar SQL directo
npx wrangler d1 execute lomitos-db --remote --command "UPDATE productos SET precio = 16000 WHERE id = 1"

# Ver logs en vivo
cd admin && npx wrangler tail
```

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "Ruta no encontrada" en `/` | Normal: el Worker es solo API, la landing va en Pages |
| Login falla en panel admin | Verificar secrets con `npx wrangler secret list`, repetir en modo interactivo |
| Imágenes no se ven | Verificar `R2_PUBLIC_URL` en wrangler.toml |
| CORS error en consola | Verificar que el Origin esté en `ALLOWED_ORIGINS` en `worker/src/index.js` |
| "No autorizado" | Token expirado (12 h): hacer login de nuevo |
| Landing no carga menú | Verificar que el Worker esté deployado y que `/api/menu` responda |
| Pages deploy falla | Verificar que estás autenticado con `npx wrangler whoami` |
