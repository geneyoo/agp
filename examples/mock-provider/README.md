# Mock Provider

Runnable mock provider implementation for the AGP reference flow.

Run:

```sh
npm run mock:provider
```

Endpoints:

- `GET /.well-known/agp-provider`
- `GET /jwks.json`
- `GET /openapi.json`
- `GET /oauth/authorize`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `GET /grants/:grant_id`
- `GET /reviews`
- `POST /confirmations`
- `POST /reviews`

The authorization flow requires PKCE S256. The token endpoint requires a DPoP proof and issues a DPoP-bound access token. Resource endpoints require `Authorization: DPoP <token>` plus a matching `DPoP` proof.

The write flow requires provider confirmation and returns an ES256-signed AGP receipt.
