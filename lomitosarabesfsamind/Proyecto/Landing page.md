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

La paleta se deriva del logo (`assets/logo.webp`): celeste de marca, pan, tinta marrón, cheddar y tomate. Se define como CSS custom properties al inicio de `styles.css`:

```css
:root {
    --sky: #55BBFF;         /* Celeste del logo */
    --cream: #FFF4E2;       /* Pan: texto/crema de marca */
    --ink: #2A1206;         /* Tinta: texto y bordes */
    --primary: #F2A51C;     /* Cheddar: relleno de CTA (texto --on-primary) */
    --primary-text: #A8E0FF;/* Acento de títulos en oscuro */
    --action-primary: #C0332A; /* Tomate: botón de agregar */
    --bg: #0A0A0A;          /* Fondo oscuro negro */
    --surface: #141414;     /* Superficie oscura */
    --text: #FFF7EC;        /* Texto claro */
}
```

> Para cambiar el tema, solo modificá estas variables. Todos los componentes las usan.
> El tema claro vive en `[data-theme="light"]`: `--bg: #E9DDC7` (papel), `--surface: #FFFFFF`, `--text: #2A1206`, `--text-muted: #5F4836`, `--primary-text: #9C3416` y `--tertiary: #7A4A00`. El fondo claro lleva una textura de grano SVG.
> Regla de contraste: sobre rellenos claros (cheddar, crema) el texto va en `--on-primary`/`--ink`, nunca blanco.

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
