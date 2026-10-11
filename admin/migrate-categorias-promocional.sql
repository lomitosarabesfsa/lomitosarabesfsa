-- ============================================================
--  MIGRACIÓN: categorías promocionales y temporales
--
--  Contexto: una categoría solo tenía (nombre, icono, orden). No se podía
--  destacar "Cajas Día de la Madre" sobre el resto ni hacer que se ocultara
--  sola al terminar la campaña (había que acordarse de apagarla a mano).
--
--  Agrega:
--    · promocional → la landing la destaca (color, badge y brillo propios)
--    · temporal    → tiene vigencia
--    · desde/hasta → ventana de vigencia en ISO con offset (ej -03:00).
--                    Vacío = sin límite. Con temporal = 1, "hasta" es obligatorio.
--
--  Ejecutar con:
--    npx wrangler d1 execute lomitos-db --remote --file=migrate-categorias-promocional.sql
--
--  Las columnas nuevas entran con DEFAULT, así que las filas existentes quedan
--  como siempre: no promocionales y sin vigencia. Idempotente en la práctica:
--  si ya existen, SQLite tira "duplicate column name" y no rompe nada más.
-- ============================================================

ALTER TABLE categorias ADD COLUMN promocional INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categorias ADD COLUMN temporal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categorias ADD COLUMN desde TEXT NOT NULL DEFAULT '';
ALTER TABLE categorias ADD COLUMN hasta TEXT NOT NULL DEFAULT '';

-- Saneamiento del orden: hasta ahora cada categoría guardaba el número que le
-- habías escrito a mano, con empates posibles (dos categorías con orden 1 y la
-- posición decidida por el azar del plan de consulta). Se renumera 1..N
-- respetando el orden que ya se ve hoy en la web.
--
-- El cálculo pasa por una tabla temporal a propósito: si la subconsulta leyera
-- "categorias" mientras el UPDATE la está modificando, las filas ya reescritas
-- ensuciarían la cuenta de las siguientes.
DROP TABLE IF EXISTS _orden_categorias;

CREATE TABLE _orden_categorias AS
  SELECT id, ROW_NUMBER() OVER (ORDER BY orden, id) AS rn FROM categorias;

UPDATE categorias
SET orden = (SELECT rn FROM _orden_categorias WHERE _orden_categorias.id = categorias.id);

DROP TABLE _orden_categorias;
