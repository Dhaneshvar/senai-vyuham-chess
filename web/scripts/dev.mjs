import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const projectRoot = resolve(webRoot, '..');
const running = new Set();

const launch = (script, args = [], cwd = projectRoot) => {
  const child = spawn(process.execPath, [script, ...args], { cwd, stdio: 'inherit', windowsHide: true });
  running.add(child);
  child.on('exit', () => running.delete(child));
  return child;
};

let serverReady = false;
try {
  const response = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(1000) });
  serverReady = response.ok;
} catch { /* Start the local analysis server below. */ }

if (!serverReady) launch(resolve(projectRoot, 'server/src/index.js'));
const vite = launch(resolve(webRoot, 'node_modules/vite/bin/vite.js'), ['--host', '0.0.0.0'], webRoot);

const shutdown = () => { for (const child of running) child.kill(); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vite.on('exit', (code) => { shutdown(); process.exitCode = code ?? 0; });
