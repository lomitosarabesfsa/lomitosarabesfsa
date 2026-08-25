#!/usr/bin/env node
// Helper: start wrangler dev and keep it running
import { execSync } from 'child_process';
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const PORT = 8799;

console.log(`Starting wrangler dev on port ${PORT}...`);

const child = spawn('npx', [
  'wrangler', 'dev', '--port', String(PORT),
  '--config', 'wrangler.e2e.toml',
  '--local', '--log-level', 'error'
], {
  cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});

// Write PID for cleanup
writeFileSync(new URL('.e2e-pid', import.meta.url), String(child.pid));
console.log(`PID: ${child.pid}`);

child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));

child.on('error', err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});

child.on('exit', code => {
  console.log(`wrangler exited with code ${code}`);
  process.exit(code || 0);
});

// Keep alive
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
