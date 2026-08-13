# 🛠️ Admin Panel — Lomitos Árabes FSA

Panel de gestión para el dueño: productos, precios, stock, fotos (R2), promos, horarios y galería.
La web pública consume la API (`/api/menu`) y el panel la edita. Adiós planilla de Google Sheets. 💪

## Arquitectura

```
Web pública (Netlify) ──▶ GET /api/menu ──┐
                                          ├─▶ Cloudflare Worker (lomitos-api)
Admin panel (estático) ──▶ /api/admin/* ──┘        │
   (login + CRUD)                                   ├─▶ D1 (SQLite: productos, categorías, promos, config)
                                                    └─▶ R2 (fotos: bucket lomitosarabesfsar2)
```

Costo: **$0/mes** (planes gratuitos de Cloudflare).

## Deploy paso a paso

Requisitos: cuenta de Cloudflare y `node` instalado.

### 1. Autenticarse
```bash
cd admin
npx wrangler login
```

### 2. Crear la base de datos D1
```bash
npx wrangler d1 create lomitos-db
```
Copiar el `database_id` que imprime y pegarlo en `wrangler.toml` (línea `database_id = "..."`).

### 3. Crear tablas + cargar los datos actuales de la planilla
```bash
npx wrangler d1 execute lomitos-db --remote --file=schema.sql
npx wrangler d1 execute lomitos-db --remote --file=seed.sql
```
(`seed.sql` se generó con `node scripts/migrar-planilla.js` y contiene los 13 productos actuales.
Para regenerarlo cuando quieras, borrá el archivo y volvé a correr el script.)

### 4. Configurar secretos (¡importante!)

> ⚠️ **En Windows, `echo "clave" | npx wrangler secret put ...` puede guardar un
> salto de línea (`\n`) o un `\r` extra dentro del valor** (y en PowerShell 5.1,
> codificación corrupta), haciendo que el login falle aunque se tipee bien.
> Usá SIEMPRE el **modo interactivo (sin tubería)**: el comando te pide el valor
> y lo tipeás/pegás vos mismo.

```bash
npx wrangler secret put ADMIN_USER      # te pide el valor → tipeá el usuario (ej: admin)
npx wrangler secret put ADMIN_PASS      # te pide el valor → tipeá la clave segura
npx wrangler secret put AUTH_SECRET     # te pide el valor → pegá una clave aleatoria
```

Alternativa en Git Bash (sin salto de línea, igual de segura):
```bash
printf '%s' 'TU_CLAVE' | npx wrangler secret put ADMIN_PASS --name lomitos-api
```

> El login del Worker **normaliza automáticamente**: ignora espacios al inicio/fin
> del usuario y la clave, y el usuario no distingue mayúsculas (la clave sí).
> Si aún así da "Usuario o clave incorrectos", repetí los comandos con el modo
> interactivo (sin `echo` ni tuberías).

### 5. Acceso público del bucket R2 (fotos visibles)
✅ **Ya activado**: bucket `lomitosarabesfsar2` sirve fotos vía `https://pub-c8b21a7042f64b0387a78407a11c934f.r2.dev`
(y la URL ya está configurada en `wrangler.toml` como variable `R2_PUBLIC_URL`).
La URL `pub-*.r2.dev` es de desarrollo (con límite de tasa); alcanza de sobra para el tráfico de un local.
Si el negocio crece mucho, se conecta un dominio propio desde el dashboard (sin costo).

### 6. Deploy del Worker
```bash
npx wrangler deploy
```
Queda disponible en `https://lomitos-api.<tu-subdominio>.workers.dev`.

### 7. Publicar el panel admin
Subir la carpeta `panel/` a un hosting estático (el mismo Netlify u otro).
Antes, editar en `panel/index.html` la línea:
```js
const API_BASE = 'https://lomitos-api.<tu-subdominio>.workers.dev';
```
**Entrar por primera vez con `admin / admin123` y cambiá la clave de inmediato** (secrets ADMIN_USER/ADMIN_PASS).

### 8. (Opcional) Migrar la web pública del CSV a la API
Cuando el Worker esté en línea, la web puede leer `https://lomitos-api.<subdominio>.workers.dev/api/menu` en vez del CSV.
El formato JSON ya está contemplado en la web (`procesarMenuJSON`). Se hace en un paso posterior para no romper nada.

## Comandos útiles

```bash
npx wrangler dev --local          # probar el Worker local (D1/R2 simulados)
node scripts/migrar-planilla.js   # regenerar seed.sql desde la planilla
npx wrangler d1 execute lomitos-db --remote --command "SELECT COUNT(*) FROM productos"
npx wrangler tail                 # ver logs en vivo del Worker
```

## Seguridad
- El bucket R2 es **solo lectura pública** (las fotos); las claves de escritura quedan en el Worker.
- Las credenciales del `.env` raíz **no se suben a git** (`.gitignore` ya las excluye).
- **Rotar el token R2** si alguna vez se compartió en un chat.
