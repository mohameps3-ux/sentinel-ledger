# Optional E2E (War Home / Live)

No runner is installed in this package by default (maintenance cost). If you add **Playwright** (or similar) in CI:

- On `/` with the **Live** tab and data loaded, assert:
  - `[data-testid="sl-war-live-section"]` is present, and
  - at least one `[data-testid="sl-war-live-card"]` when the API returns signals (or mock the API in test).

`data-testid` is stable and checked by `scripts/check-home-live-invariants.cjs` on every `prebuild`.

Degradación de API (listas vacías, `degraded`) no es el bug de parpadeo de React: el test puede marcar *skip* cuando no haya cards si solo validas estructura DOM con mocks.
