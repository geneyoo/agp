# Mock Harness

Runnable mock harness, hosted-harness adapter, and token broker demo.

Run the full demo with an in-process provider:

```sh
npm run demo
```

Run against an already-running provider:

```sh
AGP_PROVIDER_URL=http://127.0.0.1:8787 npm run mock:harness
```

The demo initiates OAuth with PKCE, obtains a DPoP-bound access token, stores tokens in the broker vault, performs a read with DPoP proof, receives a confirmation challenge on write, obtains a provider-signed confirmation token, submits an action request envelope, and receives a provider-signed receipt.
