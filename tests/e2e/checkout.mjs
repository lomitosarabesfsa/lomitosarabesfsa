// ============================================================
//  Test E2E del flujo del carrito (landing page) en Chrome real.
//
//  Sin dependencias: usa solo Node + el Chrome instalado y lo
//  maneja por CDP (Chrome DevTools Protocol).
//
//  Ejecutar:  node tests/e2e/checkout.mjs
//             CHROME_PATH=/ruta/a/chrome node tests/e2e/checkout.mjs
//             LEGACY_SW=1 node tests/e2e/checkout.mjs   (control negativo de caché)
//
//  Levanta el sitio desde el repo con una API fixture (mismo shape
//  que GET /api/menu del Worker) y recorre:
//    · validaciones de modificadores obligatorios
//    · flujo completo del carrito hasta el envío por WhatsApp
//    · que un deploy nuevo de app.js llegue sin que el cliente limpie caché
// ============================================================
import { createServer } from 'http';
import { readFile, rm, access } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEGACY = process.env.LEGACY_SW === '1';
const SITE_PORT = 8123;
const API_PORT = 8787;
const CDP_PORT = 9222;
const LOG = [];
const resultados = [];

function log(msg = '') { LOG.push(msg); console.log(msg); }
function assert(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok: !!ok, detalle: String(detalle) });
  log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? '  → ' + detalle : ''}`);
}

// ---------- Chrome ----------
async function encontrarChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const c of candidatos) { try { await access(c); return c; } catch {} }
  throw new Error('No encontré Chrome. Pasá la ruta con CHROME_PATH=/ruta/a/chrome');
}

// ---------- API fixture (mismo shape que el Worker) ----------
const MENU = {
  categorias: [
    {
      id: 1, nombre: 'Lomitos', icono: '🌯', modifier_groups: [],
      productos: [
        {
          id: 1, nombre: 'Lomito Árabe Simple', descripcion: 'Masa casera', precio: 15000, stock: 10, imagen: '',
          modifier_groups: [{
            id: 10, nombre: 'Salsa', selection_type: 'single', required: true, min_seleccion: 1, max_seleccion: 1,
            options: [
              { id: 100, nombre: 'Salsa de ajo', price_delta: 0 },
              { id: 101, nombre: 'Salsa picante', price_delta: 500 },
            ],
          }],
        },
        {
          id: 2, nombre: 'Lomito Árabe Especial', descripcion: 'Con todo', precio: 18000, stock: 5, imagen: '',
          modifier_groups: [{
            id: 11, nombre: 'Extras', selection_type: 'multiple', required: true, min_seleccion: 1, max_seleccion: 1,
            options: [
              { id: 110, nombre: 'Queso extra', price_delta: 800 },
              { id: 111, nombre: 'Huevo', price_delta: 300 },
            ],
          }],
        },
      ],
    },
    {
      id: 2, nombre: 'Bebidas', icono: '🥤', modifier_groups: [],
      productos: [{ id: 3, nombre: 'Gaseosa 500ml', descripcion: '', precio: 3000, stock: -1, imagen: '', modifier_groups: [] }],
    },
  ],
  promos: [{ id: 1, icono: '🔥', texto: '2x1 los martes', descripcion: 'En lomitos simples' }],
  config: { whatsapp: '5493704218188', horarios: {}, galeria: [] },
};

// ---------- Servidores ----------
let appVersion = 'A';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

async function serveStatic(req, res) {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/') p = '/index.html';
  const target = join(ROOT, decodeURIComponent(p));
  if (!target.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    let buf = await readFile(target);
    if (p === '/app.js') buf = Buffer.concat([buf, Buffer.from(`\nwindow.__APP_VERSION='${appVersion}';\n`)]);
    if (p === '/sw.js' && LEGACY) {
      buf = Buffer.from(buf.toString('utf8')
        .replace("const CACHE_NAME = 'lomitos-fsa-v19';", "const CACHE_NAME = 'lomitos-fsa-v18';")
        .replace('event.respondWith(networkFirst(event.request, 3000));', 'event.respondWith(cacheFirst(event.request));'));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
}

function serveApi(req, res) {
  res.writeHead(new URL(req.url, 'http://x').pathname === '/api/menu' ? 200 : 404, {
    'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(MENU));
}

// ---------- Cliente CDP mínimo ----------
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  const ready = new Promise((ok, err) => {
    ws.addEventListener('open', ok);
    ws.addEventListener('error', () => err(new Error('no pude conectar al CDP')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else for (const fn of [...listeners]) fn(msg);
  });
  return {
    ready,
    send(method, params = {}) {
      const myId = ++id;
      return new Promise((resolve, reject) => { pending.set(myId, { resolve, reject }); ws.send(JSON.stringify({ id: myId, method, params })); });
    },
    on(fn) { listeners.push(fn); },
    close() { try { ws.close(); } catch {} },
  };
}

// Helpers que se inyectan en la página
const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (sel, timeout) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 10000)) {
      const el = document.querySelector(sel);
      if (el) return el;
      await sleep(50);
    }
    throw new Error('timeout esperando ' + sel);
  };
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  const write = (el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const badge = () => document.getElementById('cart-count-badge').textContent.trim();
  const toast = () => document.getElementById('toast-container').textContent;
`;

const ESCENARIO_MODIFICADORES = `(async () => {
  ${HELPERS}
  const out = { checks: {}, errores: [] };
  window.__erroresJs = [];
  window.addEventListener('error', (e) => window.__erroresJs.push('uncaught: ' + (e.message || e.type)));
  const check = (n, ok, d) => { out.checks[n] = { ok: !!ok, detalle: d === undefined ? '' : String(d) }; };

  await waitFor('.producto-fila-add');

  // ── Grupo 'single' OBLIGATORIO sin elegir: no debería dejarlo agregar
  click(document.querySelector('.producto-fila-add[data-prod-id="api-1"]'));
  await waitFor('#bs-sheet.open');
  await waitFor('.bs-option');
  click(document.getElementById('bs-add-btn'));
  await sleep(300);
  check('grupo single obligatorio sin elegir: NO se agrega', badge() === '0', 'badge=' + badge());
  check('grupo single obligatorio sin elegir: avisa al cliente', /Elegí|obligator/i.test(toast()), toast().trim().slice(0, 60));
  check('el sheet sigue abierto para poder elegir', document.getElementById('bs-sheet').classList.contains('open'));
  check('se resalta el grupo que falta', !!document.querySelector('.bs-group.bs-group-missing'), document.querySelectorAll('.bs-group.bs-group-missing').length + ' resaltados');

  // ── Elegimos y ahora sí agrega
  click(document.querySelector('.bs-option[data-option-id="101"]'));
  await sleep(150);
  check('el resaltado desaparece al completar el grupo', !document.querySelector('.bs-group.bs-group-missing'));
  click(document.getElementById('bs-add-btn'));
  await sleep(300);
  check('con la opción elegida sí se agrega', badge() === '1', 'badge=' + badge());

  // ── Grupo 'multiple' con max_seleccion=1: la segunda opción no debe entrar
  click(document.querySelector('.producto-fila-add[data-prod-id="api-2"]'));
  await waitFor('#bs-sheet.open');
  await waitFor('.bs-option[data-group-id="11"]');
  click(document.querySelector('.bs-option[data-option-id="110"]'));
  await sleep(120);
  click(document.querySelector('.bs-option[data-option-id="111"]'));
  await sleep(150);
  const seleccionadas = [...document.querySelectorAll('.bs-option[data-group-id="11"].selected')];
  check('max_seleccion=1 respetado (solo una seleccionada)', seleccionadas.length === 1, 'seleccionadas=' + seleccionadas.length);
  click(document.getElementById('bs-add-btn'));
  await sleep(300);
  check('grupo multiple obligatorio cumplido: se agrega', badge() === '2', 'badge=' + badge());

  out.errores = window.__erroresJs;
  return out;
})()`;

const ESCENARIO_HAPPY_PATH = `(async () => {
  ${HELPERS}
  const out = { pasos: [], checks: {}, waUrl: null, resumen: '' };
  window.__erroresJs = [];
  window.__waUrls = [];
  window.addEventListener('error', (e) => window.__erroresJs.push('uncaught: ' + (e.message || e.type)));
  window.open = function (url) { window.__waUrls.push(url); return { closed: false, focus() {}, close() {}, postMessage() {} }; };
  const check = (n, ok, d) => { out.checks[n] = { ok: !!ok, detalle: d === undefined ? '' : String(d) }; };

  await waitFor('.producto-fila-add');
  out.pasos.push('menú cargado: ' + document.querySelectorAll('.producto-fila-add').length + ' productos');

  // Producto sin modificadores -> agregado directo
  click(document.querySelector('.producto-fila-add[data-prod-id="api-3"]'));
  await sleep(250);
  check('agregar producto sin modificadores', badge() === '1', 'badge=' + badge());

  // Producto con modificador con precio
  click(document.querySelector('.producto-fila-add[data-prod-id="api-1"]'));
  await waitFor('#bs-sheet.open');
  await waitFor('.bs-option[data-option-id="101"]');
  click(document.querySelector('.bs-option[data-option-id="101"]'));
  await sleep(150);
  const btnAdd = document.getElementById('bs-add-btn');
  check('el total del sheet suma el modificador (+$500)', btnAdd.textContent.includes('15.500'), btnAdd.textContent.trim());
  click(btnAdd);
  await sleep(300);
  check('agregar producto con modificador', badge() === '2', 'badge=' + badge());

  // Carrito -> checkout
  click(document.querySelector('.cart-floating-btn'));
  await waitFor('#cart-sidebar.open');
  click(document.querySelector('[data-action="ir-checkout"]'));
  await waitFor('#step-2.active');
  check('el wizard arranca en el paso 1', document.querySelector('.checkout-paso[data-paso="1"]').classList.contains('active'));

  // Paso 1: entrega a domicilio exige dirección
  const btnSig = document.getElementById('btn-paso-siguiente');
  check('paso 1: Continuar bloqueado sin dirección', btnSig.disabled === true, 'disabled=' + btnSig.disabled);
  write(document.getElementById('form-direccion'), 'Av. Siempreviva 742');
  await sleep(120);
  check('paso 1: Continuar habilitado con dirección', btnSig.disabled === false, 'disabled=' + btnSig.disabled);
  click(btnSig);

  // Paso 2: método de pago obligatorio
  await waitFor('.checkout-paso[data-paso="2"].active');
  check('paso 2: Continuar bloqueado sin método de pago', btnSig.disabled === true, 'disabled=' + btnSig.disabled);
  const radio = document.querySelector('input[name="pago"][value="Efectivo"]');
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(120);
  check('paso 2: Continuar habilitado con pago', btnSig.disabled === false, 'disabled=' + btnSig.disabled);
  click(btnSig);

  // Paso 3: nombre obligatorio + resumen
  await waitFor('.checkout-paso[data-paso="3"].active');
  const btnEnviar = document.getElementById('btn-enviar-pedido');
  check('paso 3: botón Enviar visible', btnEnviar.hidden === false, 'hidden=' + btnEnviar.hidden);
  check('paso 3: Enviar bloqueado sin nombre', btnEnviar.disabled === true, 'disabled=' + btnEnviar.disabled);
  out.resumen = document.getElementById('resumen-checkout').textContent.replace(/\\s+/g, ' ').trim();
  write(document.getElementById('form-nombre'), 'Juan Pérez');
  await sleep(120);
  check('paso 3: Enviar habilitado con nombre', btnEnviar.disabled === false, 'disabled=' + btnEnviar.disabled);

  click(btnEnviar);
  await sleep(400);
  out.waUrl = window.__waUrls[0] || null;
  check('se dispara la apertura de WhatsApp', !!out.waUrl, out.waUrl ? 'ok' : 'nunca se llamó a window.open');
  check('el carrito se vacía al enviar', badge() === '0', 'badge=' + badge());
  out.errores = window.__erroresJs;
  return out;
})()`;

const ESTADO_SW = `(async () => {
  let contenido = '';
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    const r = (await c.match('/app.js')) || (await c.match(location.origin + '/app.js'));
    if (r) contenido = await r.text();
  }
  return {
    version: window.__APP_VERSION || null,
    controlado: !!navigator.serviceWorker.controller,
    caches: await caches.keys(),
    cacheAppJs: contenido.includes("__APP_VERSION='A'") ? 'A' : (contenido.includes("__APP_VERSION='B'") ? 'B' : (contenido ? '?' : 'vacío')),
  };
})()`;

// ---------- Runner ----------
let chrome, siteServer, apiServer, page;
const evaluate = async (expr) => {
  const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('error en la página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

try {
  const chromePath = await encontrarChrome();
  siteServer = createServer(serveStatic).listen(SITE_PORT);
  apiServer = createServer(serveApi).listen(API_PORT);
  await sleep(300);

  const profile = join(ROOT, 'tests', 'e2e', '.chrome-profile');
  await rm(profile, { recursive: true, force: true });
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
    '--disable-dev-shm-usage', '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
    await sleep(250);
  }
  if (!version) throw new Error('Chrome no expuso el puerto de depuración');

  log(`\n🌐 ${version.Browser}   ${LEGACY ? '[CONTROL: sw.js viejo]' : '[sw.js actual]'}\n`);

  let target;
  try { target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch {}
  if (!target || !target.webSocketDebuggerUrl) {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('no hay target de página en Chrome');

  page = connect(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  const excepciones = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      excepciones.push(((d.exception && d.exception.description) || d.text).split('\n')[0]);
    }
  });

  const load = async () => {
    const done = new Promise((r) => { page.on((m) => { if (m.method === 'Page.loadEventFired') r(); }); setTimeout(r, 15000); });
    await page.send('Page.navigate', { url: `http://localhost:${SITE_PORT}/` });
    await done;
  };
  const cartVacio = async () => { try { await evaluate("localStorage.removeItem('lomitos_carrito')"); } catch {} };

  // ── Fase 0: instalación del service worker ──
  log('━━━ Service worker ━━━');
  await load();
  let controlado = false;
  for (let i = 0; i < 40; i++) {
    try { if (await evaluate('!!navigator.serviceWorker.controller')) { controlado = true; break; } } catch {}
    await sleep(250);
  }
  log(`  · ${controlado ? 'activo y controlando la página' : 'NO llegó a activarse'}`);
  await sleep(2500);           // deja pasar la recarga automática por controllerchange
  await cartVacio();
  await load();
  await sleep(500);

  // ── Fase 1: validaciones de modificadores ──
  log('\n━━━ Validaciones de modificadores obligatorios ━━━');
  const m = await evaluate(ESCENARIO_MODIFICADORES);
  for (const [n, c] of Object.entries(m.checks)) assert(n, c.ok, c.detalle);

  // ── Fase 2: happy path ──
  log('\n━━━ Flujo del carrito hasta el envío por WhatsApp ━━━');
  await cartVacio();
  await load();
  await sleep(500);
  const h = await evaluate(ESCENARIO_HAPPY_PATH);
  for (const p of h.pasos) log('  · ' + p);
  for (const [n, c] of Object.entries(h.checks)) assert(n, c.ok, c.detalle);

  if (h.waUrl) {
    assert('URL de WhatsApp correcta', h.waUrl.startsWith('https://wa.me/5493704218188?text='), h.waUrl.slice(0, 55) + '…');
    const texto = decodeURIComponent(h.waUrl.split('?text=')[1] || '');
    log('\n  ── mensaje formateado ──');
    log(texto.split('\n').map((l) => '  │ ' + l).join('\n'));
    assert('el mensaje incluye el nombre del cliente', texto.includes('*Cliente:* Juan Pérez'));
    assert('el mensaje incluye la dirección', texto.includes('*Dirección:* Av. Siempreviva 742'));
    assert('el mensaje incluye el método de pago', texto.includes('*Método de pago:* Efectivo'));
    assert('el mensaje incluye el modificador elegido', texto.includes('(+Salsa picante)'), texto.match(/\(\+[^)]*\)/)?.[0] || 'sin modificador');
    assert('el mensaje incluye todos los productos', texto.includes('Gaseosa 500ml') && texto.includes('Lomito Árabe Simple'));
    assert('el total refleja el modificador de +$500', texto.includes('*TOTAL: $18.500*'), texto.split('\n').pop());
  }

  // ── Fase 3: el deploy nuevo llega solo ──
  log('\n━━━ Caché: ¿un deploy nuevo llega sin que el cliente limpie nada? ━━━');
  appVersion = 'B';
  await sleep(200);
  await load();
  await sleep(900);
  const est = await evaluate(ESTADO_SW);
  log(`  · la caché del SW tenía app.js versión A; la página ejecutó la versión ${est.version}`);
  if (LEGACY) {
    assert('control negativo: con cache-first el cliente queda con el JS viejo', est.version === 'A', 'ejecutó ' + est.version);
  } else {
    assert('el deploy nuevo llega sin limpiar caché', est.version === 'B', 'ejecutó ' + est.version);
    assert('la caché se revalidó sola', est.cacheAppJs === 'B', 'caché: ' + est.cacheAppJs);
  }
  assert('el service worker quedó controlando la página', est.controlado, 'caches: ' + JSON.stringify(est.caches));

  // ── Errores de JS ──
  const errores = [...new Set([...m.errores, ...h.errores, ...excepciones])];
  log('\n━━━ Errores de JS durante el flujo ━━━');
  if (errores.length) errores.forEach((e) => log('  ⚠️  ' + e));
  else log('  (ninguno)');
  assert('sin errores de JS en el flujo', errores.length === 0, errores.join(' | ').slice(0, 160));
} catch (e) {
  log('\n💥 Falló el test: ' + e.message);
  process.exitCode = 1;
} finally {
  page?.close();
  try { chrome?.kill(); } catch {}
  siteServer?.close();
  apiServer?.close();
  await sleep(300);
  const fallos = resultados.filter((r) => !r.ok);
  log(`\n━━━ RESULTADO${LEGACY ? ' (CONTROL)' : ''}: ${resultados.length - fallos.length}/${resultados.length} checks OK ━━━`);
  fallos.forEach((f) => log(`  ❌ ${f.nombre} — ${f.detalle}`));
  if (fallos.length) process.exitCode = 1;
}
