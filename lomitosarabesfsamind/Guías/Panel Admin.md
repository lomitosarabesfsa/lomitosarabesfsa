# Panel Admin

## Acceso

Abrir `admin/panel/index.html` desde tu PC en el navegador.

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
- **Listar**: Ver todas las categorías
- **Crear**: Agregar nueva categoría con nombre y emoji
- **Eliminar**: Borrar categoría (y todos sus productos)

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

1. Abrir `admin/panel/index.html`
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
