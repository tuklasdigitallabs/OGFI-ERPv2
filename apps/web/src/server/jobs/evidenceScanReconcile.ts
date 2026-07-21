import { reconcileEvidenceScans } from "../services/evidenceScanLifecycle";

try {
  const result = await reconcileEvidenceScans();
  process.stdout.write(`${JSON.stringify({ status: "ok", ...result })}\n`);
} catch (error) {
  const code =
    error instanceof Error && /^EVIDENCE_[A-Z0-9_]+$/.test(error.message)
      ? error.message
      : "EVIDENCE_SCAN_RECONCILIATION_FAILED";
  process.stderr.write(`${JSON.stringify({ status: "failed", code })}\n`);
  process.exitCode = 1;
}
