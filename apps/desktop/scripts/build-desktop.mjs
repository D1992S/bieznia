import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const srcDir = path.join(appRoot, 'src');
const outDir = path.join(appRoot, 'dist');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: outDir,
  sourcemap: true,
  external: ['electron', 'better-sqlite3'],
  legalComments: 'none',
  logLevel: 'info',
};

const buildConfigs = [
  {
    ...sharedOptions,
    format: 'esm',
    entryPoints: [path.join(srcDir, 'main.ts')],
    outbase: srcDir,
  },
  {
    ...sharedOptions,
    format: 'cjs',
    entryPoints: [path.join(srcDir, 'preload.ts')],
    outbase: srcDir,
  },
];

async function run() {
  if (!isWatch) {
    for (const config of buildConfigs) {
      await esbuild.build(config);
    }
    return;
  }

  const contexts = [];
  for (const config of buildConfigs) {
    const context = await esbuild.context(config);
    contexts.push(context);
    await context.watch();
  }

  process.on('SIGINT', async () => {
    for (const context of contexts) {
      await context.dispose();
    }
    process.exit(0);
  });
}

run().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
