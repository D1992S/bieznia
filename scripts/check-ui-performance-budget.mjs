import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const assetsDir = path.join(repoRoot, 'apps', 'ui', 'dist', 'assets');

const INDEX_BUDGET_BYTES = 380_000;
const CHART_BUDGET_BYTES = 420_000;
const TOTAL_JS_BUDGET_BYTES = 800_000;

function formatBytes(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

let assetFiles;
try {
  assetFiles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
} catch {
  console.error('Brak zbudowanych assetów UI. Uruchom najpierw `pnpm build`.');
  process.exit(1);
}

const indexBundle = assetFiles.find((name) => name.startsWith('index-') && name.endsWith('.js'));
const chartBundle = assetFiles.find((name) => name.startsWith('studio-forecast-chart-') && name.endsWith('.js'));

if (!indexBundle || !chartBundle) {
  console.error('Nie znaleziono wymaganych bundli index/studio-forecast-chart w apps/ui/dist/assets.');
  process.exit(1);
}

const indexSize = statSync(path.join(assetsDir, indexBundle)).size;
const chartSize = statSync(path.join(assetsDir, chartBundle)).size;
const totalJsSize = assetFiles.reduce((sum, fileName) => sum + statSync(path.join(assetsDir, fileName)).size, 0);

const violations = [];
if (indexSize > INDEX_BUDGET_BYTES) {
  violations.push(`index bundle ${indexBundle} ma ${formatBytes(indexSize)} (limit ${formatBytes(INDEX_BUDGET_BYTES)}).`);
}
if (chartSize > CHART_BUDGET_BYTES) {
  violations.push(`chart bundle ${chartBundle} ma ${formatBytes(chartSize)} (limit ${formatBytes(CHART_BUDGET_BYTES)}).`);
}
if (totalJsSize > TOTAL_JS_BUDGET_BYTES) {
  violations.push(`suma bundli JS ma ${formatBytes(totalJsSize)} (limit ${formatBytes(TOTAL_JS_BUDGET_BYTES)}).`);
}

if (violations.length > 0) {
  console.error('Naruszono budżet wydajności UI:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Budżet wydajności UI: OK');
console.log(`- index: ${formatBytes(indexSize)} (${indexBundle})`);
console.log(`- chart: ${formatBytes(chartSize)} (${chartBundle})`);
console.log(`- total JS: ${formatBytes(totalJsSize)}`);
