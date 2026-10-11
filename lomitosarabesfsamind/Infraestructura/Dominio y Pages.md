# Dominio y Pages

## Cómo se configuró el dominio `lomitosarabesfsa.pages.dev`

### Paso 1: Crear el proyecto en Cloudflare Pages

```bash
cd lomitosarabesfsa
npx wrangler pages project create lomitosarabesfsa --production-branch main
```

Resultado:
```
✨ Successfully created the 'lomitosarabesfsa' project.
   It will be available at https://lomitosarabesfsa.pages.dev/
```

> **Nota**: El nombre del proyecto define el subdominio. `lomitosarabesfsa` → `lomitosarabesfsa.pages.dev`.

### Paso 2: Deployar los archivos estáticos

```bash
npx wrangler pages deploy . --project-name lomitosarabesfsa --branch main
```

Resultado:
```
Uploading... (0/50)
Uploading... (50/50)
✨ Success! Uploaded 50 files (5.08 sec)
🌎 Deploying...
✨ Deployment complete!
```

### Paso 3: Verificar

Abrir `https://lomitosarabesfsa.pages.dev` en el navegador. La landing carga los menús desde la API.

## Cómo funciona Cloudflare Pages

```
CLI → wrangler pages deploy → CDN global → HTTPS automático
```

### Ventajas
- **SSL/HTTPS automático**: No hay que configurar certificados
- **CDN global**: Se sirve desde el nodo más cercano al usuario
- **Deploy instantáneo**: Subida de archivos, no build process
- **Dominio gratuito**: `*.pages.dev` sin costo
- **Custom domain**: Se puede conectar un dominio propio después

## Cambiar el nombre del subdominio

Si se quisiera cambiar el dominio (ej: `lomitosarabes.com`):

1. **Opción A**: Conectar dominio propio desde Dashboard → Pages → Custom domains
2. **Opción B**: Crear un nuevo proyecto con otro nombre y re-deployar

### Desde el Dashboard de Cloudflare
1. Ir a [dash.cloudflare.com](https://dash.cloudflare.com) → Pages
2. Seleccionar `lomitosarabesfsa`
3. Settings → Custom domains → Add custom domain
4. Seguir las instrucciones (agregar CNAME en el DNS)

## Rutas del panel de administración

El deploy sube la raíz del repo, así que el panel queda publicado en `/admin/panel/`
(es la carpeta real `admin/panel/`). Para que la ruta corta `/panel/` no termine en el
fallback SPA —que devuelve la landing en cualquier ruta inexistente— la raíz incluye un
archivo `_redirects`:

```
/panel    /admin/panel/  302
/panel/   /admin/panel/  302
/admin    /admin/panel/  302
/admin/   /admin/panel/  302
```

Las reglas de `_redirects` se aplican siempre, exista o no un archivo en la ruta pedida,
así que tienen prioridad sobre el fallback SPA. Se verifican en local con
`npx wrangler pages dev . --port 8787` (el servidor local sí emula el fallback y las reglas).

## Último deploy registrado

| Campo | Valor |
|-------|-------|
| Fecha | 20 de agosto 2026 |
| Proyecto | `lomitosarabesfsa` |
| Archivos | 50 |
| URL | `https://lomitosarabesfsa.pages.dev` |
