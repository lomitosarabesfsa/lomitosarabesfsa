// ============================================================
//  El espejo de GitHub Pages redirige al sitio oficial
//
//  El sitio quedó publicado en dos lugares y el link viejo
//  (lomitosarabesfsa.github.io/lomitosarabesfsa/) siguió circulando:
//  ahí el menú moría por CORS. Este test verifica que quien entra por
//  ese host aterrice en pages.dev conservando la ruta — y que el host
//  oficial NO se redirija a sí mismo (nada de bucles).
//
//  No toca DNS, hosts ni HTTPS: intercepta la navegación por CDP y
//  entrega el index.html del repo como si viniera de ese dominio, así
//  el navegador ve el hostname real y ejecuta el redirect de verdad.
//
//  Ejecutar:  node tests/e2e/espejo-github-pages.mjs
//             CHROME_PATH=/ruta/a/chrome node tests/e2e/espejo-github-pages.mjs
// ============================================================
import { createServer } from 'http';
import { readFile, rm, access } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CDP_PORT = 9444;
const SITE_PORT = 8135;
const OFICIAL = 'https://lomitosarabesfsa.pages.dev';
const ESPEJO = 'https://lomitosarabesfsa.github.io';
const resultados = [];

function log(msg = '') { console.log(msg); }
function assert(nombre, ok, detalle = '') {
  resultados.push({ nombre, ok: !!ok, detalle: String(detalle) });
  log(`  ${ok ? '✅' : '❌'} ${nombre}${detalle ? '  → ' + detalle : ''}`);
}

// ---------- Sitio local (control: el mismo HTML en otro host) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };

function servirSitio(req, res) {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/') p = '/index.html';
  readFile(join(ROOT, decodeURIComponent(p)))
    .then((buf) => { res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf); })
    .catch(() => { res.writeHead(404); res.end('404'); });
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

let chrome, page, siteServer;
const evaluate = async (expr) => {
  const r = await page.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('error en la página: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};

try {
  const chromePath = await encontrarChrome();
  // Los dos archivos que llevan el redirect, cada uno en su ruta
  const landingLocal = await readFile(join(ROOT, 'index.html'));
  const panelLocal = await readFile(join(ROOT, 'admin', 'panel', 'index.html'));
  siteServer = createServer(servirSitio).listen(SITE_PORT);
  await sleep(300);

  const profile = join(ROOT, 'tests', 'e2e', '.chrome-profile-espejo');
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

  let target;
  try { target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch {}
  if (!target?.webSocketDebuggerUrl) {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  }
  if (!target?.webSocketDebuggerUrl) throw new Error('no hay target de página en Chrome');

  page = connect(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Page.enable');
  await page.send('Runtime.enable');

  // La navegación a esos dos dominios se responde con el index.html del
  // repo: el navegador queda con el hostname real y ejecuta el redirect.
  const delRepo = /^https:\/\/(?:lomitosarabesfsa\.github\.io|lomitosarabesfsa\.pages\.dev)\//;
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  page.on((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request, resourceType } = m.params;
    if (resourceType === 'Document' && delRepo.test(request.url)) {
      const esPanel = /\/admin\/panel\//.test(new URL(request.url).pathname);
      const cuerpo = esPanel ? panelLocal : landingLocal;
      page.send('Fetch.fulfillRequest', {
        requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: cuerpo.toString('base64'),
      }).catch(() => {});
    } else {
      page.send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  });

  const esperarUrl = async (empiezaCon, ms = 20000) => {
    const t0 = Date.now();
    let url = '';
    while (Date.now() - t0 < ms) {
      try { url = await evaluate('location.href'); } catch {}
      if (url.startsWith(empiezaCon)) return url;
      await sleep(200);
    }
    return url;
  };
  const ir = async (url, ms = 800) => { await page.send('Page.navigate', { url }); await sleep(ms); };
  const partes = (url) => { try { return new URL(url); } catch { return null; } };

  log(`\n🌐 ${version.Browser}  ·  espejo simulado por CDP (sin tocar DNS ni hosts)\n`);

  log('━━━ Link viejo: github.io/lomitosarabesfsa/ ━━━');
  await page.send('Page.navigate', { url: `${ESPEJO}/lomitosarabesfsa/` });
  const portada = await esperarUrl(`${OFICIAL}/`);
  const u = partes(portada);
  assert('el espejo manda al sitio oficial', portada.startsWith(OFICIAL + '/'), portada || '(sin url)');
  assert('cae en la raíz (no arrastra /lomitosarabesfsa/)', !!u && u.pathname === '/', u ? u.pathname : '(sin url)');
  assert('aterriza en un origen que el Worker autoriza', !!u && u.origin === OFICIAL, u ? u.origin : '(sin url)');

  log('\n━━━ Link viejo con ruta: el panel (con su propio index.html) ━━━');
  await page.send('Page.navigate', { url: `${ESPEJO}/lomitosarabesfsa/admin/panel/` });
  const panel = await esperarUrl(`${OFICIAL}/admin/panel`);
  assert('el panel también redirige, conservando la ruta', panel === `${OFICIAL}/admin/panel/`, panel || '(sin url)');

  log('\n━━━ Control: el sitio oficial no se redirige a sí mismo ━━━');
  await ir(`${OFICIAL}/`, 2500);
  const oficial = await evaluate('location.href');
  assert('pages.dev se queda donde está (sin bucle)', oficial.startsWith(OFICIAL + '/'), oficial);

  log('\n━━━ Control: el mismo HTML en otro host tampoco se redirige ━━━');
  await ir(`http://localhost:${SITE_PORT}/`, 1500);
  const ajeno = await evaluate('location.href');
  assert('un host que no es el espejo no se redirige', ajeno.startsWith(`http://localhost:${SITE_PORT}/`), ajeno);
} catch (e) {
  log('\n💥 Falló el test: ' + e.message);
  process.exitCode = 1;
} finally {
  page?.close();
  try { chrome?.kill(); } catch {}
  siteServer?.close();
  await sleep(300);
  const fallos = resultados.filter((r) => !r.ok);
  log(`\n━━━ RESULTADO: ${resultados.length - fallos.length}/${resultados.length} checks OK ━━━`);
  fallos.forEach((f) => log(`  ❌ ${f.nombre} — ${f.detalle}`));
  if (fallos.length) process.exitCode = 1;
}
