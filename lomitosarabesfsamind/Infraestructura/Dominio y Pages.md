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

## Último deploy registrado

| Campo | Valor |
|-------|-------|
| Fecha | 20 de agosto 2026 |
| Proyecto | `lomitosarabesfsa` |
| Archivos | 50 |
| URL | `https://lomitosarabesfsa.pages.dev` |
