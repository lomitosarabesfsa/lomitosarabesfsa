# 🥙 Lomitos Árabes FSA — Documentación

> Vault de Obsidian con toda la documentación del proyecto **Lomitos Árabes FSA**: arquitectura, despliegue, API, base de datos y más.

---

## 📂 Estructura del vault

### Proyecto
- [[Arquitectura]] — Visión general del sistema y cómo se conectan las partes
- [[Stack tecnológico]] — Tecnologías usadas y por qué
- [[Estructura de archivos]] — Árbol de carpetas del proyecto
- [[Landing page]] — La web pública que ven los clientes

### Infraestructura
- [[Dominio y Pages]] — Cómo se configuró `lomitosarabesfsa.pages.dev`
- [[Cloudflare Workers]] — El Worker que sirve la API
- [[Variables de entorno y Secrets]] — Credenciales y configuración sensible

### API
- [[API Reference]] — Todas las rutas, métodos y respuestas

### Base de datos
- [[Schema D1]] — Tablas y relaciones
- [[Seed y productos]] — Datos iniciales (lomitos, bebidas, etc.)

### Guías
- [[Guía de despliegue]] — Paso a paso para deployar desde cero
- [[Panel Admin]] — Cómo usar el panel de administración

---

## 🔗 URLs del proyecto

| Servicio | URL |
|----------|-----|
| Landing page | [lomitosarabesfsa.pages.dev](https://lomitosarabesfsa.pages.dev) |
| API Worker | [lomitos-api.gapersingula97.workers.dev](https://lomitos-api.gapersingula97.workers.dev) |
| Panel Admin | Archivo local `admin/panel/index.html` |
| R2 (imágenes) | [pub-c8b21a7042f64b0387a78407a11c934f.r2.dev](https://pub-c8b21a7042f64b0387a78407a11c934f.r2.dev) |
| Repositorio | [github.com/lomitosarabesfsa/lomitosarabesfsa](https://github.com/lomitosarabesfsa/lomitosarabesfsa) |

## 🔑 Credenciales

| Credencial | Valor |
|------------|-------|
| Usuario admin | `admin` |
| Cloudflare Account ID | `91dc1d8d70b8a45173db4569baea8876` |
| D1 Database ID | `f03410c3-0771-472b-bcc5-c0188468153c` |

> ⚠️ Las credenciales están guardadas como secrets en Cloudflare. No las compartas públicamente.
