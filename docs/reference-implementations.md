# Reference Implementations

AGP should stay grounded in working implementations. Reference providers and harnesses
are expected to prove the protocol shape, expose gaps in the spec, and feed concrete
lessons back into the docs and schemas.

## Palette

Palette is the first reference provider implementation.

Repository:

```text
git@github.com:geneyoo/palette.git
local path: ~/palette
implementation map: docs/agp-implementation.md
```

Palette currently implements:

- local provider users
- first-party CLI sessions
- external agent grants
- one provider-visible grant per external harness and primary agent
- hashed bearer token storage
- grant expiry and revocation
- guest reads
- authenticated writes
- review write attribution by user, client, harness, agent, and grant
- action receipts for `reviews.create`
- a service seam for future `Authorization: Bearer <token>` API calls
- local FastAPI REST endpoints over the provider service layer
- generated OpenAPI at `/openapi.json`
- no-OAuth ChatGPT Actions bridge using manual bearer-token Action auth

Palette does not yet implement:

- OAuth authorization code flow
- refresh tokens
- public HTTPS deployment
- full OAuth-backed ChatGPT Actions binding
- provider-owned browser consent UI
- confirmation tokens
- DPoP
- receipts for every write class
- subagent attribution fields

## Traceability Rule

When a reference implementation invents behavior that belongs in AGP, update the AGP
spec, schemas, or binding docs in the same work session.

When AGP defines behavior a reference implementation does not support yet, update that
implementation's traceability file and mark the behavior as pending.

## Shared Milestones

| Milestone | AGP Spec Meaning | Palette Meaning |
|---|---|---|
| P0 | local provider auth model | users, password hashes, CLI session |
| P1 | external grants and receipts | `agent_grants`, review attribution, `reviews.create` receipt |
| P2 | REST/OpenAPI binding | FastAPI over `PaletteService`, public HTTPS pending |
| P3 | OAuth code flow | authorize/token/revoke endpoints and consent |
| P4 | ChatGPT Actions binding | no-OAuth bearer-token Action bridge now, OAuth pending |
| P5 | conformance | shared tests for grants, scopes, receipts, revocation, no token leakage |

## Open Feedback Loop

Questions Palette should answer for AGP:

- Which fields are required on a minimal provider-side grant?
- Which scope names are portable versus Palette-specific?
- Should receipts be returned inline, by ID, or both?
- What is the minimum useful audit trail for one visible ChatGPT session?
- How should subagent attribution be represented without fragmenting the user's session UI?
