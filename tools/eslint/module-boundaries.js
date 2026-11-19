import fs from 'node:fs';
import path from 'node:path';

/**
 * The module boundaries (docs/ARCHITECTURE.md, "Dependency rules"):
 *  - the kernel never imports a module
 *  - core modules never import an engine, channel or feature
 *  - a module uses another module only through its index file, and only if it lists it in `requires` in its module.ts
 *  - nothing outside a module reaches into it; only modules/index.ts imports each module's module.ts
 * Module folders are modules/<core|engines|channels|features>/<name>/. Only relative imports are checked.
 */

const DEFAULT_MODULES_ROOT = path.resolve(import.meta.dirname, '../../apps/api/src/modules');
const DEFAULT_KERNEL_ROOT = path.resolve(import.meta.dirname, '../../apps/api/src/kernel');

/** The folder name of each module kind, and the kind it stands for in a module id. */
const KIND_BY_FOLDER = { core: 'core', engines: 'engine', channels: 'channel', features: 'feature' };

/** Whether `child` is `parent` itself or somewhere inside it. */
function isInside(parent, child) {
  const relativePath = path.relative(parent, child);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

/**
 * Works out which module a path belongs to: `{ id, folder, kind, innerPath }`, where innerPath is the rest of the path
 * inside the module ('' for the module folder itself). Returns null for paths outside every module.
 */
function findModule(modulesRoot, somePath) {
  if (!isInside(modulesRoot, somePath)) return null;
  const parts = path.relative(modulesRoot, somePath).split(path.sep);
  const kind = KIND_BY_FOLDER[parts[0]];
  if (!kind || parts.length < 2 || parts[1] === '') return null;
  return {
    // A folder may use hyphens (`module-switches`); the module id uses underscores (`core.module_switches`)
    id: `${kind}.${parts[1].replace(/-/g, '_')}`,
    folder: path.join(modulesRoot, parts[0], parts[1]),
    kind,
    innerPath: parts.slice(2).join('/'),
  };
}

/** Reads the module ids a module lists in `requires: [...]` in its module.ts (empty when there is none). */
function readRequiredModuleIds(moduleFolder) {
  let manifestSource;
  try {
    manifestSource = fs.readFileSync(path.join(moduleFolder, 'module.ts'), 'utf8');
  } catch {
    return [];
  }
  const requiresMatch = manifestSource.match(/requires\s*:\s*\[([^\]]*)\]/);
  if (!requiresMatch) return [];
  return [...requiresMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

const moduleBoundariesRule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { modulesRoot: { type: 'string' }, kernelRoot: { type: 'string' } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] ?? {};
    const modulesRoot = options.modulesRoot ?? DEFAULT_MODULES_ROOT;
    const kernelRoot = options.kernelRoot ?? DEFAULT_KERNEL_ROOT;
    const importingFile = context.filename;
    const importingModule = findModule(modulesRoot, importingFile);

    const checkImport = (node) => {
      const importPath = node.source?.value;
      if (typeof importPath !== 'string' || !importPath.startsWith('.')) return;
      const targetPath = path.resolve(path.dirname(importingFile), importPath);
      const targetModule = findModule(modulesRoot, targetPath);
      const report = (message) => context.report({ node: node.source, message });

      // The kernel is the base everything stands on: it must not know any module.
      if (isInside(kernelRoot, importingFile) && isInside(modulesRoot, targetPath)) {
        report('The kernel never imports a module. Modules plug into the kernel through their manifest (module.ts).');
        return;
      }

      // Code outside the modules (app.ts, server.ts, the module list): only the list may import each module's manifest.
      if (!importingModule) {
        if (!targetModule) return;
        const isModuleList = path.dirname(importingFile) === modulesRoot;
        if (!(isModuleList && targetModule.innerPath === 'module')) {
          report(
            `Only modules/index.ts may import a module's module.ts. Do not reach into ${targetModule.id} from here.`,
          );
        }
        return;
      }

      if (!targetModule || targetModule.id === importingModule.id) return;

      if (importingModule.kind === 'core' && targetModule.kind !== 'core') {
        report(
          `Core module ${importingModule.id} cannot import ${targetModule.id}: core never depends on engines, channels or features.`,
        );
        return;
      }
      if (targetModule.innerPath !== '' && targetModule.innerPath !== 'index') {
        report(
          `${importingModule.id} imports the inside of ${targetModule.id}. Import its index file only; its other files are private.`,
        );
        return;
      }
      if (!readRequiredModuleIds(importingModule.folder).includes(targetModule.id)) {
        report(`${importingModule.id} uses ${targetModule.id} but does not list it in \`requires\` in its module.ts.`);
      }
    };

    return {
      ImportDeclaration: checkImport,
      ExportNamedDeclaration: checkImport,
      ExportAllDeclaration: checkImport,
      ImportExpression: checkImport,
    };
  },
};

export default { rules: { 'module-boundaries': moduleBoundariesRule } };
