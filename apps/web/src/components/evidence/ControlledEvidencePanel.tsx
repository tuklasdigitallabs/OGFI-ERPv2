"use client";

import { ControlledEvidenceList } from "./ControlledEvidenceList";
import { ControlledEvidenceUploader } from "./ControlledEvidenceUploader";
import type { ControlledEvidencePanelProps } from "./types";

export type { ControlledEvidenceDisplayRow } from "./types";

export function ControlledEvidencePanel({
  attachments,
  canAdd,
  sourceType,
  sourceRecordId,
  sourceLineId,
  purpose = "EVIDENCE",
  requiredForAction,
  triggerLabel = "Add Evidence",
  captionPlaceholder = "What this evidence supports",
  archiveAction,
  archiveImpact = "This archives the evidence link only. The file remains preserved for audit and recovery; the source record is not changed.",
}: ControlledEvidencePanelProps) {
  return (
    <div className="mt-3 space-y-3">
      <ControlledEvidenceList
        archiveAction={archiveAction}
        archiveImpact={archiveImpact}
        attachments={attachments}
        canArchive={canAdd}
        sourceRecordId={sourceRecordId}
        sourceType={sourceType}
      />
      {canAdd ? (
        <ControlledEvidenceUploader
          captionPlaceholder={captionPlaceholder}
          purpose={purpose}
          requiredForAction={requiredForAction}
          sourceLineId={sourceLineId}
          sourceRecordId={sourceRecordId}
          sourceType={sourceType}
          triggerLabel={triggerLabel}
        />
      ) : null}
    </div>
  );
}
