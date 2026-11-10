import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// The one shape every module follows (docs/BACKEND.md). This file checks it; test/module-structure.test.ts runs the check.

/** The only folders a module may have, and the file-name ending each one requires. */
const LAYER_FOLDERS: Record<string, RegExp> = {
  routes: /^[a-z0-9-]+\.routes\.ts$/,
  services: /^[a-z0-9-]+\.service\.ts$/,
  repositories: /^[a-z0-9-]+\.repository\.ts$/,
  helpers: /^[a-z0-9-]+(\.test)?\.ts$/,
};

/** The only loose files a module may have at its top level. */
const TOP_LEVEL_FILES = new Set(['module.ts', 'index.ts', 'README.md', 'authenticator.ts', 'adapter.ts']);

/** Lists the files and folders inside a folder, by name. */
function listNames(folder: string): string[] {
  return readdirSync(folder).sort();
}

/** Finds every module folder (a folder with a module.ts) under src/modules, like core/auth. */
export function findModuleFolders(modulesRoot: string): string[] {
  const moduleFolders: string[] = [];
  for (const kind of listNames(modulesRoot)) {
    const kindFolder = path.join(modulesRoot, kind);
    if (!statSync(kindFolder).isDirectory()) continue;
    for (const name of listNames(kindFolder)) {
      if (statSync(path.join(kindFolder, name)).isDirectory()) moduleFolders.push(path.join(kindFolder, name));
    }
  }
  return moduleFolders;
}

/** Checks one module folder against the shape, and returns every problem in plain English (empty list = fine). */
export function findStructureProblems(moduleFolder: string): string[] {
  const problems: string[] = [];
  const moduleName = path.basename(moduleFolder);
  const say = (message: string) => problems.push(`${moduleName}: ${message}`);

  if (!existsSync(path.join(moduleFolder, 'module.ts'))) say('has no module.ts');
  // index.ts is optional: a module needs one only when other modules use it

  for (const name of listNames(moduleFolder)) {
    const fullPath = path.join(moduleFolder, name);
    if (statSync(fullPath).isDirectory()) {
      const fileRule = LAYER_FOLDERS[name];
      if (!fileRule) {
        say(`has an unknown folder "${name}/" (allowed: ${Object.keys(LAYER_FOLDERS).join(', ')})`);
        continue;
      }
      const inside = listNames(fullPath);
      if (inside.length === 0) say(`"${name}/" is empty; delete it`);
      for (const fileName of inside) {
        if (!fileRule.test(fileName)) {
          say(`"${name}/${fileName}" does not belong there (files in ${name}/ must match ${fileRule})`);
        }
      }
    } else if (!TOP_LEVEL_FILES.has(name)) {
      say(`"${name}" must not sit at the top level; put it in routes/, services/, repositories/ or helpers/`);
    }
  }

  // Every routes file must be registered in module.ts, or its endpoints silently do not exist
  const routesFolder = path.join(moduleFolder, 'routes');
  const moduleFile = path.join(moduleFolder, 'module.ts');
  if (existsSync(routesFolder) && existsSync(moduleFile)) {
    const moduleSource = readFileSync(moduleFile, 'utf8');
    for (const fileName of listNames(routesFolder)) {
      const importPath = `./routes/${fileName.replace(/\.ts$/, '')}`;
      if (!moduleSource.includes(importPath)) say(`module.ts does not register routes/${fileName}`);
    }
  }
  return problems;
}
