export const AGP_HEADERS = Object.freeze({
  grantId: "agp-grant-id",
  actionRequestId: "agp-action-request-id",
  receiptId: "agp-receipt-id",
  confirmationTokenRef: "agp-confirmation-token-ref",
  idempotencyKey: "idempotency-key"
});

export const AGP_OPENAPI_EXTENSIONS = Object.freeze({
  operation: "x-agp-operation",
  receipt: "x-agp-receipt",
  confirmation: "x-agp-confirmation",
  openaiConsequential: "x-openai-isConsequential"
});

export function parseBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return undefined;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/iu);
  return match?.[1];
}

export function parseAuthorizationToken(authorizationHeader, { schemes = ["Bearer", "DPoP"] } = {}) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return undefined;
  }

  const match = authorizationHeader.match(/^([A-Za-z][A-Za-z0-9_-]*)\s+(.+)$/u);
  if (!match) {
    return undefined;
  }

  const [, scheme, token] = match;
  const allowed = new Set(schemes.map((value) => value.toLowerCase()));
  if (!allowed.has(scheme.toLowerCase())) {
    return undefined;
  }

  return {
    scheme,
    token
  };
}

export function getHeader(headers, name) {
  if (!headers) {
    return undefined;
  }

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const lowerName = name.toLowerCase();
  const foundKey = Object.keys(headers).find((key) => key.toLowerCase() === lowerName);
  return foundKey ? headers[foundKey] : undefined;
}

export function requireIdempotencyKey(headers) {
  const idempotencyKey = getHeader(headers, AGP_HEADERS.idempotencyKey);
  if (!idempotencyKey) {
    const error = new Error("Idempotency-Key header is required");
    error.status = 400;
    error.code = "missing_idempotency_key";
    throw error;
  }

  return idempotencyKey;
}

export function createReceiptResponse(result, receipt, { receiptToken } = {}) {
  const response = {
    result,
    agp_receipt: {
      receipt_id: receipt.receipt_id,
      grant_id: receipt.grant_id,
      action: receipt.action,
      action_request_id: receipt.action_request_id,
      idempotency_key: receipt.idempotency_key,
      timestamp: receipt.timestamp
    }
  };

  if (receiptToken) {
    response.agp_receipt_token = receiptToken;
  }

  return response;
}

export function createConfirmationRequiredResponse(challenge) {
  return {
    error: "confirmation_required",
    error_description: "Provider confirmation is required before this action can be completed.",
    agp_confirmation: challenge
  };
}

export function createGrantStatusResponse(grant) {
  return {
    grant_id: grant.grant_id,
    user: grant.user,
    harness: grant.harness,
    agent: grant.agent,
    permissions: grant.permissions,
    resources: grant.resources,
    session: grant.session
  };
}

export function withAgpOpenApiExtensions(
  operation,
  { action, consequential = false, requiresConfirmation = false, returnsReceipt = false } = {}
) {
  return {
    ...operation,
    [AGP_OPENAPI_EXTENSIONS.operation]: {
      action,
      requires_confirmation: requiresConfirmation
    },
    ...(consequential ? { [AGP_OPENAPI_EXTENSIONS.openaiConsequential]: true } : {}),
    ...(requiresConfirmation
      ? { [AGP_OPENAPI_EXTENSIONS.confirmation]: { required: true } }
      : {}),
    ...(returnsReceipt ? { [AGP_OPENAPI_EXTENSIONS.receipt]: { returned: true } } : {})
  };
}
