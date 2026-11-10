#!/usr/bin/env node
// ============================================================
//  Migraciones versionadas de D1 (lomitos-api)
//
//  Contrato:
//   · Cada archivo `migrations/NNNN_nombre.sql` se aplica UNA vez, en orden.
//   · Lo aplicado queda en `schema_migrations` con su checksum, así se
//     detecta una migración editada después de aplicada.
//   · `check` no se conforma con el registro: consulta la base real y falla
//     si falta una tabla o una columna que el Worker usa. Es el gate del
//     deploy (workflow "Deploy Worker").
//
//  Uso:
//    node scripts/migrar.mjs status   [--local|--remote] [--db nombre] [--config archivo]
//    node scripts/migrar.mjs apply    [...]
//    node scripts/migrar.mjs check    [...]
//    node scripts/migrar.mjs baseline [--hasta 0004] [...]
//
//  `--local` es el destino por defecto, a propósito: nada toca la base
//  remota sin escribir `--remote`.
//
//  Códigos de salida: 0 ok · 1 falta esquema o migración · 2 error de uso/ejecución
// ============================================================

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_MIGRACIONES = join(ADMIN, 'migrations');
const DIR_TMP = join(ADMIN, '.tmp-migraciones');
const LEDGER = 'schema_migrations';
const DB_POR_DEFECTO = 'lomitos-db';
const PATRON_ARCHIVO = /^(\d{4})_([a-z0-9_-]+)\.sql$/;
const ES_WINDOWS = process.platform === 'win32';

// Columnas y tablas que el Worker y el panel consultan de verdad. Si alguna
// falta, el código revienta en runtime: mejor que reviente acá.
export const REQUERIDOS = [
  { tabla: 'categorias', columnas: ['id', 'nombre', 'icono', 'orden', 'promocional', 'temporal', 'desde', 'hasta'] },
  { tabla: 'productos', columnas: ['id', 'categoria_id', 'nombre', 'descripcion', 'precio', 'stock', 'imagen', 'activo', 'orden'] },
  { tabla: 'promos', columnas: ['id', 'activa', 'icono', 'texto', 'descripcion'] },
  { tabla: 'config', columnas: ['clave', 'valor'] },
  { tabla: 'modifier_groups', columnas: ['id', 'producto_id', 'categoria_id', 'nombre', 'selection_type', 'required', 'min_seleccion', 'max_seleccion', 'orden', 'activo'] },
  { tabla: 'modifier_options', columnas: ['id', 'group_id', 'nombre', 'price_delta', 'orden', 'activo'] },
  { tabla: 'rate_limits', columnas: ['id', 'key', 'timestamp'] },
  { tabla: 'revoked_tokens', columnas: ['token_hash', 'revoked_at'] },
];

const SQL_LEDGER = `CREATE TABLE IF NOT EXISTS ${LEDGER} (
  version TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  checksum TEXT NOT NULL,
  aplicada_en TEXT NOT NULL,
  baseline INTEGER NOT NULL DEFAULT 0
);`;

// ============================================================
//  Lógica pura (testeable sin wrangler)
// ============================================================

function sha256(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

export function leerMigraciones(dir = DIR_MIGRACIONES) {
  if (!existsSync(dir)) throw new Error(`No existe el directorio de migraciones: ${dir}`);

  const archivos = readdirSync(dir).filter(f => PATRON_ARCHIVO.test(f)).sort();
  const versiones = new Set();

  const migraciones = archivos.map(archivo => {
    const [, version, nombre] = PATRON_ARCHIVO.exec(archivo);
    if (versiones.has(version)) throw new Error(`Versión duplicada ${version} (${archivo})`);
    versiones.add(version);
    const sql = readFileSync(join(dir, archivo), 'utf8');
    return { version, nombre, archivo, sql, checksum: sha256(sql) };
  });

  return migraciones.sort((a, b) => a.version.localeCompare(b.version));
}

// La cadena tiene que arrancar en 0001 y no saltear números: un hueco significa
// que se borró un archivo que alguna base ya podría tener aplicado.
export function validarCadena(migraciones) {
  const errores = [];
  migraciones.forEach((m, i) => {
    const esperada = String(i + 1).padStart(4, '0');
    if (m.version !== esperada) {
      errores.push(`se esperaba la versión ${esperada} en la posición ${i + 1} y hay ${m.version} (${m.archivo || m.nombre})`);
    }
  });
  return errores;
}

export function calcularPendientes(migraciones, aplicadas) {
  const registradas = new Set((aplicadas || []).map(a => a.version));
  return migraciones.filter(m => !registradas.has(m.version));
}

export function diferenciasChecksum(migraciones, aplicadas) {
  const porVersion = new Map((aplicadas || []).map(a => [a.version, a]));
  return migraciones
    .filter(m => {
      const reg = porVersion.get(m.version);
      return reg && reg.checksum && reg.checksum !== m.checksum;
    })
    .map(m => ({ version: m.version, nombre: m.nombre }));
}

export function sqlVerificacion() {
  return REQUERIDOS
    .map(r => `-- ${r.tabla}\nSELECT ${r.columnas.join(', ')} FROM ${r.tabla} LIMIT 0;`)
    .join('\n\n');
}

// ============================================================
//  wrangler
// ============================================================

function comandoWrangler() {
  const bin = join(ADMIN, 'node_modules', '.bin', ES_WINDOWS ? 'wrangler.cmd' : 'wrangler');
  // Se cita porque la ruta del proyecto puede tener espacios.
  return existsSync(bin) ? `"${bin}"` : 'npx --yes wrangler';
}

function parsearJSON(texto) {
  const ini = texto.indexOf('[');
  const fin = texto.lastIndexOf(']');
  if (ini === -1 || fin <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fin + 1)); } catch { return null; }
}

function limpiarError(texto) {
  const limpio = String(texto).replace(/\x1b\[[0-9;]*m/g, '');

  // Con --json, wrangler imprime el error como objeto: se muestra el texto
  // útil en vez del volcado crudo.
  const conTexto = /"(?:text|message)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(limpio);
  if (conTexto) return String(conTexto[1]).replace(/\\"/g, '"').slice(0, 1500);

  const lineas = limpio.split('\n').map(l => l.trim()).filter(Boolean);
  const utiles = lineas.filter(l => !/^[▲✘]/.test(l));
  return (utiles.slice(-8).join('\n') || limpio.trim()).slice(0, 1500);
}

function correr(args) {
  const orden = `${comandoWrangler()} ${args.join(' ')}`;
  const r = spawnSync(orden, {
    cwd: ADMIN,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  const ok = r.status === 0;
  return {
    ok,
    status: r.status,
    json: ok ? parsearJSON(stdout) : null,
    error: ok ? null : limpiarError(`${stdout}\n${stderr}`),
  };
}

function ejecutarSql(sql, op) {
  mkdirSync(DIR_TMP, { recursive: true });
  const nombre = `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.sql`;
  writeFileSync(join(DIR_TMP, nombre), sql, 'utf8');

  const args = ['d1', 'execute', op.db, op.remote ? '--remote' : '--local', '--json', '--file', `.tmp-migraciones/${nombre}`];
  if (op.config) args.push('--config', op.config);

  const r = correr(args);
  rmSync(join(DIR_TMP, nombre), { force: true });
  return r;
}

function filas(resultado) {
  if (!Array.isArray(resultado.json) || !resultado.json.length) return [];
  const ultimo = resultado.json[resultado.json.length - 1];
  return ultimo && Array.isArray(ultimo.results) ? ultimo.results : [];
}

function leerLedger(op) {
  const r = ejecutarSql(`SELECT version, nombre, checksum, aplicada_en, baseline FROM ${LEDGER} ORDER BY version;`, op);
  if (r.ok) return filas(r);
  if (/no such table/i.test(r.error || '')) return null;
  throw new Error(`No pude leer ${LEDGER}:\n${r.error}`);
}

function prepararLedger(op) {
  const r = ejecutarSql(SQL_LEDGER, op);
  if (!r.ok) throw new Error(`No pude crear ${LEDGER}:\n${r.error}`);
}

function registrar(op, migracion, esBaseline) {
  const r = ejecutarSql(
    `INSERT OR REPLACE INTO ${LEDGER} (version, nombre, checksum, aplicada_en, baseline) ` +
    `VALUES ('${migracion.version}', '${migracion.nombre}', '${migracion.checksum}', '${new Date().toISOString()}', ${esBaseline ? 1 : 0});`,
    op
  );
  if (!r.ok) throw new Error(`No pude registrar ${migracion.version}:\n${r.error}`);
}

function verificarEsquema(op) {
  return ejecutarSql(sqlVerificacion(), op);
}

// ============================================================
//  Comandos
// ============================================================

function etiqueta(op) {
  return `${op.remote ? 'REMOTO' : 'local'}:${op.db}`;
}

function comandoStatus(op) {
  const migraciones = leerMigraciones();
  const problemas = validarCadena(migraciones);
  const ledger = leerLedger(op);
  const aplicadas = ledger || [];
  const pendientes = calcularPendientes(migraciones, aplicadas);
  const editadas = diferenciasChecksum(migraciones, aplicadas);
  const porVersion = new Map(aplicadas.map(a => [a.version, a]));

  console.log(`Migraciones (${etiqueta(op)}) — ${migraciones.length} archivo(s):`);
  for (const m of migraciones) {
    const reg = porVersion.get(m.version);
    const estado = !reg ? 'PENDIENTE' : (reg.baseline ? 'baseline' : 'aplicada');
    console.log(`  ${estado.padEnd(9)} ${m.version}  ${m.nombre}${reg ? `  ${reg.aplicada_en}` : ''}`);
  }

  if (ledger === null) console.log(`\n  La base no tiene ${LEDGER}: no hay registro de migraciones.`);

  if (problemas.length) {
    console.log('\n  ✗ Cadena inválida:');
    problemas.forEach(p => console.log(`    · ${p}`));
  }
  if (editadas.length) {
    console.log('\n  ✗ Migraciones editadas después de aplicadas:');
    editadas.forEach(e => console.log(`    · ${e.version} ${e.nombre}`));
  }

  const esquema = verificarEsquema(op);
  if (esquema.ok) {
    console.log(`\n  ✓ Esquema completo (${REQUERIDOS.length} tablas verificadas).`);
  } else {
    console.log(`\n  ✗ La base no tiene el esquema que el Worker espera:`);
    console.log(`    ${(esquema.error || '').split('\n').join('\n    ')}`);
  }

  console.log(`\n  Pendientes: ${pendientes.length}`);
  return 0;
}

function comandoCheck(op) {
  const migraciones = leerMigraciones();
  const problemas = validarCadena(migraciones);
  if (problemas.length) {
    console.error('✗ Cadena de migraciones inválida:');
    problemas.forEach(p => console.error(`  · ${p}`));
    return 2;
  }

  const ledger = leerLedger(op);
  if (ledger === null) {
    console.error(`✗ La base ${etiqueta(op)} no tiene la tabla ${LEDGER}.`);
    console.error('  Base existente que ya tiene el esquema:  node scripts/migrar.mjs baseline --remote');
    console.error('  Base nueva:                             node scripts/migrar.mjs apply --remote');
    return 1;
  }

  const editadas = diferenciasChecksum(migraciones, ledger);
  if (editadas.length) {
    console.error('✗ Hay migraciones ya aplicadas que fueron editadas (el checksum no coincide):');
    editadas.forEach(e => console.error(`  · ${e.version} ${e.nombre}`));
    console.error('  Una migración aplicada es inmutable: creá una nueva para el cambio.');
    return 1;
  }

  const pendientes = calcularPendientes(migraciones, ledger);
  if (pendientes.length) {
    console.error(`✗ Faltan ${pendientes.length} migración(es) en ${etiqueta(op)}:`);
    pendientes.forEach(m => console.error(`  · ${m.version} ${m.nombre}`));
    console.error('  Aplicalas antes de deployar: node scripts/migrar.mjs apply --remote');
    return 1;
  }

  const esquema = verificarEsquema(op);
  if (!esquema.ok) {
    console.error(`✗ El registro dice al día, pero el esquema de ${etiqueta(op)} no lo está:`);
    console.error(`  ${(esquema.error || '').split('\n').join('\n  ')}`);
    return 1;
  }

  console.log(`✓ Esquema OK en ${etiqueta(op)}: ${migraciones.length} migraciones aplicadas, ${REQUERIDOS.length} tablas verificadas.`);
  return 0;
}

function comandoApply(op) {
  const migraciones = leerMigraciones();
  const problemas = validarCadena(migraciones);
  if (problemas.length) {
    console.error('✗ Cadena de migraciones inválida:');
    problemas.forEach(p => console.error(`  · ${p}`));
    return 2;
  }

  prepararLedger(op);
  const pendientes = calcularPendientes(migraciones, leerLedger(op) || []);

  if (!pendientes.length) console.log(`Sin migraciones pendientes en ${etiqueta(op)}.`);

  for (const m of pendientes) {
    console.log(`→ Aplicando ${m.version} ${m.nombre}`);
    const r = ejecutarSql(m.sql, op);
    if (!r.ok) {
      console.error(`✗ Falló ${m.version} ${m.nombre}:`);
      console.error(`  ${(r.error || '').split('\n').join('\n  ')}`);
      console.error('  No se registró: se puede corregir el archivo y volver a intentar.');
      return 2;
    }
    registrar(op, m, false);
    console.log(`  OK ${m.version}`);
  }

  const esquema = verificarEsquema(op);
  if (!esquema.ok) {
    console.error(`✗ ${etiqueta(op)} quedó con un esquema incompleto:`);
    console.error(`  ${(esquema.error || '').split('\n').join('\n  ')}`);
    return 2;
  }

  console.log(`✓ ${etiqueta(op)} al día: ${migraciones.length} migraciones.`);
  return 0;
}

function comandoBaseline(op) {
  const migraciones = leerMigraciones();
  const problemas = validarCadena(migraciones);
  if (problemas.length) {
    console.error('✗ Cadena de migraciones inválida:');
    problemas.forEach(p => console.error(`  · ${p}`));
    return 2;
  }

  // Adoptar una base solo tiene sentido si YA tiene el esquema actual.
  const esquema = verificarEsquema(op);
  if (!esquema.ok) {
    console.error(`✗ ${etiqueta(op)} no tiene el esquema actual: no se puede adoptar como baseline.`);
    console.error(`  ${(esquema.error || '').split('\n').join('\n  ')}`);
    console.error('  Si la base es nueva, creala con: node scripts/migrar.mjs apply');
    return 2;
  }

  prepararLedger(op);
  const registradas = new Set((leerLedger(op) || []).map(l => l.version));
  const hasta = op.hasta || migraciones[migraciones.length - 1].version;
  const adoptar = migraciones.filter(m => m.version <= hasta && !registradas.has(m.version));

  for (const m of adoptar) {
    registrar(op, m, true);
    console.log(`  baseline ${m.version} ${m.nombre}`);
  }

  console.log(`✓ ${adoptar.length} migración(es) registradas como aplicadas en ${etiqueta(op)}.`);
  return 0;
}

// ============================================================
//  CLI
// ============================================================

const COMANDOS = {
  status: comandoStatus,
  apply: comandoApply,
  check: comandoCheck,
  baseline: comandoBaseline,
};

function leerArgs(argv) {
  const primero = argv[0];
  if (!primero || !COMANDOS[primero]) {
    throw new Error(`Comando desconocido: ${primero || '(ninguno)'}\nUsá: ${Object.keys(COMANDOS).join(' | ')}`);
  }

  const op = { comando: primero, remote: false, db: DB_POR_DEFECTO, config: null, hasta: null };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--remote') op.remote = true;
    else if (arg === '--local') op.remote = false;
    else if (arg === '--db') op.db = argv[++i];
    else if (arg === '--config') op.config = argv[++i];
    else if (arg === '--hasta') op.hasta = argv[++i];
    else throw new Error(`Argumento desconocido: ${arg}`);
  }

  // Estos valores viajan por shell: nada de espacios ni metacaracteres.
  if (!/^[A-Za-z0-9._-]+$/.test(op.db || '')) throw new Error(`Nombre de base inválido: ${op.db}`);
  if (op.config && !/^[A-Za-z0-9._/-]+$/.test(op.config)) throw new Error(`Ruta de config inválida: ${op.config}`);
  if (op.hasta && !/^\d{4}$/.test(op.hasta)) throw new Error(`--hasta espera una versión de 4 dígitos (ej 0004): ${op.hasta}`);

  return op;
}

function main() {
  let op;
  try {
    op = leerArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }

  try {
    return COMANDOS[op.comando](op);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 2;
  }
}

// Solo ejecuta si se lo invoca como script (los tests lo importan).
const ejecutadoDirecto = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (ejecutadoDirecto) process.exitCode = main();
