# Dependencies policy

Every package we install runs with the same access as our code, so each one is vetted first. Rule: **stable, old
enough, well known, and checked by `npm run vet` before `npm install`.**

## Rules

1. **Stable releases only.** No `-beta`, `-rc`, `-next` or `-canary`. Node is the current **LTS** (see `.nvmrc`).
2. **At least 14 days old.** We take the newest stable release that has been public for two weeks, not the newest.
3. **Well known.** A package needs at least 50,000 downloads a week, a linked repository, named maintainers, a
   package at least 180 days old and no deprecation notice. Anything below needs a written exception in the table below,
   agreed by the owner.
4. **Exact versions.** `.npmrc` has `save-exact=true`; `package-lock.json` is committed; CI installs with `npm ci`.
5. **No install scripts run by default.** `.npmrc` has `ignore-scripts=true`. A package that truly needs one is listed
   under "Install scripts allowed" and rebuilt on purpose (`npm rebuild <name>`).
6. **Check the name.** A look-alike of a popular package (typosquatting) is the commonest attack. Copy the name from the
   package's own documentation, and let `npm run vet` show who publishes it.
7. **Fewer is better.** Prefer the platform and the packages we already have. Don't add a package for ten lines of code.
8. **Run `npm audit --audit-level=high` and `npm audit signatures`** in CI; high findings fail the build.
9. **Adding a package** = run `npm run vet -- <name>`, read the line it prints, then install. Record anything unusual
   here. The `feature` skill and `CLAUDE.md` require this.

## Commands

```bash
npm run vet -- zod fastify@5          # vet one or more packages (name or name@major)
npm install --save-exact <name>@<version> -w @toobler-one/api
npm audit --audit-level=high && npm audit signatures
```

## Install scripts allowed

None so far. (Browser binaries for Playwright are downloaded explicitly with `npx playwright install chromium`.)

## Exceptions

None so far.

## Known audit findings

- 9 Nov 2026: 10 moderate findings, all one denial-of-service advisory in `minimatch` (GHSA-g3hv-75wg-m249) inside ESLint
  and typescript-eslint. Dev tooling only, runs on our own source, not reachable from the running app. No high or
  critical findings. We do not force-downgrade ESLint; we update when the maintainers publish a fixed release.

## Approved set (vetted 9 Nov 2026)

| Area | Packages |
| --- | --- |
| API | fastify 5.12.7, fastify-type-provider-zod 7.0.0, @fastify/helmet 13.2.0, @fastify/rate-limit 11.2.1, @fastify/sensible 6.0.7, pino 10.4.0, zod 4.6.7 |
| Sign-in (F01, vetted 10 Nov 2026) | jose 6.2.13 (signs and checks the access tokens; MIT, no dependencies), @fastify/cookie 11.1.5 (reads and sets cookies; Fastify's own, MIT) |
| Email (F01 slice 4, vetted 10 Nov 2026) | nodemailer 10.2.1 (sends email over SMTP; MIT-0, no dependencies, 36M downloads a week) and @types/nodemailer 8.0.2 (its types, dev only) |
| Passwords (F01, vetted 10 Nov 2026) | @node-rs/argon2 2.2.2: argon2id password hashing, a prebuilt binary with no install script (the other `argon2` package runs one, so it was rejected) |
| API docs (vetted 11 Nov 2026) | @fastify/swagger 9.9.2 (builds the OpenAPI document from the routes' zod shapes) and @fastify/swagger-ui 6.1.2 (the `/docs` page); both MIT, Fastify core team, no install scripts. They pull in @fastify/static 10.1.8 and a few small helpers. Served in development only. |
| Database and jobs | pg 8.23.1, kysely 0.29.7, pg-boss 12.38.0 |
| Web (React + Vite, no Next.js) | vite 8.3.5, @vitejs/plugin-react 6.1.2, react-router 8.5.0, react / react-dom 19.3.1, tailwindcss and @tailwindcss/vite 4.3.3, lucide-react 1.61.0, clsx 2.1.1 |
| Tooling | **typescript 6.0.3** (not 7.x: typescript-eslint 8.72 supports TypeScript below 6.1 only), tsx 4.23.15, vitest 5.0.5, @playwright/test 1.64.1, @axe-core/playwright 4.14.0 (MPL-2.0, dev only), eslint 10.13.0, @eslint/js 10.0.1, typescript-eslint 8.72.0, eslint-plugin-react-hooks 7.1.1, globals 17.13.0, prettier 3.9.10, concurrently 10.0.6 |
| Fonts (self-hosted, vetted 10 Nov 2026) | @fontsource-variable/manrope 5.3.0, @fontsource-variable/inter 5.3.0, @fontsource/noto-sans-malayalam 5.3.0, @fontsource/noto-sans-devanagari 5.3.0 (all OFL-1.1, same publisher, no install scripts) |
| Types | @types/node 26.6.5, @types/pg 8.23.1, @types/react and @types/react-dom 19.3.0 |

All MIT, ISC, Apache-2.0 or OFL-1.1 (fonts; one dev-only MPL-2.0), all published by their official projects. One dependency of the tooling, `esbuild`, declares an install script; `ignore-scripts=true` stops it from running and builds work without it.
