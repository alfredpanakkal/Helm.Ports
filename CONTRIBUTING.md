# Contributing to Helm.Ports

Thank you for your interest in improving **Helm.Ports**! This guide outlines our conventions, development workflow, and pull request standards.

---

## 1. Development Environment Setup

1. **Clone & install**:
   ```bash
   git clone <repo-url>
   cd helm-ports
   npm install
   ```

2. **Run local server**:
   ```bash
   npm run dev
   ```
   The application runs on [http://localhost:3000](http://localhost:3000).

3. **Verify compilation & types**:
   ```bash
   npm run lint    # checks TypeScript via tsc --noEmit
   npm run build   # verifies production build bundle
   npm test        # ports filtering/sorting + map bounds invariants
   node --import tsx --test src/lib/contrast.test.ts   # WCAG AA contrast pairs
   ```

---

## 2. Branching & Commit Conventions

### Branch Naming
Use clear, descriptive branch names prefixed with the work category:
- `feat/feature-name` (e.g. `feat/vessel-draft-alert`)
- `fix/bug-description` (e.g. `fix/map-culling-boundary`)
- `perf/improvement-area` (e.g. `perf/in-memory-filter-cache`)
- `docs/doc-update` (e.g. `docs/api-specifications`)

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:
```
<type>(<scope>): <short description in imperative mood>

[optional body explaining context or rationale]

[optional footer(s)]
```

**Common types**:
- `feat`: A new user-facing feature or enhancement
- `fix`: A bug fix
- `docs`: Documentation updates only
- `style`: Formatting, whitespace, or UI styling adjustments
- `refactor`: Code restructuring without modifying behavior
- `perf`: Performance optimizations
- `test`: Adding or updating test cases
- `chore`: Tooling, dependency updates, configuration

**Example**:
```
feat(map): add viewport culling buffer for high-zoom panning
fix(table): sort null channel depths to end on descending order
```

---

## 3. Pull Request Process

1. **Keep PRs Focused**: Avoid sprawling pull requests. Each PR should address a single logical change or feature.
2. **Pre-flight Checks**: Before opening a pull request, run:
   ```bash
   npm run lint
   npm run build
   npm test
   ```
   All commands must pass with zero errors.
3. **Describe Changes Clearly**:
   - Provide a high-level summary of the problem and solution.
   - Include before/after screenshots or recordings for any UI changes.
   - Note any performance impacts or dataset modifications.
4. **Review & Rebase**: Ensure your branch is rebased cleanly on latest `main` without merge conflicts.

---

## 4. Code Quality Standards

- **TypeScript Strictness**: Do not introduce `any` types. Provide comprehensive interface definitions in `src/components/ports/types.ts`.
- **Zero-Regressions on In-Memory Speed**: Any API endpoint changes must execute in under 10 ms for the served dataset (3,814 portsv2 records; 5,410 with the legacy fallback file).
- **Component Modularity**: Keep components focused. Complex filtering logic belongs in `src/lib/` or custom hooks, not inline within JSX.
- **Accessibility (a11y)**: Ensure interactive elements have valid `aria-label` attributes and keyboard accessibility. Color contrast must match WCAG AA in both themes — use the moss semantic tokens from `src/index.css` (never hard-coded palette colours); `src/lib/contrast.test.ts` pins the accepted pairs (text >= 4.5:1, control fills >= 3:1) and must stay green.

---

## 5. Security & Data Integrity

- The primary dataset lives in `data/portsv2-117 field.json` (NGA Updated Pub 150 export); `data/ports.json` is the legacy 2019 fallback. Any updates to a dataset must cite the source publication or revision date.
- Soundings and navigational data represent historical survey soundings. Never remove or alter the nautical disclaimer footer.
