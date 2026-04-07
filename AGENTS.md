# AGENTS.md — Renting App

> Canonical instructions for all AI coding agents working on this project.
> This file is the single source of truth for agent behavior, conventions, and guardrails.

---

## Project Overview

- **Name:** Renting App
- **Status:** Pre-development (planning phase)
- **Methodology:** [BMad Method](https://github.com/bmad-code-org) — follow all BMad workflows, templates, and conventions

## Repository Layout

```
.
├── AGENTS.md                  # This file — agent instructions
├── docs/                      # Project documentation (PRD, architecture, UX, etc.)
├── _bmad/                     # BMad Method modules and config (DO NOT EDIT)
├── _bmad-output/              # BMad-generated artifacts
│   ├── planning-artifacts/    # PRD, briefs, research
│   ├── implementation-artifacts/ # Architecture, epics, stories
│   └── test-artifacts/        # Test plans, traceability
├── .pi/                       # Pi agent skills (DO NOT EDIT)
├── .claude/                   # Claude Code settings (DO NOT EDIT)
└── src/                       # Application source (created during implementation)
```

## General Rules

1. **Read before writing.** Always read existing files, docs, and context before making changes.
2. **Follow existing patterns.** Match the style, naming, and structure of surrounding code.
3. **Small, focused changes.** One logical change per commit. No unrelated modifications.
4. **No placeholder code.** Every file must be functional and complete — no TODOs left behind in production code.
5. **Don't modify generated/config dirs.** Never edit `_bmad/`, `.pi/`, or `.claude/` contents directly.
6. **Preserve BMad artifacts.** Treat files in `_bmad-output/` as living documents — update, don't overwrite without cause.

## Planning Phase Rules

- All planning artifacts go in `_bmad-output/planning-artifacts/`.
- All architecture/implementation artifacts go in `_bmad-output/implementation-artifacts/`.
- All test artifacts go in `_bmad-output/test-artifacts/`.
- Reference BMad skill instructions when executing any planning workflow.
- Validate artifacts against their BMad templates before considering them complete.

## Code Conventions

> Update this section once tech stack is selected.

### General

- Prefer TypeScript over JavaScript.
- Use strict typing — avoid `any` unless absolutely necessary.
- Use named exports over default exports.
- Keep functions small and single-purpose.
- Use meaningful, descriptive names (no abbreviations unless universally understood).

### File & Folder Naming

- Use `kebab-case` for files and directories.
- Colocate tests next to source files (e.g., `widget.ts` / `widget.test.ts`).

### Error Handling

- Never swallow errors silently.
- Use structured error types over generic throws.
- Log errors with sufficient context for debugging.

### Dependencies

- Minimize external dependencies — justify each addition.
- Pin dependency versions.
- No deprecated packages.

## Testing Conventions

- Every feature must have tests before it's considered complete.
- Unit tests for business logic; integration tests for API/data flows.
- Test file naming: `<module>.test.ts` or `<module>.spec.ts`.
- Tests must be deterministic — no flaky tests allowed.
- Mock external services; never call real APIs in tests.

## Git & Commit Conventions

- **Commit message format:** `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`
  - Example: `feat(listings): add search filter component`
- Branch naming: `type/short-description` (e.g., `feat/listing-search`, `fix/auth-redirect`)
- Keep commits atomic and bisectable.

## Documentation

- Update relevant docs when changing behavior.
- Public APIs and complex logic must have inline documentation.
- Architecture decisions go in `_bmad-output/implementation-artifacts/`.

## Security

- Never commit secrets, keys, or credentials.
- Use environment variables for all configuration.
- Validate and sanitize all user input.
- Follow principle of least privilege for all access patterns.

## Performance

- Lazy-load where possible.
- Avoid N+1 queries.
- Profile before optimizing — no premature optimization.

---

*Last updated: 2026-03-28*
