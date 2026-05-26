# Milestones

## Milestone 1: Whitepaper And Protocol Spec

Goal: turn the RFC overview into a precise implementation profile.

Deliverables:

- protocol overview
- threat model
- normative MUST/SHOULD/MUST NOT requirements
- JSON schemas for grant, action request, confirmation token, and receipt
- OAuth/OIDC profile requirements
- DPoP, step-up, revocation, and idempotency rules
- subagent attribution model
- transport binding matrix
- REST/OpenAPI binding
- ChatGPT Actions binding
- optional MCP extension field proposal

Exit criteria:

- security facts are provider-signed or provider-derived
- broker/model boundary is explicit
- consent, confirmation, receipt, and revocation flows are fully specified
- the protocol can be implemented without MCP

## Milestone 2: Reference Implementation

Goal: make the spec runnable over a normal HTTPS API before adding optional tool-protocol bindings.

Deliverables:

- mock provider authorization server
- mock provider resource server
- public REST/OpenAPI surface
- OAuth authorize/token/revoke endpoints
- harness token broker
- hosted-harness credential-custody adapter
- provider-signed confirmation token flow
- provider-signed action receipts
- DPoP-bound access token demo where supported
- grant/session revocation demo
- sample primary agent with subagent attribution
- ChatGPT Actions-compatible OpenAPI example

Exit criteria:

- a user can authorize a mock agent
- the broker or hosted harness credential layer can call the mock provider without exposing tokens to the model layer
- state-changing actions generate receipts
- sensitive actions require provider-signed confirmation tokens
- a no-MCP REST/OpenAPI client can perform read and write flows

## Milestone 3: Pilot SDKs And Integration Surface

Goal: package the reusable pieces for provider and harness implementers.

Deliverables:

- provider SDK
- harness broker SDK
- REST/OpenAPI binding package
- ChatGPT Actions binding package
- optional MCP extension package
- conformance tests
- example provider metadata endpoint
- example grant/session UI contract
- integration guide
- reference implementation traceability docs

Exit criteria:

- providers can validate grants, confirmation tokens, receipts, and action envelopes
- harnesses can implement token-broker storage and policy checks
- REST/OpenAPI clients can carry grant IDs, receipt IDs, idempotency keys, and confirmation challenges safely
- ChatGPT Actions can use OAuth and a provider-side AGP grant without exposing protocol details to the user
- MCP-based tools can optionally carry AGP fields safely
- at least one reference implementation maps AGP concepts to concrete code and pending gaps
