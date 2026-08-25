// ============================================================
//  Global setup: arranca wrangler dev antes de los tests E2E
//  y lo detiene después.
// ============================================================

import { execSync } from 'child_process';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_ROOT = join(__dirname, '..', '..');
const PID_FILE = join(__dirname, '.e2e-pid');
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;

function killExisting() {
  // Kill by stored PID first (use /T to kill the full process tree on Windows)
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
      if (!isNaN(pid)) {
        if (process.platform === 'win32') {
          try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'pipe' }); } catch {}
        } else {
          try { process.kill(-pid, 'SIGTERM'); } catch {}
          try { process.kill(-pid, 'SIGKILL'); } catch {}
        }
      }
      try { unlinkSync(PID_FILE); } catch {}
    }
  } catch {}

  // On Windows, also kill workerd.exe (the actual process binding the port)
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM workerd.exe 2>nul', { stdio: 'pipe' });
    } else {
      execSync(`lsof -ti:${PORT} | xargs -r kill -9 2>/dev/null || true`, { stdio: 'pipe' });
    }
  } catch {}
}

export async function setup() {
  console.log(`\n🔧 E2E Setup: initializing D1 + starting wrangler dev on port ${PORT}...\n`);
  killExisting();
  await sleep(1000);

  // Init D1 with schema
  try {
    execSync(`npx wrangler d1 execute lomitos-db-e2e --local --file=schema.sql --config wrangler.e2e.toml`, {
      cwd: ADMIN_ROOT, timeout: 15000, stdio: 'pipe',
    });
  } catch (e) {
    console.warn('   Schema init warning:', e.message?.slice(0, 100));
  }

  // Clean previous test data to avoid UNIQUE constraint errors on re-runs
  const tables = ['modifier_options', 'modifier_groups', 'productos', 'categorias', 'promos', 'config', 'rate_limits'];
  for (const t of tables) {
    try {
      execSync(`npx wrangler d1 execute lomitos-db-e2e --local --config wrangler.e2e.toml --command "DELETE FROM ${t}"`, {
        cwd: ADMIN_ROOT, timeout: 5000, stdio: 'pipe',
      });
    } catch {}
  }

  // Seed test data
  try {
    execSync(`npx wrangler d1 execute lomitos-db-e2e --local --config wrangler.e2e.toml --command "INSERT INTO categorias (id, nombre, icono, orden) VALUES (1, 'Lomitos Test', '🌯', 1)"`, {
      cwd: ADMIN_ROOT, timeout: 10000, stdio: 'pipe',
    });
    execSync(`npx wrangler d1 execute lomitos-db-e2e --local --config wrangler.e2e.toml --command "INSERT INTO productos (id, categoria_id, nombre, descripcion, precio, stock, imagen, activo, orden) VALUES (1, 1, 'Lomito Test Simple', 'Un lomito de prueba', 15000, 10, '', 1, 1)"`, {
      cwd: ADMIN_ROOT, timeout: 10000, stdio: 'pipe',
    });
  } catch (e) {
    console.warn('   Seed warning:', e.message?.slice(0, 100));
  }

  // Start wrangler — no detached: true
  // On Windows we need shell:true for npx.cmd, but without detached
  // the child stays alive as long as the parent (vitest) keeps running.
  const child = spawn('npx', [
    'wrangler', 'dev', '--port', String(PORT),
    '--config', 'wrangler.e2e.toml', '--local', '--log-level', 'error',
  ], {
    cwd: ADMIN_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log(`   wrangler PID: ${child.pid}`);

  // Capture stderr for diagnostics
  child.stderr?.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.error('   [wrangler stderr]', msg.slice(0, 200));
  });

  // Poll until ready
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`${BASE}/api/menu`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { console.log('   ✅ Server ready!\n'); return; }
    } catch {}
    await sleep(1000);
  }
  throw new Error('wrangler dev no arrancó en 45s');
}

export async function teardown() {
  console.log('\n🔧 E2E Teardown: stopping wrangler dev...\n');
  killExisting();
}
