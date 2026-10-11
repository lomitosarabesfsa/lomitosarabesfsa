// ============================================================
//  FLUJO COMPLETO — panel → Worker real → D1 real → landing → cliente
//
//  Sin Docker y sin fixtures: wrangler dev levanta workerd (el mismo
//  runtime que usa Cloudflare en producción) con su D1 local, el repo
//  se sirve como sitio en el puerto 3000 (origen permitido por el CORS
//  del Worker) y un Chrome real maneja el flujo por CDP.
//
//  Ejecutar:  node tests/e2e/flujo-completo.mjs
//
//  El camino que recorre es el que hace una persona de punta a punta:
//   1. la landing muestra el menú que sale de D1 vía la API
//   2. el panel entra con usuario y clave y publica una campaña
//      (posición 1, promocional, temporal) → las demás se corren
//   3. el panel le carga un producto a esa campaña
//   4. el cliente ve la campaña primera, destacada y con cronómetro
//   5. al vencer, la campaña se va sola del menú y del carrito
//   6. la API ya no la sirve y el panel la marca "Vencida"
//   7. el cliente pide un producto real y sale por WhatsApp
// ============================================================
import { createServer } from 'http';
import { readFile, rm, access } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADMIN = join(ROOT, 'admin');
const SITE_PORT = 3000;
const API_PORT = 8787;
const CDP_PORT = 9333;
const SITE = `http://localhost:${SITE_PORT}`;
const API = `http://127.0.0.1:${API_PORT}`;
const LOG = [];
const resultados = [];

function log(msg = '') { LOG.push(msg); console.log(msg); }

function assert(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok: !!ok, detalle: String(detalle) });
  log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? '  → ' + detalle : ''}`);
}

function mostrar(checks) {
  for (const [n, c] of Object.entries(checks)) assert(n, c.ok, c.detalle);
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

// ---------- Puertos y procesos ----------
function liberarPuerto(puerto) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr LISTENING | findstr :${puerto}`, { stdio: 'pipe' }).toString();
      const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(p => /^\d+$/.test(p)))];
      for (const pid of pids) { try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' }); log(`   (liberé el puerto ${puerto}: PID ${pid})`); } catch {} }
    } else {
      execSync(`lsof -ti:${puerto} | xargs -r kill -9 2>/dev/null || true`, { stdio: 'pipe' });
    }
  } catch {}
}

// ---------- D1 local (la base de verdad, con el esquema de producción) ----------
function d1(args, timeout = 20000) {
  return execSync(`npx wrangler d1 execute lomitos-db-e2e --local --config wrangler.e2e.toml ${args}`, {
    cwd: ADMIN, timeout, stdio: 'pipe',
  });
}

function prepararBase() {
  log('   · esquema + migraciones');
  try { d1('--file=schema.sql'); } catch (e) { log('   (schema: ' + String(e.message).slice(0, 80) + ')'); }
  try { d1('--file=migrate-categorias-promocional.sql'); } catch (e) { log('   (migración ya aplicada)'); }

  log('   · datos limpios + menú base');
  for (const t of ['modifier_options', 'modifier_groups', 'productos', 'categorias', 'promos', 'config', 'rate_limits']) {
    try { d1(`--command "DELETE FROM ${t}"`, 8000); } catch {}
  }
  d1(`--command "INSERT INTO categorias (id, nombre, icono, orden) VALUES (1, 'Lomitos Test', '', 1)"`);
  d1(`--command "INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (1, 1, 'Lomito Test Simple', 'Un lomito de prueba', 15000, 10, '', 1, 1)"`);
}

// ---------- Worker real (workerd) ----------
async function levantarWorker() {
  log(`   · wrangler dev en ${API_PORT} (workerd + D1 local)`);
  const child = spawn('npx', [
    'wrangler', 'dev', '--port', String(API_PORT),
    '--config', 'wrangler.e2e.toml', '--local', '--log-level', 'error',
  ], {
    cwd: ADMIN,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stderr?.on('data', d => {
    const m = d.toString().trim();
    if (m) log('   [wrangler] ' + m.slice(0, 160));
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/api/menu`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return child;
    } catch {}
    await sleep(1000);
  }
  throw new Error('wrangler dev no arrancó en 60s');
}

function bajarProceso(child) {
  try { if (child?.pid) execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'pipe' }); } catch {}
  liberarPuerto(API_PORT);
}

// ---------- Servidor del sitio (landing + panel desde el repo) ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

async function servirSitio(req, res) {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/') p = '/index.html';
  const destino = join(ROOT, decodeURIComponent(p));
  if (!destino.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  let buf;
  try { buf = await readFile(destino); }
  catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(buf);
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

const HELPERS = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (el) => (el ? el.textContent.replace(/\\s+/g, ' ').trim() : '');
  const waitFor = async (sel, timeout) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeout || 15000)) {
      const el = document.querySelector(sel);
      if (el) return el;
      await sleep(50);
    }
    throw new Error('timeout esperando ' + sel);
  };
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  const write = (el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const badge = () => document.getElementById('cart-count-badge').textContent.trim();
  const check = (n, ok, d) => { out.checks[n] = { ok: !!ok, detalle: d === undefined ? '' : String(d) }; };
`;

// ---------- Acto 1: la landing consume la API y el menú de D1 ----------
const LANDING_MENU_REAL = `(async () => {
  ${HELPERS}
  const out = { checks: {}, datos: {} };
  await waitFor('#carta-container .carta-section');
  const titulos = [...document.querySelectorAll('#carta-container .carta-section-title')].map(e => txt(e));
  out.datos.titulos = titulos;
  check('la landing muestra la categoría que vive en D1', titulos.includes('Lomitos Test'), titulos.join(' | '));
  const fila = [...document.querySelectorAll('#carta-container .producto-fila')].find(f => txt(f).includes('Lomito Test Simple'));
  check('y el producto que vive en D1', !!fila, fila ? 'ok' : 'no aparece Lomito Test Simple');
  check('con el precio real de la base ($15.000)', !!(fila && txt(fila).includes('15.000')), fila ? txt(fila).slice(0, 80) : '');
  return out;
})()`;

// ---------- Acto 2: el panel publica la campaña ----------
const panelCampana = (hastaLocal) => `(async () => {
  ${HELPERS}
  const out = { checks: {}, datos: {} };

  // Login con las credenciales del wrangler.e2e.toml
  await waitFor('#login-btn');
  write(document.getElementById('login-user'), 'testadmin');
  write(document.getElementById('login-pass'), 'testpass123');
  click(document.getElementById('login-btn'));
  const app = document.getElementById('app');
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && app.style.display === 'none') await sleep(100);
  check('el panel entra al panel con usuario y clave contra el Worker real', app.style.display !== 'none', 'display=' + app.style.display);

  // Pestaña Categorías: ya hay una de D1
  click(document.querySelector('.sidebar-nav [data-tab="categorias"]'));
  await waitFor('#tab-categorias .cat-card');
  await sleep(250);
  check('el panel lista lo que hay en D1', document.querySelectorAll('.cat-card').length === 1, document.querySelectorAll('.cat-card').length + ' tarjeta(s)');

  // Nueva campaña: posición 1, promocional y temporal
  click(document.querySelector('#tab-categorias .toolbar [data-action="abrir-categoria"]'));
  await waitFor('#cat-nombre');
  write(document.getElementById('cat-nombre'), 'Caja Día de la Madre');
  write(document.getElementById('cat-icono'), '🎁');
  write(document.getElementById('cat-orden'), '1');
  const prom = document.getElementById('cat-promocional');
  prom.checked = true; prom.dispatchEvent(new Event('change', { bubbles: true }));
  const temp = document.getElementById('cat-temporal');
  temp.checked = true; temp.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(150);
  const hasta = document.getElementById('cat-hasta');
  hasta.step = 1; // precisión de segundos: así la campaña dura ~1 minuto y no una hora
  write(hasta, ${JSON.stringify(hastaLocal)});
  check('la fecha de fin entró en el formulario', hasta.value === ${JSON.stringify(hastaLocal)}, 'valor=' + hasta.value);
  click(document.getElementById('btn-guardar-cat'));

  let cards = [];
  const t1 = Date.now();
  while (Date.now() - t1 < 15000) {
    cards = [...document.querySelectorAll('.cat-card')];
    if (cards.length === 2 && txt(cards[0]).includes('Caja Día de la Madre')) break;
    await sleep(250);
  }
  check('la campaña quedó creada', cards.length === 2, cards.length + ' tarjeta(s)');
  const primero = cards[0], segundo = cards[1];
  check('quedó en la posición 1', !!primero && txt(primero.querySelector('h3')).includes('Caja Día de la Madre'), primero ? txt(primero.querySelector('h3')) : 'sin tarjetas');
  check('la que estaba primera se corrió al 2', !!(segundo && txt(segundo.querySelector('.cat-posicion')).includes('2')), segundo ? txt(segundo.querySelector('.cat-posicion')) : 'sin tarjetas');
  check('la tarjeta lleva el badge de promocional', !!(primero && primero.querySelector('.badge.promo')));
  check('la tarjeta lleva el badge de temporal', !!(primero && primero.querySelector('.badge.temp')));
  // El cronómetro del panel se llena en el primer tick (cada 1s), no al renderizar
  const timer = primero ? primero.querySelector('.cat-timer') : null;
  let timerTexto = txt(timer);
  const t2 = Date.now();
  while (Date.now() - t2 < 4000 && !timerTexto.toLowerCase().includes('termina en')) { await sleep(200); timerTexto = txt(timer); }
  check('el panel le puso cronómetro a la campaña', timerTexto.toLowerCase().includes('termina en'), timerTexto || 'sin cronómetro');
  out.datos.catId = primero ? parseInt(primero.dataset.id, 10) : null;
  return out;
})()`;

// ---------- Acto 3: el panel le carga un producto a la campaña ----------
const PANEL_PRODUCTO = `(async () => {
  ${HELPERS}
  const out = { checks: {} };
  click(document.querySelector('.sidebar-nav [data-tab="productos"]'));
  await sleep(200);
  click(document.querySelector('#tab-productos .toolbar [data-action="abrir-producto"]'));
  await waitFor('#p-nombre');
  const sel = document.getElementById('p-categoria');
  write(sel, String(window.__catId));
  write(document.getElementById('p-nombre'), 'Caja Madre x2');
  write(document.getElementById('p-precio'), '20000');
  write(document.getElementById('p-stock'), '10');
  write(document.getElementById('p-orden'), '1');
  check('el selector ofrece la campaña recién creada', sel.value === String(window.__catId), 'value=' + sel.value);
  click(document.getElementById('btn-guardar-producto'));
  let creado = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    if (txt(document.getElementById('lista-productos')).includes('Caja Madre x2')) { creado = true; break; }
    await sleep(250);
  }
  check('el producto quedó creado en la campaña', creado);
  check('el modal se cerró al guardar', !document.getElementById('overlay').classList.contains('open'));
  return out;
})()`;

// ---------- Acto 4: el cliente ve la campaña en la web ----------
const LANDING_CAMPANA = `(async () => {
  ${HELPERS}
  const out = { checks: {}, datos: {} };
  const secciones = () => [...document.querySelectorAll('#carta-container .carta-section')];
  await waitFor('#carta-container .carta-section');
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && secciones().length < 2) await sleep(150);
  out.datos.titulos = secciones().map(s => txt(s.querySelector('.carta-section-title')));
  check('las dos categorías llegan a la carta', secciones().length === 2, out.datos.titulos.join(' | '));
  const promo = document.querySelector('#carta-container .carta-section-promo');
  check('la campaña quedó primera en la web (el corrimiento llegó hasta el cliente)', promo === secciones()[0], out.datos.titulos.join(' | '));
  check('la sección se destaca con su badge', !!(promo && promo.querySelector('.carta-promo-badge')), promo && promo.querySelector('.carta-promo-badge') ? txt(promo.querySelector('.carta-promo-badge')) : 'sin badge');
  const chip = document.querySelector('#carta-chips .carta-chip-promo');
  check('el chip de la campaña está destacado en la barra', !!chip, chip ? txt(chip) : 'sin chip');
  const cd = promo ? promo.querySelector('.carta-countdown .cd-valor') : null;
  const v1 = txt(cd);
  await sleep(1300);
  const v2 = txt(cd);
  out.datos.countdown = [v1, v2];
  check('el cronómetro corre en la web', v1 !== '' && v2 !== '' && v1 !== v2, v1 + ' → ' + v2);
  const fila = promo ? [...promo.querySelectorAll('.producto-fila')].find(f => txt(f).includes('Caja Madre x2')) : null;
  check('el producto de la campaña aparece en su sección', !!fila, fila ? txt(fila).slice(0, 70) : 'no aparece');
  check('con el precio que cargó el panel ($20.000)', !!(fila && txt(fila).includes('20.000')), fila ? txt(fila).slice(0, 90) : '');
  return out;
})()`;

// ---------- Acto 5: vence la campaña (sin recargar) ----------
const LANDING_VENCIMIENTO = `(async () => {
  ${HELPERS}
  const out = { checks: {}, datos: {} };
  window.__marca = 'sin-recargar-' + Date.now();
  const fila = [...document.querySelectorAll('#carta-container .producto-fila')].find(f => txt(f).includes('Caja Madre x2'));
  check('la campaña sigue activa antes de esperar', !!document.querySelector('#carta-container .carta-section-promo'));
  check('el producto de la campaña está en el menú', !!fila);
  click(fila.querySelector('.producto-fila-add'));
  await sleep(300);
  check('el cliente lo puso en el carrito', badge() === '1', 'badge=' + badge());

  const t0 = Date.now();
  let quitada = false;
  while (Date.now() - t0 < 120000) {
    if (!document.querySelector('#carta-container .carta-section-promo')) { quitada = true; break; }
    await sleep(500);
  }
  out.datos.espera = Math.round((Date.now() - t0) / 1000) + 's';
  check('al vencer, la campaña se fue sola del menú', quitada, out.datos.espera);
  check('la página nunca se recargó (el vencimiento corrió en vivo)', window.__marca.indexOf('sin-recargar-') === 0);
  const titulos = [...document.querySelectorAll('#carta-container .carta-section-title')].map(e => txt(e));
  check('el menú de siempre sigue en su lugar', titulos.length === 1 && titulos[0] === 'Lomitos Test', titulos.join(' | '));
  check('el carrito soltó el producto de la campaña', badge() === '0', 'badge=' + badge());
  check('el chip de la campaña desapareció de la barra', !document.querySelector('#carta-chips .carta-chip-promo'));
  return out;
})()`;

// ---------- Acto 6: el panel ve la campaña vencida ----------
const PANEL_VENCIDA = `(async () => {
  ${HELPERS}
  const out = { checks: {}, datos: {} };
  click(document.querySelector('.sidebar-nav [data-tab="categorias"]'));
  await waitFor('#tab-categorias .cat-card');
  await sleep(300);
  const cards = [...document.querySelectorAll('.cat-card')];
  out.datos.cantidad = cards.length;
  const card = cards.find(c => txt(c).includes('Caja Día de la Madre'));
  check('el panel sigue listando la campaña después de vencer', !!card, cards.length + ' tarjeta(s)');
  check('la marca como vencida', !!(card && card.querySelector('.badge.err') && txt(card.querySelector('.badge.err')).toLowerCase().includes('vencida')), card && card.querySelector('.badge.err') ? txt(card.querySelector('.badge.err')) : 'sin badge');
  return out;
})()`;

// ---------- Acto 7: el cliente pide y sale por WhatsApp ----------
const LANDING_PEDIDO = `(async () => {
  ${HELPERS}
  const out = { checks: {}, waUrl: null };
  window.__waUrls = [];
  window.open = function (url) { window.__waUrls.push(url); return { closed: false, focus() {}, close() {} }; };
  await waitFor('#carta-container .producto-fila');
  const fila = [...document.querySelectorAll('#carta-container .producto-fila')].find(f => txt(f).includes('Lomito Test Simple'));
  check('el producto real está en el menú', !!fila);
  click(fila.querySelector('.producto-fila-add'));
  await sleep(300);
  check('se agregó al carrito', badge() === '1', 'badge=' + badge());
  click(document.querySelector('.cart-floating-btn'));
  await waitFor('#cart-sidebar.open');
  click(document.querySelector('[data-action="ir-checkout"]'));
  await waitFor('#step-2.active');
  write(document.getElementById('form-direccion'), 'Av. Siempreviva 742');
  await sleep(150);
  click(document.getElementById('btn-paso-siguiente'));
  await waitFor('.checkout-paso[data-paso="2"].active');
  const radio = document.querySelector('input[name="pago"][value="Efectivo"]');
  radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(150);
  click(document.getElementById('btn-paso-siguiente'));
  await waitFor('.checkout-paso[data-paso="3"].active');
  write(document.getElementById('form-nombre'), 'Juan Pérez');
  await sleep(150);
  click(document.getElementById('btn-enviar-pedido'));
  await sleep(500);
  out.waUrl = window.__waUrls[0] || null;
  check('el pedido sale por WhatsApp', !!out.waUrl, out.waUrl ? 'ok' : 'nunca se abrió WhatsApp');
  check('el carrito queda vacío después de enviar', badge() === '0', 'badge=' + badge());
  return out;
})()`;

// ============================================================
//  RUNNER
// ============================================================
let chrome, sitio, worker, page;

// Red de seguridad: si algo explota fuera del try/finally, no se dejan
// Chrome, workerd ni el servidor del sitio colgados en la máquina.
let limpiezaHecha = false;
function limpiar() {
  if (limpiezaHecha) return;
  limpiezaHecha = true;
  try { page?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { sitio?.close(); } catch {}
  bajarProceso(worker);
}
for (const evento of ['uncaughtException', 'unhandledRejection']) {
  process.on(evento, (e) => {
    log(`\n💥 ${evento}: ${e && e.message ? e.message : e}`);
    limpiar();
    process.exit(1);
  });
}

const evaluar = async (expr) => {
  const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('error en la página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

async function irA(url) {
  const listo = new Promise((r) => { page.on((m) => { if (m.method === 'Page.loadEventFired') r(); }); setTimeout(r, 20000); });
  await page.send('Page.navigate', { url });
  await listo;
}

function hastaLocalEn(segundos) {
  const p = (n) => String(n).padStart(2, '0');
  // El panel interpreta el valor del input como hora de Formosa (UTC-3),
  // así que la fecha se calcula con su mismo criterio.
  const d = new Date(Date.now() + segundos * 1000 - 3 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

try {
  log('\n🧪 FLUJO COMPLETO — panel → Worker real → D1 real → landing → cliente\n');
  log(' Preparando infraestructura');
  liberarPuerto(SITE_PORT);
  liberarPuerto(API_PORT);
  liberarPuerto(CDP_PORT);
  prepararBase();
  worker = await levantarWorker();
  log(`   · Worker listo en ${API_PORT}`);
  sitio = createServer(servirSitio).listen(SITE_PORT);
  log(`   · landing + panel servidos desde ${SITE} (origen permitido por el CORS)\n`);
  await sleep(300);

  const chromePath = await encontrarChrome();
  const profile = join(ROOT, 'tests', 'e2e', '.chrome-profile');
  await rm(profile, { recursive: true, force: true });
  chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
    '--disable-dev-shm-usage', '--window-size=430,932', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
    await sleep(250);
  }
  if (!version) throw new Error('Chrome no expuso el puerto de depuración');
  log(`🌐 ${version.Browser}\n`);

  let target;
  try { target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch {}
  if (!target || !target.webSocketDebuggerUrl) {
    target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page');
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

  // ── Acto 1 ──
  log('━━━ 1. La landing sirve el menú real de D1 ━━━');
  await irA(`${SITE}/`);
  for (let i = 0; i < 32; i++) { try { if (await evaluar('!!navigator.serviceWorker.controller')) break; } catch {} await sleep(250); }
  await sleep(2500);       // deja pasar la recarga automática del service worker
  await irA(`${SITE}/`);
  await sleep(400);
  mostrar((await evaluar(LANDING_MENU_REAL)).checks);

  // ── Acto 2 y 3 ──
  const venceEn = hastaLocalEn(55);
  log('\n━━━ 2. El panel publica una campaña (posición 1, promocional, temporal) ━━━');
  await irA(`${SITE}/admin/panel/index.html`);
  const acto2 = await evaluar(panelCampana(venceEn));
  mostrar(acto2.checks);
  await evaluar(`window.__catId = ${acto2.datos.catId}`);

  log('\n━━━ 3. El panel le carga un producto a la campaña ━━━');
  mostrar((await evaluar(PANEL_PRODUCTO)).checks);

  // ── Acto 4 ──
  log('\n━━━ 4. El cliente ve la campaña en la web ━━━');
  await irA(`${SITE}/`);
  const acto4 = await evaluar(LANDING_CAMPANA);
  mostrar(acto4.checks);
  if (acto4.datos.countdown) log(`  · cronómetro: ${acto4.datos.countdown.join(' → ')}`);

  // ── Acto 5 ──
  log('\n━━━ 5. La campaña vence (sin recargar la página) ━━━');
  const acto5 = await evaluar(LANDING_VENCIMIENTO);
  mostrar(acto5.checks);

  // ── Acto 6 ──
  log('\n━━━ 6. La API deja de servirla y el panel la marca "Vencida" ━━━');
  const menu = await (await fetch(`${API}/api/menu`)).json();
  const titulosApi = (menu.categorias || []).map((c) => c.nombre);
  assert('GET /api/menu ya no incluye la campaña vencida', !titulosApi.some((t) => t.includes('Caja Día de la Madre')), titulosApi.join(' | '));
  assert('la categoría vigente sigue en la API', titulosApi.includes('Lomitos Test'), titulosApi.join(' | '));

  await irA(`${SITE}/admin/panel/index.html`);
  mostrar((await evaluar(PANEL_VENCIDA)).checks);

  // ── Acto 7 ──
  log('\n━━━ 7. El cliente pide un producto real y sale por WhatsApp ━━━');
  await irA(`${SITE}/`);
  const acto7 = await evaluar(LANDING_PEDIDO);
  mostrar(acto7.checks);
  if (acto7.waUrl) {
    const texto = decodeURIComponent(acto7.waUrl.split('?text=')[1] || '');
    assert('la URL de WhatsApp es la del local', acto7.waUrl.startsWith('https://wa.me/5493704218188?text='), acto7.waUrl.slice(0, 55) + '…');
    assert('el pedido lleva el producto que vive en D1', texto.includes('Lomito Test Simple'));
    assert('y el total con el precio de la base', texto.includes('*TOTAL: $15.000*'), texto.split('\n').pop());
    log('\n  ── mensaje formateado ──');
    log(texto.split('\n').map((l) => '  │ ' + l).join('\n'));
  }

  // ── Errores de JS ──
  log('\n━━━ Errores de JS durante el flujo ━━━');
  if (excepciones.length) excepciones.forEach((e) => log('  ⚠️  ' + e));
  else log('  (ninguno)');
  assert('sin errores de JS en todo el flujo', excepciones.length === 0, excepciones.join(' | ').slice(0, 160));
} catch (e) {
  log('\n💥 Falló la simulación: ' + e.message);
  log(e.stack?.split('\n').slice(1, 4).join('\n') || '');
  process.exitCode = 1;
} finally {
  limpiar();
  await sleep(500);
  const fallos = resultados.filter((r) => !r.ok);
  log(`\n━━━ RESULTADO: ${resultados.length - fallos.length}/${resultados.length} checks OK ━━━`);
  fallos.forEach((f) => log(`  ❌ ${f.nombre} — ${f.detalle}`));
  if (fallos.length) process.exitCode = 1;
}
