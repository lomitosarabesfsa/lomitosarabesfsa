-- Seed generado automáticamente desde la planilla de Google Sheets
-- Uso: npx wrangler d1 execute lomitos-db --local --file=seed.json (o --remote)

INSERT INTO categorias (id, nombre, icono, orden) VALUES (1, 'Lomitos', '🌯', 1);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (1, 1, 'Árabe Simple Pollo', 'Jamón, queso, pollo, verduras + salsa de ajo', 13000, -1, '', 1, 1);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (2, 1, 'Árabe Simple Carne', 'Jamón, queso, carne, verduras + salsa de ajo', 15000, -1, '', 1, 2);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (3, 1, 'Arabe Especial Carne', 'Carne, cheddar, verduras + salsa de ajo', 17000, -1, '', 1, 3);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (4, 1, 'Arabe Especial Pollo', 'Pollo, cheddar, verduras + salsa de ajo', 17000, -1, '', 1, 4);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (5, 1, 'Arabe Mixto', 'Carne, pollo, jamón, queso, verduras + salsa de ajo', 20000, -1, '', 1, 5);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (6, 1, 'LomiBurguer Simple', 'Carne burguer, jamón, queso, verduras + salsa de ajo', 15000, -1, '', 1, 6);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (7, 1, 'LomiBurguer Completo', 'Verduras, jamón, queso, 2 huevos, carne burguer + salsa de ajo', 18000, -1, '', 1, 7);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (8, 1, 'Arabe De Remolacha Carne', 'Carne, jamón, queso, verduras + salsa de ajo', 15000, -1, '', 1, 8);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (9, 1, 'Arabe De Remolacha Pollo', 'Pollo, jamón, queso, verduras + salsa de ajo', 13000, -1, '', 1, 9);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (2, 'Oportunidad Limitada', '🔥', 2);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (10, 2, '3 Lomitos por $40.000', 'Simples Carne o Pollo, los Lunes, Martes y Miercoles .', 40000, -1, '', 1, 10);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (3, 'Bebidas', '🥤', 3);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (11, 3, 'Coca 1 L', '', 3000, -1, '', 1, 11);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (12, 3, 'Sprite 1L', '', 3000, -1, '', 1, 12);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (4, 'Aderezos', '🧄', 4);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (13, 4, 'Salsita Ajo Extra', '', 2000, -1, '', 1, 13);

-- Modifier Groups de ejemplo (el admin los edita desde el panel)
-- Grupo "Extras" para la categoría Lomitos (aplica a todos, selección múltiple)
INSERT INTO modifier_groups (id, producto_id, categoria_id, nombre, selection_type, required, min_seleccion, max_seleccion, orden, activo) VALUES (1, NULL, 1, 'Extras', 'multiple', 0, 0, 5, 1, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (1, 1, 'Bacon + Cheddar', 5000, 1, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (2, 1, 'Guacamole', 2500, 2, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (3, 1, 'Salsa de Ajo Extra', 1500, 3, 1);
-- Grupo "Salsa" para Lomitos (selección única)
INSERT INTO modifier_groups (id, producto_id, categoria_id, nombre, selection_type, required, min_seleccion, max_seleccion, orden, activo) VALUES (2, NULL, 1, 'Salsa', 'single', 0, 0, 1, 2, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (4, 2, 'Salsa de Ajo', 0, 1, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (5, 2, 'Salsa Picante', 0, 2, 1);
INSERT INTO modifier_options (id, group_id, nombre, price_delta, orden, activo) VALUES (6, 2, 'Salsa Rosada', 0, 3, 1);
