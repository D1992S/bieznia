import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const budgets = [
  // Real hotspot budget guards (not thin wrappers).
  { file: 'apps/ui/src/features/studio/studio-app.tsx', maxLines: 3000 },
  { file: 'apps/desktop/src/runtime/desktop-main.ts', maxLines: 2000 },
  { file: 'apps/desktop/src/ipc-handlers.ts', maxLines: 900 },
  { file: 'apps/ui/src/hooks/dashboard/use-dashboard-data-core.ts', maxLines: 850 },
];

function countLines(content) {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

const violations = [];
const budgetWithLines = [];

for (const budget of budgets) {
  const absolutePath = path.join(repoRoot, budget.file);
  const content = readFileSync(absolutePath, 'utf8');
  const lines = countLines(content);
  budgetWithLines.push({ ...budget, lines });
  if (lines > budget.maxLines) {
    violations.push(`${budget.file}: ${lines} linii (limit ${budget.maxLines}).`);
  }
}

if (violations.length > 0) {
  console.error('Naruszono budzet LOC dla hotspotow:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Budzet LOC hotspotow: OK');
for (const budget of budgetWithLines) {
  console.log(`- ${budget.file}: ${budget.lines}/${budget.maxLines}`);
}
