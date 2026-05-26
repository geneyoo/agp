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
- MCP extension field proposal

Exit criteria:

- security facts are provider-signed or provider-derived
- broker/model boundary is explicit
- consent, confirmation, receipt, and revocation flows are fully specified

## Milestone 2: Reference Implementation

Goal: make the spec runnable locally.

Deliverables:

- mock provider authorization server
- mock provider resource server
- harness token broker
- provider-signed confirmation token flow
- provider-signed action receipts
- DPoP-bound access token demo
- grant/session revocation demo
- sample primary agent with subagent attribution

Exit criteria:

- a user can authorize a mock agent
- the broker can call the mock provider without exposing tokens to the model layer
- state-changing actions generate receipts
- sensitive actions require provider-signed confirmation tokens

## Milestone 3: Pilot SDKs And Integration Surface

Goal: package the reusable pieces for provider and harness implementers.

Deliverables:

- provider SDK
- harness broker SDK
- MCP extension package
- conformance tests
- example provider metadata endpoint
- example grant/session UI contract
- integration guide

Exit criteria:

- providers can validate grants, confirmation tokens, receipts, and action envelopes
- harnesses can implement token-broker storage and policy checks
- MCP-based tools can carry grant IDs, receipt IDs, idempotency keys, and confirmation challenges safely
