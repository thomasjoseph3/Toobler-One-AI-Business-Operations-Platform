import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint, Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import moduleBoundaries from './module-boundaries.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const apiSource = path.join(repositoryRoot, 'apps/api/src');

describe('module boundary rule', () => {
  // A small fake set of modules on disk, so the rule can read each module.ts for `requires`.
  let workFolder: string;
  let modulesRoot: string;
  let kernelRoot: string;
  const writeFile = (relativePath: string, text = '') => {
    const fullPath = path.join(modulesRoot, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, text);
  };
  beforeAll(() => {
    workFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'module-boundaries-'));
    modulesRoot = path.join(workFolder, 'src/modules');
    kernelRoot = path.join(workFolder, 'src/kernel');
    writeFile('core/contacts/module.ts', "export default { id: 'core.contacts' };");
    writeFile('engines/leads/module.ts', "export default { id: 'engine.leads', requires: ['core.contacts'] };");
    writeFile('engines/sales/module.ts', "export default { id: 'engine.sales', requires: ['engine.leads'] };");
    writeFile('features/followups/module.ts', "export default { id: 'feature.followups' };");
  });
  afterAll(() => fs.rmSync(workFolder, { recursive: true, force: true }));

  /** Lints one import line as if it were written in `filePath` (relative to the fake modules folder) and returns the messages. */
  const lintImport = (filePath: string, importLine: string) => {
    const linter = new Linter({ configType: 'flat', cwd: workFolder });
    const results = linter.verify(
      importLine,
      [
        {
          files: ['**/*.ts'],
          plugins: { toobler: moduleBoundaries },
          rules: { 'toobler/module-boundaries': ['error', { modulesRoot, kernelRoot }] },
        },
      ],
      { filename: path.join(modulesRoot, filePath) },
    );
    return results.map((message) => message.message);
  };
  const lintKernelImport = (importLine: string) => {
    const linter = new Linter({ configType: 'flat', cwd: workFolder });
    return linter
      .verify(
        importLine,
        [
          {
            files: ['**/*.ts'],
            plugins: { toobler: moduleBoundaries },
            rules: { 'toobler/module-boundaries': ['error', { modulesRoot, kernelRoot }] },
          },
        ],
        { filename: path.join(kernelRoot, 'something.ts') },
      )
      .map((message) => message.message);
  };

  it('lets a module use its own files and the kernel', () => {
    expect(lintImport('core/contacts/service.ts', "import { find } from './repository';")).toEqual([]);
    expect(lintImport('core/contacts/service.ts', "import { find } from '../../../kernel/db';")).toEqual([]);
  });

  it('lets a module use another module through its index when it lists it in requires', () => {
    expect(lintImport('engines/leads/service.ts', "import { find } from '../../core/contacts';")).toEqual([]);
    expect(lintImport('engines/leads/service.ts', "import { find } from '../../core/contacts/index';")).toEqual([]);
  });

  it("reports a module reaching into another module's private files", () => {
    expect(lintImport('engines/leads/service.ts', "import { find } from '../../core/contacts/repository';")).toEqual([
      expect.stringContaining('imports the inside of core.contacts'),
    ]);
  });

  it('reports using a module that is not listed in requires', () => {
    expect(lintImport('features/followups/service.ts', "import { find } from '../../core/contacts';")).toEqual([
      expect.stringContaining('does not list it in `requires`'),
    ]);
  });

  it('never lets core import an engine, channel or feature', () => {
    expect(lintImport('core/contacts/service.ts', "import { find } from '../../engines/leads';")).toEqual([
      expect.stringContaining('core never depends on engines, channels or features'),
    ]);
  });

  it('never lets the kernel import a module', () => {
    expect(lintKernelImport("import { modules } from '../modules';")).toEqual([
      expect.stringContaining('The kernel never imports a module'),
    ]);
  });

  it('only lets the module list import each module manifest', () => {
    expect(lintImport('index.ts', "import contacts from './core/contacts/module';")).toEqual([]);
    expect(lintImport('index.ts', "import { find } from './core/contacts/service';")).toEqual([
      expect.stringContaining("Only modules/index.ts may import a module's module.ts"),
    ]);
    expect(lintImport('../app.ts', "import contacts from './modules/core/contacts/module';")).toEqual([
      expect.stringContaining("Only modules/index.ts may import a module's module.ts"),
    ]);
  });

  it('ignores packages and also checks dynamic imports and re-exports', () => {
    expect(lintImport('engines/leads/service.ts', "import { z } from 'zod';")).toEqual([]);
    expect(lintImport('engines/leads/service.ts', "export * from '../../core/contacts/repository';")).toHaveLength(1);
    expect(
      lintImport('engines/leads/service.ts', "const later = import('../../core/contacts/repository');"),
    ).toHaveLength(1);
  });
});

describe('project lint configuration', () => {
  const eslint = new ESLint({ cwd: repositoryRoot });
  /** Lints `code` as if it were the file at `relativePath` and returns "ruleId: message" for each problem. */
  const problemsIn = async (relativePath: string, code: string) => {
    const [result] = await eslint.lintText(code, { filePath: path.join(repositoryRoot, relativePath) });
    return (result?.messages ?? []).map((message) => `${message.ruleId}: ${message.message}`);
  };

  it('stops routes from importing a repository', async () => {
    const problems = await problemsIn(
      'apps/api/src/modules/core/contacts/routes.ts',
      "import { insertContact } from './repository';\nexport const use = insertContact;\n",
    );
    expect(problems).toEqual([expect.stringContaining('Routes call the service')]);
  });

  it('stops anything but a repository from using the database layer or the query builder', async () => {
    const serviceFile = 'apps/api/src/modules/core/contacts/service.ts';
    expect(
      await problemsIn(
        serviceFile,
        "import { createPool } from '../../../kernel/db';\nexport const use = createPool;\n",
      ),
    ).toEqual([expect.stringContaining('Only repository.ts talks to the database')]);
    expect(await problemsIn(serviceFile, "import { sql } from 'kysely';\nexport const use = sql;\n")).toEqual([
      expect.stringContaining('Queries are written in repository.ts only'),
    ]);
  });

  it('allows type-only imports of the database types, and lets a repository use the database layer', async () => {
    expect(
      await problemsIn(
        'apps/api/src/modules/core/contacts/service.ts',
        "import type { Db } from '../../../kernel/db';\nexport type Use = Db;\n",
      ),
    ).toEqual([]);
    expect(
      await problemsIn(
        'apps/api/src/modules/core/contacts/repository.ts',
        "import { sql } from 'kysely';\nimport { createPool } from '../../../kernel/db';\nexport const use = [sql, createPool];\n",
      ),
    ).toEqual([]);
  });

  it('allows process.env only in kernel/config.ts', async () => {
    const code = 'export const port = process.env.PORT;\n';
    expect(await problemsIn('apps/api/src/kernel/config.ts', code)).toEqual([]);
    expect(await problemsIn('apps/api/src/kernel/other.ts', code)).toEqual([
      expect.stringContaining('Read settings through loadConfig()'),
    ]);
  });

  it('requires readable names', async () => {
    expect(await problemsIn('apps/api/src/kernel/names.ts', 'export const ctx = 1;\n')).toEqual([
      expect.stringContaining('id-denylist'),
    ]);
    expect(await problemsIn('apps/api/src/kernel/names.ts', 'export const x = 1;\n')).toEqual([
      expect.stringContaining('id-length'),
    ]);
    expect(await problemsIn('apps/api/src/kernel/names.ts', 'export const accountContext = 1;\n')).toEqual([]);
  });

  it('reports a variable that hides another one', async () => {
    const problems = await problemsIn(
      'apps/api/src/kernel/shadow.ts',
      'const account = 1;\nexport const read = () => { const account = 2; return account; };\nexport const first = account;\n',
    );
    expect(problems).toEqual([expect.stringContaining('no-shadow')]);
  });

  it('is clean for the real source of the API', async () => {
    const results = await eslint.lintFiles([`${apiSource}/**/*.ts`]);
    const problems = results.flatMap((result) =>
      result.messages.map((message) => `${path.relative(repositoryRoot, result.filePath)}: ${message.message}`),
    );
    expect(problems).toEqual([]);
  });
});
