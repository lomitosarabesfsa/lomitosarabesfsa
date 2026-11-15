-- ============================================================
--  0005 · Descripciones de productos sin pesos
--
--  Contexto: la landing normaliza las descripciones al renderizar, pero la
--  API y el panel seguían mostrando los gramajes de la planilla
--  ("200g De Pollo... = Kg 850"). Eso hacía que la ficha pública y la base
--  no dijeran lo mismo.
--
--  Esta migración corrige la fuente (D1) y deja las descripciones con los
--  ingredientes y las cantidades que sí aportan ("2 huevos"), sin gramajes.
--  No toca nombres, precios, stock, fotos ni órdenes.
--
--  Es idempotente: se puede ejecutar las veces que haga falta.
--  Ejecutar con: npm run db:apply -- --remote
-- ============================================================

UPDATE productos SET descripcion = 'Jamón, queso, pollo, verduras + salsa de ajo'
WHERE id = 1;  -- Árabe Simple Pollo

UPDATE productos SET descripcion = 'Jamón, queso, carne, verduras + salsa de ajo'
WHERE id = 2;  -- Árabe Simple Carne

UPDATE productos SET descripcion = 'Carne, cheddar, verduras + salsa de ajo'
WHERE id = 3;  -- Arabe Especial Carne

UPDATE productos SET descripcion = 'Pollo, cheddar, verduras + salsa de ajo'
WHERE id = 4;  -- Arabe Especial Pollo

UPDATE productos SET descripcion = 'Carne, pollo, jamón, queso, verduras + salsa de ajo'
WHERE id = 5;  -- Arabe Mixto

UPDATE productos SET descripcion = 'Carne burguer, jamón, queso, verduras + salsa de ajo'
WHERE id = 6;  -- LomiBurguer Simple

UPDATE productos SET descripcion = 'Verduras, jamón, queso, 2 huevos, carne burguer + salsa de ajo'
WHERE id = 7;  -- LomiBurguer Completo

UPDATE productos SET descripcion = 'Carne, jamón, queso, verduras + salsa de ajo'
WHERE id = 8;  -- Arabe De Remolacha Carne

UPDATE productos SET descripcion = 'Pollo, jamón, queso, verduras + salsa de ajo'
WHERE id = 9;  -- Arabe De Remolacha Pollo

-- Verificación: estas nueve filas deben quedar sin "g", "kg" ni "gramos".
SELECT id, nombre, descripcion
FROM productos
WHERE id BETWEEN 1 AND 9
ORDER BY id;
