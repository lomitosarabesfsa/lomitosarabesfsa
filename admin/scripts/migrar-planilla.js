// Migración: Google Sheets (CSV) → seed.json para D1
// Uso: node scripts/migrar-planilla.js
// Salida: admin/seed.json (importable con wrangler d1 execute --file)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTkMtIXm-w68DtDh08FsPpvhAILmZ30cLIglpEYHscNeN9OHkOXVufQ1pJL5lenZLyMibWwxbZvTJpe/pub?output=csv";

// Mismo parser robusto que usa la web (RFC 4180)
function parsearCSV(csvText) {
  const filas = [];
  let filaActual = [], campoActual = '', dentroComillas = false;
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i], siguiente = csvText[i + 1];
    if (dentroComillas) {
      if (char === '"' && siguiente === '"') { campoActual += '"'; i++; }
      else if (char === '"') { dentroComillas = false; }
      else { campoActual += char; }
    } else {
      if (char === '"') { dentroComillas = true; }
      else if (char === ',') { filaActual.push(campoActual.trim()); campoActual = ''; }
      else if (char === '\n' || (char === '\r' && siguiente === '\n')) {
        filaActual.push(campoActual.trim());
        if (filaActual.some(c => c !== '')) filas.push(filaActual);
        filaActual = []; campoActual = '';
        if (char === '\r') i++;
      } else { campoActual += char; }
    }
  }
  filaActual.push(campoActual.trim());
  if (filaActual.some(c => c !== '')) filas.push(filaActual);
  return filas;
}

function parsearPrecio(raw) {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  s = s.replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  let num;
  if (s.includes(',') && s.includes('.')) {
    num = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
      : parseFloat(s.replace(/,/g, ''));
  } else if (s.includes(',')) {
    num = parseFloat(s.replace(',', '.'));
  } else if (s.includes('.')) {
    const partes = s.split('.');
    num = (partes.length === 2 && partes[1].length === 3) ? parseFloat(partes.join('')) : parseFloat(s);
  } else {
    num = parseFloat(s);
  }
  return isNaN(num) ? 0 : num;
}

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error('No se pudo descargar el CSV: HTTP ' + res.status);
const filas = parsearCSV(await res.text());
if (filas.length <= 1) throw new Error('La planilla está vacía');

const categorias = new Map(); // nombre → { icono, productos: [] }
for (let i = 1; i < filas.length; i++) {
  const v = filas[i];
  if (v.length < 4) continue;
  const cat = v[0] || 'Otros';
  if (!categorias.has(cat)) {
    categorias.set(cat, { icono: (v[5] && v[5].trim()) || '🍽️', productos: [] });
  }
  let stock = -1;
  if (v[4] !== undefined && v[4] !== '') {
    const parsed = parseInt(v[4], 10);
    if (!isNaN(parsed)) stock = parsed;
  }
  categorias.get(cat).productos.push({
    nombre: v[1] || 'Producto',
    descripcion: v[2] || '',
    precio: parsearPrecio(v[3]),
    stock,
    imagen: (v[6] && v[6].trim()) || '',
  });
}

// Generar SQL INSERT para seed
const lines = [];
let catId = 1, prodId = 1;
for (const [nombre, data] of categorias) {
  const icono = data.icono.replace(/'/g, "''");
  const nombreSql = nombre.replace(/'/g, "''");
  lines.push(`INSERT INTO categorias (id, nombre, icono, orden) VALUES (${catId}, '${nombreSql}', '${icono}', ${catId});`);
  for (const p of data.productos) {
    const n = p.nombre.replace(/'/g, "''");
    const d = p.descripcion.replace(/'/g, "''");
    const img = p.imagen.replace(/'/g, "''");
    lines.push(`INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (${prodId}, ${catId}, '${n}', '${d}', ${p.precio}, ${p.stock}, '${img}', 1, ${prodId});`);
    prodId++;
  }
  catId++;
}

const output = `-- Seed generado automáticamente desde la planilla de Google Sheets\n-- Uso: npx wrangler d1 execute lomitos-db --local --file=seed.json (o --remote)\n\n${lines.join('\n')}\n`;
writeFileSync(path.resolve(__dirname, '../seed.sql'), output);

console.log(`✅ Migración completa:`);
console.log(`   Categorías: ${categorias.size}`);
console.log(`   Productos:  ${prodId - 1}`);
console.log(`   Archivo:    admin/seed.sql`);
for (const [nombre, data] of categorias) {
  console.log(`   · ${nombre} (${data.productos.length} productos)`);
}
