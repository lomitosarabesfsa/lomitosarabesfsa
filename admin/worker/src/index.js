// ============================================================
//  LOMITOS ÁRABES FSA — API (Cloudflare Worker)
//  · GET  /api/menu          → menú público (categorías + productos + promos + config)
//  · POST /api/login         → { usuario, clave } → token de sesión
//  · CRUD /api/admin/*       → protegido con token Bearer
//  · POST /api/admin/imagen  → sube imagen base64 a R2 y devuelve URL pública
// ============================================================

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

// ---------- Utilidades ----------
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonError(message, status = 400) {
  return json({ error: message }, status);
}

const ALLOWED_ORIGINS = [
  'https://lomitosarabesfsa.pages.dev',
  'http://localhost:8787',
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  // Archivos locales (file://) → el header Origin es null, permitimos con asterisco
  // Request desde curl/Postman → sin header, permitimos
  if (!origin) return '*';
  // Origin conocido → reflejamos exacto
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Origin desconocido → rechazamos (sin header ACA-Origin = bloqueado por navegador)
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
  const r = new Response(response.body, response);
  Object.entries(corsHeaders(request)).forEach(([k, v]) => r.headers.set(k, v));
  return r;
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
  const exp = Date.now() + 12 * 3600 * 1000; // 12 h
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

// ---------- Handlers ----------
async function getMenu(envLocal) {
  const categorias = (await envLocal.DB.prepare('SELECT * FROM categorias ORDER BY orden').all()).results;
  const productos = (await envLocal.DB.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY orden').all()).results;
  const promos = (await envLocal.DB.prepare('SELECT * FROM promos WHERE activa = 1').all()).results;
  const configRows = (await envLocal.DB.prepare('SELECT clave, valor FROM config').all()).results;
  const config = {};
  configRows.forEach(r => { try { config[r.clave] = JSON.parse(r.valor); } catch (e) { config[r.clave] = r.valor; } });

  return {
    categorias: categorias.map(c => ({
      id: c.id, nombre: c.nombre, icono: c.icono,
      productos: productos.filter(p => p.categoria_id === c.id)
        .map(p => ({ id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, stock: p.stock, imagen: p.imagen })),
    })),
    promos: promos.map(p => ({ id: p.id, icono: p.icono, texto: p.texto, descripcion: p.descripcion })),
    config,
  };
}

// IMPORTANTE: en producción configurar los secrets ADMIN_USER, ADMIN_PASS y AUTH_SECRET
// con `npx wrangler secret put NOMBRE`. Los valores por defecto son solo para desarrollo local.
function authSecret(envLocal) {
  return envLocal.AUTH_SECRET || 'cambiar-este-secreto-en-produccion';
}

async function login(request, envLocal) {
  const body = await request.json().catch(() => ({}));
  // Normalización de credenciales:
  //  · Al cargar secrets con `echo`/tuberías puede quedar un salto de línea,
  //    un \r de Windows o espacios extra dentro del valor almacenado.
  //  · El usuario también puede tipear espacios sin querer.
  // Se trima todo y el usuario se compara sin distinguir mayúsculas
  // (la clave SÍ sigue siendo sensible a mayúsculas).
  const adminUser = String(envLocal.ADMIN_USER || 'admin').trim().toLowerCase();
  const adminPass = String(envLocal.ADMIN_PASS || 'admin123').trim();
  const usuario = String(body.usuario || '').trim().toLowerCase();
  const clave = String(body.clave || '').trim();
  if (usuario === adminUser && clave === adminPass) {
    return json({ ok: true, token: await crearToken(usuario, authSecret(envLocal)) });
  }
  return jsonError('Usuario o clave incorrectos', 401);
}

async function requireAuth(request, envLocal) {
  const token = obtenerToken(request);
  const data = await verificarToken(token, authSecret(envLocal));
  if (!data) return null;
  return data;
}

// CRUD productos
async function listarProductos(envLocal) {
  const rows = (await envLocal.DB.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre FROM productos p
    JOIN categorias c ON c.id = p.categoria_id ORDER BY p.orden`).all()).results;
  return json(rows);
}

async function crearProducto(envLocal, body) {
  const res = await envLocal.DB.prepare(
    'INSERT INTO productos (categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  ).bind(body.categoria_id, body.nombre, body.descripcion || '', body.precio || 0, body.stock ?? -1, body.imagen || '', body.orden || 0).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function actualizarProducto(envLocal, id, body) {
  const res = await envLocal.DB.prepare(
    'UPDATE productos SET categoria_id = ?, nombre = ?, descripcion = ?, precio = ?, stock = ?, imagen = ?, activo = ?, orden = ? WHERE id = ?'
  ).bind(body.categoria_id, body.nombre, body.descripcion || '', body.precio || 0, body.stock ?? -1, body.imagen || '', body.activo ?? 1, body.orden || 0, id).run();
  return json({ ok: res.meta.changes > 0 });
}

async function eliminarProducto(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM productos WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// CRUD categorías
async function listarCategorias(envLocal) {
  const rows = (await envLocal.DB.prepare('SELECT * FROM categorias ORDER BY orden').all()).results;
  return json(rows);
}

async function crearCategoria(envLocal, body) {
  const res = await envLocal.DB.prepare('INSERT INTO categorias (nombre, icono, orden) VALUES (?, ?, ?)')
    .bind(body.nombre, body.icono || '🍽️', body.orden || 0).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

async function eliminarCategoria(envLocal, id) {
  const res = await envLocal.DB.prepare('DELETE FROM categorias WHERE id = ?').bind(id).run();
  return json({ ok: res.meta.changes > 0 });
}

// Promos
async function guardarPromos(envLocal, body) {
  await envLocal.DB.prepare('DELETE FROM promos').run();
  for (const p of body.promos || []) {
    await envLocal.DB.prepare('INSERT INTO promos (activa, icono, texto, descripcion) VALUES (?, ?, ?, ?)')
      .bind(p.activa ? 1 : 0, p.icono || '🔥', p.texto || '', p.descripcion || '').run();
  }
  return json({ ok: true });
}

// Config (horarios, galería, whatsapp)
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
  rows.forEach(r => { try { config[r.clave] = JSON.parse(r.valor); } catch (e) { config[r.clave] = r.valor; } });
  return json(config);
}

// ---------- Router ----------
export default {
  async fetch(request, envLocal, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      // Público
      if (request.method === 'GET' && path === '/api/menu') {
        return applyCors(json(await getMenu(envLocal)), request);
      }
      if (request.method === 'POST' && path === '/api/login') {
        return applyCors(await login(request, envLocal), request);
      }

      // ---- Zona admin (requiere token) ----
      const user = await requireAuth(request, envLocal);
      if (path.startsWith('/api/admin') && !user) {
        return applyCors(jsonError('No autorizado', 401), request);
      }

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

      if (path === '/api/admin/categorias') {
        if (request.method === 'GET') return applyCors(await listarCategorias(envLocal), request);
        if (request.method === 'POST') return applyCors(await crearCategoria(envLocal, await request.json()), request);
      }
      const catMatch = path.match(/^\/api\/admin\/categorias\/(\d+)$/);
      if (catMatch && request.method === 'DELETE') {
        return applyCors(await eliminarCategoria(envLocal, catMatch[1]), request);
      }

      if (path === '/api/admin/promos') {
        if (request.method === 'GET') {
          const rows = (await envLocal.DB.prepare('SELECT * FROM promos ORDER BY id').all()).results;
          return applyCors(json(rows), request);
        }
        if (request.method === 'PUT') {
          return applyCors(await guardarPromos(envLocal, await request.json()), request);
        }
      }

      if (path === '/api/admin/config') {
        if (request.method === 'GET') return applyCors(await getConfig(envLocal), request);
        if (request.method === 'PUT') return applyCors(await guardarConfig(envLocal, await request.json()), request);
      }

      if (path === '/api/admin/imagen' && request.method === 'POST') {
        try {
          const r = await subirImagen(await request.json(), envLocal);
          return applyCors(json({ ok: true, ...r }), request);
        } catch (e) {
          return applyCors(jsonError(e.message, 400), request);
        }
      }

      return applyCors(jsonError('Ruta no encontrada', 404), request);
    } catch (e) {
      console.error(e);
      return applyCors(jsonError('Error interno: ' + e.message, 500), request);
    }
  },
};
