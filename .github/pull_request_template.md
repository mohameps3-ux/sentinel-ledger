## Resumen

<!-- Qué cambia y por qué. -->

## Checklist

- [ ] No rompe el contrato de deploy: `npm run prebuild` / `check-deploy-contract` en `frontend/`.
- [ ] Si toca **War Home o feed Live** (`frontend/pages/index.js`, `frontend/src/features/war-home/**`, `frontend/src/constants/homeData.js`):
  - [ ] **No** se reintroduce `useRankingSnapshot` en el merge de señales a grid en `index.js` (ver comentario `// No useRankingSnapshot here` y `scripts/check-home-live-invariants.cjs`).
  - [ ] **No** hay `visibleTrending` (u otra cola) desfasada de `trending` para el relleno Live frente a hot; el merge usa el mismo criterio que en código actual.
  - [ ] Conmutación **Grid / Virtuoso** sigue llevando **histéresis** (banda; no un único corte 50/51). Ver comentario `Hysteresis` en `index.js` y `UI_CONFIG` en `homeData.js`.
- [ ] Documentación o comentarios de “por qué” en `index.js` / `LiveTab.jsx` **intactos** o actualizados si el comportamiento cambia a propósito.

## War Home / feed Live (seguridad de regresión)

> Parpadeo de cards, remounts masivos y saltos en el hot-fill suelen ser **regresiones lógicas**, no solo API caída. `npm run check:home-live-invariants` (en prebuild) falla si se borran *markers* o se reintroducen antipatrones. Ver `.cursor/rules/war-home-live-stability.mdc`.

## Notas

<!-- Deploy, feature flags, screenshots opcionales. -->
