# MCP Extension

Optional MCP extension helpers for AGP delegation metadata.

MCP is one possible AGP transport binding. AGP must also work over REST/OpenAPI, ChatGPT Actions, native SDKs, and CLIs without MCP.

Implemented fields:

- `agent_delegation.grant_id`
- `agent_delegation.harness_id`
- `agent_delegation.primary_agent_id`
- `agent_delegation.subagent_chain`
- `agent_delegation.action_request_id`
- `agent_delegation.idempotency_key`
- `agent_delegation.confirmation_challenge`
- `agent_delegation.confirmation_token_ref`
- `agent_delegation.receipt_id`

Helpers create, extract, and validate the `agent_delegation` object without carrying token material.
