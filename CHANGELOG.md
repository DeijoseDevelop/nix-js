# Changelog

All notable changes to this project will be documented in this file.

## v1.1.3
- chore: add homepage link to landing page

## v1.1.2
- chore: add MIT LICENSE file, include in npm package

## v1.1.1
- Fixed `createQuery`, `invalidateQueries`, and `QueryOptions` missing from the root `src/index.ts` export barrel (consumers got TS error: `has no exported member`)
- Also added `AfterEachHook` and `ResolvedRoute` router types that were missing from the root barrel

## v1.1.0
- Added `invalidate` option to `suspend()` — re-fetch data without destroying/recreating the DOM
- Added `createQuery(key, asyncFn, renderFn, opts)` — key-based async data fetching
- Added `invalidateQueries(key)` — global invalidation of active queries by key
- New exports: `createQuery`, `invalidateQueries`, `QueryOptions`
- 6 new tests (158 total)

## v1.0.9
- feat: `suspend()` invalidate + `createQuery` / `invalidateQueries` support

## v1.0.8
- Added `NixTemplate` return type annotation to all function component examples in README and `.readme-npm.md`
- Documented `NixTemplate` as the recommended pattern for pages and display components alongside `NixComponent`

## v1.0.7
- All source comments and JSDoc translated to concise English
- README rewritten: professional badges, expanded architecture diagram, Quick Start section, complete API Reference, accurate bundle sizes (~24 KB min / ~8 KB gzip), framework comparison (two tables), Contributing guide, Changelog

## v1.0.6
- Implemented all router methods: `replace`, `back`, `forward`, `go`, `isActive`, `resolve`, `afterEach`
- Fixed `.d.ts` type declarations for npm consumers

## v1.0.5
- Security audit: hardened `template.ts` against XSS via `textContent` for user-provided strings
- Encoded URI components in router to prevent path injection
- Added `decodeURIComponent` with fallback for malformed percent-encoding

## v1.0.4
- Added route guards (`beforeEach`, `beforeEnter`) with async support
- Added `afterEach` navigation hooks
- Added `router.resolve()` for route inspection without navigation

## v1.0.3
- Initial public API with reactivity, templates, components, router, forms, stores, DI, portals, error boundaries, and transitions
