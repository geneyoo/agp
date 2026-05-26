import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  SignJWT,
  calculateJwkThumbprint,
  decodeProtectedHeader,
  importJWK,
  jwtVerify
} from "jose";

const DEFAULT_CONFIRMATION_AUDIENCE = "agp-resource-server";
const DEFAULT_GRANT_TTL_SECONDS = 14 * 24 * 60 * 60;
const DEFAULT_CONFIRMATION_TTL_SECONDS = 5 * 60;
const DEFAULT_DPOP_MAX_AGE_SECONDS = 5 * 60;

export class AgpProviderError extends Error {
  constructor(message, { status = 400, code = "agp_provider_error", details } = {}) {
    super(message);
    this.name = "AgpProviderError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function canonicalize(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new AgpProviderError("Cannot canonicalize non-finite number", {
      code: "invalid_canonical_json"
    });
  }

  return JSON.stringify(value);
}

export function base64urlEncode(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function sha256Base64Url(input) {
  return base64urlEncode(createHash("sha256").update(input).digest());
}

export function sha256Json(value) {
  return sha256Base64Url(canonicalize(value));
}

export function pkceChallengeForVerifier(codeVerifier) {
  if (!codeVerifier || typeof codeVerifier !== "string") {
    throw new AgpProviderError("code_verifier is required", {
      status: 400,
      code: "missing_code_verifier"
    });
  }

  return sha256Base64Url(codeVerifier);
}

export function assertPkceVerifier({ codeVerifier, codeChallenge, codeChallengeMethod }) {
  if (codeChallengeMethod !== "S256") {
    throw new AgpProviderError("Only S256 PKCE is supported", {
      status: 400,
      code: "unsupported_pkce_method"
    });
  }

  const computed = pkceChallengeForVerifier(codeVerifier);
  if (computed !== codeChallenge) {
    throw new AgpProviderError("PKCE verifier does not match authorization code challenge", {
      status: 400,
      code: "invalid_code_verifier"
    });
  }
}

export function createSchemaValidator(schema, { name = schema?.title ?? "JSON value" } = {}) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return (value) => {
    if (!validate(value)) {
      throw new AgpProviderError(`${name} failed schema validation`, {
        status: 400,
        code: "schema_validation_failed",
        details: validate.errors?.map((error) => ({
          instancePath: error.instancePath,
          schemaPath: error.schemaPath,
          message: error.message,
          params: error.params
        }))
      });
    }

    return value;
  };
}

export function createProviderSigningKeys({ kid = `sig_${randomUUID()}` } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256"
  });
  const publicJwk = publicKey.export({ format: "jwk" });

  delete publicJwk.key_ops;
  delete publicJwk.ext;
  publicJwk.alg = "ES256";
  publicJwk.kid = kid;
  publicJwk.use = "sig";

  return {
    kid,
    alg: "ES256",
    privateKey,
    publicKey,
    publicJwk,
    jwks: {
      keys: [publicJwk]
    }
  };
}

export async function signClaims(claims, privateKey, { header = {}, keyId } = {}) {
  if (!privateKey) {
    throw new AgpProviderError("A signing private key is required", {
      code: "missing_signing_key"
    });
  }

  const protectedHeader = {
    alg: "ES256",
    typ: "JWT",
    ...header
  };

  if (keyId) {
    protectedHeader.kid = keyId;
  }

  return new SignJWT(claims).setProtectedHeader(protectedHeader).sign(privateKey);
}

export async function verifySignedClaims(
  token,
  publicKey,
  { issuer, audience, now = new Date(), clockSkewSeconds = 30 } = {}
) {
  if (!token || typeof token !== "string") {
    throw new AgpProviderError("Signed token is required", {
      status: 401,
      code: "missing_signed_token"
    });
  }

  try {
    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience,
      currentDate: now,
      clockTolerance: clockSkewSeconds
    });
    return payload;
  } catch (error) {
    throw new AgpProviderError("Signed token verification failed", {
      status: 401,
      code: "invalid_signed_token",
      details: error.message
    });
  }
}

export async function verifyDpopProof({
  proof,
  method,
  url,
  accessToken,
  expectedJkt,
  now = new Date(),
  maxAgeSeconds = DEFAULT_DPOP_MAX_AGE_SECONDS
}) {
  if (!proof || typeof proof !== "string") {
    throw new AgpProviderError("DPoP proof header is required", {
      status: 401,
      code: "missing_dpop_proof"
    });
  }

  let protectedHeader;
  try {
    protectedHeader = decodeProtectedHeader(proof);
  } catch (error) {
    throw new AgpProviderError("DPoP proof header is malformed", {
      status: 401,
      code: "malformed_dpop_proof",
      details: error.message
    });
  }

  if (protectedHeader.typ?.toLowerCase() !== "dpop+jwt") {
    throw new AgpProviderError("DPoP proof typ must be dpop+jwt", {
      status: 401,
      code: "invalid_dpop_typ"
    });
  }

  if (protectedHeader.alg !== "ES256") {
    throw new AgpProviderError("DPoP proof alg must be ES256", {
      status: 401,
      code: "invalid_dpop_alg"
    });
  }

  if (!protectedHeader.jwk || typeof protectedHeader.jwk !== "object") {
    throw new AgpProviderError("DPoP proof must include a public JWK", {
      status: 401,
      code: "missing_dpop_jwk"
    });
  }

  const jkt = await calculateJwkThumbprint(protectedHeader.jwk);
  if (expectedJkt && jkt !== expectedJkt) {
    throw new AgpProviderError("DPoP proof key does not match the bound access token", {
      status: 401,
      code: "dpop_key_mismatch"
    });
  }

  let payload;
  try {
    const key = await importJWK(protectedHeader.jwk, protectedHeader.alg);
    ({ payload } = await jwtVerify(proof, key, {
      currentDate: now,
      clockTolerance: 5
    }));
  } catch (error) {
    throw new AgpProviderError("DPoP proof signature verification failed", {
      status: 401,
      code: "invalid_dpop_signature",
      details: error.message
    });
  }

  if (!payload.jti || typeof payload.jti !== "string") {
    throw new AgpProviderError("DPoP proof jti is required", {
      status: 401,
      code: "missing_dpop_jti"
    });
  }

  if (payload.htm !== method.toUpperCase()) {
    throw new AgpProviderError("DPoP proof htm does not match the request method", {
      status: 401,
      code: "dpop_method_mismatch"
    });
  }

  const expectedHtu = normalizeDpopUrl(url);
  if (payload.htu !== expectedHtu) {
    throw new AgpProviderError("DPoP proof htu does not match the request URI", {
      status: 401,
      code: "dpop_uri_mismatch",
      details: { expected: expectedHtu, received: payload.htu }
    });
  }

  if (typeof payload.iat !== "number") {
    throw new AgpProviderError("DPoP proof iat is required", {
      status: 401,
      code: "missing_dpop_iat"
    });
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSeconds - payload.iat) > maxAgeSeconds) {
    throw new AgpProviderError("DPoP proof is outside the accepted clock window", {
      status: 401,
      code: "stale_dpop_proof"
    });
  }

  if (accessToken) {
    const expectedAth = sha256Base64Url(accessToken);
    if (payload.ath !== expectedAth) {
      throw new AgpProviderError("DPoP proof ath does not match the access token", {
        status: 401,
        code: "dpop_access_token_hash_mismatch"
      });
    }
  }

  return {
    claims: payload,
    publicJwk: protectedHeader.jwk,
    jkt
  };
}

export function normalizeDpopUrl(url) {
  const parsed = url instanceof URL ? new URL(url) : new URL(String(url));
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function createDpopReplayStore({ ttlSeconds = DEFAULT_DPOP_MAX_AGE_SECONDS } = {}) {
  const seen = new Map();

  return {
    assertFresh(jti, { now = new Date() } = {}) {
      if (!jti || typeof jti !== "string") {
        throw new AgpProviderError("DPoP proof jti is required", {
          status: 401,
          code: "missing_dpop_jti"
        });
      }

      const nowMs = now.getTime();
      for (const [seenJti, expiresAt] of seen.entries()) {
        if (expiresAt <= nowMs) {
          seen.delete(seenJti);
        }
      }

      if (seen.has(jti)) {
        throw new AgpProviderError("DPoP proof jti has already been used", {
          status: 401,
          code: "dpop_replay_detected"
        });
      }

      seen.set(jti, nowMs + ttlSeconds * 1000);
    }
  };
}

export function createAgentDelegationGrant({
  grantId = `grant_${randomUUID()}`,
  user,
  harness,
  agent,
  subagents = {},
  resources,
  permissions,
  policy = {},
  tokenBinding = {},
  session = {},
  now = new Date(),
  ttlSeconds = DEFAULT_GRANT_TTL_SECONDS
}) {
  requireObject(user, "user");
  requireObject(harness, "harness");
  requireObject(agent, "agent");

  if (!Array.isArray(resources) || resources.length === 0) {
    throw new AgpProviderError("Grant resources must be a non-empty array", {
      code: "invalid_grant_resources"
    });
  }

  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new AgpProviderError("Grant permissions must be a non-empty array", {
      code: "invalid_grant_permissions"
    });
  }

  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  return {
    grant_id: grantId,
    user,
    harness,
    agent,
    subagents,
    resources,
    permissions,
    policy: {
      confirmation_required: [],
      ...policy
    },
    token_binding: tokenBinding,
    session: {
      agent_session_id: `ags_${randomUUID()}`,
      status: "active",
      created_at: createdAt,
      expires_at: expiresAt,
      revoked_at: null,
      provider_visible_session_label: `${harness.label ?? harness.id} / ${agent.label ?? agent.id}`,
      ...session
    }
  };
}

export function validateGrantShape(grant) {
  requireObject(grant, "grant");

  for (const field of ["grant_id", "user", "harness", "agent", "resources", "permissions", "session"]) {
    if (grant[field] === undefined || grant[field] === null) {
      throw new AgpProviderError(`Grant is missing ${field}`, {
        code: "invalid_grant"
      });
    }
  }

  if (!Array.isArray(grant.resources) || !Array.isArray(grant.permissions)) {
    throw new AgpProviderError("Grant resources and permissions must be arrays", {
      code: "invalid_grant"
    });
  }

  return grant;
}

export function isGrantActive(grant, { now = new Date() } = {}) {
  validateGrantShape(grant);
  const status = grant.session?.status ?? "active";
  const expiresAt = grant.session?.expires_at ? Date.parse(grant.session.expires_at) : Number.POSITIVE_INFINITY;

  return status === "active" && now.getTime() <= expiresAt;
}

export function assertGrantActive(grant, options = {}) {
  if (!isGrantActive(grant, options)) {
    throw new AgpProviderError("Grant is not active", {
      status: 403,
      code: "inactive_grant",
      details: { grant_id: grant?.grant_id, status: grant?.session?.status }
    });
  }

  return grant;
}

export function actionRequiresConfirmation(grant, action) {
  const confirmationRequired = grant.policy?.confirmation_required ?? [];
  return confirmationRequired.includes(action);
}

export function assertGrantAllowsAction(
  grant,
  action,
  { resource, confirmationClaims, payloadHash, dpopJkt, now = new Date() } = {}
) {
  assertGrantActive(grant, { now });

  if (!grant.permissions.includes(action) && !grant.permissions.includes("*")) {
    throw new AgpProviderError("Grant does not allow the requested action", {
      status: 403,
      code: "action_not_allowed",
      details: { grant_id: grant.grant_id, action }
    });
  }

  if (resource && grant.resources.length > 0 && !grant.resources.includes(resource) && !grant.resources.includes("*")) {
    throw new AgpProviderError("Grant does not allow the requested resource", {
      status: 403,
      code: "resource_not_allowed",
      details: { grant_id: grant.grant_id, resource }
    });
  }

  if (actionRequiresConfirmation(grant, action)) {
    if (!confirmationClaims) {
      throw new AgpProviderError("Provider confirmation is required for this action", {
        status: 403,
        code: "confirmation_required"
      });
    }

    assertConfirmationMatchesGrant(confirmationClaims, grant, {
      action,
      resource,
      payloadHash,
      dpopJkt
    });
  }

  return grant;
}

export function createConfirmationChallenge({
  grant,
  action,
  resource,
  payloadHash,
  reason = "provider_confirmation_required",
  methods = ["passkey", "provider_ui"]
}) {
  return {
    reason,
    grant_id: grant.grant_id,
    harness_id: grant.harness.id,
    agent_id: grant.agent.id,
    action,
    resource,
    payload_hash: payloadHash,
    methods,
    expires_in: DEFAULT_CONFIRMATION_TTL_SECONDS
  };
}

export async function issueConfirmationToken({
  grant,
  action,
  resource,
  payloadHash,
  issuer,
  audience = DEFAULT_CONFIRMATION_AUDIENCE,
  clientId,
  cnf,
  amr = ["provider_confirmation"],
  acr = "urn:agp:confirmation:mock",
  now = new Date(),
  ttlSeconds = DEFAULT_CONFIRMATION_TTL_SECONDS,
  privateKey,
  keyId
}) {
  validateGrantShape(grant);
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims = {
    iss: issuer,
    aud: audience,
    sub: grant.user.sub ?? grant.user.id,
    client_id: clientId ?? grant.harness.client_id ?? grant.harness.id,
    harness_id: grant.harness.id,
    agent_id: grant.agent.id,
    grant_id: grant.grant_id,
    action,
    resource,
    payload_hash: payloadHash,
    confirmation_id: `conf_${randomUUID()}`,
    cnf: cnf ?? grant.token_binding?.cnf ?? {},
    amr,
    acr,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds
  };

  return {
    claims,
    token: await signClaims(claims, privateKey, {
      keyId,
      header: { typ: "agp-confirmation+jwt" }
    })
  };
}

export async function verifyConfirmationToken({
  token,
  publicKey,
  issuer,
  audience = DEFAULT_CONFIRMATION_AUDIENCE,
  grant,
  action,
  resource,
  payloadHash,
  dpopJkt,
  now = new Date()
}) {
  const claims = await verifySignedClaims(token, publicKey, { issuer, audience, now });

  if (grant) {
    assertConfirmationMatchesGrant(claims, grant, {
      action,
      resource,
      payloadHash,
      dpopJkt
    });
  }

  return claims;
}

export function assertConfirmationMatchesGrant(claims, grant, { action, resource, payloadHash, dpopJkt } = {}) {
  const expected = {
    grant_id: grant.grant_id,
    harness_id: grant.harness.id,
    agent_id: grant.agent.id,
    action,
    resource,
    payload_hash: payloadHash
  };

  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && claims[field] !== value) {
      throw new AgpProviderError(`Confirmation token ${field} does not match the action`, {
        status: 403,
        code: "confirmation_mismatch",
        details: { field, expected: value, received: claims[field] }
      });
    }
  }

  if (dpopJkt && claims.cnf?.jkt !== dpopJkt) {
    throw new AgpProviderError("Confirmation token cnf.jkt does not match the bound DPoP key", {
      status: 403,
      code: "confirmation_token_binding_mismatch"
    });
  }

  return claims;
}

export function createActionReceipt({
  grant,
  actionRequest,
  action = actionRequest?.action,
  result,
  resourceId,
  provider,
  resourceServer,
  issuer = provider,
  confirmationClaims,
  dpopJkt,
  now = new Date()
}) {
  validateGrantShape(grant);
  requireObject(actionRequest, "actionRequest");

  return stripUndefined({
    receipt_id: `rcpt_${randomUUID()}`,
    iss: issuer,
    provider,
    resource_server: resourceServer,
    user_sub: grant.user.sub ?? grant.user.id,
    harness_id: grant.harness.id,
    primary_agent_id: grant.agent.id,
    subagent_chain: actionRequest.subagent_chain ?? [],
    grant_id: grant.grant_id,
    agent_session_id: grant.session.agent_session_id,
    action,
    resource_id: resourceId,
    action_request_id: actionRequest.action_request_id,
    idempotency_key: actionRequest.idempotency_key,
    timestamp: now.toISOString(),
    confirmation_token_id: confirmationClaims?.confirmation_id ?? null,
    step_up_performed: Boolean(confirmationClaims),
    dpop_jkt: dpopJkt,
    request_hash: actionRequest.request_hash,
    result
  });
}

export async function signActionReceipt(
  receipt,
  privateKey,
  { issuer = receipt.iss, audience = "agp-receipt", keyId } = {}
) {
  const issuedAt = Math.floor(Date.parse(receipt.timestamp) / 1000);
  return signClaims(
    {
      iss: issuer,
      aud: audience,
      iat: Number.isFinite(issuedAt) ? issuedAt : Math.floor(Date.now() / 1000),
      receipt
    },
    privateKey,
    {
      keyId,
      header: { typ: "agp-receipt+jwt" }
    }
  );
}

export async function verifyActionReceiptToken(
  receiptToken,
  publicKey,
  { issuer, audience = "agp-receipt", now = new Date() } = {}
) {
  const claims = await verifySignedClaims(receiptToken, publicKey, { issuer, audience, now });
  return claims.receipt;
}

export function createProviderStore() {
  const grants = new Map();
  const accessTokens = new Map();
  const authCodes = new Map();
  const receipts = new Map();
  const receiptsByIdempotencyKey = new Map();

  return {
    saveGrant(grant) {
      validateGrantShape(grant);
      grants.set(grant.grant_id, structuredClone(grant));
      return grant;
    },

    getGrant(grantId) {
      const grant = grants.get(grantId);
      return grant ? structuredClone(grant) : undefined;
    },

    listGrants() {
      return [...grants.values()].map((grant) => structuredClone(grant));
    },

    revokeGrant(grantId, { now = new Date(), reason = "revoked" } = {}) {
      const grant = grants.get(grantId);
      if (!grant) {
        return undefined;
      }

      grant.session.status = reason;
      grant.session.revoked_at = now.toISOString();
      grants.set(grantId, grant);
      return structuredClone(grant);
    },

    issueAuthorizationCode(
      grantId,
      { clientId, redirectUri, codeChallenge, codeChallengeMethod = "S256", ttlSeconds = 300, now = new Date() } = {}
    ) {
      if (!grants.has(grantId)) {
        throw new AgpProviderError("Cannot issue authorization code for unknown grant", {
          status: 404,
          code: "unknown_grant"
        });
      }

      const code = `code_${randomUUID()}`;
      authCodes.set(code, {
        grant_id: grantId,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
        consumed_at: null
      });

      return code;
    },

    consumeAuthorizationCode(code, { clientId, redirectUri, codeVerifier, now = new Date() } = {}) {
      const record = authCodes.get(code);
      if (!record) {
        throw new AgpProviderError("Authorization code is unknown", {
          status: 400,
          code: "invalid_authorization_code"
        });
      }

      if (record.consumed_at) {
        throw new AgpProviderError("Authorization code has already been consumed", {
          status: 400,
          code: "authorization_code_consumed"
        });
      }

      if (Date.parse(record.expires_at) < now.getTime()) {
        throw new AgpProviderError("Authorization code has expired", {
          status: 400,
          code: "authorization_code_expired"
        });
      }

      if (record.client_id && clientId && record.client_id !== clientId) {
        throw new AgpProviderError("Authorization code client does not match", {
          status: 400,
          code: "authorization_code_client_mismatch"
        });
      }

      if (record.redirect_uri && redirectUri && record.redirect_uri !== redirectUri) {
        throw new AgpProviderError("Authorization code redirect URI does not match", {
          status: 400,
          code: "authorization_code_redirect_mismatch"
        });
      }

      if (record.code_challenge) {
        assertPkceVerifier({
          codeVerifier,
          codeChallenge: record.code_challenge,
          codeChallengeMethod: record.code_challenge_method
        });
      }

      record.consumed_at = now.toISOString();
      authCodes.set(code, record);
      return { ...record };
    },

    issueAccessToken(grantId, { ttlSeconds = 3600, now = new Date(), token, dpopJkt } = {}) {
      if (!grants.has(grantId)) {
        throw new AgpProviderError("Cannot issue access token for unknown grant", {
          status: 404,
          code: "unknown_grant"
        });
      }

      const accessToken = token ?? `agp_at_${randomUUID()}`;
      accessTokens.set(accessToken, {
        grant_id: grantId,
        issued_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
        revoked_at: null,
        dpop_jkt: dpopJkt
      });

      return accessToken;
    },

    revokeAccessToken(accessToken, { now = new Date() } = {}) {
      const record = accessTokens.get(accessToken);
      if (!record) {
        return false;
      }

      record.revoked_at = now.toISOString();
      accessTokens.set(accessToken, record);
      return true;
    },

    getAccessTokenRecord(accessToken) {
      const record = accessTokens.get(accessToken);
      return record ? { ...record } : undefined;
    },

    getActiveAccessTokenRecord(accessToken, { now = new Date() } = {}) {
      const record = accessTokens.get(accessToken);
      if (!record || record.revoked_at || Date.parse(record.expires_at) < now.getTime()) {
        return undefined;
      }

      return { ...record };
    },

    getGrantForAccessToken(accessToken, { now = new Date() } = {}) {
      const record = this.getActiveAccessTokenRecord(accessToken, { now });
      if (!record) {
        return undefined;
      }

      return this.getGrant(record.grant_id);
    },

    saveReceipt(receipt) {
      receipts.set(receipt.receipt_id, structuredClone(receipt));
      if (receipt.idempotency_key) {
        receiptsByIdempotencyKey.set(`${receipt.grant_id}:${receipt.idempotency_key}`, receipt.receipt_id);
      }
      return receipt;
    },

    getReceipt(receiptId) {
      const receipt = receipts.get(receiptId);
      return receipt ? structuredClone(receipt) : undefined;
    },

    getReceiptByIdempotencyKey(grantId, idempotencyKey) {
      const receiptId = receiptsByIdempotencyKey.get(`${grantId}:${idempotencyKey}`);
      return receiptId ? this.getReceipt(receiptId) : undefined;
    }
  };
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgpProviderError(`${name} must be an object`, {
      code: "invalid_object"
    });
  }
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}
