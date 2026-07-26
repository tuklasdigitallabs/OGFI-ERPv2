import { z } from "zod";
import {
  approvalFamilySupportsSupplementalEvidence,
  canonicalApprovalDecisionCapabilities,
  canonicalApprovalDecisionKinds,
} from "./approvalDecisionCapabilities";
import {
  supportedApprovalDocumentTypes,
  type SupportedApprovalDocumentType,
} from "./approvalRoutingRegistry";

const approvalFamilyTuple = supportedApprovalDocumentTypes as unknown as readonly [
  SupportedApprovalDocumentType,
  ...SupportedApprovalDocumentType[],
];

const canonicalApprovalDecisionCommandSchema = z.object({
  approvalInstanceId: z.string().uuid(),
  family: z.enum(approvalFamilyTuple),
  decision: z.enum(canonicalApprovalDecisionKinds),
  remarks: z.string().max(1000).optional(),
  evidenceReference: z.string().max(1000).optional(),
}).strict().superRefine((command, context) => {
  if (
    !canonicalApprovalDecisionCapabilities[command.family].includes(
      command.decision as never,
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decision"],
      message: "Unsupported approval decision for this family",
    });
  }
  if (
    command.decision !== "APPROVE" &&
    (command.remarks?.trim().length ?? 0) < 3
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["remarks"],
      message: "Remarks are required for return or rejection",
    });
  }
  if (
    command.evidenceReference !== undefined &&
    !approvalFamilySupportsSupplementalEvidence(command.family)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["evidenceReference"],
      message: "Supplemental evidence is not supported for this family",
    });
  }
});

export type CanonicalApprovalDecisionCommand = z.infer<
  typeof canonicalApprovalDecisionCommandSchema
>;

export type ApprovalDecisionFieldErrors = {
  decision?: string;
  remarks?: string;
  evidenceReference?: string;
};

export function getApprovalDecisionFieldErrors(
  error: unknown,
): ApprovalDecisionFieldErrors {
  if (!(error instanceof z.ZodError)) return {};
  const fieldErrors: ApprovalDecisionFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "remarks") {
      fieldErrors.remarks =
        issue.code === "too_big"
          ? "Remarks must be 1,000 characters or fewer."
          : "Enter at least 3 non-space characters for return or rejection.";
    } else if (field === "evidenceReference") {
      fieldErrors.evidenceReference =
        "Evidence reference must be 1,000 characters or fewer.";
    } else if (field === "decision") {
      fieldErrors.decision = "Choose an available decision.";
    }
  }
  return fieldErrors;
}

export function parseCanonicalApprovalDecisionCommand(input: unknown) {
  return canonicalApprovalDecisionCommandSchema.parse(input);
}

export function approvalDecisionCommandToFormData(
  command: CanonicalApprovalDecisionCommand,
) {
  const formData = new FormData();
  formData.set("approvalInstanceId", command.approvalInstanceId);
  formData.set("documentType", command.family);
  if (command.remarks !== undefined) {
    formData.set("remarks", command.remarks);
  }
  if (command.evidenceReference !== undefined) {
    formData.set("evidenceReference", command.evidenceReference);
  }
  return formData;
}
