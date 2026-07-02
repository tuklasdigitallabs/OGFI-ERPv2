export type AuditEvent = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

export function createAuditEvent(input: Omit<AuditEvent, "id" | "occurredAt">) {
  return {
    ...input,
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString()
  };
}
