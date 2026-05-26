import assert from "node:assert/strict";
import test from "node:test";
import { runMockHarnessDemo } from "../examples/mock-harness/demo.js";
import { startMockProvider } from "../examples/mock-provider/server.js";
import {
  createActionRequestEnvelope,
  createDpopKeyPair,
  createDpopProof,
  createInMemoryTokenVault,
  createPkcePair
} from "../packages/harness-broker-sdk/src/index.js";
import { verifyActionReceiptToken } from "../packages/provider-sdk/src/index.js";
import { CHATGPT_ACTIONS_HARNESS_ID } from "../packages/chatgpt-actions-binding/src/index.js";
import {
  createAgentDelegationFields,
  extractAgentDelegationFields
} from "../packages/mcp-extension/src/index.js";

const CLIENT_ID = "mock-harness-client";
const AGENT_ID = "palette-gpt";

test("mock harness completes AGP authorization, DPoP, confirmation, write, receipt, and idempotency flow", async () => {
  const summary = await runMockHarnessDemo();

  assert.match(summary.grant_id, /^grant_/u);
  assert.match(summary.created_review_id, /^review_/u);
  assert.match(summary.receipt_id, /^rcpt_/u);
  assert.equal(summary.duplicate_receipt_id, summary.receipt_id);
  assert.match(summary.confirmation_token_ref, /^conf_/u);
});

test("mock provider protects writes with PKCE, DPoP-bound tokens, confirmation, and signed receipts", async () => {
  const provider = await startMockProvider({ port: 0 });
  const tokenVault = createInMemoryTokenVault();
  const dpopKeyPair = createDpopKeyPair();

  try {
    const { tokenSet } = await authorizeAndToken({ provider, dpopKeyPair });
    tokenVault.storeTokenSet(tokenSet.grant_id, tokenSet);

    const payload = {
      rating: 4,
      text: "Test review"
    };
    const envelope = createActionRequestEnvelope({
      grantId: tokenSet.grant_id,
      harnessId: CHATGPT_ACTIONS_HARNESS_ID,
      primaryAgentId: AGENT_ID,
      action: "reviews.create",
      resource: `${provider.baseUrl}/reviews`,
      payload
    });

    const challenge = await fetchJson(`${provider.baseUrl}/reviews`, {
      method: "POST",
      headers: {
        ...authHeaders({
          tokenSet,
          dpopKeyPair,
          method: "POST",
          url: `${provider.baseUrl}/reviews`
        }),
        "Idempotency-Key": envelope.idempotency_key
      },
      body: {
        ...payload,
        action_request: envelope
      },
      expectedStatus: 403
    });
    assert.equal(challenge.error, "confirmation_required");

    const confirmation = await fetchJson(`${provider.baseUrl}/confirmations`, {
      method: "POST",
      headers: authHeaders({
        tokenSet,
        dpopKeyPair,
        method: "POST",
        url: `${provider.baseUrl}/confirmations`
      }),
      body: {
        action: challenge.agp_confirmation.action,
        resource: challenge.agp_confirmation.resource,
        payload_hash: challenge.agp_confirmation.payload_hash
      }
    });

    const created = await fetchJson(`${provider.baseUrl}/reviews`, {
      method: "POST",
      headers: {
        ...authHeaders({
          tokenSet,
          dpopKeyPair,
          method: "POST",
          url: `${provider.baseUrl}/reviews`
        }),
        "Idempotency-Key": envelope.idempotency_key
      },
      body: {
        ...payload,
        action_request: {
          ...envelope,
          confirmation_token_ref: confirmation.confirmation_token_ref
        },
        confirmation_token: confirmation.confirmation_token
      },
      expectedStatus: 201
    });

    const receipt = await verifyActionReceiptToken(created.agp_receipt_token, provider.publicKey, {
      issuer: provider.baseUrl
    });
    assert.equal(receipt.receipt_id, created.agp_receipt.receipt_id);
    assert.equal(receipt.step_up_performed, true);
    assert.equal(receipt.action, "reviews.create");
    assert.equal(receipt.dpop_jkt, tokenSet.cnf.jkt);

    await fetchJson(`${provider.baseUrl}/oauth/revoke`, {
      method: "POST",
      body: {
        token: tokenVault.getAccessToken(tokenSet.grant_id)
      }
    });

    const afterRevoke = await fetchJson(`${provider.baseUrl}/reviews`, {
      headers: authHeaders({
        tokenSet,
        dpopKeyPair,
        method: "GET",
        url: `${provider.baseUrl}/reviews`
      }),
      expectedStatus: 401
    });
    assert.equal(afterRevoke.error, "invalid_access_token");
  } finally {
    await provider.close();
  }
});

test("provider rejects missing PKCE and invalid PKCE verifier", async () => {
  const provider = await startMockProvider({ port: 0 });
  const dpopKeyPair = createDpopKeyPair();

  try {
    const missingPkce = await fetchJson(
      `${provider.baseUrl}/oauth/authorize?client_id=${CLIENT_ID}&harness_id=${CHATGPT_ACTIONS_HARNESS_ID}&agent_id=${AGENT_ID}&scope=reviews.read%20reviews.create`,
      { expectedStatus: 400 }
    );
    assert.equal(missingPkce.error, "pkce_required");

    const pkce = createPkcePair();
    const authorizeUrl = new URL("/oauth/authorize", provider.baseUrl);
    authorizeUrl.searchParams.set("client_id", CLIENT_ID);
    authorizeUrl.searchParams.set("harness_id", CHATGPT_ACTIONS_HARNESS_ID);
    authorizeUrl.searchParams.set("agent_id", AGENT_ID);
    authorizeUrl.searchParams.set("scope", "reviews.read reviews.create");
    authorizeUrl.searchParams.set("code_challenge", pkce.code_challenge);
    authorizeUrl.searchParams.set("code_challenge_method", pkce.code_challenge_method);
    const authorization = await fetchJson(authorizeUrl);

    const invalidToken = await fetchJson(`${provider.baseUrl}/oauth/token`, {
      method: "POST",
      headers: dpopHeaders({
        dpopKeyPair,
        method: "POST",
        url: `${provider.baseUrl}/oauth/token`
      }),
      body: {
        grant_type: "authorization_code",
        code: authorization.code,
        client_id: CLIENT_ID,
        code_verifier: "wrong-verifier"
      },
      expectedStatus: 400
    });
    assert.equal(invalidToken.error, "invalid_code_verifier");
  } finally {
    await provider.close();
  }
});

test("provider rejects missing, mismatched, and replayed DPoP proofs", async () => {
  const provider = await startMockProvider({ port: 0 });
  const dpopKeyPair = createDpopKeyPair();
  const otherDpopKeyPair = createDpopKeyPair();

  try {
    const { tokenSet } = await authorizeAndToken({ provider, dpopKeyPair });

    const missingDpop = await fetchJson(`${provider.baseUrl}/reviews`, {
      headers: {
        Authorization: `${tokenSet.token_type} ${tokenSet.access_token}`
      },
      expectedStatus: 401
    });
    assert.equal(missingDpop.error, "missing_dpop_proof");

    const mismatchedDpop = await fetchJson(`${provider.baseUrl}/reviews`, {
      headers: authHeaders({
        tokenSet,
        dpopKeyPair: otherDpopKeyPair,
        method: "GET",
        url: `${provider.baseUrl}/reviews`
      }),
      expectedStatus: 401
    });
    assert.equal(mismatchedDpop.error, "dpop_key_mismatch");

    const replayedProof = createDpopProof({
      privateKey: dpopKeyPair.privateKey,
      publicJwk: dpopKeyPair.publicJwk,
      htm: "GET",
      htu: `${provider.baseUrl}/reviews`,
      accessToken: tokenSet.access_token
    });

    await fetchJson(`${provider.baseUrl}/reviews`, {
      headers: {
        Authorization: `${tokenSet.token_type} ${tokenSet.access_token}`,
        DPoP: replayedProof
      }
    });

    const replay = await fetchJson(`${provider.baseUrl}/reviews`, {
      headers: {
        Authorization: `${tokenSet.token_type} ${tokenSet.access_token}`,
        DPoP: replayedProof
      },
      expectedStatus: 401
    });
    assert.equal(replay.error, "dpop_replay_detected");
  } finally {
    await provider.close();
  }
});

test("broker and MCP helpers expose DPoP and delegation metadata without token material", () => {
  const keyPair = createDpopKeyPair();
  const proof = createDpopProof({
    privateKey: keyPair.privateKey,
    publicJwk: keyPair.publicJwk,
    htm: "POST",
    htu: "https://provider.example/reviews",
    accessToken: "opaque-access-token"
  });
  const fields = createAgentDelegationFields({
    grantId: "grant_123",
    harnessId: CHATGPT_ACTIONS_HARNESS_ID,
    primaryAgentId: AGENT_ID,
    actionRequestId: "actreq_123",
    idempotencyKey: "idem_123",
    receiptId: "rcpt_123"
  });

  assert.equal(proof.split(".").length, 3);
  assert.equal(typeof keyPair.jkt, "string");
  assert.equal(extractAgentDelegationFields(fields).grant_id, "grant_123");
  assert.equal(fields.agent_delegation.receipt_id, "rcpt_123");
  assert.equal(fields.agent_delegation.access_token, undefined);
});

async function authorizeAndToken({ provider, dpopKeyPair }) {
  const pkce = createPkcePair();
  const authorizeUrl = new URL("/oauth/authorize", provider.baseUrl);
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("harness_id", CHATGPT_ACTIONS_HARNESS_ID);
  authorizeUrl.searchParams.set("agent_id", AGENT_ID);
  authorizeUrl.searchParams.set("scope", "reviews.read reviews.create");
  authorizeUrl.searchParams.set("code_challenge", pkce.code_challenge);
  authorizeUrl.searchParams.set("code_challenge_method", pkce.code_challenge_method);

  const authorization = await fetchJson(authorizeUrl);
  const tokenSet = await fetchJson(`${provider.baseUrl}/oauth/token`, {
    method: "POST",
    headers: dpopHeaders({
      dpopKeyPair,
      method: "POST",
      url: `${provider.baseUrl}/oauth/token`
    }),
    body: {
      grant_type: "authorization_code",
      code: authorization.code,
      client_id: CLIENT_ID,
      code_verifier: pkce.code_verifier
    }
  });

  return {
    authorization,
    tokenSet,
    pkce
  };
}

function authHeaders({ tokenSet, dpopKeyPair, method, url }) {
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

  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  return payload;
}
