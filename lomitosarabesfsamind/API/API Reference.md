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
      "nombre": "Lomitos",
      "icono": "🍽️",
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
Lista todas las categorías.

#### `POST /api/admin/categorias`
Crea una categoría.

**Request**:
```json
{ "nombre": "Nueva Categoría", "icono": "🍽️", "orden": 5 }
```

#### `DELETE /api/admin/categorias/:id`
Elimina una categoría (y sus productos por CASCADE).

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
