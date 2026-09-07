# Resume Intelligence

Resume Intelligence is a local-first, evidence-grounded resume workspace. It helps a user structure a resume, analyze a job description, compare requirements against current resume evidence, inspect exact source paths, understand skill gaps, and optionally review advisory AI suggestions.

## Product principles

- Deterministic analysis is the source of truth.
- Evidence is traceable to structured resume and job-description fields.
- `supported`, `partial`, and `not-demonstrated` are distinct outcomes.
- AI is optional, advisory, validated, and never automatically edits the resume.
- Resume data is stored locally in the browser by default.

## Architecture

```text
Structured editor + localStorage
              │
              ├── structured resume model / migration / validation
              │
              ├── deterministic JD parser
              │          │
              │          └── deterministic matcher
              │                    │
              │                    ├── evidence traceability
              │                    └── skill-gap analysis
              │
              └── optional server-side AI advisory layer
                         (validated; deterministic fallback)
```

The browser provides the product UI and local preview. Node/Express provides canonical analysis APIs and evidence-integrity validation.

## Local setup

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Open <http://localhost:3000>.

## Testing

Deterministic and server tests:

```bash
npm test
```

Browser tests require Playwright and its browser binaries. They are included in the development dependencies:

```bash
npm run test:browser
```

The browser suite covers loading, structured editing, refresh persistence, JD baseline analysis, matching, stale-state invalidation, and malicious-content rendering.

## APIs

- `GET /` — Resume Intelligence application shell
- `POST /api/parse-job-description` — deterministic JD parsing
- `POST /api/match-resume-job` — evidence-grounded deterministic matching
- `POST /api/skill-gaps` — deterministic gap analysis
- `POST /api/ai-insights` — optional validated AI advisory output with fallback
- Legacy Evidence Vault endpoints remain available for compatibility.

## Optional AI configuration

AI is disabled unless configured. Supported environment configuration is intentionally server-side only:

```text
AI_PROVIDER=mock
AI_API_KEY=...
AI_MODEL=...
```

The mock provider is useful for local UI testing. No API key is placed in browser code. AI output must pass strict validation, preserve source paths, require user verification, and cannot mutate the resume automatically.

## Security model

- Structured source paths are resolved against current resume/JD data.
- Tampered requirement IDs, source paths, or source text are rejected.
- Browser-rendered content is escaped.
- Prompt data is explicitly treated as untrusted input.
- JSON payload limits and oversized JD limits are enforced.
- Security headers include CSP, `nosniff`, `DENY` framing, and a strict referrer policy.

## Storage and limitations

Resume data is local-first and uses an in-memory fallback when browser storage is unavailable. Legacy flat resume data is migrated into the versioned structured model. Browser analysis is invalidated when the resume or JD changes so stale results are not presented as current.

This repository is a hardened local/product-foundation build, not a complete production SaaS deployment. Production use would additionally require authentication, HTTPS, rate limiting, persistent server storage, secret management, monitoring, and an explicit external dependency strategy.

## AI disclosure

AI insights are optional advisory suggestions. The deterministic baseline, evidence paths, match statuses, and skill-gap results remain authoritative. Suggested wording always requires user verification and is never silently written back into the resume.

## License

See [LICENSE](LICENSE).
