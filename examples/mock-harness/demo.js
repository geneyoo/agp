import {
  createActionRequestEnvelope,
  createDpopKeyPair,
  createDpopProof,
  createInMemoryTokenVault,
  createPkcePair
} from "../../packages/harness-broker-sdk/src/index.js";
import { startMockProvider } from "../mock-provider/server.js";
import { CHATGPT_ACTIONS_HARNESS_ID } from "../../packages/chatgpt-actions-binding/src/index.js";

const CLIENT_ID = "mock-harness-client";
const AGENT_ID = "palette-gpt";
const AGENT_LABEL = "Palette GPT";

export async function runMockHarnessDemo({ providerUrl, startProvider = !providerUrl } = {}) {
  const provider = startProvider ? await startMockProvider({ port: 0 }) : undefined;
  const baseUrl = providerUrl ?? provider.baseUrl;
  const tokenVault = createInMemoryTokenVault();
  const pkce = createPkcePair();
  const dpopKeyPair = createDpopKeyPair();

  try {
    const authorizeUrl = new URL("/oauth/authorize", baseUrl);
    authorizeUrl.searchParams.set("client_id", CLIENT_ID);
    authorizeUrl.searchParams.set("harness_id", CHATGPT_ACTIONS_HARNESS_ID);
    authorizeUrl.searchParams.set("harness_label", "ChatGPT Actions");
    authorizeUrl.searchParams.set("agent_id", AGENT_ID);
    authorizeUrl.searchParams.set("agent_label", AGENT_LABEL);
    authorizeUrl.searchParams.set("scope", "reviews.read reviews.create");
    authorizeUrl.searchParams.set("code_challenge", pkce.code_challenge);
    authorizeUrl.searchParams.set("code_challenge_method", pkce.code_challenge_method);

    const authorization = await fetchJson(authorizeUrl);
    const tokenSet = await fetchJson(new URL("/oauth/token", baseUrl), {
      method: "POST",
      headers: dpopHeaders({
        dpopKeyPair,
        method: "POST",
        url: new URL("/oauth/token", baseUrl)
      }),
      body: {
        grant_type: "authorization_code",
        code: authorization.code,
        client_id: CLIENT_ID,
        code_verifier: pkce.code_verifier
      }
    });

    tokenVault.storeTokenSet(tokenSet.grant_id, tokenSet);

    const reviewsBefore = await fetchJson(new URL("/reviews", baseUrl), {
      headers: authHeaders({
        tokenVault,
        grantId: tokenSet.grant_id,
        dpopKeyPair,
        method: "GET",
        url: new URL("/reviews", baseUrl)
      })
    });

    const reviewPayload = {
      rating: 5,
      text: "Created by the AGP mock harness."
    };
    const resource = `${baseUrl}/reviews`;
    const firstEnvelope = createActionRequestEnvelope({
      grantId: tokenSet.grant_id,
      harnessId: CHATGPT_ACTIONS_HARNESS_ID,
      primaryAgentId: AGENT_ID,
      subagentChain: [
        {
          id: "caption-writer",
          role: "drafted review text"
        }
      ],
      action: "reviews.create",
      resource,
      payload: reviewPayload
    });

    const confirmationChallenge = await fetchJson(new URL("/reviews", baseUrl), {
      method: "POST",
      headers: {
        ...authHeaders({
          tokenVault,
          grantId: tokenSet.grant_id,
          dpopKeyPair,
          method: "POST",
          url: new URL("/reviews", baseUrl)
        }),
        "Idempotency-Key": firstEnvelope.idempotency_key
      },
      body: {
        ...reviewPayload,
        action_request: firstEnvelope
      },
      expectedStatus: 403
    });

    const confirmation = await fetchJson(new URL("/confirmations", baseUrl), {
      method: "POST",
      headers: authHeaders({
        tokenVault,
        grantId: tokenSet.grant_id,
        dpopKeyPair,
        method: "POST",
        url: new URL("/confirmations", baseUrl)
      }),
      body: {
        action: confirmationChallenge.agp_confirmation.action,
        resource: confirmationChallenge.agp_confirmation.resource,
        payload_hash: confirmationChallenge.agp_confirmation.payload_hash
      }
    });
    tokenVault.storeConfirmationToken(
      tokenSet.grant_id,
      confirmation.confirmation_token_ref,
      confirmation.confirmation_token
    );

    const confirmedEnvelope = {
      ...firstEnvelope,
      confirmation_token_ref: confirmation.confirmation_token_ref
    };
    const createResponse = await fetchJson(new URL("/reviews", baseUrl), {
      method: "POST",
      headers: {
        ...authHeaders({
          tokenVault,
          grantId: tokenSet.grant_id,
          dpopKeyPair,
          method: "POST",
          url: new URL("/reviews", baseUrl)
        }),
        "Idempotency-Key": confirmedEnvelope.idempotency_key
      },
      body: {
        ...reviewPayload,
        action_request: confirmedEnvelope,
        confirmation_token: tokenVault.getConfirmationToken(
          tokenSet.grant_id,
          confirmation.confirmation_token_ref
        )
      },
      expectedStatus: 201
    });

    const duplicateResponse = await fetchJson(new URL("/reviews", baseUrl), {
      method: "POST",
      headers: {
        ...authHeaders({
          tokenVault,
          grantId: tokenSet.grant_id,
          dpopKeyPair,
          method: "POST",
          url: new URL("/reviews", baseUrl)
        }),
        "Idempotency-Key": confirmedEnvelope.idempotency_key
      },
      body: {
        ...reviewPayload,
        action_request: confirmedEnvelope,
        confirmation_token: tokenVault.getConfirmationToken(
          tokenSet.grant_id,
          confirmation.confirmation_token_ref
        )
      }
    });

    const summary = {
      provider: baseUrl,
      grant_id: tokenSet.grant_id,
      reviews_before: reviewsBefore.result.length,
      created_review_id: createResponse.result.id,
      receipt_id: createResponse.agp_receipt.receipt_id,
      duplicate_receipt_id: duplicateResponse.agp_receipt.receipt_id,
      confirmation_token_ref: confirmation.confirmation_token_ref
    };

    return summary;
  } finally {
    if (provider) {
      await provider.close();
    }
  }
}

function authHeaders({ tokenVault, grantId, dpopKeyPair, method, url }) {
  const tokenSet = tokenVault.getTokenSet(grantId);
  return {
    Authorization: `${tokenSet.token_type} ${tokenSet.access_token}`,
    ...dpopHeaders({
      dpopKeyPair,
      method,
      url,
      accessToken: tokenSet.access_token
    })
  };
}

function dpopHeaders({ dpopKeyPair, method, url, accessToken }) {
  return {
    DPoP: createDpopProof({
      privateKey: dpopKeyPair.privateKey,
      publicJwk: dpopKeyPair.publicJwk,
      htm: method,
      htu: normalizeDpopUrl(url),
      accessToken
    })
  };
}

function normalizeDpopUrl(url) {
  const parsed = url instanceof URL ? new URL(url) : new URL(String(url));
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function fetchJson(url, { method = "GET", headers = {}, body, expectedStatus = 200 } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();

  if (response.status !== expectedStatus) {
    const error = new Error(`Expected ${expectedStatus} from ${url}, got ${response.status}`);
    error.response = payload;
    throw error;
  }

  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await runMockHarnessDemo({ providerUrl: process.env.AGP_PROVIDER_URL });
  console.log(JSON.stringify(summary, null, 2));
}
