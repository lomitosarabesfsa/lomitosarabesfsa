-- ============================================================
--  0004 · Limpieza de tablas obsoletas
--
--  'adicionales' fue reemplazada por modifier_groups + modifier_options.
--  'usuarios' era dead code: la autenticación se gestiona con secrets de
--  Cloudflare (ADMIN_USER, ADMIN_PASS, AUTH_SECRET).
--
--  Ejecutar con: node scripts/migrar.mjs apply
-- ============================================================

DROP TABLE IF EXISTS adicionales;
DROP INDEX IF EXISTS idx_adicionales_producto;
DROP INDEX IF EXISTS idx_adicionales_categoria;

DROP TABLE IF EXISTS usuarios;
