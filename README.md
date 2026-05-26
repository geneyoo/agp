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
- `packages/provider-sdk/`: placeholder for provider-side helpers.
- `packages/harness-broker-sdk/`: placeholder for harness token broker and credential-custody helpers.
- `packages/rest-openapi-binding/`: placeholder for REST/OpenAPI helpers.
- `packages/chatgpt-actions-binding/`: placeholder for ChatGPT Actions helpers.
- `packages/mcp-extension/`: optional MCP extension types.
- `examples/mock-provider/`: placeholder provider implementation.
- `examples/mock-harness/`: placeholder harness/broker implementation.

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

## Current Status

Private exploratory draft. The first milestone is to harden the spec before implementing SDKs.
