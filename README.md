# Agent Grant Protocol

Agent Grant Protocol is a transport-agnostic OAuth/OIDC interoperability profile for delegated agent access.

It lets a user grant a named agent inside a named harness bounded, revocable access to a provider account without sharing passwords, cookies, or raw bearer tokens with the model.

Core rule:

> Provider signs security facts. Broker or credential custody layer forwards and enforces them. Agent requests work but does not mint trust.

## What This Repo Contains

- `docs/protocol-overview.md`: RFC-style overview and threat model.
- `docs/transport-bindings.md`: REST/OpenAPI, ChatGPT Actions, MCP, CLI, and native app bindings.
- `docs/milestones.md`: staged plan from paper to reference implementation.
- `schemas/`: draft JSON schemas for protocol objects.
- `packages/provider-sdk/`: provider-side grant, confirmation, receipt, token, and in-memory store helpers.
- `packages/harness-broker-sdk/`: harness broker helpers for PKCE, DPoP, token custody, idempotency, and action envelopes.
- `packages/rest-openapi-binding/`: REST/OpenAPI response, header, and extension helpers.
- `packages/chatgpt-actions-binding/`: ChatGPT Actions grant and OpenAPI helpers.
- `packages/mcp-extension/`: optional MCP `agent_delegation` field helpers.
- `examples/mock-provider/`: runnable mock OAuth/provider/resource server.
- `examples/mock-harness/`: runnable hosted-harness/token-broker demo client.

## Protocol Components

- Agent Delegation Grant
- Token broker boundary
- Provider-signed confirmation token
- Provider-signed or provider-stored action receipt
- Action request envelope
- Subagent attribution under one provider-visible session
- Transport bindings for REST/OpenAPI, ChatGPT Actions, MCP, native apps, and CLIs

## Positioning

AGP is not an MCP replacement and does not require MCP.

MCP can be one transport binding for tool discovery and invocation. AGP owns the delegated-access layer below that: user, harness, agent, subagent, grant, consent, scope, confirmation, receipt, revocation, and audit semantics.

The first practical consumer binding should be OAuth + REST/OpenAPI, with ChatGPT Actions as an early no-MCP deployment path.

## Quickstart

Requirements: Node.js 20 or newer.

Install dependencies:

```sh
npm install
```

Run the reference flow end to end:

```sh
npm test
npm run demo
```

Run the mock provider:

```sh
npm run mock:provider
```

Then run the mock harness against it:

```sh
AGP_PROVIDER_URL=http://127.0.0.1:8787 npm run mock:harness
```

The demo covers:

- mock OAuth authorization code exchange with PKCE S256
- DPoP-bound access token issuance and provider-side DPoP proof validation
- token custody in a harness-side vault
- read and write REST calls without MCP
- provider confirmation for a consequential write
- ES256 provider-signed confirmation token with JWKS metadata
- ES256 provider-signed action receipt
- runtime JSON Schema validation for grant, action request, confirmation claims, and receipts
- idempotent write replay returning the same receipt

## Current Status

Private exploratory draft with a hardened Node reference implementation for the primary REST/OpenAPI path.

This is still not a production OAuth/OIDC server. It intentionally omits a real consent UI, persistent storage, refresh tokens, token introspection endpoint, dynamic client registration, PAR/JAR/RAR, full OIDC ID-token handling, and production key rotation.
