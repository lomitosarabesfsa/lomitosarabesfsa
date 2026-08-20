# Seed y Productos

## Datos iniciales cargados

El archivo `admin/seed.sql` inserta **13 productos** en **4 categorías**.

---

## 🥙 Lomitos (categoría 1)

| ID | Nombre | Descripción | Precio |
|----|--------|-------------|--------|
| 1 | Árabe Simple Pollo | Jamon,Queso,200g De Pollo,180g De Verduras + Salsa De Ajo = Kg 850 | $13.000 |
| 2 | Árabe Simple Carne | Jamon,Queso,200g De Carne,180g De Verduras + Salsa De Ajo = Kg 850 | $15.000 |
| 3 | Arabe Especial Carne | 200g De Carne,Cheddar,200g De Verduras + Salsa De Ajo = Kg 900 | $17.000 |
| 4 | Arabe Especial Pollo | 200g De Pollo,Cheddar,200g De Verduras + Salsa De Ajo = Kg 900 | $17.000 |
| 5 | Arabe Mixto | 200g De Carne,200g De Pollo,Jamon,Queso,250g De Verduras + Salsa De Ajo = Kg 1400 | $20.000 |
| 6 | LomiBurguer Simple | 220g De Carne Burguer,Jamon,Queso,180g De Verduras + Salsa De Ajo = Kg 800 | $15.000 |
| 7 | LomiBurguer Completo | 180g De Verduras,Jamon,Queso,2Huevos,220g De Carne Burger + Salsa De Ajo = Kg 900 | $18.000 |
| 8 | Arabe De Remolacha Carne | 200g De Carne,Jamon,Queso,180g De Verduras + Salsa De Ajo = Kg 850 | $15.000 |
| 9 | Arabe De Remolacha Pollo | 200g De Pollo,Jamon,Queso,180g De Verduras + Salsa De Ajo = Kg 850 | $13.000 |

## 🍽️ Oportunidad Limitada (categoría 2)

| ID | Nombre | Descripción | Precio |
|----|--------|-------------|--------|
| 10 | 3 Lomitos por $40.000 | Simples Carne o Pollo, los Lunes, Martes y Miércoles | $40.000 |

## 🥤 Bebidas (categoría 3)

| ID | Nombre | Precio |
|----|--------|--------|
| 11 | Coca 1 L | $3.000 |
| 12 | Sprite 1L | $3.000 |

## 🍽️ Aderezos (categoría 4)

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
