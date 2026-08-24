-- ============================================================
-- MIGRACIÓN: Eliminar tablas obsoletas de D1
-- Ejecutar con: npx wrangler d1 execute lomitos-db --remote --file=migrate-limpiar-tablas.sql
-- ============================================================

-- La tabla 'adicionales' fue reemplazada por modifier_groups + modifier_options.
DROP TABLE IF EXISTS adicionales;
DROP INDEX IF EXISTS idx_adicionales_producto;
DROP INDEX IF EXISTS idx_adicionales_categoria;

-- La tabla 'usuarios' era dead code: la autenticación se gestiona
-- con secrets de Cloudflare (ADMIN_USER, ADMIN_PASS, AUTH_SECRET).
DROP TABLE IF EXISTS usuarios;
