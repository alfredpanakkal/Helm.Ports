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
   npm run lint   # checks TypeScript via tsc --noEmit
   npm run build  # verifies production build bundle
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
   ```
   Both commands must pass with zero errors.
3. **Describe Changes Clearly**:
   - Provide a high-level summary of the problem and solution.
   - Include before/after screenshots or recordings for any UI changes.
   - Note any performance impacts or dataset modifications.
4. **Review & Rebase**: Ensure your branch is rebased cleanly on latest `main` without merge conflicts.

---

## 4. Code Quality Standards

- **TypeScript Strictness**: Do not introduce `any` types. Provide comprehensive interface definitions in `src/components/ports/types.ts`.
- **Zero-Regressions on In-Memory Speed**: Any API endpoint changes must execute in under 10ms for 5,410 records.
- **Component Modularity**: Keep components focused. Complex filtering logic belongs in `src/lib/` or custom hooks, not inline within JSX.
- **Accessibility (a11y)**: Ensure interactive elements have valid `aria-label` attributes, keyboard accessibility, and color contrast matching WCAG AA standards in both light and dark themes.

---

## 5. Security & Data Integrity

- The primary dataset lives in `data/ports.json`. Any updates to the dataset must cite the source publication or revision date.
- Soundings and navigational data represent historical survey soundings. Never remove or alter the nautical disclaimer footer.
