import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findModuleFolders, findStructureProblems } from './support/module-structure';

const modulesRoot = path.resolve(__dirname, '../src/modules');
const scratchFolders: string[] = [];
afterAll(() => scratchFolders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

/** Builds a throwaway module folder from a list of file paths, so we can show the checker catches mistakes. */
function buildModule(files: Record<string, string>, emptyFolders: string[] = []): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'module-shape-'));
  scratchFolders.push(root);
  const moduleFolder = path.join(root, 'sample');
  for (const [relativePath, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(moduleFolder, relativePath)), { recursive: true });
    writeFileSync(path.join(moduleFolder, relativePath), content);
  }
  for (const folder of emptyFolders) mkdirSync(path.join(moduleFolder, folder), { recursive: true });
  return moduleFolder;
}

const GOOD_FILES = {
  'module.ts': "import { x } from './routes/things.routes';",
  'index.ts': '',
  'routes/things.routes.ts': '',
  'services/things.service.ts': '',
  'repositories/things.repository.ts': '',
  'helpers/rules.ts': '',
  'helpers/rules.test.ts': '',
};

describe('every module has the same shape (routes/, services/, repositories/, helpers/)', () => {
  it('finds the real modules, and every one of them follows the shape', () => {
    const moduleFolders = findModuleFolders(modulesRoot);
    expect(moduleFolders.length).toBeGreaterThanOrEqual(3); // auth, health, industries: the scan really ran
    const problems = moduleFolders.flatMap((folder) => findStructureProblems(folder));
    expect(problems).toEqual([]);
  });

  it('accepts a correct module', () => {
    expect(findStructureProblems(buildModule(GOOD_FILES))).toEqual([]);
  });

  it('rejects a routes file in the wrong place or with the wrong name', () => {
    const { 'routes/things.routes.ts': _removed, ...rest } = GOOD_FILES;
    const wrongPlace = buildModule({ ...rest, 'helpers/things.routes.ts': '', 'things.routes.ts': '' });
    expect(findStructureProblems(wrongPlace).join('\n')).toMatch(/things\.routes\.ts" must not sit at the top level/);
    const wrongName = buildModule({ ...GOOD_FILES, 'routes/things.ts': '' });
    expect(findStructureProblems(wrongName).join('\n')).toMatch(/"routes\/things\.ts" does not belong there/);
  });

  it('rejects a repository outside repositories/, and a service inside helpers/', () => {
    const problems = findStructureProblems(
      buildModule({ ...GOOD_FILES, 'services/other.repository.ts': '', 'helpers/other.service.ts': '' }),
    ).join('\n');
    expect(problems).toMatch(/"services\/other\.repository\.ts" does not belong there/);
    expect(problems).toMatch(/"helpers\/other\.service\.ts" does not belong there/);
  });

  it('rejects an unknown folder, a loose file, and an empty folder', () => {
    const problems = findStructureProblems(
      buildModule({ ...GOOD_FILES, 'data/x.ts': '', 'stray.ts': '' }, ['services/old']),
    ).join('\n');
    expect(problems).toMatch(/unknown folder "data\/"/);
    expect(problems).toMatch(/"stray\.ts" must not sit at the top level/);
    const emptyLayer = findStructureProblems(buildModule(GOOD_FILES, ['password'])).join('\n');
    expect(emptyLayer).toMatch(/unknown folder "password\/"/);
    const emptyAllowed = buildModule({ 'module.ts': '', 'index.ts': '' }, ['repositories']);
    expect(findStructureProblems(emptyAllowed).join('\n')).toMatch(/"repositories\/" is empty/);
  });

  it('rejects a routes file that module.ts forgot to register, and a module with no module.ts', () => {
    const forgotten = buildModule({ ...GOOD_FILES, 'routes/extra.routes.ts': '' });
    expect(findStructureProblems(forgotten).join('\n')).toMatch(
      /module\.ts does not register routes\/extra\.routes\.ts/,
    );
    const { 'module.ts': _removed, ...withoutManifest } = GOOD_FILES;
    expect(findStructureProblems(buildModule(withoutManifest)).join('\n')).toMatch(/has no module\.ts/);
  });
});
