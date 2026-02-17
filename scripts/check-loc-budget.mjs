import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const budgets = [
  { file: 'apps/ui/src/App.tsx', maxLines: 600 },
  { file: 'apps/desktop/src/main.ts', maxLines: 700 },
  { file: 'apps/ui/src/hooks/use-dashboard-data.ts', maxLines: 400 },
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
  console.error('Naruszono budżet LOC dla plików brzegowych:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Budżet LOC: OK');
for (const budget of budgetWithLines) {
  console.log(`- ${budget.file}: ${budget.lines}/${budget.maxLines}`);
}
