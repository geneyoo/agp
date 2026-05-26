# Agent Delegated Login Protocol

Draft: v3.1 RFC overview  
Status: exploratory  
Goal: define an interoperable, provider-safe way for users to delegate app access to named agents running inside named LLM harnesses.

## 1. Executive Summary

Agent Delegated Login Protocol is an OAuth/OIDC interoperability profile, not a new cryptographic protocol.

It introduces a three-tier identity model:

```text
user -> harness -> agent
```

Example:

```text
User: Gene's Instagram account
Harness: ChatGPT
Agent: Social Scheduler
Provider: Instagram
Permission: create draft posts, publish only after human confirmation
```

The protocol lets a user authorize a specific agent inside a specific harness to access a provider account without sharing usernames, passwords, cookies, or raw long-lived bearer tokens with the LLM.

Core thesis:

> OAuth/OIDC proves user delegation.
> DPoP/passkeys make it safer.
> Agent claims make it agent-native.
> Provider-owned sessions make it business-safe.

Core security rule:

> Provider signs the security facts the provider or resource server must trust.
> Broker stores secrets, enforces policy, signs transport proofs, and forwards provider-signed artifacts.
> Agent/model never gets credentials and never directly supplies security-critical claims.

The protocol should be a win for all sides:

- Users get simple connection, clear consent, and revocation.
- Harnesses get reliable app access without brittle scraping or stolen cookies.
- Providers get more authenticated usage, better attribution, rate limits, revocation, monetization hooks, and abuse controls.

## 2. Problem Statement

Users increasingly expect LLM harnesses like ChatGPT, Claude, Gemini, and local agents to operate across their existing apps: Instagram, YouTube, Gmail, GitHub, Shopify, banks, productivity tools, and other services.

Today, this usually fails in one of three ways:

1. The agent cannot access the app.
2. The user is asked for unsafe credentials, cookies, screenshots, or browser automation.
3. The app loses control over attribution, rate limits, abuse handling, monetization, and session safety.

The desired outcome:

> A user can connect Instagram to an agent in ChatGPT as easily as SSO, while Instagram keeps control over consent, scopes, sessions, revocation, attribution, safety, and monetization.

This is not simply "login via IG." More precisely:

> The user delegates bounded, revocable access from IG to a named agent running inside a named harness.

## 3. Scope

This profile covers:

- User identity proof through OIDC.
- Delegated authorization through OAuth.
- Harness identity.
- Agent identity.
- Provider-owned consent.
- Token binding.
- Token broker isolation.
- Session and grant revocation.
- Action attribution.
- Fine-grained authorization.
- Human confirmation and step-up for sensitive actions.
- Compatibility with tool ecosystems such as MCP.

This profile does not cover:

- New password systems.
- Replacement of OAuth, OIDC, WebAuthn, or app-native login.
- Unrestricted browser control by agents.
- Scraping as an integration model.
- Giving the LLM direct access to cookies, passwords, access tokens, refresh tokens, or raw bearer material.
- Perfect or "guaranteed" security.

The correct security claim is:

> cryptographically bound, auditable, revocable, least-privilege delegation with explicit trust boundaries and residual risk.

## 4. Design Principles

1. Use existing standards wherever possible.
2. Do not expose raw credentials to the LLM context.
3. Treat the provider as the authority for user consent, policy, revocation, and monetized surfaces.
4. Make the harness and agent visible in every grant and action.
5. Make sensitive actions require fresh policy evaluation.
6. Prefer narrow, action-oriented permissions over broad API scopes.
7. Make attribution and receipts mandatory.
8. Be honest about agent identity trust level.
9. Start with a practical MVP, but leave room for stronger attestation.
10. Treat subagents as internal delegation under one provider-visible session unless the provider explicitly requires a separate grant.

## 5. Participants

| Role | Example | Responsibility |
|---|---|---|
| User | Human IG account owner | Approves delegation |
| Provider | Instagram, YouTube, GitHub | Authenticates user, grants access, enforces policy |
| Authorization Server | IG auth service | Issues codes, tokens, and grant metadata |
| Resource Server | IG API | Validates tokens and executes allowed actions |
| Harness | ChatGPT, Claude, Gemini | Runs agents and owns the user-facing agent runtime |
| Agent | Social Scheduler | Requests actions on behalf of user |
| Subagent | Caption Writer, Image Selector | Performs internal work under the primary agent and harness |
| Token Broker | Harness-side auth subsystem | Stores secrets, enforces policy, signs requests |
| Agent Registry | Optional future registry | Publishes or verifies agent metadata |

Important distinction:

```text
Human session = user is logged into IG on iPhone/Safari.
Agent grant = ChatGPT agent can perform approved IG actions.
```

These should appear side-by-side in provider safety UI but be independently revocable.

### Reference Architecture

```text
        User device / browser
                |
                | provider-owned login, consent, confirmation
                v
        Provider Authorization Server
                |
                | issues provider-signed grant, tokens, confirmations
                v
Harness UI -> Agent runtime -> Subagents/tools
                |
                | structured action requests, no token material
                v
        Harness Token Broker
                |
                | DPoP-bound calls + provider-signed artifacts
                v
        Provider Resource Server
                |
                | receipts, audit events, session state
                v
        Provider safety UI / user activity feed
```

From the provider and user point of view, a primary agent and its subagents SHOULD appear as one connected agent session. Subagent attribution MAY appear in audit details and receipts, but subagents SHOULD NOT create separate provider-visible sessions unless the provider explicitly requires it for risk, policy, or billing.

## 6. Terminology

**Harness**: the application or runtime that hosts the agent. Examples: ChatGPT, Claude, Gemini, a local desktop agent.

**Agent**: a named workflow, assistant, extension, or task runner inside a harness.

**Subagent**: a child worker, specialist model, tool agent, or delegated internal actor used by a primary agent. Subagents run under the same provider-visible grant/session unless the provider requires separate consent.

**Provider**: the app or service that owns the user account and resource. Examples: Instagram, YouTube, GitHub.

**Token Broker**: a harness-side security component that stores tokens and keys, evaluates policy, signs requests, performs provider API calls, and emits receipts. It is not merely a credential store.

**Agent Delegation Grant**: the provider-issued authorization record that binds user, harness, agent, resource, scopes, policy, and session state.

**Human Session**: a provider session for direct user interaction, such as Instagram on iPhone.

**Agent Session**: a provider-visible delegated session for an agent.

**Provider-Visible Session**: the session shown to the user and provider safety UI. Multiple subagents may contribute to work inside one provider-visible session.

**Action Request**: a structured request from the agent runtime to the token broker.

**Action Receipt**: a signed or provider-recorded evidence object describing an action taken under a grant.

## 7. Standards Profile

This profile should be implemented as a strict OAuth/OIDC profile with agent-specific extensions.

| Standard | Requirement | Use |
|---|---|---|
| OpenID Connect | MUST | User identity: issuer, subject, ID token |
| OAuth 2 Authorization Code + PKCE | MUST | Delegated authorization flow |
| OAuth Security BCP | MUST | Security baseline |
| Authorization Server Metadata | MUST | Discover provider auth endpoints |
| Protected Resource Metadata | SHOULD | Discover resource authorization server |
| Resource Indicators | SHOULD | Bind token request to intended resource |
| DPoP | SHOULD for MVP, MUST for sensitive providers | Bind tokens to harness-held key |
| Token Revocation | MUST | Provider-side grant/session revocation |
| Token Introspection | SHOULD, MUST for high-risk actions | Check active grant state at call time |
| RAR | SHOULD | Fine-grained action permissions |
| PAR/JAR | SHOULD | Tamper-resistant authorization requests |
| WebAuthn/passkeys | SHOULD for step-up | Strong provider-side user approval |
| OAuth Step Up Authentication Challenge | SHOULD, MUST for high-risk action-time confirmation | Let resource server request stronger user authentication |
| Token Exchange | MAY | Future delegation chaining |
| Dynamic Client Registration / Client Metadata | MAY | Ecosystem-scale client onboarding |

References:

- OAuth Security BCP, RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- DPoP, RFC 9449: https://www.rfc-editor.org/rfc/rfc9449
- OAuth 2 Token Revocation, RFC 7009: https://www.rfc-editor.org/rfc/rfc7009
- OAuth 2 Token Introspection, RFC 7662: https://www.rfc-editor.org/rfc/rfc7662
- OAuth 2 Resource Indicators, RFC 8707: https://www.rfc-editor.org/rfc/rfc8707
- OAuth 2 Authorization Server Metadata, RFC 8414: https://www.rfc-editor.org/rfc/rfc8414
- OAuth 2 Rich Authorization Requests, RFC 9396: https://www.rfc-editor.org/rfc/rfc9396
- OAuth 2 JWT-Secured Authorization Request, RFC 9101: https://www.rfc-editor.org/rfc/rfc9101
- OAuth 2 Pushed Authorization Requests, RFC 9126: https://www.rfc-editor.org/rfc/rfc9126
- OAuth 2 Token Exchange, RFC 8693: https://www.rfc-editor.org/rfc/rfc8693
- OAuth 2 Step Up Authentication Challenge Protocol, RFC 9470: https://www.rfc-editor.org/rfc/rfc9470
- JSON Canonicalization Scheme, RFC 8785: https://www.rfc-editor.org/rfc/rfc8785
- OpenID Connect Core: https://openid.net/specs/openid-connect-core-1_0.html
- WebAuthn: https://www.w3.org/TR/webauthn-3/
- MCP authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

## 8. Trust Model

The protocol has three identity layers:

```text
user identity: provider-issued
harness identity: provider-registered or metadata-discovered
agent identity: trust-tiered
```

The provider is authoritative for the user identity.

The provider may trust a harness through registration, review, federation, signed metadata, or bilateral agreement. The ecosystem should support multiple registration models, but any deployment MUST state which model is used:

| Harness Registration Model | Description | Best For |
|---|---|---|
| Provider-local registration | Each provider reviews and registers each harness | Early pilots and high-risk providers |
| Federation metadata | Harness publishes signed metadata trusted through a federation | Multi-provider ecosystems |
| Registry/consortium | A neutral body reviews harnesses and publishes trust metadata | Broad ecosystem scaling |
| Bilateral agreement | Provider and harness agree out of band | Strategic integrations |

Phase 1 should use provider-local registration or bilateral agreement. Phase 2 should define federation or registry metadata if the goal is a broad ecosystem rather than N separate integrations.

The agent identity is the hardest part. A DPoP-bound token proves possession of a harness-held key. It does not, by itself, prove which internal agent produced the action. Therefore, the protocol must explicitly label the agent identity trust tier.

### Agent Identity Trust Tiers

| Tier | Name | Description | Provider Trusts |
|---|---|---|---|
| 0 | Unverified label | Agent name is display-only | Nothing beyond harness identity |
| 1 | Harness-asserted agent | Harness asserts `agent_id` and metadata | Harness policy and logs |
| 2 | Registry-verified manifest | Agent has a signed manifest published by a registry or marketplace | Manifest integrity and stable identity |
| 3 | Per-agent signing identity | Agent identity has its own certified signing key, normally held by broker/HSM | Cryptographic signing identity for the agent |
| 4 | Runtime attestation | Execution environment provides hardware or TEE attestation | Code/runtime integrity within attestation limits |

MVP may start with Tier 1, but the consent screen and token claims must make the trust level visible.

The protocol must not pretend that Tier 1 is cryptographic proof of agent execution. Tier 1 means:

> The provider trusts the harness to correctly label, isolate, and audit the agent.

### Trust Tier Verification

Each trust tier MUST define how the provider verifies it. The tier number MUST NOT be accepted solely because the harness placed it in an authorization request.

| Tier | Provider Verification Requirement |
|---|---|
| 0 | Provider ignores agent security claims and treats the grant as harness-only. |
| 1 | Provider validates the registered harness identity, then records the harness-asserted `agent_id` as an accountability label. |
| 2 | Provider validates a signed agent manifest against a trusted registry, marketplace, or federation root. |
| 3 | Provider validates a per-agent signing key certificate or signed package identity chained to a trusted harness, registry, or federation root. The broker/HSM may hold the key on behalf of the agent. |
| 4 | Provider validates a runtime attestation document and checks that the attested code/package identity matches the approved agent manifest and policy. |

Tier 4 deployments MUST define the attestation format and trust root. Examples may include TPM quotes, platform app attestation, secure enclave attestation, or cloud confidential-computing attestation. The profile should not treat "runtime attested" as meaningful unless the verifier, measurement, freshness, and revocation rules are specified.

Tier 3 does not require private keys to live inside the model or agent process. The preferred design is:

```text
per-agent signing identity exists
broker/HSM stores the key
agent runtime authenticates to broker
broker signs as that agent only after policy checks
```

This keeps the broker as the central secret boundary while allowing stronger per-agent signing semantics.

For Tier 3, providers SHOULD specify whether key proof is required:

- at grant creation only
- at token exchange
- on every state-changing action
- on every action

For sensitive actions, the provider SHOULD require the per-agent signing identity to sign the action envelope or confirmation-token request, while DPoP continues to bind the transport token to the harness-held key.

### Agent Manifest Handling

For Tier 2 and above, the provider SHOULD pin an agent manifest digest at grant time.

The manifest verification policy MUST define:

- who signs the manifest
- which trust root validates the signature
- how signing keys rotate
- whether the provider re-fetches manifests
- when manifest digest changes require re-consent
- whether existing grants remain valid after manifest update
- how compromised manifests are revoked

Recommended behavior:

- Grants pin the approved `manifest_digest`.
- Security-relevant manifest changes require re-consent.
- Non-security metadata changes may be accepted without re-consent if signed by the same trusted issuer.
- Providers should periodically revalidate manifests for active grants.
- Registry compromise should support emergency revocation of affected manifests.

### Subagent Trust

Subagents inherit the primary provider-visible grant unless the provider policy requires otherwise.

Subagent attribution inherits the primary agent/harness trust tier unless the subagent is independently verified. A subagent MUST NOT claim a higher trust tier than the primary agent unless the provider independently verifies that subagent's manifest, signing identity, or runtime attestation.

The provider-visible session key should remain:

```text
provider user + harness + primary agent + grant
```

Internal subagent activity may be recorded as:

```json
{
  "primary_agent_id": "agent-social-scheduler-v1",
  "subagent_chain": [
    {
      "id": "subagent-caption-writer-v2",
      "role": "caption_writer",
      "trust_tier": 1
    }
  ]
}
```

Providers SHOULD NOT force a separate user-visible session per subagent by default. Providers MAY require separate grants for subagents that introduce materially different risk, such as a payment subagent, messaging subagent, or third-party hosted subagent outside the harness trust boundary.

Subagent traces SHOULD be bounded. Providers and harnesses SHOULD cap recorded subagent depth, for example at 8 hops, and MAY truncate or summarize deeper internal execution. If workflows are not linear, `subagent_chain` should be interpreted as a flattened attribution trace rather than a complete execution graph.

Providers need a way to evaluate subagent risk before or during action execution. Supported mechanisms:

- Primary agent manifest declares allowed subagent roles and IDs.
- Provider metadata declares which subagent roles require separate consent.
- Resource server can reject or challenge an action when an undeclared or high-risk subagent appears.
- Provider can require separate grants for third-party hosted subagents or subagents with elevated privileges.

Recommended manifest shape:

```json
{
  "agent_id": "agent-social-scheduler-v1",
  "allowed_subagents": [
    {
      "id": "subagent-caption-writer-v2",
      "role": "caption_writer",
      "max_trust_tier": 1,
      "actions": ["content.create_draft"]
    }
  ]
}
```

For receipt and audit purposes, subagent attribution is only as strong as the verification tier that produced it. At Tier 1, subagent attribution is a harness/broker accountability claim, not independent proof that the named subagent executed.

## 9. Threat Model

This section is normative for security review. The protocol must describe what it protects against and what remains residual risk.

| Threat | Primary Controls | Residual Risk |
|---|---|---|
| Stolen access token | DPoP, short TTL, audience/resource binding | Attacker may act until expiry if private key also compromised |
| Post-revocation access token drift | Short TTL, introspection for writes, provider grant status checks | Low-risk actions may continue until access token expiry |
| Stolen refresh token | Rotation, reuse detection, revocation | Broker compromise can still be severe |
| Token exposed to LLM context | Broker isolation, redaction, logging controls | Harness implementation bug |
| Prompt injection | Least privilege, broker policy, action confirmation, receipts | Model may still propose bad actions |
| Confused deputy | Structured action requests, provider policy, explicit resource binding | Cross-tool workflows remain complex |
| Malicious agent | Agent review, trust tiers, scopes, rate limits, audit | Tier 1 depends heavily on harness honesty |
| Malicious harness | Provider registration, certification, limits, revocation | Protocol cannot fully protect against trusted harness abuse |
| Compromised broker | Key isolation, HSM/KMS, monitoring, revocation, step-up | High-impact failure domain |
| User tricked into consent | Provider-owned consent UI, PAR/JAR, redirect validation, clear naming | Social engineering cannot be eliminated |
| Replay attack | Nonces, state, PKCE, DPoP `jti`, short lifetimes | Clock and replay cache correctness required |
| CSRF/open redirect | State, exact redirect URI validation, issuer/audience checks | Provider/client implementation bugs |
| Scope stacking | Grant inventory, user-visible permissions, per-action policy | Users may approve too much over time |
| Draft spam or low-risk abuse | Rate limits, quotas, receipts, anomaly detection | "Low-risk" actions can still become abusive at scale |
| Provider API abuse | Per-user/harness/agent/action limits, receipts, enforcement | Provider policy must be actively maintained |

DPoP is important but narrow. It prevents replay of stolen bearer tokens. It does not solve malicious agents, prompt injection, broad permissions, compromised brokers, or bad provider policy.

## 10. Token Broker Boundary

The token broker is the security center of the system.

Definition:

> The token broker is a policy enforcement and signing service that stores credentials, receives structured action requests from the agent runtime, validates those requests against grants and provider policy, performs provider calls, and emits receipts without exposing bearer material to the model context.

The broker MUST NOT invent security facts that the provider or resource server relies on. It may enforce local policy, but provider/resource-server decisions should be based on provider-signed or provider-derived artifacts.

Examples:

| Security Fact | Wrong Source | Correct Source |
|---|---|---|
| User approved grant | broker boolean | provider authorization server grant record |
| User confirmed publish | `human_confirmed: true` from broker | provider-signed confirmation token |
| Step-up performed | broker claim | provider-issued `amr`/`acr` or confirmation token |
| Agent trust tier | harness request alone | provider-validated registration/manifest/key/attestation |
| Action receipt | harness analytics event only | provider-signed receipt or provider-stored receipt ID |

The broker MUST prevent token material from appearing in:

- model prompts
- model completions
- tool arguments
- tool return values
- application logs
- traces
- error messages
- retry payloads
- screenshots
- agent memory
- exported conversation state

The broker MUST expose only structured capabilities to the agent runtime.

Example action request:

```json
{
  "grant_id": "grant_456",
  "action": "media.create_draft",
  "provider": "https://instagram.com",
  "resource": "https://api.instagram.com",
  "arguments": {
    "caption": "Draft caption text",
    "media_ref": "broker-local-upload-123"
  },
  "display_context": {
    "provider_template": "media_create_draft"
  },
  "idempotency_key": "idem_abc123"
}
```

The broker MUST verify:

- the grant exists and is active
- the requested action is allowed by the grant
- the target resource matches the grant
- required provider-signed confirmation token is present and valid
- the request does not violate provider or user policy
- rate limits and quotas permit the action
- the action is idempotent or has an idempotency key where needed
- sensitive arguments do not leak tokens or cross-provider secrets

The broker SHOULD run outside the inference process. For high-risk providers, the broker SHOULD use isolated secret storage such as KMS, HSM, secure enclave, or equivalent platform isolation.

Agent-supplied text MUST NOT be used as the authoritative language in provider consent or confirmation UI. The provider should render confirmation text from provider-owned templates keyed on action, account, resource, risk, and payload preview. Agent-supplied text may be shown as untrusted context only if clearly separated from the security decision.

## 11. Agent Delegation Grant

The profile defines an Agent Delegation Grant that binds:

- user
- provider
- harness
- agent
- trust tier
- resource or resource set
- permissions
- token binding key
- session state
- confirmation policy
- revocation state

Example logical object:

```json
{
  "grant_id": "grant_456",
  "user": {
    "iss": "https://instagram.com",
    "sub": "ig-user-123"
  },
  "harness": {
    "id": "https://chatgpt.com",
    "name": "ChatGPT",
    "client_id": "chatgpt-prod"
  },
  "agent": {
    "id": "agent-social-scheduler-v1",
    "name": "Social Scheduler",
    "trust_tier": 1,
    "trust_verification": "harness_asserted",
    "manifest_uri": "https://chatgpt.com/agents/social-scheduler/manifest.json",
    "manifest_digest": "sha256-..."
  },
  "subagents": {
    "provider_visible": "provider_decision",
    "receipt_attribution": "allowed"
  },
  "resources": [
    "https://api.instagram.com"
  ],
  "permissions": [
    "profile.read",
    "media.create_draft",
    "media.publish"
  ],
  "policy": {
    "media.publish": {
      "human_confirmation": "required",
      "step_up": "provider_discretion",
      "confirmation_token": "required"
    },
    "message.send": {
      "allowed": false
    }
  },
  "token_binding": {
    "method": "dpop",
    "jkt": "thumbprint-of-harness-public-key"
  },
  "session": {
    "id": "agt_sess_123",
    "created_at": "2026-05-26T12:00:00Z",
    "last_used_at": "2026-05-26T12:10:00Z",
    "revocable": true,
    "status": "active"
  }
}
```

`subagents.provider_visible` is a provider decision recorded on the grant, not a harness demand. The harness may request grouped subagent handling, but the provider decides whether subagents remain internal attribution or require separate user-visible grants.

By default, a grant SHOULD target one provider-visible session and one or more explicit resource indicators. Multi-resource providers may either:

- issue one grant per resource and group them in provider UI
- issue one multi-resource grant with explicit `resources` and per-resource audiences

Ambiguous grants that silently span unrelated products SHOULD be avoided.

## 12. Consent UX

The provider owns the consent screen.

The consent screen MUST show:

- provider account
- harness name
- agent name
- agent trust tier, or a plain-language equivalent
- requested permissions
- actions requiring confirmation
- actions that are not allowed
- persistence duration
- revocation location

Recommended trust language:

| Tier | User-Visible Phrase |
|---|---|
| 0 | "This agent name has not been verified." |
| 1 | "This agent identity is asserted by the harness." |
| 2 | "This agent manifest is verified by a trusted registry." |
| 3 | "This agent uses a verified signing identity." |
| 4 | "This agent is running in a verified execution environment." |

Providers may simplify these phrases for consumer UX, but MUST NOT imply stronger verification than the protocol actually performed.

Example:

```text
Allow ChatGPT / Social Scheduler to access Instagram?

This allows:
- Read your profile
- Create draft posts
- Suggest captions

This requires your confirmation:
- Publish a post

This does not allow:
- Send DMs
- Change account settings
- Delete posts

You can revoke this later in Instagram Settings -> Connected Agents.
```

For Tier 1 agent identity, the screen should be honest:

```text
Agent identity is asserted by ChatGPT.
Instagram has verified ChatGPT, not the internal code of this agent.
```

For consumer UX, this can be simplified, but the security semantics should remain true.

Provider confirmation UI MUST be rendered from provider-owned language. Agent-provided notes MUST NOT be used in the confirmation renderer; if retained, they belong in audit-only channels.

## 13. Authorization Flow

Happy path:

1. User asks the harness to connect a provider account.
2. Harness creates a fresh keypair, nonce, state, and PKCE challenge.
3. Harness sends an authorization request to the provider.
4. Request includes harness metadata, agent metadata, requested resource, and requested action permissions.
5. Provider authenticates the user using its normal login/session/passkey/MFA.
6. Provider verifies the requested agent trust tier or downgrades it to the highest tier it can verify.
7. Provider evaluates declared subagent roles and risk policy.
8. Provider performs step-up if required by risk policy.
9. Provider shows a provider-owned consent screen with the actually verified trust tier.
10. User approves.
11. Provider creates an Agent Delegation Grant and agent session.
12. Provider returns an authorization code.
13. Token broker exchanges code for tokens using PKCE and DPoP.
14. Provider issues short-lived access token and rotating refresh token.
15. Broker stores token material outside the LLM context.
16. Agent or subagent sends structured action requests to broker.
17. Broker validates policy and performs provider API calls.
18. Provider validates token, DPoP proof, action envelope, grant state, scopes, rate limits, confirmation tokens, and risk policy.
19. Provider emits a signed receipt or provider-stored receipt ID.

If trust tier verification or subagent evaluation changes after consent is rendered, the provider MUST either preserve the already-shown guarantees or force re-consent with the downgraded trust language.

## 14. Authorization Request Extensions

The authorization request should carry agent-specific metadata using standard extension points where possible.

Example conceptual request fields:

```json
{
  "client_id": "chatgpt-prod",
  "redirect_uri": "https://chatgpt.com/oauth/callback",
  "response_type": "code",
  "scope": "openid profile",
  "resource": "https://api.instagram.com",
  "code_challenge": "...",
  "code_challenge_method": "S256",
  "state": "...",
  "nonce": "...",
  "dpop_jkt": "thumbprint-of-harness-public-key",
  "agent": {
    "id": "agent-social-scheduler-v1",
    "name": "Social Scheduler",
    "trust_tier": 1,
    "requested_trust_verification": "harness_asserted",
    "manifest_uri": "https://chatgpt.com/agents/social-scheduler/manifest.json",
    "manifest_digest": "sha256-..."
  },
  "authorization_details": [
    {
      "type": "agent_action",
      "actions": [
        "profile.read",
        "media.create_draft",
        "media.publish"
      ],
      "constraints": {
        "media.publish": {
          "human_confirmation": "required"
        }
      }
    }
  ]
}
```

The `dpop_jkt` value is the DPoP public-key thumbprint authorization request parameter described by RFC 9449 Section 10.

For high-security providers, the request SHOULD use PAR and/or JAR so the authorization request cannot be tampered with through the browser.

## 15. Token Claims

The provider-issued access token or introspection response SHOULD include:

```json
{
  "iss": "https://instagram.com",
  "sub": "ig-user-123",
  "aud": "https://api.instagram.com",
  "azp": "chatgpt-prod",
  "client_id": "chatgpt-prod",
  "harness_id": "https://chatgpt.com",
  "agent_id": "agent-social-scheduler-v1",
  "agent_trust_tier": 1,
  "agent_trust_verification": "harness_asserted",
  "agent_manifest_digest": "sha256-...",
  "grant_id": "grant_456",
  "agent_session_id": "agt_sess_123",
  "resources": ["https://api.instagram.com"],
  "scope": "profile.read media.create_draft media.publish",
  "authorization_details": [
    {
      "type": "agent_action",
      "actions": ["profile.read", "media.create_draft", "media.publish"]
    }
  ],
  "cnf": {
    "jkt": "thumbprint-of-harness-public-key"
  },
  "iat": 1779806400,
  "exp": 1779807000,
  "auth_time": 1779806300,
  "amr": ["passkey"],
  "acr": "provider-defined-step-up"
}
```

Resource servers MUST NOT trust raw client-supplied headers such as:

```text
X-User-Id
X-Agent-Id
X-Harness-Id
```

Resource servers should trust identity only when it appears in:

- a provider-issued signed token
- a provider-issued introspection response
- a mutually authenticated internal provider channel

## 16. Action Request Envelope

Every provider API action SHOULD include an action attribution envelope. For state-changing actions, it MUST.

Example:

```json
{
  "action_request_id": "arq_123",
  "grant_id": "grant_456",
  "harness_id": "https://chatgpt.com",
  "primary_agent_id": "agent-social-scheduler-v1",
  "agent_trust_tier": 1,
  "subagent_chain": [
    {
      "id": "subagent-caption-writer-v2",
      "role": "caption_writer"
    }
  ],
  "action": "media.create_draft",
  "resource": "https://api.instagram.com",
  "display_context": {
    "provider_template": "media_create_draft"
  },
  "confirmation_token_ref": null,
  "idempotency_key": "idem_abc123",
  "created_at": "2026-05-26T12:20:00Z",
  "request_hash": "sha256-..."
}
```

This envelope may be sent as a signed JWT or as structured request metadata authenticated by the DPoP-bound client call.

For actions requiring human confirmation, the envelope MUST include a provider-signed confirmation token. The resource server MUST validate that token instead of trusting a client-supplied `human_confirmed` boolean.

The broker MUST NOT send a `confirmation.required` field as a security claim. Confirmation requirements are determined by provider grant policy and resource-server risk policy. The broker may attach `confirmation_token_ref` or the protected confirmation token through a channel hidden from the model.

Agent-supplied notes MUST NOT be sent to provider confirmation renderers. If needed for debugging or abuse review, agent notes should be delivered through an audit-only field that is explicitly unavailable to user-facing confirmation UI.

### Request Hash Canonicalization

`payload_hash` and `request_hash` MUST be computed over a deterministic canonical representation.

Recommended rule:

- use JSON Canonicalization Scheme, RFC 8785, for JSON payloads
- hash bytes with SHA-256
- encode hash as base64url without padding
- exclude transport-only fields such as access tokens, DPoP proofs, and signatures
- include action, resource, grant ID, idempotency key, and normalized action arguments

If a provider uses a non-JSON payload, it MUST publish the canonicalization rule for that action type.

`payload_hash` is the hash used in confirmation tokens. `request_hash` is the hash recorded in envelopes and receipts. For confirmed actions, they SHOULD be the same value unless the provider explicitly separates "user-confirmed payload" from "full execution request"; if separate, both hashes MUST be present and named distinctly.

### Idempotency

State-changing action requests SHOULD include an idempotency key.

Idempotency semantics:

- Uniqueness scope SHOULD be `provider + grant_id + action + idempotency_key`.
- Providers SHOULD retain idempotency records for at least 24 hours, and longer for money movement, purchase, publish, or message-send actions.
- Reusing the same key with the same payload SHOULD return the original result or receipt.
- Reusing the same key with a different payload MUST fail with an idempotency conflict.
- Token rotation during an in-flight action MUST NOT invalidate idempotency behavior.
- The idempotency record SHOULD include `request_hash`, `action_request_id`, result status, and receipt ID.

## 17. Action Receipts

Action receipts are mandatory for attribution, audit, abuse handling, billing, monetization reconciliation, and user safety.

Providers MUST create action receipts for state-changing actions. Providers SHOULD create receipts for reads that are monetized, sensitive, or rate-limited.

For read actions, providers SHOULD choose one clear policy:

- universal read receipts
- receipts for a documented set of sensitive, monetized, or rate-limited reads
- aggregate read audit events where per-read receipts are too expensive

The policy should be discoverable so harnesses do not have to guess which actions produce receipts.

Receipts MUST be either:

- provider-signed objects, such as JWS/JWT receipts
- provider-stored opaque receipt IDs retrievable from a provider audit API

For monetization, billing, dispute handling, and cross-system reconciliation, provider-signed receipts are preferred.

Example receipt:

```json
{
  "receipt_id": "act_123",
  "iss": "https://instagram.com",
  "provider": "https://instagram.com",
  "resource_server": "https://api.instagram.com",
  "user_sub": "ig-user-123",
  "harness_id": "https://chatgpt.com",
  "primary_agent_id": "agent-social-scheduler-v1",
  "agent_trust_tier": 1,
  "subagent_chain": [
    {
      "id": "subagent-caption-writer-v2",
      "role": "caption_writer"
    }
  ],
  "grant_id": "grant_456",
  "agent_session_id": "agt_sess_123",
  "action": "media.create_draft",
  "resource_id": "ig-draft-789",
  "action_request_id": "arq_123",
  "idempotency_key": "idem_abc123",
  "timestamp": "2026-05-26T12:21:00Z",
  "confirmation_token_id": null,
  "step_up_performed": false,
  "dpop_jkt": "thumbprint-of-harness-public-key",
  "request_hash": "sha256-...",
  "result": "success"
}
```

Receipt signing semantics:

- Provider MUST be the authoritative issuer for provider action receipts.
- Harness MAY countersign receipts for its own audit trail.
- `receipt_id` MUST be globally unique within the provider.
- Receipts MUST NOT authorize future actions.
- Replayed receipts MUST NOT be accepted as proof of new execution.
- Receipts SHOULD include the original action request ID and request hash.
- Failed and denied actions SHOULD also produce audit events, even if not full receipts.

Receipts SHOULD be visible to:

- provider abuse systems
- provider analytics
- harness audit systems
- user-facing activity logs where appropriate

For monetized actions, receipts SHOULD support reconciliation without forcing the provider to trust harness-side analytics.

## 18. Scope And Action Vocabulary

Classic OAuth scopes are often too broad for agents. This profile should prefer action-oriented permissions carried through RAR.

The profile should define a small common vocabulary while allowing provider-specific extensions.

Suggested common action classes:

| Action Class | Meaning |
|---|---|
| `identity.read` | Read stable account identity |
| `profile.read` | Read public or user-approved profile info |
| `content.read` | Read user content |
| `content.create_draft` | Create draft content that is not published |
| `content.publish` | Publish content |
| `message.read` | Read messages |
| `message.send` | Send messages |
| `purchase.prepare` | Prepare cart/checkout |
| `purchase.commit` | Complete purchase |
| `account.settings.read` | Read account settings |
| `account.settings.write` | Change account settings |

Providers SHOULD publish supported action semantics through metadata.

Example:

```json
{
  "agent_delegation_supported": true,
  "agent_actions_supported": [
    "profile.read",
    "content.create_draft",
    "content.publish"
  ],
  "confirmation_required_by_default": [
    "content.publish",
    "message.send",
    "purchase.commit",
    "account.settings.write"
  ],
  "agent_trust_tiers_supported": [1, 2, 3]
}
```

The goal is not to force every provider into the same taxonomy. The goal is to let harnesses discover semantics instead of hardcoding every integration.

## 19. Session And Revocation Model

Providers should extend existing safety UI:

```text
Logged-in devices:
- Gene's iPhone
- Safari on Mac

Connected agents:
- ChatGPT / Social Scheduler
  Trust: asserted by ChatGPT
  Permissions: draft posts, read profile
  Internal workers: 2 recent subagents
  Last used: 2 minutes ago
  Revoke
```

Revoking an iPhone session should not necessarily revoke an agent grant. Revoking an agent grant should not log the user out of iPhone.

Subagents SHOULD be grouped under the primary provider-visible session. The provider UI may show subagent details in an expanded activity view, but should avoid creating one visible session per internal worker unless a subagent crosses a separate trust boundary.

From the client/user point of view, subagents are implementation details of the same connected session. The session should be named by the harness and primary agent, not by every internal worker involved in the task.

Providers SHOULD offer:

- revoke this browser session
- revoke this phone session
- revoke this agent grant
- revoke all sessions and agents
- require re-approval for sensitive actions
- view recent agent actions
- reduce permissions without full revocation

Revocation requirements:

- Refresh token revocation MUST take effect immediately.
- Reuse of a rotated refresh token MUST revoke the grant or trigger risk policy.
- State-changing actions SHOULD check active grant state at call time.
- High-risk actions MUST either use very short-lived tokens or token introspection.
- Providers SHOULD maintain a provider-side grant status service.

Access token lifetime guidance:

| Action Type | Recommended Access Token Behavior |
|---|---|
| Low-risk read | Up to 15 minutes |
| Draft creation | 5-15 minutes, provider discretion |
| Publish/message/purchase/settings | <= 60 seconds or introspection on every call |

### Grant Delta And Scope Reduction

Revocation should not be the only way to reduce risk.

Providers SHOULD support grant updates that reduce or narrow permissions without forcing full re-consent.

Examples:

```text
keep profile.read
keep media.create_draft
remove media.publish
disable offline access
require confirmation for all writes
```

Rules:

- Scope reduction SHOULD take effect immediately.
- Scope expansion MUST require provider-owned consent.
- Changed grant policy SHOULD be reflected in token introspection and new access tokens.
- Existing access tokens for removed sensitive scopes SHOULD be invalidated or forced through introspection.

### User Activity Feed

Providers SHOULD expose a user-visible activity feed for agent actions.

The feed SHOULD include:

- harness name
- primary agent name
- subagent details where useful
- action type
- time
- resource or content preview where safe
- confirmation status
- result
- revoke or report controls

Sensitive actions SHOULD trigger push, email, or in-app notifications according to provider policy. Activity feed retention SHOULD be long enough for account recovery and dispute handling, with redaction for sensitive payloads.

## 20. Human Confirmation And Step-Up

Human confirmation should be an action policy, not a vague UX preference.

Human confirmation MUST be represented by a provider-signed confirmation token, not by a broker-asserted boolean.

Actions that SHOULD require human confirmation by default:

- publish public content
- send messages
- make purchases
- change account settings
- delete content
- grant additional permissions
- access financial, medical, precise location, or similarly sensitive data

Step-up authentication SHOULD be required when:

- the grant is first created for sensitive scopes
- the user has not recently authenticated
- the action is high risk
- the provider detects anomalous behavior
- the action exceeds normal user/harness/agent pattern

If the user has a passkey, the provider SHOULD consider requiring a passkey assertion when issuing a sensitive grant or confirming a high-risk action.

The provider may record auth method references in token claims:

```json
{
  "amr": ["passkey"],
  "acr": "provider-defined-step-up"
}
```

### Provider-Signed Confirmation Token

For sensitive actions, the provider should use a short-lived confirmation token.

Flow:

1. Broker attempts a sensitive action.
2. Resource server determines fresh confirmation or step-up is required.
3. Resource server returns a step-up or confirmation challenge.
4. Harness routes the user to provider-owned confirmation UI.
5. Provider renders the action from provider-owned templates and payload previews.
6. User confirms, optionally with passkey/MFA.
7. Provider issues a signed confirmation token.
8. Broker attaches the token to the action call.
9. Resource server validates the token signature, binding, expiry, and payload hash.

Confirmation token claims SHOULD include:

```json
{
  "iss": "https://instagram.com",
  "aud": "https://api.instagram.com",
  "sub": "ig-user-123",
  "client_id": "chatgpt-prod",
  "harness_id": "https://chatgpt.com",
  "agent_id": "agent-social-scheduler-v1",
  "grant_id": "grant_456",
  "action": "media.publish",
  "resource": "https://api.instagram.com",
  "payload_hash": "sha256-...",
  "confirmation_id": "conf_123",
  "cnf": {
    "jkt": "thumbprint-of-harness-public-key"
  },
  "amr": ["passkey"],
  "acr": "provider-defined-step-up",
  "iat": 1779806400,
  "exp": 1779806460
}
```

Confirmation tokens MUST be:

- provider-signed
- short-lived
- bound to user, harness, agent, grant, action, resource, payload hash, and DPoP key thumbprint
- one-time use for state-changing actions
- unusable for broader scopes or different payloads

### Action-Time Step-Up

Step-up may be required at grant creation or at action time.

For action-time step-up, the resource server SHOULD use the OAuth 2.0 Step Up Authentication Challenge Protocol where applicable.

Example conceptual response:

```http
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  acr_values="provider-defined-step-up",
  max_age="0",
  challenge_uri="https://instagram.com/agent-confirmation/chal_123"
```

In this profile, `max_age="0"` means the provider requires fresh authentication or confirmation now.

The challenge response SHOULD include or reference a structured challenge object:

```json
{
  "challenge_id": "chal_123",
  "confirmation_uri": "https://instagram.com/agent-confirmation/chal_123",
  "expires_at": "2026-05-26T12:31:00Z",
  "provider": "https://instagram.com",
  "account_hint": "@gene",
  "grant_id": "grant_456",
  "action": "media.publish",
  "resource": "https://api.instagram.com",
  "payload_hash": "sha256-...",
  "required_acr": "provider-defined-step-up",
  "allowed_methods": ["passkey", "mfa"]
}
```

The response SHOULD include:

- challenge ID
- required action
- required account
- confirmation URI
- expiry
- payload hash or preview reference

The broker must surface this to the harness without exposing token material. The harness should route the user to the provider-owned confirmation flow and retry only after receiving a provider-signed confirmation token.

## 21. Autonomous And Offline Agents

Many useful agents are asynchronous: scheduled posts, overnight workflows, monitoring, reminders, and cron-style tasks.

This creates tension with human confirmation.

The profile should support constrained offline authorization:

```json
{
  "offline_policy": {
    "allowed": true,
    "expires_at": "2026-06-26T00:00:00Z",
    "max_actions_per_day": 5,
    "allowed_actions": ["content.create_draft"],
    "requires_confirmation": ["content.publish"],
    "spend_limits": {
      "enabled": false
    }
  }
}
```

For sensitive actions, the provider should choose one of:

- require just-in-time human confirmation
- allow pre-approved scheduled execution with a narrow time window
- require step-up before the schedule is accepted
- disallow offline execution

The protocol should avoid silent, indefinite pre-approval for high-impact actions.

If money movement is allowed, spend limits MUST be explicit:

```json
{
  "spend_limits": {
    "enabled": true,
    "currency": "USD",
    "per_transaction_max": "25.00",
    "daily_max": "100.00",
    "cumulative_max": "500.00",
    "expires_at": "2026-06-26T00:00:00Z",
    "enforced_by": "provider"
  }
}
```

Spend limits should be enforced by the provider or merchant system, not only by the harness.

## 22. Account Creation And Linking

The main Phase 1 product should be delegation from an existing provider account.

If the relying service needs a local account, it may create one from the provider identity:

```text
provider_issuer + provider_subject
```

Example:

```text
https://instagram.com + 123456789
```

Do not use email as the primary identifier.

Email may be used as a hint only if:

- provider asserts `email_verified`
- local policy permits it
- user performs explicit linking
- risk checks pass

Existing local account linking MUST require proof of both sides:

1. User is logged into the existing local account.
2. User authorizes provider identity in the same flow.
3. Provider subject is stable and recorded.
4. Server links only after both sides are proven.

The system SHOULD support:

- unlinking
- relinking
- recovery if provider access is lost
- notification on new link
- step-up before linking sensitive accounts

The system MUST NOT auto-link solely because emails match.

## 23. Provider Business Controls

Providers need this to feel like partnership, not extraction.

The protocol should support:

- provider-owned consent
- provider-owned confirmation UI
- attribution on every action
- rate limits per harness, agent, user, and action
- abuse reporting
- ad/session measurement
- paid API tiers
- provider-rendered surfaces for monetized actions
- revocation and session safety

Recommended pattern:

```text
agent prepares
provider renders
user confirms
provider monetizes/measures
agent continues
```

Examples:

| Action | Preferred Model |
|---|---|
| Read profile | API |
| Create draft post | API |
| Publish post | Provider confirmation |
| Watch video | Provider-owned surface |
| Buy product | Merchant checkout |
| Change settings | Step-up auth |

This framing is critical:

> Agents do not bypass apps.
> Agents become permissioned, attributable, revocable clients of apps.

## 24. MCP Relationship

This profile is transport-agnostic. It can be used by:

- MCP clients and servers
- hosted LLM harnesses
- native apps
- web apps
- local desktop agents
- provider SDKs

MCP is a primary deployment target, not the only target.

Recommended positioning:

> Agent Delegated Login is an OAuth/OIDC profile that can be used by MCP authorization. It extends the normal client/resource/user model with explicit harness identity, agent identity, broker isolation, action receipts, and provider-owned consent semantics.

In MCP terms:

- MCP server may act as resource server.
- MCP client/harness may act as OAuth client.
- Authorization server remains provider-controlled or provider-approved.
- Protected Resource Metadata can advertise agent delegation support.
- MCP tool calls should map to structured action requests.
- Tool results must not leak token material back to the model context.

MCP compatibility likely requires extension fields rather than prose-only mapping.

Suggested MCP extension points:

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

Tool results SHOULD return receipt references and user-safe summaries, not bearer tokens, refresh tokens, provider cookies, or raw confirmation tokens.

## 25. Wire-Level Enforcement Points

Provider/resource server should be able to key policy on:

- provider user subject
- harness client ID
- harness ID
- primary agent ID
- subagent chain where relevant
- agent trust tier
- agent trust verification method
- grant ID
- agent session ID
- action type
- resource indicator
- DPoP key thumbprint
- provider-signed confirmation token status
- step-up status
- action receipt ID

These values should come from provider-issued tokens, introspection, or signed action envelopes, not from arbitrary client headers.

## 26. Tradeoffs Considered

| Option | Benefit | Problem |
|---|---|---|
| Give agents cookies | Simple | Unsafe, unrevocable, indistinguishable from user |
| Give agents passwords | Universal | Catastrophic security model |
| Plain OAuth app token | Familiar | Does not distinguish harness vs agent |
| Browser automation | Works today | Brittle, abusive, hard to attribute |
| New crypto protocol | Custom fit | High risk, low adoption |
| OAuth/OIDC profile with agent claims | Compatible | Requires providers/harnesses to implement profile |
| DPoP-bound tokens | Strong replay protection | Does not prove internal agent identity |
| Harness-asserted agent identity | Practical MVP | Relies heavily on harness trust |
| Per-agent keys/attestation | Stronger identity | More implementation and ecosystem complexity |
| Human confirmation for sensitive writes | Safer/provider-friendly | More friction |
| Full autonomy | Better UX | Higher abuse and business risk |
| Provider-rendered sensitive surfaces | Preserves monetization/control | Less seamless harness UX |
| Provider-signed confirmation tokens | Strong action approval semantics | Adds challenge/retry UX |
| One provider-visible session for subagents | Cleaner UX and session safety | Requires receipt-level subagent attribution |

Recommended tradeoff:

> Start with strict OAuth/OIDC compatibility, DPoP token binding, provider-owned consent, mandatory receipts, and Tier 1 harness-asserted agent identity. Design the profile so Tier 2-4 agent identity can be adopted without replacing the protocol.

## 27. Phased Plan

### Phase 0: Specification

- Define threat model.
- Define mandatory/optional standards profile.
- Define agent identity trust tiers.
- Define trust-tier verification mechanisms.
- Define agent grant claims.
- Define consent UX requirements.
- Define token broker requirements.
- Define provider-signed confirmation token flow.
- Define revocation/session APIs.
- Define action request envelope.
- Define action receipt schema.
- Define receipt signing semantics.
- Define idempotency semantics.
- Define provider metadata fields.
- Define MCP compatibility guidance and extension fields.
- Define subagent attribution under one provider-visible session.

### Phase 1: Single Provider, Single Harness

Goal: prove existing provider account delegation, not just net-new account creation.

Phase 1a: consent, grant, broker, and receipts.

- One provider.
- One harness.
- Existing provider account authorization.
- Local net-new account creation only if needed, anchored on issuer + subject.
- Read profile.
- Create draft.
- Provider session UI for connected agent.
- Revoke agent grant.
- Mandatory receipts for writes.
- Broker isolation from model context.
- DPoP-bound access tokens.

Phase 1b: binding and refresh hardening.

- Rotating refresh tokens.
- Token introspection or short-TTL enforcement for state-changing actions.

Phase 1c: sensitive writes.

- Provider-signed confirmation tokens.
- Human-confirmed publish.
- Action-time step-up challenge.
- User activity feed for confirmed writes.

### Phase 2: Ecosystem Readiness

- Multiple harnesses.
- Multiple providers.
- Provider metadata discovery.
- Common action vocabulary.
- Existing local account linking.
- Agent registry or marketplace.
- Agent manifest verification.
- Provider analytics.
- Abuse reporting.
- Certification/app review.
- Token introspection for sensitive providers.

### Phase 3: Advanced Delegation

- Token exchange.
- Organization policies.
- Team accounts.
- Delegated admin controls.
- Step-up policies.
- Per-agent keys.
- Runtime attestation.
- Cross-agent workflows.
- Standardized monetization callbacks.
- Offline/asynchronous policies.

## 28. Mandatory Security Requirements

Implementations MUST:

- use OAuth Authorization Code with PKCE
- validate issuer, audience, expiry, redirect URI, nonce, and state
- prevent token material from entering model context
- support provider-side revocation
- use short-lived access tokens
- rotate refresh tokens
- emit action receipts for state-changing actions
- use provider-signed or provider-stored receipts for state-changing actions
- use provider-signed confirmation tokens for sensitive confirmed actions
- distinguish human sessions from agent grants
- group subagents under one provider-visible session unless provider policy requires otherwise
- expose agent grants in provider safety UI
- validate action authorization at execution time
- validate agent trust tier according to the stated verification mechanism
- log security-relevant events

Implementations SHOULD:

- use DPoP
- use PAR/JAR for high-security providers
- use RAR for action-level permissions
- use token introspection for high-risk actions
- require human confirmation for sensitive actions
- require passkey or MFA step-up for sensitive grants
- publish provider metadata for supported actions
- support agent identity trust tiers
- support user-visible activity feeds
- support scope reduction without full revocation

Implementations MUST NOT:

- use implicit grant
- use password grants
- collect user provider passwords in harnesses
- share provider cookies with agents
- expose raw access tokens to the LLM
- expose refresh tokens to the LLM
- store provider cookies in agent memory
- rely on email as sole account-linking proof
- trust raw client-supplied user or agent headers
- trust broker-asserted `human_confirmed` for sensitive actions
- use agent-supplied text as the authoritative provider confirmation language
- silently expand scopes without provider consent

## 29. Open Questions

- What is the minimum acceptable Tier 1 harness certification?
- Should major providers require Tier 2 agent manifests from day one?
- Who operates agent registries?
- What signature and certificate formats should registries use?
- What metadata belongs in the agent manifest?
- Which manifest changes require re-consent?
- Which action classes require human confirmation by default?
- How should provider-rendered monetized surfaces appear inside harnesses?
- How should users set global rules like "never publish without asking"?
- How should receipts be retained, redacted, and shared between provider and harness?
- What read-action receipt policy is practical for high-volume providers?
- Can action vocabularies converge enough to reduce provider-specific adapters?
- What should be required for offline scheduled sensitive actions?
- When should a subagent require its own provider-visible grant?

## 30. Adoption Pitch

For users:

> Connect once, approve clearly, revoke anytime.

For harnesses:

> Reliable access to user apps without storing passwords, cookies, or brittle browser state.

For providers:

> More usage, more authenticated sessions, more attribution, better safety, fewer scraping incentives, and monetization-preserving control.

For security reviewers:

> This profile does not ask providers to trust an LLM with credentials. It asks providers to trust a registered harness and token broker under explicit scopes, token binding, revocation, receipts, and policy enforcement.

## 31. Bottom Line

The protocol should not be sold as "agents can log in as users."

It should be sold as:

> users can delegate bounded, revocable, attributable access from a provider to a named agent in a named harness, under provider-controlled policy.

The first version can rely on harness-asserted agent identity, but it must say that honestly. The long-term protocol should support stronger agent identity through registries, manifests, per-agent signing identities, and runtime attestation.

Subagents should not fragment the user's safety model. From the provider and user point of view, they should normally remain inside one connected agent session, with subagent attribution captured in receipts and audit trails rather than separate visible sessions.

The protocol should follow one rule whenever possible:

> Provider signs security facts.
> Broker forwards and enforces them.
> Agent requests work but does not mint trust.
