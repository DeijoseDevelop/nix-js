# Contributing to Nix.js

First off, **thank you** for considering contributing to Nix.js! 🎉

Nix.js is a lightweight, fully reactive micro-framework — no virtual DOM, no compiler, just signals and tagged templates. Every contribution, whether it's a bug report, a feature suggestion, documentation improvement, or a code change, helps make this project better.

Please take a moment to review this guide before submitting your contribution.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Improving Documentation](#improving-documentation)
  - [Submitting Code](#submitting-code)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
  - [Available Scripts](#available-scripts)
  - [Recommended Editor Extensions](#recommended-editor-extensions)
- [Pull Request Workflow](#pull-request-workflow)
  - [Branch Naming Convention](#branch-naming-convention)
  - [Commit Convention](#commit-convention)
  - [PR Checklist](#pr-checklist)
- [Code Guidelines](#code-guidelines)
- [Testing](#testing)
- [Review Process](#review-process)
- [Priority Areas](#priority-areas)
- [License](#license)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior by opening an issue.

---

## How Can I Contribute?

### Reporting Bugs

Found a bug? Help us fix it by opening an issue with the following information:

1. **Title**: A clear and descriptive title.
2. **Description**: A detailed description of the problem.
3. **Steps to reproduce**: A minimal, reproducible example.
4. **Expected behavior**: What you expected to happen.
5. **Actual behavior**: What actually happened.
6. **Environment**: Node.js version, browser, OS, and Nix.js version.

> **Tip:** Use the `bug report` issue template if one is available.

### Suggesting Features

Have an idea to improve Nix.js? We'd love to hear it!

1. **Search existing issues** first to avoid duplicates.
2. Open a new issue with the `feature request` label.
3. Describe the feature, the problem it solves, and any alternatives you've considered.
4. If possible, provide code examples or API sketches showing how the feature would be used.

### Improving Documentation

Documentation improvements are always welcome! This includes:

- Fixing typos or unclear explanations in the README.
- Adding new usage examples.
- Improving inline code comments.
- Writing tutorials or guides.

### Submitting Code

Ready to write some code? Awesome! Please follow the [Pull Request Workflow](#pull-request-workflow) below.

---

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **Bun** (recommended) or **npm** as your package manager
- **Git**

### Getting Started

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/<your-username>/nix-js.git
cd nix-js

# 3. Install dependencies
bun install
# or
npm install

# 4. Start the development server
bun run dev
# or
npm run dev

# 5. Run the tests to make sure everything works
bun run test
# or
npm run test
```

### Available Scripts

| Script | Description |
|---|---|
| `dev` | Start the Vite development server |
| `build` | Build the project (TypeScript compilation + Vite build) |
| `build:lib` | Build the library for publishing |
| `preview` | Preview the production build locally |
| `test` | Run tests with Vitest |
| `typecheck` | Run TypeScript type checking without emitting files |

### Recommended Editor Extensions

For the best development experience with Nix.js, we recommend the following VS Code extensions:

- **[lit-html](https://marketplace.visualstudio.com/items?itemName=ericc-ch.lit-html)** by `ericc-ch` — Provides syntax highlighting and IntelliSense for HTML inside JavaScript and TypeScript tagged template strings. Since Nix.js heavily uses `html` tagged template literals, this extension will give you proper HTML autocompletion, syntax coloring, and error detection inside your templates.

  To install it, search for `ericc-ch.lit-html` in the VS Code Extensions panel or run:
  ```bash
  code --install-extension ericc-ch.lit-html
  ```

---

## Pull Request Workflow

### Branch Naming Convention

Create a descriptive branch from `main` using the following prefixes:

| Prefix | Usage | Example |
|---|---|---|
| `feat/` | New feature | `feat/reactive-lists` |
| `fix/` | Bug fix | `fix/signal-memory-leak` |
| `docs/` | Documentation changes | `docs/update-api-reference` |
| `refactor/` | Code refactoring | `refactor/simplify-renderer` |
| `test/` | Adding or updating tests | `test/computed-signal-edge-cases` |
| `chore/` | Tooling, config, or maintenance | `chore/update-vite-config` |

```bash
git checkout -b feat/my-awesome-feature
```

### Commit Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Each commit message should be structured as:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:**

| Type | Description |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `chore` | Changes to build process, tooling, or auxiliary tools |
| `perf` | A performance improvement |
| `style` | Code style changes (formatting, missing semicolons, etc.) |

**Examples:**

```bash
# ✅ Good
git commit -m "feat(signals): add batched updates for computed signals"
git commit -m "fix(renderer): prevent double rendering on rapid state changes"
git commit -m "docs: add examples for effect cleanup"

# ❌ Bad
git commit -m "fixed stuff"
git commit -m "update"
git commit -m "WIP"
```

### PR Checklist

Before submitting your Pull Request, please make sure:

- [ ] Your code builds without errors (`npm run build` or `bun run build`)
- [ ] All existing tests pass (`npm run test` or `bun run test`)
- [ ] You've added tests for any new functionality
- [ ] TypeScript type checking passes (`npm run typecheck` or `bun run typecheck`)
- [ ] Your commits follow the [Conventional Commits](#commit-convention) convention
- [ ] You've updated documentation if needed
- [ ] Your PR description clearly explains what it does and why

---

## Code Guidelines

To keep Nix.js lightweight and consistent, please follow these guidelines:

- **TypeScript strict mode** — Avoid using `any` unless absolutely necessary. Prefer proper typing.
- **Zero runtime dependencies** — Nix.js is built to have no external runtime dependencies. Do not add any `dependencies` to `package.json`. Development dependencies (`devDependencies`) are acceptable.
- **Keep it small** — Every byte counts for a micro-framework. Avoid adding unnecessary abstractions or features that could be implemented in userland.
- **Meaningful naming** — Use clear, descriptive names for variables, functions, and files.
- **Comment the "why"** — Code should be self-documenting. Add comments only when the *reason* behind a decision isn't obvious.
- **No side effects** — Keep modules pure. The library is marked as `sideEffects: false` in `package.json`.

---

## Testing

All new features and bug fixes **must** include tests. We use [Vitest](https://vitest.dev/) as our test runner.

- **Test location**: Place tests in `src/__tests__/`
- **File naming**: Use the pattern `<feature>.test.ts`
- **Run tests**: `bun run test` or `npm run test`

```bash
# Run all tests
bun run test

# Run tests in watch mode (during development)
bunx vitest watch
```

When writing tests:
- Test both the happy path and edge cases.
- Keep tests focused — one assertion per test when possible.
- Use descriptive test names that explain the expected behavior.

```typescript
// ✅ Good test name
it("should update computed signal when dependency changes", () => { ... });

// ❌ Bad test name
it("works", () => { ... });
```

---

## Review Process

After submitting a PR, here's what to expect:

1. **Automated checks** — CI will run tests and type checking on your PR.
2. **Code review** — A maintainer will review your code. This may take a few days depending on the complexity.
3. **Feedback** — You may be asked to make changes. This is normal and part of the collaborative process.
4. **Approval & merge** — Once approved and all checks pass, your PR will be merged. 🎉

**Please be patient** — this is an open source project maintained in spare time.

---

## Priority Areas

Looking for something to work on? Here are areas where contributions are especially welcome:

- 🏷️ Issues labeled [`good first issue`](https://github.com/DeijoseDevelop/nix-js/labels/good%20first%20issue) — Great for newcomers
- 🆘 Issues labeled [`help wanted`](https://github.com/DeijoseDevelop/nix-js/labels/help%20wanted) — We need your help!
- 📝 Documentation improvements and examples
- 🧪 Additional test coverage
- ⚡ Performance optimizations

---

## License

By contributing to Nix.js, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Thank you for helping make Nix.js better!** 💜
