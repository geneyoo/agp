export const AGENT_DELEGATION_FIELD = "agent_delegation";

export function createAgentDelegationFields({
  grantId,
  harnessId,
  primaryAgentId,
  subagentChain = [],
  actionRequestId,
  idempotencyKey,
  confirmationChallenge,
  confirmationTokenRef,
  receiptId
}) {
  const agentDelegation = stripUndefined({
    grant_id: grantId,
    harness_id: harnessId,
    primary_agent_id: primaryAgentId,
    subagent_chain: subagentChain,
    action_request_id: actionRequestId,
    idempotency_key: idempotencyKey,
    confirmation_challenge: confirmationChallenge,
    confirmation_token_ref: confirmationTokenRef,
    receipt_id: receiptId
  });

  assertValidAgentDelegation(agentDelegation, { partial: true });

  return {
    [AGENT_DELEGATION_FIELD]: agentDelegation
  };
}

export function extractAgentDelegationFields(value) {
  return value?.[AGENT_DELEGATION_FIELD];
}

export function assertValidAgentDelegation(agentDelegation, { partial = false } = {}) {
  if (!agentDelegation || typeof agentDelegation !== "object" || Array.isArray(agentDelegation)) {
    throw new TypeError("agent_delegation must be an object");
  }

  const required = partial
    ? []
    : ["grant_id", "harness_id", "primary_agent_id", "action_request_id", "idempotency_key"];

  for (const field of required) {
    if (!agentDelegation[field]) {
      throw new TypeError(`agent_delegation.${field} is required`);
    }
  }

  if (
    agentDelegation.subagent_chain !== undefined &&
    !Array.isArray(agentDelegation.subagent_chain)
  ) {
    throw new TypeError("agent_delegation.subagent_chain must be an array when present");
  }

  return agentDelegation;
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}
