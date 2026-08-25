// ============================================================
//  LOMITOS ÁRABES FSA — API (Cloudflare Worker)
//  · GET  /api/menu              → menú público
//  · POST /api/login             → autenticación
//  · CRUD /api/admin/*           → protegido con token Bearer
//  · POST /api/admin/imagen      → sube imagen a R2
// ============================================================

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

// ---------- Utilidades ----------
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function jsonNoCache(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...NO_CACHE } });
}

function jsonError(message, status = 400) {
  return json({ error: message }, status);
}

const ALLOWED_ORIGINS = [
  'https://lomitosarabesfsa.pages.dev',
  'http://localhost:8787',
  'http://localhost:3000',
  'http://localhost:3001',
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '*';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function applyCors(response, request) {
  let r = new Response(response.body, response);
  Object.entries(corsHeaders(request)).forEach(([k, v]) => r.headers.set(k, v));
  // Evitar cache en responses de admin ( datos siempre frescos en el panel)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/admin')) {
    r.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }
  r = addSecurityHeaders(r);
  return r;
}

// IMP-8: Content-Security-Policy headers
function addSecurityHeaders(response) {
  const r = new Response(response.body, response);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return r;
}

// IMP-7: Rate limiting con D1 (funciona en producción, no solo local)
async function checkRateLimit(envLocal, ip, action, maxAttempts, windowMs) {
  const key = `${action}:${ip}`;
  const cutoff = Date.now() - windowMs;
  try {
    await envLocal.DB.prepare('DELETE FROM rate_limits WHERE key = ? AND timestamp < ?').bind(key, cutoff).run();
    const result = await envLocal.DB.prepare('SELECT COUNT(*) as cnt FROM rate_limits WHERE key = ? AND timestamp >= ?').bind(key, cutoff).first();
    if (result && result.cnt >= maxAttempts) return false;
    return true;
  } catch (e) {
    return true;
  }
}

async function recordRateLimitHit(envLocal, ip, action) {
  const key = `${action}:${ip}`;
  try {
    await envLocal.DB.prepare('INSERT INTO rate_limits (key, timestamp) VALUES (?, ?)').bind(key, Date.now()).run();
  } catch {}
}

// ---------- Autenticación (HMAC con WebCrypto) ----------
async function hmacHex(key, message) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function b64url(s) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function crearToken(usuario, authSecret) {
  const exp = Date.now() + 12 * 3600 * 1000;
  const payload = b64url(JSON.stringify({ u: usuario, exp }));
  const firma = await hmacHex(authSecret, payload);
  return `${payload}.${firma}`;
}

async function verificarToken(token, authSecret) {
  if (!token) return null;
  const [payload, firma] = token.split('.');
  if (!payload || !firma) return null;
  const esperada = await hmacHex(authSecret, payload);
  if (firma !== esperada) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function obtenerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// ---------- Subida de imagen a R2 ----------
async function subirImagen(body, envLocal) {
  if (!body || typeof body.data !== 'string') throw new Error('Falta el contenido de la imagen (base64).');
  const nombreBase = (body.filename || 'imagen').toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(0, 60);
  const key = `productos/${Date.now()}-${nombreBase}`;
  const bytes = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));
  await envLocal.IMAGENES.put(key, bytes, {
    httpMetadata: { contentType: body.contentType || 'image/jpeg' },
  });
  const base = envLocal.R2_PUBLIC_URL || '';
  return { key, url: base ? `${base}/${key}` : key };
}

// ---------- Validación server-side (IMP-5) ----------
function validateProducto(body) {
  const errors = [];
  if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim().length === 0) errors.push('nombre es obligatorio');
  if (body.nombre && body.nombre.length > 200) errors.push('nombre demasiado largo (máx 200)');
  if (body.categoria_id === undefined || body.categoria_id === null) errors.push('categoria_id es obligatorio');
  if (body.precio !== undefined && (typeof body.precio !== 'number' || body.precio < 0)) errors.push('precio debe ser un número positivo');
  if (body.stock !== undefined && body.stock !== -1 && (typeof body.stock !== 'number' || body.stock < 0)) errors.push('stock debe ser -1 (sin control) o un número positivo');
  if (body.orden !== undefined && (typeof body.orden !== 'number' || body.orden < 0)) errors.push('orden debe ser un número positivo');
  return errors;
}

function validateCategoria(body) {
  const errors = [];
  if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim().length === 0) errors.push('nombre es obligatorio');
  if (body.nombre && body.nombre.length > 100) errors.push('nombre demasiado largo (máx 100)');
  return errors;
}

function validateModifierGroup(body) {
  const errors = [];
  if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim().length === 0) errors.push('nombre es obligatorio');
  if (body.selection_type && !['single', 'multiple'].includes(body.selection_type)) errors.push('selection_type debe ser single o multiple');
  if (body.min_seleccion !== undefined && body.min_seleccion < 0) errors.push('min_seleccion no puede ser negativo');
  if (body.max_seleccion !== undefined && body.max_seleccion < 1) errors.push('max_seleccion debe ser al menos 1');
  return errors;
}

function validateModifierOption(body) {
  const errors = [];
  if (!body.group_id) errors.push('group_id es obligatorio');
  if (!body.nombre || typeof body.nombre !== 'string' || body.nombre.trim().length === 0) errors.push('nombre es obligatorio');
  if (body.price_delta !== undefined && typeof body.price_delta !== 'number') errors.push('price_delta debe ser un número');
  return errors;
}

// ---------- Subida de imagen a R2 (CRIT-4: presigned URL) ----------
// Endpoint para obtener una URL de presignado (upload directo a R2)
async function presignUpload(body, envLocal) {
  if (!body || typeof body.filename !== 'string') throw new Error('filename es obligatorio');
  if (!body.contentType) throw new Error('contentType es obligatorio');
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (!allowedTypes.includes(body.contentType)) throw new Error('Tipo de archivo no permitido: ' + body.contentType);
  const nombreBase = body.filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(0, 60);
  const key = `productos/${Date.now()}-${nombreBase}`;
  const base = envLocal.R2_PUBLIC_URL || '';
  // En R2 con r2.dev público, el upload se hace vía PUT directo al Worker
  // Retornamos la key para que el frontend haga PUT a /api/admin/imagen-upload/:key
  return { key, uploadUrl: `/api/admin/imagen-upload/${key}`, url: base ? `${base}/${key}` : key };
}

// Upload directo a R2 via PUT (sin base64)
async function uploadToR2(request, envLocal, key) {
  if (!request.body) throw new Error('No hay body en la request');
  const contentType = request.headers.get('Content-Type') || 'image/jpeg';
  await envLocal.IMAGENES.put(key, request.body, {
    httpMetadata: { contentType },
  });
  const base = envLocal.R2_PUBLIC_URL || '';
  return { key, url: base ? `${base}/${key}` : key };
}

// ============================================================
//  GET /api/menu — Menú público con modifier groups
// ============================================================
async function getMenu(envLocal) {
  const categorias = (await envLocal.DB.prepare('SELECT * FROM categorias ORDER BY orden').all()).results;
  const productos = (await envLocal.DB.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden').all()).results;
  const promos = (await envLocal.DB.prepare('SELECT * FROM promos WHERE activa = 1').all()).results;
  const configRows = (await envLocal.DB.prepare('SELECT clave, valor FROM config').all()).results;
  const config = {};
  configRows.forEach(r => { try { config[r.clave] = JSON.parse(r.valor); } catch (e) { config[r.clave] = r.valor; } });

  // Modifier groups activos
  const allGroups = (await envLocal.DB.prepare('SELECT * FROM modifier_groups WHERE activo = 1 ORDER BY orden').all()).results;
  // Modifier options activos
  const allOptions = (await envLocal.DB.prepare('SELECT * FROM modifier_options WHERE activo = 1 ORDER BY orden').all()).results;

  // Mapa group_id → options[]
  const optionsByGroup = new Map();
  allOptions.forEach(o => {
    if (!optionsByGroup.has(o.group_id)) optionsByGroup.set(o.group_id, []);
    optionsByGroup.get(o.group_id).push({ id: o.id, nombre: o.nombre, price_delta: o.price_delta });
  });

  return {
    categorias: categorias.map(c => {
      // Groups de categoría
      const catGroups = allGroups.filter(g => g.categoria_id === c.id).map(g => ({
        id: g.id, nombre: g.nombre, selection_type: g.selection_type,
        required: !!g.required, min_seleccion: g.min_seleccion, max_seleccion: g.max_seleccion,
        options: optionsByGroup.get(g.id) || [],
      }));

      return {
        id: c.id, nombre: c.nombre, icono: c.icono,
        modifier_groups: catGroups,
        productos: productos.filter(p => p.categoria_id === c.id).map(p => {
          // Groups específicos del producto
          const prodGroups = allGroups.filter(g => g.producto_id === p.id).map(g => ({
            id: g.id, nombre: g.nombre, selection_type: g.selection_type,
            required: !!g.required, min_seleccion: g.min_seleccion, max_seleccion: g.max_seleccion,
            options: optionsByGroup.get(g.id) || [],
          }));

          // Combinar: groups del producto + groups de categoría (sin duplicar por nombre)
          const nombresProd = new Set(prodGroups.map(g => g.nombre));
          const extras = catGroups.filter(g => !nombresProd.has(g.nombre));

          return {
            id: p.id, nombre: p.nombre, descripcion: p.descripcion,
            precio: p.precio, stock: p.stock, imagen: p.imagen,
            modifier_groups: [...prodGroups, ...extras],
          };
        }),
      };
    }),
    promos: promos.map(p => ({ id: p.id, icono: p.icono, texto: p.texto, descripcion: p.descripcion })),
    config,
  };
}

// ============================================================
//  AUTH
// ============================================================
function authSecret(envLocal) {
  // IMP-5: No usar defaults inseguros. Si AUTH_SECRET no está configurado, rechazar.
  if (!envLocal.AUTH_SECRET) throw new Error('AUTH_SECRET no configurado en secrets de Cloudflare');
  return envLocal.AUTH_SECRET;
}

async function login(request, envLocal) {
  const body = await request.json().catch(() => ({}));
  // IMP-5: Si secrets no están configurados, rechazar login (no usar defaults)
  if (!envLocal.ADMIN_USER || !envLocal.ADMIN_PASS) {
    return jsonError('Credenciales no configuradas en el servidor', 500);
  }
  const adminUser = String(envLocal.ADMIN_USER).trim().toLowerCase();
  const adminPass = String(envLocal.ADMIN_PASS).trim();
  const usuario = String(body.usuario || '').trim().toLowerCase();
  const clave = String(body.clave || '').trim();
  if (usuario === adminUser && clave === adminPass) {
    return json({ ok: true, token: await crearToken(usuario, authSecret(envLocal)) });
  }
  return jsonError('Usuario o clave incorrectos', 401);
}

async function requireAuth(request, envLocal) {
  const token = obtenerToken(request);
  return await verificarToken(token, authSecret(envLocal));
}

// ============================================================
//  CRUD Productos
// ============================================================
async function listarProductos(envLocal) {
  const rows = (await envLocal.DB.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre FROM productos p
    JOIN categorias c ON c.id = p.categoria_id ORDER BY p.orden`).all()).results;
  return json(rows);
}

async function crearProducto(envLocal, body) {
  const errors = validateProducto(body);
  if (errors.length) return jsonError(errors.join('; '), 400);
  const res = await envLocal.DB.prepare(
    'INSERT INTO productos (categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  ).bind(body.categoria_id, body.nombre.trim(), (body.descripcion || '').trim().slice(0, 500), Math.max(0, body.precio || 0), body.stock ?? -1, (body.imagen || '').slice(0, 500), body.orden || 0).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function actualizarProducto(envLocal, id, body) {
  const errors = validateProducto(body);
  if (errors.length) return jsonError(errors.join('; '), 400);
  const res = await envLocal.DB.prepare(
    'UPDATE productos SET categoria_id = ?, nombre = ?, descripcion = ?, precio = ?, stock = ?, imagen = ?, activo = ?, orden = ? WHERE id = ?'
  ).bind(body.categoria_id, body.nombre.trim(), (body.descripcion || '').trim().slice(0, 500), Math.max(0, body.precio || 0), body.stock ?? -1, (body.imagen || '').slice(0, 500), body.activo ?? 1, body.orden || 0, id).run();
  return json({ ok: res.meta.changes > 0 });
}

async function eliminarProducto(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM productos WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// ============================================================
//  CRUD Categorías
// ============================================================
async function listarCategorias(envLocal) {
  const rows = (await envLocal.DB.prepare('SELECT * FROM categorias ORDER BY orden').all()).results;
  return json(rows);
}

async function crearCategoria(envLocal, body) {
  const errors = validateCategoria(body);
  if (errors.length) return jsonError(errors.join('; '), 400);
  const res = await envLocal.DB.prepare('INSERT INTO categorias (nombre, icono, orden) VALUES (?, ?, ?)')
    .bind(body.nombre.trim(), (body.icono || '🍽️').slice(0, 10), body.orden || 0).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function eliminarCategoria(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM categorias WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// ============================================================
//  CRUD Modifier Groups
// ============================================================
async function listarModifierGroups(envLocal) {
  const rows = (await envLocal.DB.prepare(`
    SELECT mg.*, COALESCE(p.nombre, '') AS producto_nombre, COALESCE(c.nombre, '') AS categoria_nombre
    FROM modifier_groups mg
    LEFT JOIN productos p ON p.id = mg.producto_id
    LEFT JOIN categorias c ON c.id = mg.categoria_id
    ORDER BY mg.orden`).all()).results;
  // Adjuntar options a cada grupo
  const allOpts = (await envLocal.DB.prepare('SELECT * FROM modifier_options ORDER BY orden').all()).results;
  const optsByGroup = new Map();
  allOpts.forEach(o => {
    if (!optsByGroup.has(o.group_id)) optsByGroup.set(o.group_id, []);
    optsByGroup.get(o.group_id).push(o);
  });
  return json(rows.map(g => ({ ...g, options: optsByGroup.get(g.id) || [] })));
}

async function crearModifierGroup(envLocal, body) {
  if (!body.nombre) return jsonError('El nombre es obligatorio');
  if (!body.producto_id && !body.categoria_id) return jsonError('Asociá el grupo a un producto o categoría');
  if (body.producto_id && body.categoria_id) return jsonError('No se puede asociar a producto Y categoría a la vez');
  const res = await envLocal.DB.prepare(
    'INSERT INTO modifier_groups (producto_id, categoria_id, nombre, selection_type, required, min_seleccion, max_seleccion, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    body.producto_id || null, body.categoria_id || null,
    body.nombre, body.selection_type || 'multiple',
    body.required ? 1 : 0, body.min_seleccion ?? 0, body.max_seleccion ?? 99,
    body.orden || 0, body.activo ?? 1
  ).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function actualizarModifierGroup(envLocal, id, body) {
  const res = await envLocal.DB.prepare(
    'UPDATE modifier_groups SET producto_id = ?, categoria_id = ?, nombre = ?, selection_type = ?, required = ?, min_seleccion = ?, max_seleccion = ?, orden = ?, activo = ? WHERE id = ?'
  ).bind(
    body.producto_id || null, body.categoria_id || null,
    body.nombre, body.selection_type || 'multiple',
    body.required ? 1 : 0, body.min_seleccion ?? 0, body.max_seleccion ?? 99,
    body.orden || 0, body.activo ?? 1, id
  ).run();
  return json({ ok: res.meta.changes > 0 });
}

async function eliminarModifierGroup(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM modifier_groups WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// ============================================================
//  CRUD Modifier Options
// ============================================================
async function listarModifierOptions(envLocal, groupId) {
  const rows = (await envLocal.DB.prepare('SELECT * FROM modifier_options WHERE group_id = ? ORDER BY orden').bind(groupId).all()).results;
  return json(rows);
}

async function crearModifierOption(envLocal, body) {
  if (!body.group_id) return jsonError('group_id es obligatorio');
  if (!body.nombre) return jsonError('El nombre es obligatorio');
  const res = await envLocal.DB.prepare(
    'INSERT INTO modifier_options (group_id, nombre, price_delta, orden, activo) VALUES (?, ?, ?, ?, ?)'
  ).bind(body.group_id, body.nombre, body.price_delta || 0, body.orden || 0, body.activo ?? 1).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function actualizarModifierOption(envLocal, id, body) {
  const res = await envLocal.DB.prepare(
    'UPDATE modifier_options SET group_id = ?, nombre = ?, price_delta = ?, orden = ?, activo = ? WHERE id = ?'
  ).bind(body.group_id, body.nombre, body.price_delta || 0, body.orden || 0, body.activo ?? 1, id).run();
  return json({ ok: res.meta.changes > 0 });
}

async function eliminarModifierOption(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM modifier_options WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// ============================================================
//  Promos
// ============================================================
async function guardarPromos(envLocal, body) {
  const stmts = [envLocal.DB.prepare('DELETE FROM promos')];
  for (const p of body.promos || []) {
    stmts.push(
      envLocal.DB.prepare('INSERT INTO promos (activa, icono, texto, descripcion) VALUES (?, ?, ?, ?)')
        .bind(p.activa ? 1 : 0, p.icono || '🔥', p.texto || '', p.descripcion || '')
    );
  }
  await envLocal.DB.batch(stmts);
  return json({ ok: true });
}

// ============================================================
//  Config
// ============================================================
async function guardarConfig(envLocal, body) {
  for (const [clave, valor] of Object.entries(body)) {
    await envLocal.DB.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
      .bind(clave, typeof valor === 'string' ? valor : JSON.stringify(valor)).run();
  }
  return json({ ok: true });
}

async function getConfig(envLocal) {
  const rows = (await envLocal.DB.prepare('SELECT clave, valor FROM config').all()).results;
  const config = {};
  rows.forEach(r => {
    const v = r.valor;
    if (v.startsWith('{') || v.startsWith('[')) {
      try { config[r.clave] = JSON.parse(v); return; } catch {}
    }
    config[r.clave] = v;
  });
  return json(config);
}

// ============================================================
//  Router
// ============================================================
export default {
  async fetch(request, envLocal, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      // ---- Públicas ----
      if (request.method === 'GET' && path === '/api/menu') {
        return applyCors(json(await getMenu(envLocal)), request);
      }
      if (request.method === 'POST' && path === '/api/login') {
        // IMP-7: Rate limiting con D1 (funciona en producción)
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
        const allowed = await checkRateLimit(envLocal, ip, 'login', 5, 60000);
        if (!allowed) {
          return applyCors(jsonError('Demasiados intentos. Esperá un minuto.', 429), request);
        }
        const loginResp = await login(request, envLocal);
        if (loginResp.status >= 400) await recordRateLimitHit(envLocal, ip, 'login');
        return applyCors(loginResp, request);
      }

      // ---- Admin (requiere token) ----
      const user = await requireAuth(request, envLocal);
      if (path.startsWith('/api/admin') && !user) {
        return applyCors(jsonError('No autorizado', 401), request);
      }

      // Productos
      if (path === '/api/admin/productos') {
        if (request.method === 'GET') return applyCors(await listarProductos(envLocal), request);
        if (request.method === 'POST') return applyCors(await crearProducto(envLocal, await request.json()), request);
      }
      const prodMatch = path.match(/^\/api\/admin\/productos\/(\d+)$/);
      if (prodMatch) {
        const id = prodMatch[1];
        if (request.method === 'PUT') return applyCors(await actualizarProducto(envLocal, id, await request.json()), request);
        if (request.method === 'DELETE') return applyCors(await eliminarProducto(envLocal, id), request);
      }

      // Categorías
      if (path === '/api/admin/categorias') {
        if (request.method === 'GET') return applyCors(await listarCategorias(envLocal), request);
        if (request.method === 'POST') return applyCors(await crearCategoria(envLocal, await request.json()), request);
      }
      const catMatch = path.match(/^\/api\/admin\/categorias\/(\d+)$/);
      if (catMatch && request.method === 'DELETE') {
        return applyCors(await eliminarCategoria(envLocal, catMatch[1]), request);
      }

      // Modifier Groups
      if (path === '/api/admin/modifier-groups') {
        if (request.method === 'GET') return applyCors(await listarModifierGroups(envLocal), request);
        if (request.method === 'POST') return applyCors(await crearModifierGroup(envLocal, await request.json()), request);
      }
      const mgMatch = path.match(/^\/api\/admin\/modifier-groups\/(\d+)$/);
      if (mgMatch) {
        const id = mgMatch[1];
        if (request.method === 'PUT') return applyCors(await actualizarModifierGroup(envLocal, id, await request.json()), request);
        if (request.method === 'DELETE') return applyCors(await eliminarModifierGroup(envLocal, id), request);
      }

      // Modifier Options
      const moMatch = path.match(/^\/api\/admin\/modifier-options\/?(\d*)$/);
      if (moMatch) {
        if (request.method === 'GET' && moMatch[1]) return applyCors(await listarModifierOptions(envLocal, moMatch[1]), request);
        if (request.method === 'POST') return applyCors(await crearModifierOption(envLocal, await request.json()), request);
      }
      const moSingleMatch = path.match(/^\/api\/admin\/modifier-options\/(\d+)$/);
      if (moSingleMatch && request.method !== 'GET') {
        const id = moSingleMatch[1];
        if (request.method === 'PUT') return applyCors(await actualizarModifierOption(envLocal, id, await request.json()), request);
        if (request.method === 'DELETE') return applyCors(await eliminarModifierOption(envLocal, id), request);
      }

      // Promos
      if (path === '/api/admin/promos') {
        if (request.method === 'GET') {
          const rows = (await envLocal.DB.prepare('SELECT * FROM promos ORDER BY id').all()).results;
          return applyCors(json(rows), request);
        }
        if (request.method === 'PUT') {
          return applyCors(await guardarPromos(envLocal, await request.json()), request);
        }
      }

      // Config
      if (path === '/api/admin/config') {
        if (request.method === 'GET') return applyCors(await getConfig(envLocal), request);
        if (request.method === 'PUT') return applyCors(await guardarConfig(envLocal, await request.json()), request);
      }

      // Imagen (legacy: base64 upload)
      if (path === '/api/admin/imagen' && request.method === 'POST') {
        try {
          const r = await subirImagen(await request.json(), envLocal);
          return applyCors(json({ ok: true, ...r }), request);
        } catch (e) {
          return applyCors(jsonError(e.message, 400), request);
        }
      }

      // CRIT-4: Presign URL para upload directo a R2 (sin base64)
      if (path === '/api/admin/presign' && request.method === 'POST') {
        try {
          const r = await presignUpload(await request.json(), envLocal);
          return applyCors(json({ ok: true, ...r }), request);
        } catch (e) {
          return applyCors(jsonError(e.message, 400), request);
        }
      }

      // CRIT-4: Upload directo a R2 via PUT
      const uploadMatch = path.match(/^\/api\/admin\/imagen-upload\/(.+)$/);
      if (uploadMatch && request.method === 'PUT') {
        try {
          const r = await uploadToR2(request, envLocal, uploadMatch[1]);
          return applyCors(json({ ok: true, ...r }), request);
        } catch (e) {
          return applyCors(jsonError(e.message, 400), request);
        }
      }

      return applyCors(jsonError('Ruta no encontrada', 404), request);
    } catch (e) {
      console.error(e);
      // En producción no exponer el mensaje original del error
      return applyCors(jsonError('Error interno del servidor', 500), request);
    }
  },
};
