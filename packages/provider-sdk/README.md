# Provider SDK

Provider-side helpers for the Agent Grant Protocol reference implementation.

Implemented modules:

- agent delegation grant creation and validation
- JSON Schema validation helpers backed by Ajv 2020-12
- ES256 signing-key and JWKS helpers
- in-memory authorization-code, DPoP-bound access-token, grant, revocation, and receipt store
- PKCE S256 verification
- DPoP proof verification and replay detection
- action policy checks
- confirmation challenge creation
- provider-signed confirmation token issuance and validation
- provider-signed action receipt issuance and validation
- stable JSON hashing helpers for action request payloads

Example:

```js
import {
  createAgentDelegationGrant,
  createProviderSigningKeys,
  createProviderStore,
  issueConfirmationToken
} from "@agp/provider-sdk";
```
