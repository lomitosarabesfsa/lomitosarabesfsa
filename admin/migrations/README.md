# Migraciones de D1

El esquema de la base **solo** cambia por archivos de este directorio. No hay
`schema.sql` paralelo: era la segunda fuente de verdad que se desactualizaba.

## Contrato

- Nombre: `NNNN_nombre_en_minusculas.sql` (guiones o guiones bajos), numeración continua desde `0001`.
- Se aplican **una sola vez y en orden**. Lo aplicado queda en la tabla
  `schema_migrations` con su checksum SHA-256 y la fecha.
- **Nunca edites una migración ya aplicada.** El checksum lo detecta y
  `db:check` falla (el deploy del Worker no sale).
- Para un cambio nuevo: creá `0005_lo-que-sea.sql` y corré `npm run db:apply -- --remote`.

## Comandos (desde `admin/`)

```bash
npm run db:status   -- --remote   # qué está aplicado, qué falta, si el esquema real está completo
npm run db:apply    -- --remote   # aplica las pendientes
npm run db:check    -- --remote   # gate del deploy: sale con 1 si hay drift
npm run db:baseline -- --remote   # adopta una base existente sin re-ejecutar
```

Sin `--remote` todo apunta a la **base local** (destino por defecto, a propósito).

## Base que ya existía

La producción actual tiene el esquema al día pero nació antes de este registro.
Se adopta una única vez:

```bash
npm run db:baseline -- --remote
```

`baseline` primero verifica que la base real tenga todas las tablas y columnas
que el Worker usa; si falta algo, se niega y hay que crear la base con `apply`.

## Cómo verifica `check`

No se conforma con el registro: además de comparar versiones y checksums,
ejecuta un `SELECT` con las columnas exactas que usa el Worker contra cada tabla
(`REQUERIDOS` en `scripts/migrar.mjs`). Una columna que falta aparece en el log
del deploy con el nombre del error de SQLite.
