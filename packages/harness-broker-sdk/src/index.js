import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as signBuffer
} from "node:crypto";

export function canonicalize(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Cannot canonicalize non-finite number");
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

export function createIdempotencyKey(prefix = "idem") {
  return `${prefix}_${randomUUID()}`;
}

export function createActionRequestEnvelope({
  actionRequestId = `actreq_${randomUUID()}`,
  grantId,
  harnessId,
  primaryAgentId,
  subagentChain = [],
  action,
  resource,
  payload,
  displayContext = {},
  confirmationTokenRef = null,
  idempotencyKey = createIdempotencyKey(),
  requestHash = sha256Json({ action, resource, payload })
}) {
  for (const [name, value] of Object.entries({ grantId, harnessId, primaryAgentId, action, resource })) {
    if (!value) {
      throw new TypeError(`${name} is required`);
    }
  }

  return {
    action_request_id: actionRequestId,
    grant_id: grantId,
    harness_id: harnessId,
    primary_agent_id: primaryAgentId,
    subagent_chain: subagentChain,
    action,
    resource,
    display_context: displayContext,
    confirmation_token_ref: confirmationTokenRef,
    idempotency_key: idempotencyKey,
    request_hash: requestHash
  };
}

export function verifyActionRequestEnvelope(envelope, { payload } = {}) {
  const required = [
    "action_request_id",
    "grant_id",
    "harness_id",
    "primary_agent_id",
    "action",
    "resource",
    "idempotency_key",
    "request_hash"
  ];

  for (const field of required) {
    if (!envelope?.[field]) {
      throw new TypeError(`Action request envelope is missing ${field}`);
    }
  }

  if (payload !== undefined) {
    const expected = sha256Json({
      action: envelope.action,
      resource: envelope.resource,
      payload
    });

    if (envelope.request_hash !== expected) {
      throw new TypeError("Action request envelope request_hash does not match payload");
    }
  }

  return envelope;
}

export function createPkcePair({ byteLength = 32 } = {}) {
  const verifier = base64urlEncode(randomBytes(byteLength));
  const challenge = sha256Base64Url(verifier);

  return {
    code_verifier: verifier,
    code_challenge: challenge,
    code_challenge_method: "S256"
  };
}

export function createInMemoryTokenVault() {
  const tokenSets = new Map();
  const confirmationTokens = new Map();

  return {
    storeTokenSet(grantId, tokenSet) {
      if (!grantId) {
        throw new TypeError("grantId is required");
      }

      tokenSets.set(grantId, structuredClone(tokenSet));
      return tokenSet;
    },

    getTokenSet(grantId) {
      const tokenSet = tokenSets.get(grantId);
      return tokenSet ? structuredClone(tokenSet) : undefined;
    },

    getAccessToken(grantId) {
      return tokenSets.get(grantId)?.access_token;
    },

    deleteTokenSet(grantId) {
      tokenSets.delete(grantId);
      confirmationTokens.delete(grantId);
    },

    listGrantIds() {
      return [...tokenSets.keys()];
    },

    storeConfirmationToken(grantId, confirmationTokenRef, token) {
      if (!grantId || !confirmationTokenRef || !token) {
        throw new TypeError("grantId, confirmationTokenRef, and token are required");
      }

      const tokensForGrant = confirmationTokens.get(grantId) ?? new Map();
      tokensForGrant.set(confirmationTokenRef, token);
      confirmationTokens.set(grantId, tokensForGrant);

      return confirmationTokenRef;
    },

    getConfirmationToken(grantId, confirmationTokenRef) {
      return confirmationTokens.get(grantId)?.get(confirmationTokenRef);
    }
  };
}

export function createDpopKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256"
  });
  const publicJwk = publicKey.export({ format: "jwk" });

  delete publicJwk.key_ops;
  delete publicJwk.ext;

  return {
    privateKey,
    publicKey,
    publicJwk,
    jkt: jwkThumbprint(publicJwk)
  };
}

export function jwkThumbprint(publicJwk) {
  const normalized = {
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y
  };

  return sha256Base64Url(canonicalize(normalized));
}

export function createDpopProof({
  privateKey,
  publicJwk,
  htm,
  htu,
  accessToken,
  nonce,
  now = new Date(),
  jti = `dpop_${randomUUID()}`
}) {
  if (!privateKey || !publicJwk || !htm || !htu) {
    throw new TypeError("privateKey, publicJwk, htm, and htu are required");
  }

  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: publicJwk
  };
  const payload = {
    jti,
    htm: htm.toUpperCase(),
    htu,
    iat: Math.floor(now.getTime() / 1000)
  };

  if (accessToken) {
    payload.ath = sha256Base64Url(accessToken);
  }

  if (nonce) {
    payload.nonce = nonce;
  }

  const signingInput = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;
  const signature = signBuffer("sha256", Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });

  return `${signingInput}.${base64urlEncode(signature)}`;
}
