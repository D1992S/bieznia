import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function listFilesRecursive(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function parseImports(source) {
  const results = [];
  const staticImportPattern = /import\s+(?:type\s+)?(?:[^'"\n]+?)\s+from\s+['\"]([^'\"]+)['\"]/g;
  const sideEffectImportPattern = /import\s+['\"]([^'\"]+)['\"]/g;
  const dynamicImportPattern = /import\(\s*['\"]([^'\"]+)['\"]\s*\)/g;

  for (const pattern of [staticImportPattern, sideEffectImportPattern, dynamicImportPattern]) {
    let match = pattern.exec(source);
    while (match) {
      results.push(match[1]);
      match = pattern.exec(source);
    }
  }

  return results;
}

const violations = [];

const uiSourceRoot = path.join(repoRoot, 'apps', 'ui', 'src');
const sharedSourceRoot = path.join(repoRoot, 'packages', 'shared', 'src');
const sourceFiles = [
  ...listFilesRecursive(uiSourceRoot),
  ...listFilesRecursive(sharedSourceRoot),
].filter((filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx'));

for (const filePath of sourceFiles) {
  const source = readFileSync(filePath, 'utf8');
  const imports = parseImports(source);
  const relativeFilePath = path.relative(repoRoot, filePath).replaceAll('\\', '/');

  for (const importPath of imports) {
    if (relativeFilePath.startsWith('apps/ui/src/')) {
      if (importPath.startsWith('@moze/') && importPath !== '@moze/shared') {
        violations.push(`${relativeFilePath}: niedozwolony import ${importPath} (UI może importować tylko @moze/shared).`);
      }
    }

    if (relativeFilePath.startsWith('packages/shared/src/')) {
      if (importPath.startsWith('@moze/') && importPath !== '@moze/shared') {
        violations.push(`${relativeFilePath}: pakiet shared nie może importować ${importPath}.`);
      }
    }
  }
}

function readWorkspacePackages(groupDirName) {
  const groupPath = path.join(repoRoot, groupDirName);
  const dirs = readdirSync(groupPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const packages = [];

  for (const dir of dirs) {
    const packageJsonPath = path.join(groupPath, dir.name, 'package.json');
    if (!statSync(path.join(groupPath, dir.name)).isDirectory()) {
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      packages.push({
        name: parsed.name,
        packagePath: `${groupDirName}/${dir.name}`,
        dependencies: {
          ...(parsed.dependencies ?? {}),
          ...(parsed.devDependencies ?? {}),
        },
      });
    } catch {
      // ignore folders without package.json
    }
  }

  return packages;
}

const workspacePackages = [
  ...readWorkspacePackages('packages'),
  ...readWorkspacePackages('apps'),
].filter((pkg) => typeof pkg.name === 'string' && pkg.name.startsWith('@moze/'));

const packageByName = new Map(workspacePackages.map((pkg) => [pkg.name, pkg]));
const graph = new Map();

for (const pkg of workspacePackages) {
  const deps = Object.keys(pkg.dependencies).filter((dep) => packageByName.has(dep));
  graph.set(pkg.name, deps);
}

const visiting = new Set();
const visited = new Set();

function detectCycles(node, trail) {
  if (visiting.has(node)) {
    const cycleStart = trail.indexOf(node);
    const cycle = [...trail.slice(cycleStart), node];
    violations.push(`Wykryto cykliczną zależność pakietów: ${cycle.join(' -> ')}`);
    return;
  }

  if (visited.has(node)) {
    return;
  }

  visiting.add(node);
  const next = graph.get(node) ?? [];
  for (const child of next) {
    detectCycles(child, [...trail, child]);
  }
  visiting.delete(node);
  visited.add(node);
}

for (const node of graph.keys()) {
  detectCycles(node, [node]);
}

if (violations.length > 0) {
  console.error('Naruszenia granic architektury:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Granice architektury: OK');
