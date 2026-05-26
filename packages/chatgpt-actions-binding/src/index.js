export const CHATGPT_ACTIONS_HARNESS_ID = "openai-chatgpt-actions";

export function createChatGPTActionsGrant({
  userId,
  agentId,
  agentLabel,
  scopes,
  ttlDays = 14,
  providerVisibleSessionLabel
}) {
  if (!userId || !agentId || !Array.isArray(scopes) || scopes.length === 0) {
    throw new TypeError("userId, agentId, and non-empty scopes are required");
  }

  return {
    user_id: userId,
    harness_id: CHATGPT_ACTIONS_HARNESS_ID,
    agent_id: agentId,
    agent_label: agentLabel ?? agentId,
    client_type: "chatgpt",
    scopes,
    ttl_days: ttlDays,
    provider_visible_session_label:
      providerVisibleSessionLabel ?? `ChatGPT / ${agentLabel ?? agentId}`
  };
}

export function markConsequentialOperation(operation) {
  return {
    ...operation,
    "x-openai-isConsequential": true
  };
}

export function createChatGPTActionsOpenApi({
  title = "AGP Mock Provider",
  version = "0.1.0",
  serverUrl = "http://localhost:8787",
  scopes = {
    "reviews.read": "Read reviews",
    "reviews.create": "Create reviews after provider confirmation"
  }
} = {}) {
  return {
    openapi: "3.1.0",
    info: {
      title,
      version
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/reviews": {
        get: {
          operationId: "listReviews",
          summary: "List reviews",
          security: [{ OAuth2: ["reviews.read"] }],
          responses: {
            "200": {
              description: "Reviews visible to the connected AGP grant",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Review" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: markConsequentialOperation({
          operationId: "createReview",
          summary: "Create a review",
          security: [{ OAuth2: ["reviews.create"] }],
          "x-agp-operation": {
            action: "reviews.create",
            requires_confirmation: true
          },
          "x-agp-receipt": {
            returned: true
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateReviewRequest" }
              }
            }
          },
          responses: {
            "201": {
              description: "Review created with an AGP receipt",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ReceiptResponse" }
                }
              }
            },
            "403": {
              description: "Provider confirmation is required",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ConfirmationRequired" }
                }
              }
            }
          }
        })
      },
      "/confirmations": {
        post: markConsequentialOperation({
          operationId: "confirmAction",
          summary: "Complete provider confirmation for an AGP action",
          security: [{ OAuth2: ["reviews.create"] }],
          "x-agp-confirmation": {
            issues_provider_signed_token: true
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConfirmationRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Provider-signed confirmation token for broker custody",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ConfirmationTokenResponse" }
                }
              }
            }
          }
        })
      }
    },
    components: {
      securitySchemes: {
        OAuth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${serverUrl}/oauth/authorize`,
              tokenUrl: `${serverUrl}/oauth/token`,
              scopes
            }
          }
        }
      },
      schemas: {
        Review: {
          type: "object",
          required: ["id", "text", "rating"],
          properties: {
            id: { type: "string" },
            text: { type: "string" },
            rating: { type: "integer", minimum: 1, maximum: 5 }
          }
        },
        CreateReviewRequest: {
          type: "object",
          required: ["text", "rating", "action_request"],
          properties: {
            text: { type: "string" },
            rating: { type: "integer", minimum: 1, maximum: 5 },
            action_request: { type: "object" },
            confirmation_token: {
              type: "string",
              description: "Provider-signed token held by the broker or hosted harness credential layer."
            }
          }
        },
        ReceiptResponse: {
          type: "object",
          required: ["result", "agp_receipt"],
          properties: {
            result: { $ref: "#/components/schemas/Review" },
            agp_receipt: {
              type: "object",
              required: ["receipt_id", "grant_id", "action"],
              properties: {
                receipt_id: { type: "string" },
                grant_id: { type: "string" },
                action: { type: "string" },
                action_request_id: { type: "string" },
                idempotency_key: { type: "string" },
                timestamp: { type: "string", format: "date-time" }
              }
            },
            agp_receipt_token: { type: "string" }
          }
        },
        ConfirmationRequired: {
          type: "object",
          required: ["error", "agp_confirmation"],
          properties: {
            error: { const: "confirmation_required" },
            error_description: { type: "string" },
            agp_confirmation: { type: "object" }
          }
        },
        ConfirmationRequest: {
          type: "object",
          required: ["action", "resource", "payload_hash"],
          properties: {
            action: { type: "string" },
            resource: { type: "string" },
            payload_hash: { type: "string" }
          }
        },
        ConfirmationTokenResponse: {
          type: "object",
          required: ["confirmation_token_ref", "confirmation_token", "expires_in"],
          properties: {
            confirmation_token_ref: { type: "string" },
            confirmation_token: { type: "string" },
            expires_in: { type: "integer" }
          }
        }
      }
    }
  };
}
