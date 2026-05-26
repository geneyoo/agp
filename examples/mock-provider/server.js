import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  AgpProviderError,
  assertGrantActive,
  assertGrantAllowsAction,
  createActionReceipt,
  createAgentDelegationGrant,
  createConfirmationChallenge,
  createDpopReplayStore,
  createProviderSigningKeys,
  createProviderStore,
  createSchemaValidator,
  issueConfirmationToken,
  normalizeDpopUrl,
  sha256Json,
  signActionReceipt,
  verifyDpopProof,
  verifyConfirmationToken
} from "../../packages/provider-sdk/src/index.js";
import {
  createConfirmationRequiredResponse,
  createGrantStatusResponse,
  createReceiptResponse,
  parseAuthorizationToken,
  requireIdempotencyKey
} from "../../packages/rest-openapi-binding/src/index.js";
import {
  CHATGPT_ACTIONS_HARNESS_ID,
  createChatGPTActionsOpenApi
} from "../../packages/chatgpt-actions-binding/src/index.js";

const require = createRequire(import.meta.url);
const agentDelegationGrantSchema = require("../../schemas/agent-delegation-grant.schema.json");
const actionRequestEnvelopeSchema = require("../../schemas/action-request-envelope.schema.json");
const confirmationTokenClaimsSchema = require("../../schemas/confirmation-token.claims.schema.json");
const actionReceiptSchema = require("../../schemas/action-receipt.schema.json");

const REVIEW_ACTION_READ = "reviews.read";
const REVIEW_ACTION_CREATE = "reviews.create";
const SCHEMA_VALIDATORS = {
  grant: createSchemaValidator(agentDelegationGrantSchema),
  actionRequest: createSchemaValidator(actionRequestEnvelopeSchema),
  confirmationClaims: createSchemaValidator(confirmationTokenClaimsSchema),
  receipt: createSchemaValidator(actionReceiptSchema)
};

export function createMockProvider({
  issuer,
  signingKeys = createProviderSigningKeys(),
  userSub = "user_mock_123"
} = {}) {
  const store = createProviderStore();
  const dpopReplayStore = createDpopReplayStore();
  const reviews = new Map([
    [
      "review_seed_1",
      {
        id: "review_seed_1",
        rating: 5,
        text: "Seed review from the mock provider."
      }
    ]
  ]);
  const state = {
    issuer,
    signingKeys,
    userSub,
    store,
    dpopReplayStore,
    reviews
  };

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, state);
    } catch (error) {
      sendError(response, error);
    }
  });

  return {
    server,
    store,
    reviews,
    publicKey: signingKeys.publicKey,
    jwks: signingKeys.jwks,
    get issuer() {
      return state.issuer;
    },
    setIssuer(nextIssuer) {
      state.issuer = nextIssuer;
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

export async function startMockProvider({ host = "127.0.0.1", port = 8787, ...options } = {}) {
  const provider = createMockProvider(options);

  await new Promise((resolve, reject) => {
    provider.server.once("error", reject);
    provider.server.listen(port, host, resolve);
  });

  const address = provider.server.address();
  const baseUrl = `http://${host}:${address.port}`;
  provider.setIssuer(options.issuer ?? baseUrl);
  provider.baseUrl = baseUrl;

  return provider;
}

async function routeRequest(request, response, state) {
  const url = new URL(request.url, state.issuer ?? "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, issuer: state.issuer });
    return;
  }

  if (request.method === "GET" && url.pathname === "/.well-known/agp-provider") {
    sendJson(response, 200, createProviderMetadata(state));
    return;
  }

  if (request.method === "GET" && url.pathname === "/jwks.json") {
    sendJson(response, 200, state.signingKeys.jwks);
    return;
  }

  if (request.method === "GET" && url.pathname === "/openapi.json") {
    sendJson(
      response,
      200,
      createChatGPTActionsOpenApi({
        serverUrl: state.issuer
      })
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/oauth/authorize") {
    handleAuthorize(url, response, state);
    return;
  }

  if (request.method === "POST" && url.pathname === "/oauth/token") {
    await handleToken(request, response, state);
    return;
  }

  if (request.method === "POST" && url.pathname === "/oauth/revoke") {
    await handleRevoke(request, response, state);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/grants/")) {
    const grantId = decodeURIComponent(url.pathname.slice("/grants/".length));
    const grant = state.store.getGrant(grantId);
    if (!grant) {
      throw new AgpProviderError("Grant not found", { status: 404, code: "grant_not_found" });
    }
    sendJson(response, 200, createGrantStatusResponse(grant));
    return;
  }

  if (request.method === "GET" && url.pathname === "/reviews") {
    const { grant } = await authenticate(request, state);
    assertGrantAllowsAction(grant, REVIEW_ACTION_READ, {
      resource: reviewsResource(state)
    });
    sendJson(response, 200, {
      result: [...state.reviews.values()],
      grant_id: grant.grant_id
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/confirmations") {
    await handleConfirmation(request, response, state);
    return;
  }

  if (request.method === "POST" && url.pathname === "/reviews") {
    await handleCreateReview(request, response, state);
    return;
  }

  throw new AgpProviderError("Route not found", { status: 404, code: "not_found" });
}

function handleAuthorize(url, response, state) {
  const clientId = url.searchParams.get("client_id") ?? "mock-harness-client";
  const redirectUri = url.searchParams.get("redirect_uri");
  const harnessId = url.searchParams.get("harness_id") ?? CHATGPT_ACTIONS_HARNESS_ID;
  const harnessLabel = url.searchParams.get("harness_label") ?? "ChatGPT Actions";
  const agentId = url.searchParams.get("agent_id") ?? "palette-gpt";
  const agentLabel = url.searchParams.get("agent_label") ?? "Palette GPT";
  const scope = url.searchParams.get("scope") ?? `${REVIEW_ACTION_READ} ${REVIEW_ACTION_CREATE}`;
  const permissions = scope.split(/[\s,]+/u).filter(Boolean);
  const providerVisibleSessionLabel =
    url.searchParams.get("session_label") ?? `${harnessLabel} / ${agentLabel}`;
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    throw new AgpProviderError("OAuth authorization requests must use PKCE S256", {
      status: 400,
      code: "pkce_required"
    });
  }

  const grant = createAgentDelegationGrant({
    user: {
      sub: state.userSub,
      label: "Mock Provider User"
    },
    harness: {
      id: harnessId,
      label: harnessLabel,
      client_id: clientId
    },
    agent: {
      id: agentId,
      label: agentLabel,
      trust_tier: "provider_registered"
    },
    resources: [reviewsResource(state)],
    permissions,
    policy: {
      confirmation_required: [REVIEW_ACTION_CREATE]
    },
    session: {
      provider_visible_session_label: providerVisibleSessionLabel
    }
  });

  SCHEMA_VALIDATORS.grant(grant);
  state.store.saveGrant(grant);
  const code = state.store.issueAuthorizationCode(grant.grant_id, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod
  });

  if (redirectUri) {
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("code", code);
    const returnedState = url.searchParams.get("state");
    if (returnedState) {
      redirectUrl.searchParams.set("state", returnedState);
    }
    response.writeHead(302, { Location: redirectUrl.toString() });
    response.end();
    return;
  }

  sendJson(response, 200, {
    code,
    grant: createGrantStatusResponse(grant)
  });
}

async function handleToken(request, response, state) {
  const body = await readBody(request);

  if ((body.grant_type ?? "authorization_code") !== "authorization_code") {
    throw new AgpProviderError("Only authorization_code is supported by the mock provider", {
      status: 400,
      code: "unsupported_grant_type"
    });
  }

  const dpop = await verifyDpopProof({
    proof: request.headers.dpop,
    method: request.method,
    url: dpopTargetUrl(request, state)
  });
  state.dpopReplayStore.assertFresh(dpop.claims.jti);

  const record = state.store.consumeAuthorizationCode(body.code, {
    clientId: body.client_id,
    redirectUri: body.redirect_uri,
    codeVerifier: body.code_verifier
  });
  const grant = state.store.getGrant(record.grant_id);
  grant.token_binding = {
    type: "dpop",
    cnf: {
      jkt: dpop.jkt
    }
  };
  SCHEMA_VALIDATORS.grant(grant);
  state.store.saveGrant(grant);

  const accessToken = state.store.issueAccessToken(grant.grant_id, {
    dpopJkt: dpop.jkt
  });

  sendJson(response, 200, {
    access_token: accessToken,
    token_type: "DPoP",
    expires_in: 3600,
    cnf: {
      jkt: dpop.jkt
    },
    scope: grant.permissions.join(" "),
    grant_id: grant.grant_id
  });
}

async function handleRevoke(request, response, state) {
  const body = await readBody(request);
  const token = body.token ?? parseAuthorizationToken(request.headers.authorization)?.token;

  if (token) {
    const tokenRecord = state.store.getAccessTokenRecord(token);
    state.store.revokeAccessToken(token);
    if (tokenRecord?.grant_id) {
      state.store.revokeGrant(tokenRecord.grant_id, { reason: "revoked" });
    }
  }

  sendJson(response, 200, { revoked: true });
}

async function handleConfirmation(request, response, state) {
  const { grant, dpopJkt } = await authenticate(request, state);
  const body = await readBody(request);
  const action = body.action;
  const resource = body.resource;
  const payloadHash = body.payload_hash;

  assertString(action, "action");
  assertString(resource, "resource");
  assertString(payloadHash, "payload_hash");
  assertGrantActive(grant);
  assertActionAndResourceAllowed(grant, action, resource);

  const confirmation = await issueConfirmationToken({
    grant,
    action,
    resource,
    payloadHash,
    issuer: state.issuer,
    audience: "agp-resource-server",
    clientId: grant.harness.client_id,
    cnf: {
      jkt: dpopJkt
    },
    privateKey: state.signingKeys.privateKey,
    keyId: state.signingKeys.kid
  });
  SCHEMA_VALIDATORS.confirmationClaims(confirmation.claims);

  sendJson(response, 200, {
    confirmation_token_ref: confirmation.claims.confirmation_id,
    confirmation_token: confirmation.token,
    expires_in: confirmation.claims.exp - confirmation.claims.iat
  });
}

async function handleCreateReview(request, response, state) {
  const { grant, dpopJkt } = await authenticate(request, state);
  const body = await readBody(request);
  assertCreateReviewPayload(body);
  const idempotencyKey = requireIdempotencyKey(request.headers);
  const actionRequest = body.action_request;
  const payload = {
    rating: body.rating,
    text: body.text
  };
  const resource = reviewsResource(state);
  const expectedPayloadHash = sha256Json({
    action: REVIEW_ACTION_CREATE,
    resource,
    payload
  });

  validateActionRequest(actionRequest, {
    grant,
    action: REVIEW_ACTION_CREATE,
    resource,
    idempotencyKey,
    expectedPayloadHash
  });

  const existingReceipt = state.store.getReceiptByIdempotencyKey(grant.grant_id, idempotencyKey);
  if (existingReceipt) {
    sendJson(
      response,
      200,
      createReceiptResponse(state.reviews.get(existingReceipt.resource_id), existingReceipt)
    );
    return;
  }

  let confirmationClaims;
  if (!body.confirmation_token) {
    const challenge = createConfirmationChallenge({
      grant,
      action: REVIEW_ACTION_CREATE,
      resource,
      payloadHash: expectedPayloadHash
    });
    sendJson(response, 403, createConfirmationRequiredResponse(challenge));
    return;
  }

  confirmationClaims = await verifyConfirmationToken({
    token: body.confirmation_token,
    publicKey: state.signingKeys.publicKey,
    issuer: state.issuer,
    audience: "agp-resource-server",
    grant,
    action: REVIEW_ACTION_CREATE,
    resource,
    payloadHash: expectedPayloadHash,
    dpopJkt
  });
  SCHEMA_VALIDATORS.confirmationClaims(confirmationClaims);

  assertGrantAllowsAction(grant, REVIEW_ACTION_CREATE, {
    resource,
    confirmationClaims,
    payloadHash: expectedPayloadHash,
    dpopJkt
  });

  const review = {
    id: `review_${randomUUID()}`,
    rating: body.rating,
    text: body.text
  };
  state.reviews.set(review.id, review);

  const receipt = createActionReceipt({
    grant,
    actionRequest,
    result: "created",
    resourceId: review.id,
    provider: state.issuer,
    resourceServer: state.issuer,
    issuer: state.issuer,
    confirmationClaims,
    dpopJkt
  });
  SCHEMA_VALIDATORS.receipt(receipt);
  const receiptToken = await signActionReceipt(receipt, state.signingKeys.privateKey, {
    issuer: state.issuer,
    keyId: state.signingKeys.kid
  });
  state.store.saveReceipt(receipt);

  sendJson(response, 201, createReceiptResponse(review, receipt, { receiptToken }));
}

async function authenticate(request, state) {
  const parsedAuthorization = parseAuthorizationToken(request.headers.authorization, {
    schemes: ["DPoP"]
  });
  if (!parsedAuthorization) {
    throw new AgpProviderError("DPoP access token is required", {
      status: 401,
      code: "missing_access_token"
    });
  }

  const accessToken = parsedAuthorization.token;
  const tokenRecord = state.store.getActiveAccessTokenRecord(accessToken);
  if (!tokenRecord) {
    throw new AgpProviderError("Access token is invalid or expired", {
      status: 401,
      code: "invalid_access_token"
    });
  }

  const dpop = await verifyDpopProof({
    proof: request.headers.dpop,
    method: request.method,
    url: dpopTargetUrl(request, state),
    accessToken,
    expectedJkt: tokenRecord.dpop_jkt
  });
  state.dpopReplayStore.assertFresh(dpop.claims.jti);

  const grant = state.store.getGrant(tokenRecord.grant_id);
  if (!grant) {
    throw new AgpProviderError("Access token grant is unknown", {
      status: 401,
      code: "invalid_access_token"
    });
  }

  assertGrantActive(grant);
  return {
    accessToken,
    grant,
    tokenRecord,
    dpopJkt: dpop.jkt
  };
}

function validateActionRequest(
  actionRequest,
  { grant, action, resource, idempotencyKey, expectedPayloadHash }
) {
  if (!actionRequest || typeof actionRequest !== "object") {
    throw new AgpProviderError("action_request is required", {
      status: 400,
      code: "missing_action_request"
    });
  }

  SCHEMA_VALIDATORS.actionRequest(actionRequest);
  const expected = {
    grant_id: grant.grant_id,
    harness_id: grant.harness.id,
    primary_agent_id: grant.agent.id,
    action,
    resource,
    idempotency_key: idempotencyKey,
    request_hash: expectedPayloadHash
  };

  for (const [field, value] of Object.entries(expected)) {
    if (actionRequest[field] !== value) {
      throw new AgpProviderError(`action_request.${field} does not match provider state`, {
        status: 400,
        code: "invalid_action_request",
        details: { field, expected: value, received: actionRequest[field] }
      });
    }
  }
}

function assertActionAndResourceAllowed(grant, action, resource) {
  if (!grant.permissions.includes(action) && !grant.permissions.includes("*")) {
    throw new AgpProviderError("Grant does not allow the requested action", {
      status: 403,
      code: "action_not_allowed"
    });
  }

  if (!grant.resources.includes(resource) && !grant.resources.includes("*")) {
    throw new AgpProviderError("Grant does not allow the requested resource", {
      status: 403,
      code: "resource_not_allowed"
    });
  }
}

function createProviderMetadata(state) {
  return {
    issuer: state.issuer,
    jwks_uri: `${state.issuer}/jwks.json`,
    authorization_endpoint: `${state.issuer}/oauth/authorize`,
    token_endpoint: `${state.issuer}/oauth/token`,
    revocation_endpoint: `${state.issuer}/oauth/revoke`,
    openapi: `${state.issuer}/openapi.json`,
    resources: [reviewsResource(state)],
    supported_actions: [REVIEW_ACTION_READ, REVIEW_ACTION_CREATE],
    confirmation_required: [REVIEW_ACTION_CREATE]
  };
}

function dpopTargetUrl(request, state) {
  return normalizeDpopUrl(new URL(request.url, state.issuer));
}

function reviewsResource(state) {
  return `${state.issuer}/reviews`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    return {};
  }

  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return JSON.parse(rawBody);
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendError(response, error) {
  const status = error.status ?? 500;
  const payload = {
    error: error.code ?? "internal_error",
    error_description: error.message
  };

  if (error.details) {
    payload.details = error.details;
  }

  sendJson(response, status, payload);
}

function assertCreateReviewPayload(body) {
  assertString(body.text, "text");

  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw new AgpProviderError("rating must be an integer from 1 to 5", {
      status: 400,
      code: "invalid_review_rating"
    });
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new AgpProviderError(`${name} must be a non-empty string`, {
      status: 400,
      code: "invalid_request"
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const provider = await startMockProvider({ port });
  console.log(`AGP mock provider listening at ${provider.baseUrl}`);
}
