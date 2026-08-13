-- Seed generado automáticamente desde la planilla de Google Sheets
-- Uso: npx wrangler d1 execute lomitos-db --local --file=seed.json (o --remote)

INSERT INTO categorias (id, nombre, icono, orden) VALUES (1, 'Lomitos', '🍽️', 1);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (1, 1, 'Árabe Simple Pollo', 'Jamon,Queso,200g De Pollo,180g De Verduras + Salsa De Ajo = Kg 850', 13000, -1, '', 1, 1);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (2, 1, 'Árabe Simple Carne', 'Jamon,Queso,200g De Carne,180g De Verduras + Salsa De Ajo = Kg 850', 15000, -1, '', 1, 2);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (3, 1, 'Arabe Especial Carne', '200g De Carne,Cheddar,200g De Verduras + Salsa De Ajo = Kg 900', 17000, -1, '', 1, 3);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (4, 1, 'Arabe Especial Pollo', '200g De Pollo,Cheddar,200g De Verduras + Salsa De Ajo = Kg 900', 17000, -1, '', 1, 4);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (5, 1, 'Arabe Mixto', '200g De Carne,200g De Pollo,Jamon,Queso,250g De Verduras + Salsa De Ajo = Kg 1400', 20000, -1, '', 1, 5);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (6, 1, 'LomiBurguer Simple', '220g De Carne Burguer,Jamon,Queso,180g De Verduras + Salsa De Ajo = Kg 800', 15000, -1, '', 1, 6);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (7, 1, 'LomiBurguer Completo', '180g De Verduras,Jamon,Queso,2Huevos,220g De Carne Bueguer + Salsa De Ajo = Kg 900', 18000, -1, '', 1, 7);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (8, 1, 'Arabe De Remolacha Carne', '200g De Carne,Jamon,Queso,180g De Verduras + Salsa De Ajo =Kg 850', 15000, -1, '', 1, 8);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (9, 1, 'Arabe De Remolacha Pollo', '200g De Pollo,Jamon,Queso,180g De Verduras + Salsa De Ajo = Kg 850', 13000, -1, '', 1, 9);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (2, 'Oportunidad Limitada', '🍽️', 2);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (10, 2, '3 Lomitos por $40.000', 'Simples Carne o Pollo, los Lunes, Martes y Miercoles .', 40000, -1, '', 1, 10);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (3, 'Bebidas', '🍽️', 3);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (11, 3, 'Coca 1 L', '', 3000, -1, '', 1, 11);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (12, 3, 'Sprite 1L', '', 3000, -1, '', 1, 12);
INSERT INTO categorias (id, nombre, icono, orden) VALUES (4, 'Aderezos', '🍽️', 4);
INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (13, 4, 'Salsita Ajo Extra', '', 2000, -1, '', 1, 13);
