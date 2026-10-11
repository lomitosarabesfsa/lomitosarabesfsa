# Landing Page

## Descripción
La landing page es un archivo HTML autocontenido (`index.html`) que funciona como la web pública de Lomitos Árabes FSA. Los clientes ven el menú, hacen pedidos por WhatsApp y consultan horarios.

## Cómo funciona

### Carga inicial
1. El navegador carga `index.html` desde Cloudflare Pages
2. El JavaScript busca la configuración (`CONFIG.API_URL`)
3. Hace `fetch` a `/api/menu` del Worker
4. Renderiza categorías, productos, promos y config

### Renderizado del menú
```
API response → procesarMenuJSON() → renderizarCarta()
                                  → renderizarPromos()
                                  → renderFooterHours()
```

### Chips de categorías (sticky)
- Barra horizontal deslizable con las categorías
- Se queda fija (sticky) debajo del nav al hacer scroll
- Scroll-spy resalta la categoría visible
- Altura del nav sincronizada dinámicamente con JS (`--nav-height`)
- La categoría **promocional** también se marca en la barra (🔥 + estilo propio)

### Categorías de campaña (promocional / temporal)
Una categoría puede venir marcada como `promocional` y/o `temporal` desde el panel:
- **Promocional**: la sección se despega del resto (fondo, borde y sombra propios), con el badge
  `🔥 PROMO` en el encabezado. Los productos siguen siendo productos normales: entran al carrito,
  al mensaje de WhatsApp y al control de stock igual que cualquier otro
- **Temporal**: la sección muestra un cronómetro con lo que falta para que termine
  (`⏳ Termina en 2d 4h`). Arriba de un día muestra días/horas, abajo muestra minutos y segundos,
  y en la última hora se pone rojo y palpita (respeta `prefers-reduced-motion`)
- Cuando el cronómetro llega a cero **la categoría se va sola de la página**, sin recargar: la
  sección, su chip, sus productos y lo que el cliente tuviera de esa promo en el carrito
  (con aviso). La API además ya no la devuelve, así que el que entra después tampoco la ve

### Carrito de compras
- Se almacena en `localStorage` con key `lomitos-carrito`
- Los items se suman/restan con botones +/- en modales
- El total se envía como mensaje pre-armado a WhatsApp

### Horarios dinámicos
- Se cargan desde la tabla `config` de D1
- Se comparan con la hora actual para mostrar "Abierto" / "Cerrado"
- Actualización en tiempo real cada minuto

## Personalización de colores

Los colores se definen como CSS custom properties al inicio del `<style>`:

```css
:root {
    --primary: #F57C00;     /* Naranja (marca) */
    --secondary: #D84315;   /* Rojo oscuro */
    --tertiary: #FFB300;    /* Dorado */
    --bg: #121212;          /* Fondo oscuro */
    --surface: #1E1E1E;     /* Superficie */
    --text: #FFFFFF;        /* Texto claro */
}
```

> Para cambiar el tema, solo modificá estas variables. Todos los componentes las usan.

## SEO

La landing incluye:
- **Meta tags** completos (title, description, og:image, twitter:card)
- **JSON-LD** con schema.org `Restaurant` para Google
- **robots.txt** y **sitemap.xml** para crawlers
- **Semantic HTML** con headings jerárquicos
- **Canonical URL** configurada

## PWA (Progressive Web App)

- `manifest.json` define la app instalable
- `sw.js` implementa cache offline para assets estáticos
- Permite "agregar a pantalla de inicio" en móviles
- Cache strategy: network-first para HTML, cache-first para assets

## Deploy

La landing se deploya con Wrangler:
```bash
npx wrangler pages deploy . --project-name lomitosarabesfsa --branch main
```
