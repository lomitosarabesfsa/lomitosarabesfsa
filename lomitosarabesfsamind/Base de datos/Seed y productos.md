# Seed y Productos

## Datos iniciales cargados

El archivo `admin/seed.sql` inserta **13 productos** en **4 categorías**.

---

## 🌯 Lomitos (categoría 1)

| ID | Nombre | Descripción | Precio |
|----|--------|-------------|--------|
| 1 | Árabe Simple Pollo | Jamón, queso, pollo, verduras + salsa de ajo | $13.000 |
| 2 | Árabe Simple Carne | Jamón, queso, carne, verduras + salsa de ajo | $15.000 |
| 3 | Arabe Especial Carne | Carne, cheddar, verduras + salsa de ajo | $17.000 |
| 4 | Arabe Especial Pollo | Pollo, cheddar, verduras + salsa de ajo | $17.000 |
| 5 | Arabe Mixto | Carne, pollo, jamón, queso, verduras + salsa de ajo | $20.000 |
| 6 | LomiBurguer Simple | Carne burguer, jamón, queso, verduras + salsa de ajo | $15.000 |
| 7 | LomiBurguer Completo | Verduras, jamón, queso, 2 huevos, carne burguer + salsa de ajo | $18.000 |
| 8 | Arabe De Remolacha Carne | Carne, jamón, queso, verduras + salsa de ajo | $15.000 |
| 9 | Arabe De Remolacha Pollo | Pollo, jamón, queso, verduras + salsa de ajo | $13.000 |

## 🔥 Oportunidad Limitada (categoría 2)

| ID | Nombre | Descripción | Precio |
|----|--------|-------------|--------|
| 10 | 3 Lomitos por $40.000 | Simples Carne o Pollo, los Lunes, Martes y Miércoles | $40.000 |

## 🥤 Bebidas (categoría 3)

| ID | Nombre | Precio |
|----|--------|--------|
| 11 | Coca 1 L | $3.000 |
| 12 | Sprite 1L | $3.000 |

## 🧄 Aderezos (categoría 4)

| ID | Nombre | Precio |
|----|--------|--------|
| 13 | Salsita Ajo Extra | $2.000 |

---

## Configuración inicial

```json
{
  "horarios": {
    "0": { "abre": "20:00", "cierra": "00:00" },  // Domingo
    "1": { "abre": "20:00", "cierra": "00:00" },  // Lunes
    "2": { "abre": "20:00", "cierra": "00:00" },  // Martes
    "3": { "abre": "20:00", "cierra": "00:00" },  // Miércoles
    "4": { "abre": "20:00", "cierra": "00:00" },  // Jueves
    "5": { "abre": "20:00", "cierra": "01:00" },  // Viernes
    "6": { "abre": "20:00", "cierra": "01:00" }   // Sábado
  },
  "whatsapp": "5493704218188",
  "galeria": []
}
```

> Viernes y sábado cierran a la 1:00 AM.

## Cargar el seed

```bash
# Remote (producción)
cd admin
npx wrangler d1 execute lomitos-db --remote --file=seed.sql

# Local (desarrollo)
npx wrangler d1 execute lomitos-db --local --file=seed.sql
```

## Modificar productos

Los productos se gestionan desde el **Panel Admin** (`admin/panel/index.html`):
- Agregar/quitar productos
- Cambiar precios
- Subir fotos
- Activar/desactivar
- Reordenar

O directamente con SQL:
```bash
npx wrangler d1 execute lomitos-db --remote --command \
  "UPDATE productos SET precio = 16000 WHERE id = 1"
```
