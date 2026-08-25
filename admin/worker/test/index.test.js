// ============================================================
//  Tests para LOMITOS ÁRABES FSA — API Worker
//  Ejecutar con: npx vitest run admin/worker/test/index.test.js
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';

// ---------- Mock de D1 ----------

function mockD1() {
  const tables = {
    categorias: [],
    productos: [],
    modifier_groups: [],
    modifier_options: [],
    promos: [],
    config: [],
    rate_limits: [],
  };

  let nextId = 100;

  const db = {
    prepare(sql) {
      const self = {
        _sql: sql,
        _params: [],
        bind(...params) {
          this._params = params;
          return this;
        },
        async run() {
          // Simular INSERT/UPDATE/DELETE
          if (sql.includes('INSERT INTO')) {
            const table = sql.match(/INSERT INTO (\w+)/)[1];
            const id = nextId++;
            return { meta: { last_row_id: id, changes: 1 } };
          }
          if (sql.includes('UPDATE')) {
            return { meta: { changes: 1 } };
          }
          if (sql.includes('DELETE')) {
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async all() {
          if (sql.includes('FROM categorias')) return { results: tables.categorias };
          if (sql.includes('FROM productos')) return { results: tables.productos };
          if (sql.includes('FROM modifier_groups')) return { results: tables.modifier_groups };
          if (sql.includes('FROM modifier_options')) return { results: tables.modifier_options };
          if (sql.includes('FROM promos')) return { results: tables.promos };
          if (sql.includes('FROM config')) return { results: tables.config };
          if (sql.includes('FROM rate_limits')) return { results: [] };
          return { results: [] };
        },
        async first() {
          const r = await this.all();
          return r.results[0] || null;
        },
      };
      return self;
    },
    async batch(stmts) {
      return stmts;
    },
    _tables: tables,
  };

  return db;
}

function mockR2() {
  return {
    _store: {},
    async put(key, body, opts) {
      this._store[key] = { body, opts };
    },
  };
}

// ---------- Helper ----------

async function makeRequest(path, method = 'GET', body = null, headers = {}) {
  const url = `https://lomitosarabesfsa.pages.dev${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  Object.assign(opts.headers, headers);
  return worker.fetch(new Request(url, opts), mockEnv(), {});
}

function mockEnv() {
  return {
    DB: mockD1(),
    IMAGENES: mockR2(),
    AUTH_SECRET: 'test-secret-123',
    ADMIN_USER: 'admin',
    ADMIN_PASS: 'testpass123',
    R2_PUBLIC_URL: 'https://pub-test.r2.dev',
  };
}

// ---------- Tests ----------

describe('GET /api/menu', () => {
  it('debería retornar el menú público', async () => {
    const res = await makeRequest('/api/menu');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('categorias');
    expect(data).toHaveProperty('promos');
    expect(data).toHaveProperty('config');
    expect(Array.isArray(data.categorias)).toBe(true);
  });

  it('debería manejar OPTIONS (preflight)', async () => {
    const res = await makeRequest('/api/menu', 'OPTIONS');
    expect(res.status).toBe(204);
  });
});

describe('POST /api/login', () => {
  it('debería retornar token con credenciales válidas', async () => {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'testpass123',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.token).toContain('.');
  });

  it('debería rechazar credenciales incorrectas', async () => {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'wrongpass',
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('incorrectos');
  });

  it('debería rechazar sin body', async () => {
    const res = await makeRequest('/api/login', 'POST', {});
    expect(res.status).toBe(401);
  });
});

describe('Autenticación', () => {
  async function getToken() {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'testpass123',
    });
    const data = await res.json();
    return data.token;
  }

  it('debería rechazar admin sin token', async () => {
    const res = await makeRequest('/api/admin/productos');
    expect(res.status).toBe(401);
  });

  it('debería aceptar admin con token válido', async () => {
    const token = await getToken();
    const res = await makeRequest('/api/admin/productos', 'GET', null, {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
  });

  it('debería rechazar token inválido', async () => {
    const res = await makeRequest('/api/admin/productos', 'GET', null, {
      Authorization: 'Bearer invalid.token.here',
    });
    expect(res.status).toBe(401);
  });
});

describe('CRUD Productos', () => {
  let token;

  beforeEach(async () => {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'testpass123',
    });
    const data = await res.json();
    token = data.token;
  });

  it('debería crear un producto con datos válidos', async () => {
    const res = await makeRequest('/api/admin/productos', 'POST', {
      categoria_id: 1,
      nombre: 'Test Lomito',
      descripcion: 'Un lomito de prueba',
      precio: 15000,
      stock: 10,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.id).toBeDefined();
  });

  it('debería rechazar producto sin nombre', async () => {
    const res = await makeRequest('/api/admin/productos', 'POST', {
      categoria_id: 1,
      precio: 15000,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('nombre');
  });

  it('debería rechazar producto sin categoría', async () => {
    const res = await makeRequest('/api/admin/productos', 'POST', {
      nombre: 'Test',
      precio: 15000,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });

  it('debería rechazar precio negativo', async () => {
    const res = await makeRequest('/api/admin/productos', 'POST', {
      categoria_id: 1,
      nombre: 'Test',
      precio: -100,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });
});

describe('CRUD Categorías', () => {
  let token;

  beforeEach(async () => {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'testpass123',
    });
    const data = await res.json();
    token = data.token;
  });

  it('debería crear una categoría con datos válidos', async () => {
    const res = await makeRequest('/api/admin/categorias', 'POST', {
      nombre: 'Test Categoría',
      icono: '🌮',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(201);
  });

  it('debería rechazar categoría sin nombre', async () => {
    const res = await makeRequest('/api/admin/categorias', 'POST', {
      icono: '🌮',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });
});

describe('CORS', () => {
  it('debería retornar CORS headers para origen permitido', async () => {
    const res = await makeRequest('/api/menu', 'GET', null, {
      Origin: 'https://lomitosarabesfsa.pages.dev',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lomitosarabesfsa.pages.dev');
  });

  it('debería manejar OPTIONS (preflight)', async () => {
    const res = await makeRequest('/api/menu', 'OPTIONS', null, {
      Origin: 'https://lomitosarabesfsa.pages.dev',
      'Access-Control-Request-Method': 'GET',
    });
    expect(res.status).toBe(204);
  });
});

describe('Seguridad', () => {
  it('debería retornar X-Content-Type-Options: nosniff en 404', async () => {
    const res = await makeRequest('/api/noexiste');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('debería retornar 404 para rutas no encontradas', async () => {
    const res = await makeRequest('/api/invalid');
    expect(res.status).toBe(404);
  });
});

describe('Modifier Groups', () => {
  let token;

  beforeEach(async () => {
    const res = await makeRequest('/api/login', 'POST', {
      usuario: 'admin',
      clave: 'testpass123',
    });
    const data = await res.json();
    token = data.token;
  });

  it('debería crear un modifier group válido', async () => {
    const res = await makeRequest('/api/admin/modifier-groups', 'POST', {
      nombre: 'Salsas',
      selection_type: 'multiple',
      categoria_id: 1,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(201);
  });

  it('debería rechazar modifier group sin nombre', async () => {
    const res = await makeRequest('/api/admin/modifier-groups', 'POST', {
      selection_type: 'multiple',
      categoria_id: 1,
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });

  it('debería rechazar modifier group sin producto ni categoría', async () => {
    const res = await makeRequest('/api/admin/modifier-groups', 'POST', {
      nombre: 'Test',
      selection_type: 'multiple',
    }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });
});
