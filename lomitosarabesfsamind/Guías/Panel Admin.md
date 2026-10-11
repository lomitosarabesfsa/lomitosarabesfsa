# Panel Admin

## Acceso

**En línea**: `https://lomitosarabesfsa.pages.dev/panel/` — la ruta corta `/panel/` redirige
a `/admin/panel/` (regla en `_redirects`), así que las dos direcciones abren el mismo panel.
Además `/admin/` también lleva al panel.

**Local**: abrir `admin/panel/index.html` desde tu PC en el navegador.

**Credenciales**:
```
Usuario: admin
Clave:   (la que configuraste en secrets)
```

> El login dura 12 horas. Al expirar, se pide re-login.

---

## Funcionalidades

### 🥙 Productos
- **Listar**: Se muestran todos los productos agrupados por categoría
- **Crear**: Completar nombre, descripción, precio, categoría
- **Editar**: Modificar cualquier campo de un producto existente
- **Eliminar**: Borrar un producto (requiere confirmación)
- **Activar/Desactivar**: Mostrar u ocultar un producto sin eliminarlo
- **Subir foto**: Seleccionar imagen → se sube a R2 → se muestra en el menú
- **Reordenar**: Cambiar el orden de aparición dentro de la categoría

### 📂 Categorías
- **Listar**: Ver todas las categorías con su **posición real** (la que tiene la web), sus
  productos, y los badges de campaña (`🔥 Promo`, `⏱️ Temporal`, `Activa` / `Programada` / `Vencida`)
- **Crear**: Agregar nueva categoría con nombre, emoji y **posición**
- **Eliminar**: Borrar categoría (y todos sus productos). Las que quedan se renumeran solas

#### Ordenar (arrastrar, flechas o número)
- **Arrastrar**: mantené presionada una categoría (o tomala de la manija `⠿`) y movela; al
  soltarla se guarda sola. Funciona con mouse y con el dedo
- **Flechas ↑ ↓**: mueven una posición y guardan
- **Campo Posición**: si le ponés un número ocupado, las demás **se corren un lugar**. Al crear
  una categoría con posición 1, entra primera y todas las otras bajan uno

El orden del panel es el orden real del menú: se guarda 1..N, sin huecos ni números repetidos
(antes podías tener dos categorías con orden 1 y la web las ordenaba al azar).

#### Campañas (Día de la Madre, aniversario, fechas puntuales)
En el modal de la categoría, sección **Campaña**:
- **🔥 Destacar como promocional**: la categoría se ve distinta en la web (badge 🔥 PROMO,
  fondo y borde propios, marcada también en la barra de chips)
- **⏱️ Temporal**: la categoría tiene vigencia. Al marcarla se abre **Desde** (opcional) y
  **Hasta** (obligatorio), con una fecha sugerida a 7 días
  - En la web aparece un **cronómetro** con lo que falta ("⏳ Termina en 2d 4h"); en la última
    hora se pone rojo y palpita
  - Cuando llega la fecha de fin, la categoría **desaparece sola** del menú (y si alguien la
    tenía en el carrito, se le quita con aviso). No hace falta acordarse de apagarla
  - Si ponés **Desde** en el futuro, queda **programada**: se publica sola cuando llega la hora
  - Mientras está vencida o programada, el panel te lo dice con el badge de estado

### 🔥 Promos
- **Activar/Desactivar**: Mostrar u ocultar una promo en la landing
- **Crear**: Agregar texto y descripción
- **Editar**: Modificar texto existente

### ⚙️ Configuración
- **Horarios**: Configurar horario de apertura y cierre por día
- **WhatsApp**: Número de teléfono para pedidos
- **Galería**: URLs de imágenes para la galería

---

## Flujo típico de uso

1. Abrir `admin/panel/index.html` (o `https://lomitosarabesfsa.pages.dev/panel/`)
2. Iniciar sesión
3. Modificar productos (precios, fotos, stock)
4. Actualizar horarios si es necesario
5. Los cambios se reflejan **inmediatamente** en la landing

---

## Subir fotos de productos

1. Ir a la sección de Productos
2. En el producto deseado, hacer clic en "Subir foto"
3. Seleccionar una imagen (JPG, PNG)
4. La imagen se sube a R2 y se muestra automáticamente

> Las imágenes se guardan en `productos/` dentro del bucket R2 con un timestamp para evitar colisiones.

---

## Configuración de horarios

Los horarios se configuran como JSON:

```json
{
  "0": { "abre": "20:00", "cierra": "00:00" },  // Domingo
  "1": { "abre": "20:00", "cierra": "00:00" },  // Lunes
  "2": { "abre": "20:00", "cierra": "00:00" },  // Martes
  "3": { "abre": "20:00", "cierra": "00:00" },  // Miércoles
  "4": { "abre": "20:00", "cierra": "00:00" },  // Jueves
  "5": { "abre": "20:00", "cierra": "01:00" },  // Viernes
  "6": { "abre": "20:00", "cierra": "01:00" }   // Sábado
}
```

La landing muestra automáticamente "Abierto" / "Cerrado" según la hora actual.

---

## Seguridad

- El panel usa **tokens HMAC** con expiración de 12 horas
- Las credenciales se comparan **case-insensitive** para el usuario
- El panel solo puede acceder al Worker a través de HTTPS
- Las imágenes se suben como base64 → R2 (sin acceso directo a las keys)
- CORS restrictivo: solo acepta requests de dominios permitidos
