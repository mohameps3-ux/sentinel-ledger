# Sentinel Ledger — AI Agent Guardrails

These rules apply to AI-assisted changes in this repository.

## Production safety

- Do not push directly to `main`.
- Work in short-lived branches only.
- Open a pull request for every change.
- Keep pull requests small and focused.
- Do not run repeated automatic fix/commit loops.
- Stop after one failed build and inspect the failing logs before making another change.

## Deployment safety

- Frontend lives in `frontend/` and deploys to Vercel.
- Backend lives in `backend/` and deploys to Railway.
- Supabase SQL migrations must be applied explicitly; committing SQL does not apply it to production.
- Never trigger redeploys repeatedly to “try again” without a code/config reason.

## Secrets

Never commit or print secrets, including:

- `OPENAI_API_KEY`
- Supabase service role keys
- Stripe keys
- Helius keys
- Railway tokens
- Vercel tokens
- `OMNI_BOT_OPS_KEY`
- private wallet keys or seed phrases

Use `.env.example` for variable names only.

## Frontend rules

- Use `frontend/` as the Vercel root directory.
- Run `npm run prebuild` from `frontend/` before changing deployment-critical UI.
- Preserve the deploy contract markers required by `frontend/scripts/check-deploy-contract.cjs`.
- Preserve War Home / Live anti-flicker invariants required by `frontend/scripts/check-home-live-invariants.cjs` unless intentionally updating the guardrail and documenting why.

## Backend rules

- Do not change database expectations without updating Supabase migrations and verification scripts.
- Premium/paid access must be checked server-side, not only in the frontend.
- External API calls must have rate limits, retries, timeouts, and logging.
- AI/OpenAI calls must be budgeted and should not run in unbounded loops.

## PR requirements

Every PR should include:

- What changed.
- Why it changed.
- How it was tested.
- Deployment impact.
- Rollback notes if it touches production paths.

## Stop conditions

Stop and ask for human review when:

- A build fails twice for different reasons.
- A change touches payments, auth, entitlement logic, or production migrations.
- A fix requires guessing environment variables.
- A change would cause repeated CI, Vercel, or Railway runs.
