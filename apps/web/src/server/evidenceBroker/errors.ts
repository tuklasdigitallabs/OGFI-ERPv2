export class EvidenceBrokerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "EvidenceBrokerError";
  }
}

export function asBrokerError(error: unknown) {
  if (error instanceof EvidenceBrokerError) return error;
  return new EvidenceBrokerError(500, "EVIDENCE_BROKER_INTERNAL_ERROR");
}

