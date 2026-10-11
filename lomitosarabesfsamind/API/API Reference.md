# API Reference

**Base URL**: `https://lomitos-api.gapersingula97.workers.dev`

---

## Públicas

### GET `/api/menu`
Devuelve el menú completo para la landing page.

**Response**:
```json
{
  "categorias": [
    {
      "id": 1,
      "nombre": "Cajas Día de la Madre",
      "icono": "💐",
      "promocional": 1,
      "temporal": 1,
      "desde": "2026-10-16T00:00:00-03:00",
      "hasta": "2026-10-18T23:59:00-03:00",
      "productos": [
        {
          "id": 1,
          "nombre": "Árabe Simple Pollo",
          "descripcion": "Jamon,Queso,200g De Pollo...",
          "precio": 13000,
          "stock": -1,
          "imagen": ""
        }
      ]
    }
  ],
  "promos": [
    {
      "id": 1,
      "icono": "🔥",
      "texto": "3 Lomitos por $40.000",
      "descripcion": "Lunes, Martes y Miércoles"
    }
  ],
  "config": {
    "horarios": { "0": { "abre": "20:00", "cierra": "00:00" } },
    "whatsapp": "5493704218188",
    "galeria": []
  }
}
```

**Detalles de la respuesta**:

- Las categorías salen ordenadas por `orden` (desempate estable por `id`), y **las que no están
  vigentes no se publican**: una categoría `temporal` cuya ventana todavía no empezó
  (programada) o ya terminó (vencida) queda fuera de la respuesta. Nunca se muestra una promo
  vencida, aunque nadie se acuerde de apagarla.
- `promocional`, `temporal`, `desde` y `hasta` son los metadatos de campaña: la landing los usa
  para destacar la categoría y para correr el cronómetro ("⏳ Termina en 1d 4h").
- Las categorías sin productos visibles no se dibujan en la web (sí vienen en el JSON).
- El endpoint no se cachea (`/api/` siempre va a red), así que un cambio del panel se ve al
  recargar.

---

### POST `/api/login`
Autenticación del panel admin.

**Request**:
```json
{
  "usuario": "admin",
  "clave": "TU_CLAVE"
}
```

**Response (200)**:
```json
{ "ok": true, "token": "eyJ1..." }
```

**Response (401)**:
```json
{ "error": "Usuario o clave incorrectos" }
```

> El usuario se compara **case-insensitive**. La clave es case-sensitive.

---

## Admin (requieren `Authorization: Bearer <token>`)

### Productos

#### `GET /api/admin/productos`
Lista todos los productos con su categoría.

**Response**:
```json
[
  {
    "id": 1,
    "categoria_id": 1,
    "nombre": "Árabe Simple Pollo",
    "descripcion": "Jamon,Queso,200g De Pollo...",
    "precio": 13000,
    "stock": -1,
    "imagen": "https://pub-*.r2.dev/productos/...",
    "activo": 1,
    "orden": 1,
    "categoria_nombre": "Lomitos"
  }
]
```

#### `POST /api/admin/productos`
Crea un nuevo producto.

**Request**:
```json
{
  "categoria_id": 1,
  "nombre": "Nuevo Lomito",
  "descripcion": "Descripción del producto",
  "precio": 15000,
  "stock": -1,
  "imagen": "",
  "orden": 10
}
```

**Response (201)**: `{ "ok": true, "id": 14 }`

#### `PUT /api/admin/productos/:id`
Actualiza un producto existente.

**Request**: Mismo formato que POST.

**Response**: `{ "ok": true }`

#### `DELETE /api/admin/productos/:id`
Elimina un producto.

**Response**: `{ "ok": true }`

---

### Categorías

#### `GET /api/admin/categorias`
Lista **todas** las categorías, incluidas las programadas y las vencidas (el panel necesita
poder corregirlas), cada una con `vigente: 1|0` ya resuelto para poder avisar en pantalla.

#### `POST /api/admin/categorias`
Crea una categoría.

**Request**:
```json
{ "nombre": "Nueva Categoría", "icono": "🌯", "orden": 5 }
```

`icono` es opcional: si se omite o se manda vacío, la categoría se guarda sin icono
y la landing la muestra sólo con su nombre (ya no se rellena con `🍽️`).

```json
{ "nombre": "Nueva Categoría", "icono": "", "orden": 5 }
```

**`orden` es una posición, no un número suelto.** Con `orden: 1` la categoría entra primera
**y todas las demás corren un lugar**; sin `orden` la categoría va al final. La API deja
siempre la secuencia en 1..N sin huecos ni empates (mismo criterio al editar con
`PUT .../categorias/:id` y al borrar).

**Categoría de campaña** (promocional y/o con vigencia):
```json
{
  "nombre": "Cajas Día de la Madre",
  "icono": "💐",
  "orden": 1,
  "promocional": 1,
  "temporal": 1,
  "desde": "2026-10-16T00:00:00-03:00",
  "hasta": "2026-10-18T23:59:00-03:00"
}
```

- `promocional` → la landing la destaca (badge 🔥, fondo y borde propios).
- `temporal` + `hasta` → se publica sólo dentro de la ventana y la web le corre un cronómetro.
- `hasta` es **obligatorio** si `temporal` es 1, y debe ser posterior a `desde`.
- Errores: `400` con `una categoría temporal necesita fecha de fin (hasta)`,
  `la fecha de fin debe ser posterior a la de inicio` o `hasta no es una fecha válida`.

#### `PUT /api/admin/categorias/orden`
Reordena todas las categorías de una sola vez (lo que usa el panel al arrastrar).

**Request**:
```json
{ "ids": [8, 7, 5, 1] }
```

Los ids tienen que ser **exactamente** los de todas las categorías actuales: si falta uno,
sobra o se repite, responde `409` y no toca nada (protege contra un panel desactualizado).

**Response**: `{ "ok": true }`

#### `DELETE /api/admin/categorias/:id`
Elimina una categoría (y sus productos por CASCADE). Las que quedan se renumeran 1..N.

---

### Promos

#### `GET /api/admin/promos`
Lista todas las promos (activas e inactivas).

#### `PUT /api/admin/promos`
Reemplaza todas las promos.

**Request**:
```json
{
  "promos": [
    { "activa": true, "icono": "🔥", "texto": "3x1 lomitos", "descripcion": "Solo lunes" }
  ]
}
```

---

### Configuración

#### `GET /api/admin/config`
Devuelve toda la config (horarios, whatsapp, galería).

#### `PUT /api/admin/config`
Actualiza la config.

**Request**:
```json
{
  "horarios": { "0": { "abre": "20:00", "cierra": "00:00" } },
  "whatsapp": "5493704218188"
}
```

---

### Imágenes

#### `POST /api/admin/imagen`
Sube una imagen a R2.

**Request**:
```json
{
  "data": "base64_de_la_imagen...",
  "filename": "lomito-arabe.jpg",
  "contentType": "image/jpeg"
}
```

**Response**:
```json
{
  "ok": true,
  "key": "productos/1692555600000-lomito-arabe.jpg",
  "url": "https://pub-c8b21a7042f64b0387a78407a11c934f.r2.dev/productos/1692555600000-lomito-arabe.jpg"
}
```

---

## Errores comunes

| HTTP Status | Error | Causa |
|-------------|-------|-------|
| 400 | `Ruta no encontrada` | URL incorrecta |
| 401 | `No autorizado` | Token inválido o ausente |
| 401 | `Usuario o clave incorrectos` | Credenciales erróneas |
| 400 | `Falta el contenido de la imagen` | Body incompleto en upload |
| 500 | `Error interno: ...` | Error en el Worker |
