# Harness Broker SDK

Harness-side token broker and credential-custody helpers for the Agent Grant Protocol reference implementation.

Implemented modules:

- PKCE verifier/challenge creation
- P-256 DPoP keypair and proof creation for token and resource requests
- in-memory token vault for keeping access and confirmation tokens outside model context
- action request envelope creation and verification
- idempotency key generation
- subagent attribution fields

Example:

```js
import {
  createActionRequestEnvelope,
  createDpopKeyPair,
  createDpopProof,
  createInMemoryTokenVault
} from "@agp/harness-broker-sdk";
```
