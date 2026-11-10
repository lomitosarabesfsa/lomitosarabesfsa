// ============================================================
//  Tests de la cadena de migraciones (sin tocar wrangler)
//  Ejecutar: npx vitest run test/migraciones.test.js
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  REQUERIDOS,
  calcularPendientes,
  diferenciasChecksum,
  leerMigraciones,
  sqlVerificacion,
  validarCadena,
} from '../scripts/migrar.mjs';

describe('cadena de migraciones real', () => {
  const migraciones = leerMigraciones();

  it('arranca en 0001 y no tiene huecos ni versiones repetidas', () => {
    expect(migraciones.length).toBeGreaterThan(0);
    expect(validarCadena(migraciones)).toEqual([]);
    expect(new Set(migraciones.map(m => m.version)).size).toBe(migraciones.length);
  });

  it('todas tienen SQL propio', () => {
    for (const m of migraciones) expect(m.sql.trim().length).toBeGreaterThan(40);
  });

  it('los nombres son seguros para registrarlos en SQL', () => {
    for (const m of migraciones) expect(m.nombre).toMatch(/^[a-z0-9_-]+$/);
  });
});

describe('validarCadena', () => {
  it('detecta un hueco', () => {
    const errores = validarCadena([{ version: '0001', nombre: 'a' }, { version: '0003', nombre: 'c' }]);
    expect(errores).toHaveLength(1);
    expect(errores[0]).toContain('0002');
  });

  it('detecta una cadena que no arranca en 0001', () => {
    expect(validarCadena([{ version: '0002', nombre: 'b' }])).toHaveLength(1);
  });
});

describe('calcularPendientes', () => {
  const migraciones = [
    { version: '0001', nombre: 'a', checksum: 'x' },
    { version: '0002', nombre: 'b', checksum: 'y' },
  ];

  it('devuelve todo si no hay registro', () => {
    expect(calcularPendientes(migraciones, []).map(m => m.version)).toEqual(['0001', '0002']);
  });

  it('no devuelve nada si está todo aplicado', () => {
    expect(calcularPendientes(migraciones, migraciones)).toEqual([]);
  });

  it('devuelve solo la que falta', () => {
    expect(calcularPendientes(migraciones, [migraciones[0]]).map(m => m.version)).toEqual(['0002']);
  });
});

describe('diferenciasChecksum', () => {
  it('detecta una migración editada después de aplicada', () => {
    const migraciones = [{ version: '0001', nombre: 'a', checksum: 'nuevo' }];
    expect(diferenciasChecksum(migraciones, [{ version: '0001', checksum: 'viejo' }]))
      .toEqual([{ version: '0001', nombre: 'a' }]);
  });

  it('no marca nada si el checksum coincide', () => {
    const migraciones = [{ version: '0001', nombre: 'a', checksum: 'igual' }];
    expect(diferenciasChecksum(migraciones, [{ version: '0001', checksum: 'igual' }])).toEqual([]);
  });
});

describe('sqlVerificacion', () => {
  const sql = sqlVerificacion();

  it('consulta cada tabla que usa el Worker', () => {
    for (const r of REQUERIDOS) expect(sql).toContain(`FROM ${r.tabla}`);
  });

  it('incluye las columnas de campaña de categorias', () => {
    expect(sql).toMatch(/SELECT[^;]*promocional[^;]*temporal[^;]*desde[^;]*hasta[^;]*FROM categorias/);
  });

  it('no usa LIMIT distinto de 0 (no trae datos en el deploy)', () => {
    for (const r of REQUERIDOS) expect(sql).toContain(`FROM ${r.tabla} LIMIT 0;`);
  });
});
