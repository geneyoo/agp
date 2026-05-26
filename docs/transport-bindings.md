# Transport Bindings

AGP is transport-agnostic. The core protocol defines delegated access semantics:

- user
- harness
- agent
- subagent attribution
- grant/session
- scopes and action policy
- provider-owned consent
- confirmation
- receipt
- revocation

Transports define how those semantics are carried over a concrete integration surface.

## Binding Strategy

The protocol should support multiple bindings without changing the core grant model:

| Binding | Primary Use | Status |
|---|---|---|
| REST/OpenAPI | Lowest-friction provider API and SDK integration | Primary MVP binding |
| ChatGPT Actions | Consumer ChatGPT UX without MCP | Primary early deployment target |
| MCP | Tool ecosystem compatibility | Optional binding |
| Native app SDK | First-party mobile/desktop apps | Later binding |
| CLI | Local developer and automation clients | Later binding |

The existence of an MCP binding must not make AGP depend on MCP. A provider should be able to implement AGP with only OAuth, HTTPS, JSON, and a documented OpenAPI schema.

## REST/OpenAPI Binding

The REST/OpenAPI binding uses ordinary HTTPS APIs:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
Idempotency-Key: <key>
```

The access token maps to an AGP grant through JWT claims or token introspection. The resource server enforces:

- active grant
- user identity
- harness identity
- agent identity and trust tier
- requested scope/action
- confirmation token when required
- revocation state
- idempotency semantics

State-changing responses SHOULD include an action receipt or a receipt reference:

```json
{
  "result": {
    "id": "review_123"
  },
  "agp_receipt": {
    "receipt_id": "rcpt_123",
    "grant_id": "grant_123",
    "action": "reviews.create"
  }
}
```

## ChatGPT Actions Binding

ChatGPT Actions should be treated as a hosted harness binding over REST/OpenAPI.

From the user perspective:

```text
Connect Palette once.
Approve read/write access.
ChatGPT can call Palette until the grant expires or is revoked.
```

From the provider perspective:

```text
user = provider account
harness = openai-chatgpt-actions
agent = provider-defined GPT/action integration
subagents = internal attribution only unless elevated risk requires separate consent
```

Requirements:

- Use OAuth Authorization Code flow for user-specific access.
- Use the standard `Authorization: Bearer` header for API calls.
- Do not depend on custom request headers for security-critical AGP claims.
- Treat ChatGPT/OpenAI credential storage as the hosted harness credential custody layer.
- Treat OpenAI-provided user/session metadata, if present, as correlation hints only, not identity proof.
- Provider must store the AGP grant and map the OAuth token to that grant.
- Provider should mark write operations as consequential in the OpenAPI schema where the host supports that metadata.
- Provider should show one user-visible connected session for the harness and primary agent, not one session per subagent.

ChatGPT does not expose a stable device UUID equivalent to a first-party iPhone app keychain identity. AGP must therefore create its own provider-side grant/session record instead of trying to reuse a device session.

Recommended Palette-style grant:

```json
{
  "user_id": "user_123",
  "harness_id": "openai-chatgpt-actions",
  "agent_id": "palette-gpt",
  "client_type": "chatgpt",
  "scopes": ["reviews.read", "reviews.write"],
  "ttl_days": 14,
  "provider_visible_session_label": "ChatGPT / Palette GPT"
}
```

## MCP Binding

MCP remains useful for tool discovery and tool invocation, but it is only one possible binding.

MCP tool calls should map to AGP action requests. MCP tool results should carry receipt references, confirmation challenges, and user-safe summaries without leaking tokens, refresh tokens, provider cookies, or raw confirmation tokens back to model context.

Suggested MCP extension fields:

| Field | Purpose |
|---|---|
| `agent_delegation.grant_id` | Bind tool call to provider grant |
| `agent_delegation.primary_agent_id` | Identify provider-visible agent |
| `agent_delegation.subagent_chain` | Preserve internal subagent attribution |
| `agent_delegation.action_request_id` | Correlate tool call to provider action |
| `agent_delegation.idempotency_key` | Prevent duplicate writes |
| `agent_delegation.confirmation_challenge` | Return provider step-up/confirmation requirement |
| `agent_delegation.confirmation_token_ref` | Reference provider-signed confirmation token without exposing it to the model |
| `agent_delegation.receipt_id` | Return provider receipt handle |

## Native App And CLI Bindings

Native apps and CLIs may store their local user session in platform credential storage:

- iOS/macOS Keychain
- Android Keystore
- desktop OS credential stores
- local encrypted credential files
- CLI session files for development

These sessions are first-party or client-specific sessions. They should not be shared with hosted harnesses like ChatGPT.

The same provider account may have several sessions:

| Session | Storage | Purpose |
|---|---|---|
| First-party app session | App keychain/cookies | Direct provider app usage |
| CLI session | Local credential store/session file | Terminal usage |
| ChatGPT grant | Hosted harness credential store + provider grant record | ChatGPT Actions usage |
| MCP grant | MCP client/server credential store + provider grant record | MCP tool usage |

Each session/grant is independently revocable.

## Consumer UX Contract

The default consumer UX should be:

```text
Read/search: works as guest when provider allows it.
First write: connect provider account.
After connect: writes work until TTL expiry or revocation.
Sensitive writes: provider confirmation or step-up.
Subagents: hidden under one visible connected session by default.
```

User-visible consent should name the provider, harness, primary agent, scopes, expiry, and revocation path. It should not expose protocol objects like token hashes, DPoP key thumbprints, or internal subagent traces unless the user opens advanced audit details.
