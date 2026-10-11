// ============================================================
//  Tests E2E — LOMITOS ÁRABES FSA — API Worker
//  Ejecutar con: cd admin && npm run test:e2e
//
//  El server se arranca/para automáticamente via globalSetup.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;

async function api(path, method = 'GET', body = null, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    signal: AbortSignal.timeout(10000),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: Object.fromEntries(res.headers) };
}

// ============================================================
//  GET /api/menu — Menú público
// ============================================================
describe('E2E: GET /api/menu', () => {
  it('debería retornar el menú con categorías', async () => {
    const { status, data } = await api('/api/menu');
    expect(status).toBe(200);
    expect(data).toHaveProperty('categorias');
    expect(data).toHaveProperty('promos');
    expect(data).toHaveProperty('config');
    expect(Array.isArray(data.categorias)).toBe(true);
  });

  it('debería incluir productos activos', async () => {
    const { status, data } = await api('/api/menu');
    expect(status).toBe(200);
    const totalProductos = data.categorias.reduce((sum, c) => sum + c.productos.length, 0);
    expect(totalProductos).toBeGreaterThanOrEqual(0);
  });

  it('debería retornar config con horarios', async () => {
    const { status, data } = await api('/api/menu');
    expect(status).toBe(200);
    expect(data.config).toBeDefined();
  });
});

// ============================================================
//  POST /api/login — Autenticación
// ============================================================
describe('E2E: POST /api/login', () => {
  it('debería retornar token con credenciales válidas', async () => {
    const { status, data } = await api('/api/login', 'POST', {
      usuario: 'testadmin', clave: 'testpass123',
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.token).toMatch(/^[\w-]+\.[\w-]+$/);
  });

  it('debería rechazar credenciales incorrectas', async () => {
    const { status, data } = await api('/api/login', 'POST', {
      usuario: 'testadmin', clave: 'wrongpass',
    });
    expect(status).toBe(401);
    expect(data.error).toBeDefined();
  });

  it('debería rechazar body vacío', async () => {
    const { status } = await api('/api/login', 'POST', {});
    expect(status).toBe(401);
  });
});

// ============================================================
//  CRUD Productos
// ============================================================
describe('E2E: CRUD Productos', () => {
  let token;
  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería listar productos', async () => {
    const { status, data } = await api('/api/admin/productos', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('debería crear un producto', async () => {
    const { status, data } = await api('/api/admin/productos', 'POST', {
      categoria_id: 1, nombre: 'E2E Product', precio: 12000, stock: 5,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.id).toBeDefined();
  });

  it('debería rechazar producto sin nombre', async () => {
    const { status, data } = await api('/api/admin/productos', 'POST', {
      categoria_id: 1, precio: 12000,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(400);
    expect(data.error).toContain('nombre');
  });

  it('debería rechazar precio negativo', async () => {
    const { status } = await api('/api/admin/productos', 'POST', {
      categoria_id: 1, nombre: 'Test', precio: -100,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(400);
  });

  it('debería rechazar sin categoría', async () => {
    const { status } = await api('/api/admin/productos', 'POST', {
      nombre: 'Test', precio: 10000,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(400);
  });

  it('debería actualizar un producto', async () => {
    const { data: created } = await api('/api/admin/productos', 'POST', {
      categoria_id: 1, nombre: 'To Update', precio: 10000,
    }, { Authorization: `Bearer ${token}` });
    const { status, data } = await api(`/api/admin/productos/${created.id}`, 'PUT', {
      categoria_id: 1, nombre: 'Updated', precio: 15000, stock: 20,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('debería eliminar un producto', async () => {
    const { data: created } = await api('/api/admin/productos', 'POST', {
      categoria_id: 1, nombre: 'To Delete', precio: 5000,
    }, { Authorization: `Bearer ${token}` });
    const { status, data } = await api(`/api/admin/productos/${created.id}`, 'DELETE', null, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('debería rechazar sin token', async () => {
    const { status } = await api('/api/admin/productos');
    expect(status).toBe(401);
  });

  it('debería rechazar token inválido', async () => {
    const { status } = await api('/api/admin/productos', 'GET', null, {
      Authorization: 'Bearer invalid.token.here',
    });
    expect(status).toBe(401);
  });
});

// ============================================================
//  CRUD Categorías
// ============================================================
describe('E2E: CRUD Categorías', () => {
  let token;
  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería listar categorías', async () => {
    const { status, data } = await api('/api/admin/categorias', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('debería crear una categoría', async () => {
    const { status, data } = await api('/api/admin/categorias', 'POST', {
      nombre: 'E2E Cat', icono: '🌮',
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
  });

  it('debería rechazar categoría sin nombre', async () => {
    const { status } = await api('/api/admin/categorias', 'POST', { icono: '🌮' }, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(400);
  });

  it('debería eliminar una categoría', async () => {
    const { data: created } = await api('/api/admin/categorias', 'POST', {
      nombre: 'To Delete Cat',
    }, { Authorization: `Bearer ${token}` });
    const { status, data } = await api(`/api/admin/categorias/${created.id}`, 'DELETE', null, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ============================================================
//  Orden de categorías: corrimiento automático + reordenamiento
//  (contra SQLite real, que es donde se nota el empate de orden)
// ============================================================
describe('E2E: orden de categorías', () => {
  let token;

  const listar = async () => {
    const { data } = await api('/api/admin/categorias', 'GET', null, { Authorization: `Bearer ${token}` });
    return data.map(c => ({ id: c.id, nombre: c.nombre, orden: c.orden }));
  };

  const contiguo = (lista) => lista.map((_, i) => i + 1);

  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería correr el resto cuando se crea con orden 1', async () => {
    const antes = await listar();

    const { data: nueva } = await api('/api/admin/categorias', 'POST', {
      nombre: 'Primera Ahora', orden: 1,
    }, { Authorization: `Bearer ${token}` });

    const despues = await listar();
    // La nueva entra primera...
    expect(despues[0].id).toBe(nueva.id);
    // ...y las que estaban corren un lugar: órdenes 1..N sin huecos ni empates
    expect(despues.map(c => c.orden)).toEqual(contiguo(despues));
    // Nadie se perdió y el orden relativo anterior se mantiene intacto
    expect(despues.map(c => c.id).filter(id => id !== nueva.id)).toEqual(antes.map(c => c.id));
  });

  it('debería mover una categoría al final sin dejar empates', async () => {
    const antes = await listar();
    const primera = antes[0];
    const { status } = await api(`/api/admin/categorias/${primera.id}`, 'PUT', {
      nombre: primera.nombre, icono: '', orden: antes.length,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(200);

    const despues = await listar();
    expect(despues[despues.length - 1].id).toBe(primera.id);
    expect(despues.map(c => c.id)).toEqual([...antes.slice(1).map(c => c.id), primera.id]);
    expect(despues.map(c => c.orden)).toEqual(contiguo(despues));
  });

  it('debería reordenar en bloque (arrastrar y soltar)', async () => {
    const antes = await listar();
    const invertido = [...antes].reverse().map(c => c.id);

    const { status } = await api('/api/admin/categorias/orden', 'PUT', { ids: invertido }, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);

    const despues = await listar();
    expect(despues.map(c => c.id)).toEqual(invertido);
    expect(despues.map(c => c.orden)).toEqual(contiguo(despues));

    // Y el menú público respeta ese orden
    const { data: menu } = await api('/api/menu');
    const nombres = menu.categorias.map(c => c.nombre);
    const { data: admin } = await api('/api/admin/categorias', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(nombres).toEqual(admin.map(c => c.nombre));
  });

  it('debería rechazar una lista de orden incompleta', async () => {
    const antes = await listar();
    const { status, data } = await api('/api/admin/categorias/orden', 'PUT', {
      ids: [antes[0].id],
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(409);
    expect(data.error).toContain('no coincide');
    // Y no se tocó nada
    expect((await listar()).map(c => c.id)).toEqual(antes.map(c => c.id));
  });

  it('debería exigir token para reordenar', async () => {
    const antes = await listar();
    const { status } = await api('/api/admin/categorias/orden', 'PUT', { ids: [...antes].reverse().map(c => c.id) });
    expect(status).toBe(401);
  });
});

// ============================================================
//  Categorías de campaña: promocional + vigencia temporal
// ============================================================
describe('E2E: categorías temporales', () => {
  let token;
  // Hora de Formosa (UTC-3) en ISO con offset: es el formato que guarda la API
  const enHora = (h) => new Date(Date.now() + h * 3600000 - 3 * 3600000).toISOString().slice(0, 19) + '-03:00';
  const enSegundos = (s) => new Date(Date.now() + s * 1000 - 3 * 3600000).toISOString().slice(0, 19) + '-03:00';

  const crear = async (body) => {
    const { status, data } = await api('/api/admin/categorias', 'POST', body, { Authorization: `Bearer ${token}` });
    return { status, data };
  };
  const enMenu = async (nombre) => {
    const { data } = await api('/api/menu');
    return data.categorias.find(c => c.nombre === nombre) || null;
  };

  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería exponer los metadatos de campaña en el menú público', async () => {
    const { status } = await crear({
      nombre: 'Caja Día de la Madre', icono: '💐', promocional: 1,
      temporal: 1, desde: enHora(-2), hasta: enHora(48),
    });
    expect(status).toBe(201);

    const cat = await enMenu('Caja Día de la Madre');
    expect(cat).not.toBeNull();
    expect(cat.promocional).toBe(1);
    expect(cat.temporal).toBe(1);
    expect(cat.hasta).toContain('-03:00');
  });

  it('debería ocultar del menú una categoría ya vencida', async () => {
    const { status } = await crear({
      nombre: 'Promo Vencida', temporal: 1, desde: enHora(-48), hasta: enHora(-1),
    });
    expect(status).toBe(201);
    // La API la devuelve (la API admin existe para poder arreglarla)...
    const { data: admin } = await api('/api/admin/categorias', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(admin.find(c => c.nombre === 'Promo Vencida')).toBeTruthy();
    // ...pero no se publica ni con el reloj de la API ni con el del visitante
    expect(await enMenu('Promo Vencida')).toBeNull();
    expect(admin.find(c => c.nombre === 'Promo Vencida').vigente).toBe(0);
  });

  it('debería ocultar del menú una categoría programada a futuro', async () => {
    const { status } = await crear({
      nombre: 'Promo Programada', temporal: 1, desde: enHora(24), hasta: enHora(72),
    });
    expect(status).toBe(201);
    expect(await enMenu('Promo Programada')).toBeNull();
  });

  it('debería rechazar una temporal sin fecha de fin', async () => {
    const { status, data } = await crear({ nombre: 'Temporal Sin Fin', temporal: 1 });
    expect(status).toBe(400);
    expect(data.error).toContain('fecha de fin');
  });

  it('debería rechazar un fin anterior al inicio', async () => {
    const { status, data } = await crear({
      nombre: 'Vigencia Invertida', temporal: 1, desde: enHora(10), hasta: enHora(2),
    });
    expect(status).toBe(400);
    expect(data.error).toContain('posterior');
  });

  it('debería rechazar una fecha ilegible', async () => {
    const { status, data } = await crear({
      nombre: 'Fecha Mala', temporal: 1, hasta: 'mañana a la noche',
    });
    expect(status).toBe(400);
    expect(data.error).toContain('no es una fecha válida');
  });

  it('debería dejar de mostrarla en cuanto vence', async () => {
    const { data: creada } = await crear({
      nombre: 'Caja Que Vence Ya', temporal: 1, promocional: 1, desde: enHora(-1), hasta: enSegundos(7),
    });
    expect(await enMenu('Caja Que Vence Ya')).not.toBeNull();
    await new Promise(r => setTimeout(r, 9000));
    expect(await enMenu('Caja Que Vence Ya')).toBeNull();
    // Sin una mano encima, la categoría vencida sale sola del menú público
    const { data: admin } = await api('/api/admin/categorias', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(admin.find(c => c.nombre === 'Caja Que Vence Ya').vigente).toBe(0);
    // Se limpia para no ensuciar al resto de la suite
    await api(`/api/admin/categorias/${creada.id}`, 'DELETE', null, { Authorization: `Bearer ${token}` });
  }, 20000);
});

// ============================================================
//  Modifier Groups
// ============================================================
describe('E2E: Modifier Groups', () => {
  let token;
  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería listar modifier groups', async () => {
    const { status, data } = await api('/api/admin/modifier-groups', 'GET', null, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it('debería crear un modifier group', async () => {
    const { status, data } = await api('/api/admin/modifier-groups', 'POST', {
      nombre: 'Salsas E2E', selection_type: 'multiple', categoria_id: 1,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(201);
    expect(data.ok).toBe(true);
  });

  it('debería rechazar group sin nombre', async () => {
    const { status } = await api('/api/admin/modifier-groups', 'POST', {
      selection_type: 'multiple', categoria_id: 1,
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(400);
  });

  it('debería rechazar group sin producto ni categoría', async () => {
    const { status } = await api('/api/admin/modifier-groups', 'POST', {
      nombre: 'Test', selection_type: 'multiple',
    }, { Authorization: `Bearer ${token}` });
    expect(status).toBe(400);
  });

  it('debería crear y eliminar modifier option', async () => {
    const { data: group } = await api('/api/admin/modifier-groups', 'POST', {
      nombre: 'Options Test', selection_type: 'single', categoria_id: 1,
    }, { Authorization: `Bearer ${token}` });
    const { status: s1, data: opt } = await api('/api/admin/modifier-options', 'POST', {
      group_id: group.id, nombre: 'Option 1', price_delta: 500,
    }, { Authorization: `Bearer ${token}` });
    expect(s1).toBe(201);
    const { status: s2 } = await api(`/api/admin/modifier-options/${opt.id}`, 'DELETE', null, {
      Authorization: `Bearer ${token}`,
    });
    expect(s2).toBe(200);
  });
});

// ============================================================
//  Promos
// ============================================================
describe('E2E: Promos', () => {
  let token;
  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería guardar y leer promos', async () => {
    const promos = [
      { activa: true, icono: '🔥', texto: '2x1 Test', descripcion: 'Promo E2E' },
      { activa: false, icono: '⭐', texto: 'Inactive', descripcion: '' },
    ];
    const { status } = await api('/api/admin/promos', 'PUT', { promos }, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    const { data } = await api('/api/admin/promos', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(data.length).toBe(2);
    expect(data[0].texto).toBe('2x1 Test');
    expect(data[0].activa).toBe(1);
  });
});

// ============================================================
//  Config
// ============================================================
describe('E2E: Config', () => {
  let token;
  beforeAll(async () => {
    const { data } = await api('/api/login', 'POST', { usuario: 'testadmin', clave: 'testpass123' });
    token = data.token;
  });

  it('debería guardar y leer config', async () => {
    const { status } = await api('/api/admin/config', 'PUT', { whatsapp: '5493704218188' }, {
      Authorization: `Bearer ${token}`,
    });
    expect(status).toBe(200);
    const { data } = await api('/api/admin/config', 'GET', null, { Authorization: `Bearer ${token}` });
    expect(data.whatsapp).toBe('5493704218188');
  });
});

// ============================================================
//  Seguridad
// ============================================================
describe('E2E: Seguridad', () => {
  it('debería retornar headers de seguridad', async () => {
    const { headers } = await api('/api/menu');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('debería retornar 404 para rutas inexistentes', async () => {
    const { status } = await api('/api/noexiste');
    expect(status).toBe(404);
  });

  it('debería manejar OPTIONS (CORS preflight)', async () => {
    const res = await fetch(`${BASE}/api/menu`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://lomitosarabesfsa.pages.dev',
        'Access-Control-Request-Method': 'GET',
      },
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://lomitosarabesfsa.pages.dev');
  });
});

// ============================================================
//  CORS
// ============================================================
describe('E2E: CORS', () => {
  it('debería permitir origen del frontend', async () => {
    const { headers } = await api('/api/menu', 'GET', null, {
      Origin: 'https://lomitosarabesfsa.pages.dev',
    });
    expect(headers['access-control-allow-origin']).toBe('https://lomitosarabesfsa.pages.dev');
  });

  it('debería rechazar origen no permitido', async () => {
    const { headers } = await api('/api/menu', 'GET', null, {
      Origin: 'https://evil-site.com',
    });
    const acao = headers['access-control-allow-origin'];
    expect(acao).not.toBe('https://evil-site.com');
  });
});
