-- ============================================================
--  0003 · Iconos propios por categoría
--
--  Contexto: las categorías nacían con el emoji 🍽️ por defecto, así que la
--  landing mostraba varios recuadros idénticos que no decían nada. El default
--  ya no existe (schema/panel/worker); esto arregla las filas históricas.
--
--  Es idempotente: se puede correr las veces que haga falta.
--  Ejecutar con: node scripts/migrar.mjs apply
-- ============================================================

UPDATE categorias SET icono = '🌯' WHERE nombre = 'Lomitos';
UPDATE categorias SET icono = '🔥' WHERE nombre = 'Oportunidad Limitada';
UPDATE categorias SET icono = '🥤' WHERE nombre = 'Bebidas';
UPDATE categorias SET icono = '🧄' WHERE nombre = 'Aderezos';
UPDATE categorias SET icono = '🍟' WHERE nombre = 'Papas Fritas';

-- Cualquier otra categoría que siga con el plato genérico: se la deja sin
-- icono (la landing no dibuja el recuadro) y se elige el emoji desde el panel.
UPDATE categorias SET icono = '' WHERE icono = '🍽️';
