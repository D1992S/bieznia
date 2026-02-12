import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = new Set();

function spawnProcess(args, env = {}) {
  const child = spawn(pnpmCmd, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  children.add(child);
  child.on('exit', () => {
    children.delete(child);
  });
  return child;
}

function runAndWait(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(args, env);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Polecenie zakończone kodem ${String(code)}: pnpm ${args.join(' ')}`));
    });
  });
}

function waitForPort(host, port, timeoutMs) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });

      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timeout: serwer ${host}:${String(port)} nie wystartował.`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

function shutdown(exitCode) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

async function main() {
  console.log('[dev] Build desktop runtime...');
  await runAndWait(['--filter', '@moze/desktop', 'run', 'build']);

  console.log('[dev] Start UI dev server...');
  const uiProcess = spawnProcess([
    '--filter',
    '@moze/ui',
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
  ]);

  uiProcess.on('exit', (code) => {
    if (code !== 0) {
      shutdown(code ?? 1);
    }
  });

  console.log('[dev] Wait for UI at http://127.0.0.1:5173 ...');
  await waitForPort('127.0.0.1', 5173, 60_000);

  console.log('[dev] Start Electron...');
  const electronProcess = spawnProcess(
    ['--filter', '@moze/desktop', 'run', 'start'],
    {
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
    },
  );

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[dev] Błąd uruchomienia:', error);
  shutdown(1);
});
