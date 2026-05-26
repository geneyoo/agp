# Mock Harness

Placeholder for a runnable harness, hosted-harness adapter, and token broker implementation.

Expected responsibilities:

- initiate authorization flow
- store tokens outside model context
- call REST/OpenAPI provider endpoints without MCP
- enforce grant policy
- attach DPoP proofs
- attach provider-signed confirmation tokens
- submit action request envelopes
- preserve subagent attribution
