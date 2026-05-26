# Agent Grant Protocol

Agent Grant Protocol is an OAuth/OIDC interoperability profile for delegated agent access.

It lets a user grant a named agent inside a named harness bounded, revocable access to a provider account without sharing passwords, cookies, or raw bearer tokens with the model.

Core rule:

> Provider signs security facts. Broker forwards and enforces them. Agent requests work but does not mint trust.

## What This Repo Contains

- `docs/protocol-overview.md`: RFC-style overview and threat model.
- `docs/milestones.md`: staged plan from paper to reference implementation.
- `schemas/`: draft JSON schemas for protocol objects.
- `packages/provider-sdk/`: placeholder for provider-side helpers.
- `packages/harness-broker-sdk/`: placeholder for harness-side token broker helpers.
- `packages/mcp-extension/`: placeholder for MCP extension types.
- `examples/mock-provider/`: placeholder provider implementation.
- `examples/mock-harness/`: placeholder harness/broker implementation.

## Protocol Components

- Agent Delegation Grant
- Token broker boundary
- Provider-signed confirmation token
- Provider-signed or provider-stored action receipt
- Action request envelope
- Subagent attribution under one provider-visible session
- MCP extension fields

## Current Status

Private exploratory draft. The first milestone is to harden the spec before implementing SDKs.
