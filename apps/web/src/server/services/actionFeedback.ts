export type ActionFeedback = {
  code: string;
  message: string;
  title: string;
};

const actionFeedbackMessages: Record<string, string> = {
  EVIDENCE_LEGAL_HOLD_PLACED:
    "The preservation legal hold was placed and recorded in the audit history.",
  EVIDENCE_ATTACHMENT_NOT_FOUND:
    "This evidence record is no longer available in the selected company.",
  EVIDENCE_LEGAL_HOLD_CONFLICT:
    "A different legal hold is already active for this evidence record.",
  EVIDENCE_LEGAL_HOLD_BYTES_NOT_PRESERVABLE:
    "A legal hold cannot be placed because the evidence bytes were already purged.",
  EVIDENCE_LEGAL_HOLD_CONCURRENT_CHANGE:
    "This evidence record changed while the hold was being placed. Refresh and try again.",
  EXPANSION_GATE_EVIDENCE_REQUIRED:
    "Provide a clear evidence or decision reason before changing this expansion gate.",
  EXPANSION_GATE_ACHIEVEMENT_REASON_REQUIRED:
    "Explain why this lifecycle gate is ready before approving it.",
  EXPANSION_GATE_PRIOR_GATE_REQUIRED:
    "Complete the earlier lifecycle gates before approving this one.",
  EXPANSION_GATE_REVIEWER_REQUIRED:
    "Only the configured project sponsor can approve this lifecycle gate.",
  EXPANSION_GATE_SELF_APPROVAL_NOT_ALLOWED:
    "The gate owner or creator cannot approve the same lifecycle gate.",
  EXPANSION_GATE_TRANSITION_NOT_ALLOWED:
    "This lifecycle gate is no longer awaiting review. Refresh and check its current status.",
  EXPANSION_FINANCIAL_ESTIMATES_PERMISSION_DENIED:
    "You need financial estimate access to create or view confidential Expansion assumptions.",
  EXPANSION_FEASIBILITY_EVIDENCE_REQUIRED:
    "Provide executive, finance, or business-case evidence before marking this feasibility review complete.",
  EXPANSION_CAPEX_PROCUREMENT_EVIDENCE_REQUIRED:
    "Provide the budget, procurement, award, PO, invoice, or handover evidence reference before marking this capex/procurement item complete.",
  EXPANSION_POST_OPENING_EVIDENCE_REQUIRED:
    "Provide the 30/60/90-day review pack, operating report, or owner signoff evidence before marking this post-opening review complete.",
  EXPANSION_PERMIT_EVIDENCE_REQUIRED:
    "Provide the permit or document evidence reference before marking this requirement complete.",
  EXPANSION_CONSTRUCTION_EVIDENCE_REQUIRED:
    "Provide construction progress, inspection, or handover evidence before marking this work complete.",
  EXPANSION_CONSTRUCTION_PROGRESS_TRANSITION_DENIED:
    "Use the controlled status action to return a blocked or reviewed construction task to active work before recording progress.",
  EXPANSION_READINESS_EVIDENCE_REQUIRED:
    "Provide opening-readiness evidence before marking this readiness item complete.",
  EXPANSION_PUNCH_LIST_EVIDENCE_REQUIRED:
    "Provide rectification, inspection, or handover evidence before closing this punch-list item.",
  EXPANSION_PUNCH_LIST_REVIEW_REQUIRED:
    "High and critical punch-list items must be sent for review before they can be closed.",
  EXPANSION_PUNCH_LIST_INDEPENDENT_REVIEW_REQUIRED:
    "A high or critical punch-list item must be closed by its independent reviewer, not its creator or owner.",
  EXPANSION_PUNCH_LIST_ESCALATION_OWNER_REQUIRED:
    "Assign an escalation owner before recording a high or critical punch-list item.",
  EXPANSION_PUNCH_LIST_INITIAL_EVIDENCE_REQUIRED:
    "Record the initial inspection or evidence reference before raising a high or critical punch-list item.",
  EXPANSION_PUNCH_LIST_RETURN_REASON_REQUIRED:
    "Explain the unmet acceptance criteria before returning a punch-list item for more work.",
  EXPANSION_PUNCH_LIST_INVALID_TRANSITION:
    "That punch-list status change is not allowed. Progress the item through rectification, review, and closure in order.",
  EXPANSION_TASK_INVALID_TRANSITION:
    "That Expansion work-item status change is not allowed from its current status.",
  EXPANSION_TASK_REVIEW_REQUIRED:
    "Send the Expansion work item for review before marking it complete.",
  EXPANSION_TASK_EVIDENCE_REQUIRED:
    "Add a document, photo, source-record link, or structured evidence reference before completing this Expansion work item.",
  EXPANSION_FINANCIAL_PERMISSION_DENIED:
    "Viewing or changing Expansion financial estimates requires the Budget Control permission.",
  GOODS_RECEIPT_LINE_REQUIRED:
    "A receiving report needs at least one receivable line.",
  GOODS_RECEIPT_NOT_DRAFT_FOR_POSTING:
    "Only draft receiving reports can be posted.",
  GOODS_RECEIPT_NOT_POSTED_FOR_REVERSAL:
    "Only posted receiving reports can be reversed.",
  GOODS_RECEIPT_ALREADY_REVERSED:
    "This receiving report has already been reversed.",
  GOODS_RECEIPT_NOT_FOUND: "This receiving report is no longer available.",
  GOODS_RECEIPT_SELF_REVERSAL_NOT_ALLOWED:
    "The original receiver cannot reverse their own receiving report.",
  GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED:
    "This receiving report is missing its posted inventory movement link.",
  GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID:
    "This receiving report is linked to an invalid original inventory movement.",
  GOODS_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH:
    "This receiving report movement link does not match the original receipt line.",
  GOODS_RECEIPT_REVERSAL_PO_CLOSED:
    "Receiving reversal is blocked because the Purchase Order is closed or cancelled.",
  GOODS_RECEIPT_REVERSAL_PO_CLOSURE_ACTIVE:
    "Receiving reversal is blocked while a remaining-balance closure is active.",
  GOODS_RECEIPT_REVERSAL_OPEN_RECEIPT_EXISTS:
    "Post or resolve other open receiving reports for this Purchase Order before reversal.",
  GOODS_RECEIPT_REVERSAL_PO_RECEIVED_QTY_INVALID:
    "The Purchase Order received quantity no longer matches this receipt.",
  GOODS_RECEIPT_REVERSAL_STATE_CONFLICT:
    "This receiving report changed while reversal was being processed. Refresh and try again.",
  INVENTORY_LOCATION_NOT_FOUND:
    "The receiving inventory location is no longer available.",
  INVENTORY_LOCATION_SCOPE_DENIED:
    "That inventory location is outside your authorized scope.",
  INVENTORY_BALANCE_NEGATIVE_NOT_ALLOWED:
    "This action would make stock negative, so it was blocked.",
  INVENTORY_EXPIRY_REQUIRED:
    "The selected item requires an expiry date before this stock movement can be posted.",
  INVENTORY_ITEM_NOT_FOUND:
    "The selected inventory item is no longer available.",
  INVENTORY_LOT_REQUIRED:
    "The selected item requires a lot number before this stock movement can be posted.",
  INVENTORY_MOVEMENT_FROZEN_BY_STOCK_COUNT:
    "Stock movement is frozen while an active count session is locking this inventory location.",
  INVENTORY_SEARCH_QUERY_TOO_LONG:
    "Shorten the inventory search text and try again.",
  INVENTORY_MOVEMENT_BASE_QUANTITY_INVALID:
    "The stock movement base quantity must be greater than zero.",
  INVENTORY_MOVEMENT_ENTERED_QUANTITY_INVALID:
    "The stock movement entered quantity must be greater than zero.",
  INVENTORY_UOM_CONVERSION_REQUIRED:
    "A unit conversion is required before this inventory movement can be posted.",
  ITEM_NOT_TRACKED_FOR_INVENTORY:
    "The selected item is not configured for inventory tracking.",
  TRANSFER_RECEIPT_QUANTITY_INVALID:
    "Transfer receipt quantities must be zero or greater.",
  TRANSFER_RECEIPT_EXCEEDS_DISPATCHED:
    "The receipt quantities exceed the remaining dispatched quantity.",
  TRANSFER_RECEIPT_DISCREPANCY_REASON_REQUIRED:
    "Provide a reason for rejected, damaged, or short transfer quantities.",
  TRANSFER_RECEIPT_DISCREPANCY_EVIDENCE_REQUIRED:
    "Provide an evidence reference for rejected, damaged, or short transfer quantities.",
  TRANSFER_RECEIPT_QUANTITY_REQUIRED:
    "Enter at least one accepted, rejected, damaged, or short quantity.",
  TRANSFER_RECEIPT_STATE_CONFLICT:
    "This transfer changed while the receipt was being posted. Refresh and try again.",
  TRANSFER_RECEIPT_NOT_FOUND: "This transfer receipt is no longer available.",
  TRANSFER_RECEIPT_NOT_POSTED_FOR_REVERSAL:
    "Only posted transfer receipts can be reversed.",
  TRANSFER_RECEIPT_ALREADY_REVERSED:
    "This transfer receipt has already been reversed.",
  TRANSFER_RECEIPT_SELF_REVERSAL_NOT_ALLOWED:
    "The original receiver cannot reverse their own transfer receipt.",
  TRANSFER_RECEIPT_DISPATCHER_REVERSAL_NOT_ALLOWED:
    "The dispatcher cannot reverse the destination receipt for the same transfer.",
  TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_REQUIRED:
    "This transfer receipt is missing its posted stock movement link.",
  TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_INVALID:
    "This transfer receipt is linked to an invalid original stock movement.",
  TRANSFER_RECEIPT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH:
    "This transfer receipt movement link does not match the original receipt line.",
  TRANSFER_RECEIPT_LINE_ALREADY_REVERSED:
    "This transfer receipt line has already been reversed.",
  TRANSFER_RECEIPT_REVERSAL_ROLLUP_INVALID:
    "Transfer receipt reversal is blocked because the transfer rollups no longer match this receipt.",
  TRANSFER_RECEIPT_REVERSAL_STATE_CONFLICT:
    "This transfer receipt changed while reversal was being processed. Refresh and try again.",
  GOODS_RECEIPT_REFERENCE_ALLOCATION_FAILED:
    "The receiving reference could not be allocated. Try again.",
  GOODS_RECEIPT_DISCREPANCY_CONFLICT:
    "This receiving discrepancy changed while you were working. Refresh and review the latest receipt.",
  GOODS_RECEIPT_PURCHASE_ORDER_LINE_MISMATCH:
    "The selected Purchase Order lines no longer match the receiving record.",
  PURCHASE_ORDER_NOT_FOUND:
    "The selected Purchase Order is no longer available.",
  PERMISSION_DENIED: "You do not have permission to perform this action.",
  PHASE2_WORKFLOW_TRANSITION_NOT_ALLOWED:
    "That workflow action is not available from the record's current status.",
  PHASE2_WORKFLOW_REASON_REQUIRED:
    "Provide a reason before completing this workflow action.",
  PHASE2_WORKFLOW_EVIDENCE_REQUIRED:
    "Provide an evidence reference before completing this workflow action.",
  RECIPE_VERSION_NOT_FOUND:
    "This recipe version is no longer available or outside your scope.",
  RECIPE_VERSION_SELF_APPROVAL_BLOCKED:
    "You cannot approve or publish your own recipe version.",
  RECIPE_VERSION_TRANSITION_CONFLICT:
    "This recipe version changed while the action was being processed. Refresh and try again.",
  RECIPE_NOT_FOUND:
    "This recipe is no longer available or outside your scope.",
  RECIPE_ARCHIVED_NOT_EDITABLE:
    "Archived recipes cannot be changed. Create a new active recipe instead.",
  RECIPE_OPEN_VERSION_EXISTS:
    "Finish or cancel the open recipe version before creating another draft revision.",
  RECIPE_OPEN_VERSION_BLOCKS_ARCHIVE:
    "Archive is blocked while a recipe version is still in draft, review, returned, or approved status.",
  RECIPE_ALREADY_ARCHIVED:
    "This recipe is already archived.",
  RECIPE_ARCHIVE_CONFLICT:
    "This recipe changed while archive was being processed. Refresh and try again.",
  RECIPE_REVISION_LINE_QUANTITY_INVALID:
    "Recipe revision line quantities must be greater than zero.",
  RECIPE_DUPLICATE_LINE_NOT_ALLOWED:
    "The revision contains a duplicate ingredient and unit. Update the existing line instead of adding another duplicate.",
  RECIPE_LINE_SORT_ORDER_INVALID:
    "Recipe line order values must be whole numbers from 1 to 100.",
  RECIPE_SUB_RECIPE_VERSION_NOT_FOUND:
    "The selected sub-recipe version is unpublished, inactive, missing, or outside your scope.",
  RECIPE_CODE_DUPLICATE:
    "A recipe with this code already exists for the selected company.",
  RECIPE_LINES_REQUIRED:
    "Add at least one ingredient line before creating a draft recipe.",
  RECIPE_LINES_LIMIT_EXCEEDED:
    "A draft recipe can include up to 100 ingredient lines in one create action.",
  RECIPE_LINE_INDEX_INVALID:
    "Review the recipe ingredient lines and try again.",
  RECIPE_LINE_ITEM_NOT_FOUND:
    "One or more recipe ingredients are inactive, missing, or outside your company scope.",
  RECIPE_LINE_UOM_NOT_FOUND:
    "One or more recipe units are inactive, missing, or outside your company scope.",
  RECIPE_TARGET_FOOD_COST_INVALID:
    "Target food cost percent must be greater than zero and no more than 100.",
  BRANCH_CHECKLIST_STATUS_NOT_CORRECTABLE:
    "Only returned branch checklists can be corrected and resubmitted.",
  BRANCH_CHECKLIST_CORRECTION_CONFLICT:
    "This branch checklist changed while the correction was being applied. Refresh and try again.",
  FOOD_SAFETY_LOG_STATUS_NOT_CORRECTABLE:
    "Only returned food-safety logs can be corrected and resubmitted.",
  FOOD_SAFETY_CORRECTION_CONFLICT:
    "This food-safety log changed while the correction was being applied. Refresh and try again.",
  INCIDENT_STATUS_NOT_CORRECTABLE:
    "Only open, in-progress, or pending-review incidents can be corrected.",
  INCIDENT_CORRECTION_CONFLICT:
    "This incident changed while the correction was being applied. Refresh and try again.",
  MAINTENANCE_TICKET_STATUS_NOT_CORRECTABLE:
    "Only open, in-progress, or vendor-pending maintenance tickets can be corrected.",
  MAINTENANCE_TICKET_CORRECTION_CONFLICT:
    "This maintenance ticket changed while the correction was being applied. Refresh and try again.",
  MENU_PRICE_DECISION_NOT_FOUND:
    "This menu-price decision is no longer available or outside your scope.",
  MENU_PRICE_DECISION_EFFECTIVE_RANGE_INVALID:
    "The menu-price effective end date must be after the effective start date.",
  MENU_PRICE_DECISION_SELF_APPROVAL_BLOCKED:
    "You cannot approve or apply your own menu-price decision.",
  MENU_PRICE_DECISION_TRANSITION_CONFLICT:
    "This menu-price decision changed while the action was being processed. Refresh and try again.",
  MENU_ITEM_NOT_FOUND:
    "The selected menu item is no longer available or outside your scope.",
  SCOPE_DENIED: "This record is outside your authorized scope.",
  AUTH_REQUIRED: "Sign in again before continuing this action.",
  VALIDATION_FAILED:
    "Review the required fields and field lengths, then try again.",
  LOGIN_ACCOUNT_NOT_FOUND:
    "The organization code, email, or password is incorrect.",
  LOGIN_CREDENTIALS_INVALID:
    "The organization code, email, or password is incorrect.",
  LOGIN_TEMPORARILY_THROTTLED:
    "Too many sign-in attempts were detected. Wait 15 minutes, then try again or contact support.",
  AUTHENTICATION_CAPACITY_TEMPORARILY_UNAVAILABLE:
    "Authentication is busy right now. Wait a moment, then try again.",
  PASSWORD_POLICY_NOT_MET:
    "Use at least 12 characters with uppercase, lowercase, and a number.",
  PASSWORD_CONFIRMATION_MISMATCH:
    "The password confirmation does not match the new password.",
  AUTH_ACTIVATION_INVALID:
    "This activation link is invalid, expired, or already used. Ask an administrator for a new link.",
  MFA_CODE_INVALID:
    "That authenticator or recovery code is invalid or expired.",
  MFA_CODE_REPLAYED:
    "That authenticator code was already used. Wait for the next code and try again.",
  MFA_CHALLENGE_NOT_FOUND:
    "Your MFA challenge expired. Sign in again to continue.",
  MFA_CHALLENGE_TEMPORARILY_THROTTLED:
    "Too many verification attempts were detected. Sign in again later or contact support.",
  PRIVILEGED_MFA_STEP_UP_REQUIRED:
    "Refresh MFA assurance under Account security before repeating this sensitive action.",
  CORE_ADMIN_USER_DUPLICATE:
    "A user with that email already exists in this tenant.",
  CORE_ADMIN_ROLE_DUPLICATE:
    "A role with that code already exists in this tenant.",
  CORE_ADMIN_ROLE_CODE_INVALID:
    "Enter a valid role code using letters, numbers, dashes, underscores, or periods.",
  POLICY_SETTING_NOT_FOUND:
    "That policy setting is not available for this company.",
  POLICY_SETTING_BOOLEAN_INVALID:
    "Select either enabled or disabled for this policy setting.",
  POLICY_SETTING_NUMBER_INVALID:
    "Enter a valid zero-or-greater number for this policy setting.",
  POLICY_SETTING_JSON_INVALID:
    "Enter valid JSON for this policy setting.",
  POLICY_SETTING_SELECT_INVALID:
    "Select one of the available policy options.",
  RELEASE_READINESS_GATE_NOT_FOUND:
    "That release-readiness gate is not available for this company.",
  RELEASE_READINESS_EVIDENCE_REQUIRED:
    "Attach or reference evidence before marking this gate ready, conditional, or waived.",
  RELEASE_READINESS_DECISION_NOTE_REQUIRED:
    "Conditional GO and waiver gates require a decision note with owner, mitigation, or expiry.",
  RELEASE_READINESS_UAT_SIGNOFF_REQUIRED:
    "UAT readiness gates require a decision note that names the owner signoff, finding disposition, or default revision decision.",
  RELEASE_READINESS_UAT_EVIDENCE_UNRESOLVED:
    "Record and verify the required UAT evidence, and resolve failed or blocked UAT results, before marking this UAT gate ready.",
  RELEASE_READINESS_BLOCKER_SUMMARY_REQUIRED:
    "Hold gates require a blocker summary.",
  RELEASE_READINESS_SECURITY_EVIDENCE_UNRESOLVED:
    "Resolve the live security evidence counters before marking this security gate ready, or record a Conditional GO or waiver with a decision note.",
  RELEASE_READINESS_DEPLOYMENT_EVIDENCE_UNRESOLVED:
    "Record and verify the required deployment evidence before marking this deployment gate ready, or record a Conditional GO or waiver with a decision note.",
  RELEASE_READINESS_ENABLEMENT_EVIDENCE_UNRESOLVED:
    "Record and verify the required training, support-route, KB, release-note, and training-impact evidence before marking this enablement gate ready.",
  RELEASE_READINESS_TARGET_DATE_INVALID:
    "Enter a valid target date for this readiness gate.",
  DEPLOYMENT_EVIDENCE_PERFORMED_AT_INVALID:
    "Enter a valid date and time for when this deployment evidence was performed.",
  DEPLOYMENT_EVIDENCE_NOT_FOUND:
    "This deployment evidence record is no longer available for this company.",
  DEPLOYMENT_EVIDENCE_NOT_RECORDED:
    "Only newly recorded deployment evidence can be verified or rejected.",
  DEPLOYMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED:
    "Deployment evidence must be verified or rejected by someone other than the person who recorded it.",
  ENABLEMENT_EVIDENCE_COMPLETED_AT_INVALID:
    "Enter a valid date and time for when this enablement evidence was completed.",
  ENABLEMENT_EVIDENCE_NOT_FOUND:
    "This enablement evidence record is no longer available for this company.",
  ENABLEMENT_EVIDENCE_NOT_RECORDED:
    "Only newly recorded enablement evidence can be verified or rejected.",
  ENABLEMENT_EVIDENCE_SELF_VERIFICATION_BLOCKED:
    "Enablement evidence must be verified or rejected by someone other than the person who recorded it.",
  UAT_EVIDENCE_EXECUTED_AT_INVALID:
    "Enter a valid date and time for when this UAT evidence was executed.",
  UAT_EVIDENCE_NOT_FOUND:
    "This UAT evidence record is no longer available for this company.",
  UAT_EVIDENCE_NOT_RECORDED:
    "Only newly recorded UAT evidence can be verified or rejected.",
  UAT_EVIDENCE_SELF_VERIFICATION_BLOCKED:
    "UAT evidence must be verified or rejected by someone other than the person who recorded it.",
  RELEASE_BOARD_DECIDED_AT_INVALID:
    "Enter a valid date and time for the Release Board decision.",
  RELEASE_BOARD_READY_GATES_REQUIRED:
    "A GO decision requires all required readiness gates to be ready, conditionally ready, or waived with no hold gates.",
  RELEASE_BOARD_DECISION_REQUIRED:
    "Record the Release Board decision before marking the GO / NO-GO gate ready or conditional.",
  RELEASE_BOARD_GO_DECISION_REQUIRED:
    "Marking the GO / NO-GO gate ready requires the latest Release Board decision to be GO.",
  RELEASE_BOARD_CONDITIONAL_DECISION_REQUIRED:
    "Marking the GO / NO-GO gate conditional requires the latest Release Board decision to be Conditional GO.",
  RELEASE_BOARD_WAIVER_DECISION_REQUIRED:
    "Waiving the GO / NO-GO gate requires a recorded Release Board hold decision, evidence, and a decision note.",
  BREAK_GLASS_SELF_REQUEST_BLOCKED:
    "You cannot request break-glass access for yourself.",
  BREAK_GLASS_SELF_APPROVAL_BLOCKED:
    "You cannot approve or reject break-glass access that you requested or that grants access to yourself.",
  BREAK_GLASS_SELF_REVIEW_BLOCKED:
    "You cannot complete the post-review for break-glass access that you requested or that granted access to yourself.",
  BREAK_GLASS_EXPIRY_INVALID:
    "Enter a future break-glass expiry date and time.",
  BREAK_GLASS_EXPIRY_TOO_LONG:
    "Break-glass access cannot exceed the configured 24-hour maximum.",
  DUPLICATE_ACTIVE_BREAK_GLASS_ACCESS:
    "This user already has pending or active break-glass access.",
  BREAK_GLASS_ACCESS_NOT_FOUND:
    "This break-glass access record is no longer available or is outside your admin scope.",
  BREAK_GLASS_POST_REVIEW_NOT_READY:
    "Break-glass post-review is available only after the access is rejected, revoked, or expired.",
  PRIVILEGED_MFA_SELF_ATTESTATION_BLOCKED:
    "You cannot attest your own privileged MFA enrollment evidence.",
  PRIVILEGED_MFA_SELF_VERIFICATION_BLOCKED:
    "You cannot verify or revoke your own privileged MFA enrollment evidence, or evidence you attested.",
  PRIVILEGED_MFA_TARGET_NOT_PRIVILEGED:
    "The selected user does not currently have sensitive permissions in this company scope.",
  PRIVILEGED_MFA_ENROLLMENT_NOT_FOUND:
    "This privileged MFA enrollment record is no longer available or is outside your admin scope.",
  PRIVILEGED_MFA_REQUIRED:
    "Verified privileged MFA evidence is required before this sensitive administrative action can continue.",
  AUTH_SESSION_INVALIDATION_NOT_FOUND:
    "This session invalidation record is no longer pending or is outside your admin scope.",
  AUTH_SESSION_INVALIDATION_SELF_COMPLETION_BLOCKED:
    "A separate admin must confirm the external provider session invalidation evidence.",
  LOW_RISK_ROLE_USE_QUICK_ASSIGNMENT:
    "This role is eligible for quick assignment. Use Assign Role instead of controlled approval.",
  DUPLICATE_PENDING_SENSITIVE_ROLE_REQUEST:
    "A pending controlled role request already exists for this user and role.",
  SENSITIVE_ROLE_REQUEST_NOT_FOUND:
    "This controlled role request is no longer pending or is outside your admin scope.",
  SELF_ROLE_APPROVAL_BLOCKED:
    "You cannot approve or reject a controlled role request that you requested for yourself or that grants access to yourself.",
  CORE_ADMIN_COMPANY_DUPLICATE:
    "A company with that code already exists in this tenant.",
  CORE_ADMIN_COMPANY_CODE_INVALID:
    "Enter a valid company code using letters, numbers, dashes, underscores, or periods.",
  CORE_ADMIN_BRAND_DUPLICATE:
    "A brand with that code already exists for the selected company.",
  CORE_ADMIN_BRAND_CODE_INVALID:
    "Enter a valid brand code using letters, numbers, dashes, underscores, or periods.",
  CORE_ADMIN_LOCATION_DUPLICATE:
    "A location with that code already exists for the selected company.",
  CORE_ADMIN_LOCATION_CODE_INVALID:
    "Enter a valid location code using letters, numbers, dashes, underscores, or periods.",
  BRANCH_BRAND_REQUIRED:
    "Select a brand before creating a branch location.",
  BRAND_NOT_FOUND:
    "The selected brand is inactive, missing, or outside the selected company.",
  OPERATIONAL_REASON_CODE_INVALID:
    "Select an active reason code configured for this workflow and type.",
  OPERATIONAL_REASON_CODE_NOT_ACTIVE:
    "This reason code is already inactive.",
  OPERATIONAL_REASON_CODE_NOT_FOUND:
    "This reason code is no longer available.",
  OPERATIONAL_REASON_CODE_DUPLICATE:
    "A reason code with this workflow and code already exists for this company.",
  PURCHASE_ORDER_NOT_ISSUED_FOR_RECEIVING:
    "Only issued or partially received Purchase Orders can be received.",
  PURCHASE_ORDER_NOT_RECEIVABLE: "This Purchase Order is no longer receivable.",
  ACTIVE_QUOTATION_RECOMMENDATION_EXISTS:
    "This quotation request already has an active recommendation.",
  APPROVAL_ASSIGNMENT_DENIED:
    "This approval step is not assigned to your role or user.",
  APPROVAL_AUTHORITY_STALE:
    "Your approval authority changed. Refresh the approval and try again.",
  APPROVAL_DOCUMENT_NOT_FOUND:
    "The source document for this approval is no longer available.",
  APPROVAL_NOT_ACTIONABLE:
    "This approval is no longer actionable. Refresh the inbox and review the latest status.",
  APPROVAL_NEXT_STEP_ROUTING_CHANGED:
    "The next approval step changed. Refresh the approval and review its current route.",
  APPROVAL_NEXT_STEP_RECIPIENT_NOT_AVAILABLE:
    "The next approval step has no available recipient. Contact an administrator before retrying.",
  APPROVAL_ROUTING_BACKFILL_REQUIRED:
    "This approval is not ready for the current routing workflow. Contact an administrator.",
  APPROVAL_ROUTING_V1_DISABLED:
    "This approval cannot continue with the retired routing workflow. Contact an administrator.",
  APPROVAL_RULE_NOT_CONFIGURED:
    "No approval rule is configured for this action yet.",
  APPROVAL_RULE_STEP_NOT_CONFIGURED:
    "The approval rule does not have an active first step configured.",
  APPROVAL_SCOPE_DENIED:
    "This approval is outside your authorized company, brand, or location scope.",
  ADMIN_SCOPE_DENIED:
    "Your admin scope does not allow this user access change.",
  ADMIN_ROLE_CORE_PERMISSION_REQUIRED:
    "The configured admin role must retain core administration permission.",
  COMPANY_NOT_FOUND: "The selected company scope is no longer available.",
  BASE_UOM_NOT_FOUND: "The selected base UOM is no longer available.",
  DUPLICATE_ITEM_CATEGORY_CODE:
    "An item category with this code already exists.",
  DUPLICATE_ITEM_CODE: "An item with this code already exists.",
  DUPLICATE_ACTIVE_ROLE_ASSIGNMENT:
    "This user already has that active role assignment.",
  DUPLICATE_ACTIVE_SCOPE_ASSIGNMENT:
    "This user already has that active scope assignment.",
  HIGH_RISK_SCOPE_ASSIGNMENT_BLOCKED:
    "High-risk scope changes require controlled approval and cannot be changed from quick assignment.",
  LOW_RISK_SCOPE_USE_QUICK_ASSIGNMENT:
    "This location scope is eligible for quick assignment. Use Assign Scope instead of controlled approval.",
  DUPLICATE_PENDING_HIGH_RISK_SCOPE_REQUEST:
    "A pending controlled scope request already exists for this user and location.",
  HIGH_RISK_SCOPE_REQUEST_NOT_FOUND:
    "This controlled scope request is no longer pending or is outside your admin scope.",
  SELF_SCOPE_APPROVAL_BLOCKED:
    "You cannot approve or reject a controlled scope request that you requested for yourself or that grants access to yourself.",
  EMERGENCY_PURCHASE_REASON_REQUIRED:
    "Emergency Purchase Requests require an emergency reason.",
  EMERGENCY_PURCHASE_EVIDENCE_REQUIRED:
    "Emergency Purchase Requests require an evidence reference.",
  EMERGENCY_PURCHASE_ESTIMATE_REQUIRED:
    "Emergency Purchase Requests require a positive estimated amount.",
  EMERGENCY_PURCHASE_CAP_EXCEEDED:
    "This emergency Purchase Request exceeds the configured emergency cap and must use the normal purchase request route.",
  EMERGENCY_PURCHASE_POST_REVIEW_NOT_REQUIRED:
    "Emergency post-review is only required for emergency Purchase Requests.",
  EMERGENCY_PURCHASE_POST_REVIEW_NOT_READY:
    "Emergency post-review can be completed only after the emergency Purchase Request reaches an approved, rejected, or cancelled outcome.",
  EMERGENCY_PURCHASE_POST_REVIEW_ALREADY_COMPLETED:
    "Emergency post-review has already been completed for this Purchase Request.",
  DUPLICATE_SUPPLIER_CODE: "A supplier with this code already exists.",
  DUPLICATE_SUPPLIER_ITEM_LINK:
    "This supplier is already linked to the selected item and UOM.",
  DUPLICATE_UOM_CODE: "A UOM with this code already exists.",
  INVALID_UOM_CONVERSION:
    "The UOM conversion must use different units and a valid positive factor.",
  INVALID_STATUS_TRANSITION:
    "That status change is no longer valid. Refresh and review the latest state.",
  ITEM_NOT_FOUND: "The selected item is no longer available.",
  ITEM_CATEGORY_NOT_FOUND: "The selected item category is no longer available.",
  ITEM_CATEGORY_HAS_ACTIVE_ITEMS:
    "This category is still used by active items. Move or deactivate those items before deactivating the category.",
  MIXED_CURRENCY_QUOTES_UNSUPPORTED:
    "Mixed-currency quotation comparison is blocked until an evaluated FX policy is configured.",
  NON_LOWEST_JUSTIFICATION_REQUIRED:
    "A non-lowest supplier recommendation requires a justification.",
  NO_SUPPLIER_QUOTES_FOR_RECOMMENDATION:
    "Record at least one supplier quote before creating a recommendation.",
  PR_LINE_ITEM_NOT_FOUND:
    "The selected Purchase Request item is no longer available.",
  PR_LINE_UOM_NOT_FOUND:
    "The selected Purchase Request unit is no longer available.",
  PR_LINE_UOM_REQUIRED: "Select a catalog unit or enter a free-text UOM.",
  PURCHASE_ORDER_ALREADY_EXISTS_FOR_RECOMMENDATION:
    "A Purchase Order already exists for this approved supplier recommendation.",
  PURCHASE_ORDER_ALREADY_SUBMITTED:
    "This Purchase Order has already been submitted for approval.",
  PURCHASE_ORDER_CLOSURE_ALREADY_PENDING:
    "A remaining-balance closure request is already pending approval.",
  PURCHASE_ORDER_AMENDMENT_ALREADY_PENDING:
    "A Purchase Order amendment is already pending approval.",
  PURCHASE_ORDER_AMENDMENT_LINES_INVALID:
    "Review the amendment line quantities and prices, then try again.",
  PURCHASE_ORDER_AMENDMENT_LINE_SET_MISMATCH:
    "The amendment must include every current Purchase Order line without adding or removing lines.",
  PURCHASE_ORDER_AMENDMENT_NOT_PENDING_APPROVAL:
    "This Purchase Order amendment is no longer pending approval.",
  PURCHASE_ORDER_AMENDMENT_PROPOSAL_INVALID:
    "This Purchase Order amendment proposal is incomplete. Return it for correction.",
  PURCHASE_ORDER_CLOSURE_SUPPLIER_NOTICE_REQUIRED:
    "Provide a supplier notice reference or explain why supplier notice is unavailable.",
  PURCHASE_ORDER_CLOSURE_BLOCKS_AMENDMENT:
    "Resolve the pending balance-closure request before amending this Purchase Order.",
  PURCHASE_ORDER_DELIVERY_LOCATION_INACTIVE:
    "The Purchase Order delivery location is no longer active.",
  PURCHASE_ORDER_LINE_ACTIVITY_BLOCKS_AMENDMENT:
    "This Purchase Order line has receiving or cancellation activity and can no longer be amended.",
  PURCHASE_ORDER_LINE_AMOUNT_INVALID:
    "Purchase Order line amounts must be valid positive values.",
  PURCHASE_ORDER_LINE_QUANTITY_INVALID:
    "Purchase Order line quantities must be greater than zero.",
  PURCHASE_ORDER_LINE_NOT_FOUND: "This Purchase Order has no amendable lines.",
  PURCHASE_ORDER_NO_REMAINING_BALANCE_TO_CLOSE:
    "There is no remaining balance available to close.",
  PURCHASE_ORDER_NOT_APPROVED_FOR_ISSUE:
    "Only approved Purchase Orders can be issued to suppliers.",
  PURCHASE_ORDER_NOT_CANCELLABLE:
    "This Purchase Order can no longer be cancelled.",
  PURCHASE_ORDER_NOT_DRAFT_FOR_APPROVAL:
    "Only draft Purchase Orders can be submitted for approval.",
  PURCHASE_ORDER_NOT_ISSUED_FOR_RESEND:
    "Only issued Purchase Orders can be resent to suppliers.",
  PURCHASE_ORDER_NOT_ISSUED_FOR_AMENDMENT:
    "Only issued, unreceived Purchase Orders can be amended.",
  PURCHASE_ORDER_NOT_PARTIALLY_RECEIVED_FOR_CLOSURE:
    "Only partially received Purchase Orders can request remaining-balance closure.",
  PURCHASE_ORDER_NOT_PENDING_AMENDMENT:
    "This Purchase Order is no longer pending amendment approval.",
  PURCHASE_ORDER_CLOSURE_NOT_PENDING_APPROVAL:
    "This balance-closure request is no longer pending approval.",
  PURCHASE_ORDER_NOT_PENDING_APPROVAL:
    "This Purchase Order is no longer pending approval.",
  PURCHASE_ORDER_OPEN_RECEIPT_BLOCKS_CLOSURE:
    "Post or clear draft receiving reports before requesting balance closure.",
  PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_CANCELLATION:
    "Purchase Orders with received quantities cannot be cancelled.",
  PURCHASE_ORDER_RECEIVED_QUANTITY_BLOCKS_AMENDMENT:
    "Purchase Orders with received quantities cannot be amended.",
  PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_CANCELLATION:
    "Purchase Orders with receiving reports cannot be cancelled.",
  PURCHASE_ORDER_RECEIVING_REPORT_BLOCKS_AMENDMENT:
    "Purchase Orders with receiving reports cannot be amended.",
  PURCHASE_ORDER_SUPPLIER_CANCELLATION_NOTICE_REQUIRED:
    "Provide a supplier cancellation notice reference or explain why it is unavailable.",
  PURCHASE_ORDER_SUPPLIER_COPY_NOT_AVAILABLE:
    "The supplier copy is available only after approval.",
  PURCHASE_ORDER_ISSUE_METHOD_NOT_ALLOWED:
    "Choose one of the configured Purchase Order issue methods.",
  PURCHASE_UOM_NOT_FOUND: "The selected purchase UOM is no longer available.",
  ISSUE_UOM_NOT_FOUND: "The selected issue UOM is no longer available.",
  NO_ROLE_PERMISSION_CHANGES:
    "No role permission changes were detected. Change at least one toggle before saving.",
  ROLE_NOT_FOUND: "The selected role is no longer available.",
  ROLE_RECOMMENDATION_NOT_CONFIGURED:
    "This role does not have a system recommended permission set yet.",
  UNKNOWN_PERMISSION_CODE:
    "One of the selected permissions is not available in the controlled permission catalog.",
  PURCHASE_REQUEST_LINE_NOT_FOUND:
    "The Purchase Request line is no longer available.",
  PURCHASE_REQUEST_LINES_LIMIT_EXCEEDED:
    "A single Purchase Request can include up to 100 lines. Split larger requests by supplier, category, or delivery date.",
  PURCHASE_REQUEST_NOT_APPROVED_FOR_PO:
    "Only approved Purchase Requests can be converted into Purchase Orders.",
  PURCHASE_REQUEST_NOT_APPROVED_FOR_QUOTE:
    "Only approved Purchase Requests can receive supplier quotes.",
  PURCHASE_REQUEST_NOT_FOUND: "This Purchase Request is no longer available.",
  PURCHASE_REQUEST_NOT_FOUND_AFTER_CANCEL:
    "The Purchase Request was cancelled but could not be reloaded.",
  PURCHASE_REQUEST_NOT_FOUND_AFTER_COMMENT:
    "The comment was saved but the Purchase Request could not be reloaded.",
  PURCHASE_REQUEST_NOT_FOUND_AFTER_CREATE:
    "The draft was created but could not be reloaded.",
  PURCHASE_REQUEST_NOT_FOUND_AFTER_REOPEN:
    "The Purchase Request was reopened but could not be reloaded.",
  PURCHASE_REQUEST_NOT_FOUND_AFTER_SUBMIT:
    "The Purchase Request was submitted but could not be reloaded.",
  BRANCH_CHECKLIST_EXCEPTION_REVIEW_REQUIRED:
    "A checklist with exceptions must stay open for follow-up instead of being marked reviewed.",
  BRANCH_CHECKLIST_ALREADY_EXISTS:
    "A checklist already exists for this business date and shift in the selected location.",
  BRANCH_CHECKLIST_LINES_REQUIRED:
    "Add at least one checklist line before saving the branch checklist.",
  BRANCH_CHECKLIST_LINE_INDEX_INVALID:
    "Checklist lines must be entered in order from line 1 with no skipped or out-of-range rows.",
  BRANCH_BUSINESS_DATE_INVALID:
    "Enter a valid branch checklist business date.",
  BRANCH_CHECKLIST_NOT_FOUND:
    "This branch checklist is no longer available or is outside your scope.",
  BRANCH_REVIEWED_AT_INVALID:
    "Enter a valid branch checklist review date.",
  BRANCH_CHECKLIST_REVIEW_CONFLICT:
    "This branch checklist changed while review was being saved. Refresh and try again.",
  BRANCH_CHECKLIST_SELF_REVIEW_BLOCKED:
    "A different authorized reviewer must review this checklist.",
  BRANCH_CHECKLIST_STATUS_NOT_REVIEWABLE:
    "Only submitted or manager-review checklists can be reviewed.",
  BRANCH_CHECKLIST_STATUS_NOT_CLOSABLE:
    "Only reviewed or exception-open branch checklists can be closed.",
  BRANCH_CHECKLIST_CLOSE_CONFLICT:
    "This branch checklist changed while close was being saved. Refresh and try again.",
  BRANCH_REVIEWED_AT_BEFORE_BUSINESS_DATE:
    "The review date cannot be before the checklist business date.",
  FOOD_SAFETY_EXCEPTION_REVIEW_REQUIRED:
    "A food-safety log with exceptions must stay open for follow-up instead of being marked reviewed.",
  FOOD_SAFETY_LOG_ALREADY_EXISTS:
    "A food-safety log already exists for this business date and log type in the selected location.",
  FOOD_SAFETY_READINGS_REQUIRED:
    "Add at least one reading before saving the food-safety log.",
  FOOD_SAFETY_READING_INDEX_INVALID:
    "Food-safety readings must be entered in order from reading 1 with no skipped or out-of-range rows.",
  FOOD_SAFETY_BUSINESS_DATE_INVALID:
    "Enter a valid food-safety business date.",
  FOOD_SAFETY_READING_VALUE_INVALID:
    "Food-safety reading values and expected limits must be valid numbers.",
  FOOD_SAFETY_LOG_NOT_FOUND:
    "This food-safety log is no longer available or is outside your scope.",
  FOOD_SAFETY_LOG_STATUS_NOT_REVIEWABLE:
    "Only submitted or exception-review food-safety logs can be reviewed.",
  FOOD_SAFETY_REVIEWED_AT_INVALID:
    "Enter a valid food-safety review date.",
  FOOD_SAFETY_REVIEW_CONFLICT:
    "This food-safety log changed while review was being saved. Refresh and try again.",
  FOOD_SAFETY_REVIEWED_AT_BEFORE_BUSINESS_DATE:
    "The review date cannot be before the food-safety log business date.",
  FOOD_SAFETY_SELF_REVIEW_BLOCKED:
    "A different authorized reviewer must review this food-safety log.",
  FOOD_SAFETY_LOG_STATUS_NOT_CLOSABLE:
    "Only reviewed or exception-open food-safety logs can be closed.",
  FOOD_SAFETY_CLOSE_CONFLICT:
    "This food-safety log changed while close was being saved. Refresh and try again.",
  INCIDENT_NOT_FOUND:
    "This incident is no longer available or is outside your scope.",
  INCIDENT_DATE_INVALID:
    "Enter a valid incident date.",
  INCIDENT_DUE_DATE_INVALID:
    "Enter a valid incident due date, or leave it blank.",
  INCIDENT_DUE_AT_BEFORE_INCIDENT_DATE:
    "The incident due date cannot be before the incident date.",
  INCIDENT_RESOLVED_AT_INVALID:
    "Enter a valid incident resolution date.",
  INCIDENT_RESOLVED_AT_BEFORE_INCIDENT_DATE:
    "The resolution date cannot be before the incident date.",
  INCIDENT_RESOLUTION_CONFLICT:
    "This incident changed while resolution was being saved. Refresh and try again.",
  INCIDENT_NUMBER_GENERATION_FAILED:
    "The incident number could not be generated after several attempts. Refresh and try again.",
  INCIDENT_STATUS_NOT_RESOLVABLE:
    "Only open, in-progress, or pending-review incidents can be resolved.",
  INCIDENT_STATUS_NOT_CANCELLABLE:
    "Only open, in-progress, or pending-review incidents can be cancelled.",
  INCIDENT_CANCELLATION_CONFLICT:
    "This incident changed while cancellation was being saved. Refresh and try again.",
  INCIDENT_SOURCE_RECORD_NOT_FOUND_OR_UNSCOPED:
    "The selected incident source record is unavailable or outside your scope.",
  MAINTENANCE_COMPLETED_AT_INVALID:
    "Enter a valid maintenance completion date.",
  MAINTENANCE_COMPLETED_AT_BEFORE_REQUESTED_AT:
    "The completion date cannot be before the maintenance request date.",
  MAINTENANCE_REQUESTED_AT_INVALID:
    "Enter a valid maintenance request date.",
  MAINTENANCE_TARGET_DUE_AT_INVALID:
    "Enter a valid maintenance target due date, or leave it blank.",
  MAINTENANCE_TARGET_DUE_AT_BEFORE_REQUESTED_AT:
    "The maintenance target due date cannot be before the requested date.",
  MAINTENANCE_TICKET_COMPLETION_CONFLICT:
    "This maintenance ticket changed while completion was being saved. Refresh and try again.",
  MAINTENANCE_TICKET_NUMBER_RETRY_EXHAUSTED:
    "The maintenance ticket number could not be generated after several attempts. Refresh and try again.",
  MAINTENANCE_TICKET_NOT_FOUND:
    "This maintenance ticket is no longer available or is outside your scope.",
  MAINTENANCE_TICKET_STATUS_NOT_COMPLETABLE:
    "Only open, in-progress, or pending-vendor maintenance tickets can be completed.",
  MAINTENANCE_TICKET_STATUS_NOT_CANCELLABLE:
    "Only open, in-progress, or pending-vendor maintenance tickets can be cancelled.",
  MAINTENANCE_TICKET_CANCELLATION_CONFLICT:
    "This maintenance ticket changed while cancellation was being saved. Refresh and try again.",
  MAINTENANCE_SOURCE_INCIDENT_NOT_FOUND_OR_UNSCOPED:
    "The selected source incident is unavailable or outside your scope.",
  PROJECT_TASK_ASSIGNEE_NOT_PROJECT_MEMBER:
    "Select an active member of this project as the task owner.",
  PROJECT_TASK_BLOCKER_REASON_REQUIRED:
    "Provide a blocker reason before marking this task blocked.",
  PROJECT_TASK_CANCEL_REASON_REQUIRED:
    "Provide a cancellation reason before cancelling this task.",
  PROJECT_TASK_INITIAL_STATUS_NOT_ENABLED:
    "The selected starting status is not enabled for this project.",
  PROJECT_TASK_NOT_FOUND: "This project task is no longer available.",
  PROJECT_TASK_PERMISSION_DENIED:
    "You do not have permission to change this project task.",
  PROJECT_TASK_REASSIGNMENT_REASON_REQUIRED:
    "Provide a reassignment reason for blocked, overdue, waiting, high-priority, or critical tasks.",
  PROJECT_TASK_REASSIGNMENT_TERMINAL_STATUS:
    "Completed or cancelled tasks cannot be reassigned.",
  PROJECT_TASK_REOPEN_REASON_REQUIRED:
    "Provide a reopen reason before reopening this task.",
  PROJECT_TASK_REQUIRED_CHECKLIST_INCOMPLETE:
    "Complete all required checklist items before marking this task complete.",
  PROJECT_TASK_STALE_VERSION:
    "This project task changed while you were working. Refresh and try again.",
  PROJECT_TASK_STATUS_NOT_ENABLED:
    "That task status is not enabled for this project.",
  PROJECT_TASK_TERMINAL_STATUS:
    "Completed or cancelled tasks cannot move to that status.",
  PROJECT_ATTACHMENT_NOT_FOUND:
    "This project attachment is no longer available or is not linked to this project.",
  PROJECT_BLOCKER_NOT_FOUND: "This project blocker is no longer available.",
  PROJECT_BLOCKER_NOT_OPEN: "Only open blockers can be resolved or cancelled.",
  PROJECT_CHECKLIST_ITEM_NOT_FOUND:
    "This checklist item is no longer available.",
  PROJECT_EXPORT_RATE_LIMITED:
    "Project export was rate-limited. Wait a moment and try again.",
  PROJECT_LIFECYCLE_ACTIVE_TASKS_BLOCKED:
    "Finish, cancel, or archive all active project tasks before closing or cancelling this project.",
  PROJECT_LIFECYCLE_INVALID_TRANSITION:
    "That project lifecycle change is not allowed from the current status.",
  PROJECT_LIFECYCLE_OPEN_BLOCKERS_BLOCKED:
    "Resolve or cancel open project blockers before closing or cancelling this project.",
  PROJECT_LIFECYCLE_OPEN_RISKS_BLOCKED:
    "Resolve, mitigate, accept, or close open project risks before closing or cancelling this project.",
  PROJECT_LIFECYCLE_EXPANSION_GATES_BLOCKED:
    "Generate and achieve every required Expansion lifecycle gate before completing this project.",
  PROJECT_LIFECYCLE_REQUIREMENTS_BLOCKED:
    "Complete required project checklist lines and approve or waive every required evidence and signoff before closing this project.",
  PROJECT_LIFECYCLE_PERMISSION_DENIED:
    "You do not have permission to change this project's lifecycle.",
  PROJECT_LIFECYCLE_REASON_REQUIRED:
    "Provide a reason for holding, cancelling, or archiving this project.",
  PROJECT_LIFECYCLE_STALE_VERSION:
    "This project changed while you were working. Refresh and try again.",
  PROJECT_LINK_CONTEXT_INVALID:
    "Choose either a task or a milestone context for this project link, not both.",
  PROJECT_LINK_NOT_FOUND: "This project link is no longer available.",
  PROJECT_LINK_PERMISSION_DENIED:
    "You do not have permission to change links for this project.",
  PROJECT_LINK_REDACTION_LABEL_INVALID:
    "Use a safe redaction label for restricted linked records.",
  PROJECT_LINK_REDACTION_LEAK:
    "Restricted linked-record details cannot be exposed here.",
  PROJECT_LINK_SOURCE_DENIED:
    "You can link only source records you are allowed to view.",
  PROJECT_MEMBER_NOT_FOUND: "This project member is no longer available.",
  PROJECT_MEMBER_PERMISSION_DENIED:
    "You do not have permission to manage members for this project.",
  PROJECT_MEMBER_SELF_REMOVE_BLOCKED:
    "You cannot remove yourself from this project from this screen.",
  PROJECT_MEMBER_USER_NOT_FOUND: "The selected user is no longer available.",
  PROJECT_RISK_STALE_VERSION:
    "This project risk changed while you were working. Refresh and try again.",
  PROJECT_NOT_FOUND:
    "This project is no longer available or is outside your scope.",
  PROJECT_RISK_CONTEXT_INVALID:
    "Choose either a task or milestone context for this risk, not both.",
  PROJECT_RISK_NOT_FOUND: "This project risk is no longer available.",
  PROJECT_RISK_PERMISSION_DENIED:
    "You do not have permission to change this project risk.",
  PROJECT_RISK_REOPEN_REASON_REQUIRED:
    "Provide a reopen reason before reopening this risk.",
  PROJECT_RISK_RESOLUTION_NOTE_REQUIRED:
    "Provide a resolution note before closing or cancelling this risk.",
  PROJECT_RISK_RESOLVE_PERMISSION_DENIED:
    "You do not have permission to resolve this project risk.",
  PROJECT_RISK_TARGET_DATE_REQUIRED: "Mitigating risks require a target date.",
  PROJECT_RISK_TERMINAL_STATUS:
    "Closed or cancelled risks cannot move to that status.",
  PROJECT_SCOPE_DENIED:
    "The selected project scope is outside your authorized access.",
  PROJECT_SCOPE_REQUIRED: "Select a valid scope before creating this project.",
  PROJECT_STALE_VERSION:
    "This project changed while you were working. Refresh and review the latest details.",
  PROJECT_DETAILS_PERMISSION_DENIED:
    "You do not have permission to update this project's details.",
  PROJECT_TARGET_DATE_INVALID:
    "Enter a valid target opening date.",
  PROJECT_LEADERSHIP_INCOMPLETE:
    "Assign distinct active project manager and sponsor roles before continuing.",
  PROJECT_LEADERSHIP_SEGREGATION_REQUIRED:
    "The project creator, manager, and sponsor must be different people for this controlled workflow.",
  PROJECT_LEADERSHIP_USER_NOT_FOUND:
    "Choose an active user for the project leadership assignment.",
  PROJECT_MILESTONE_STALE_VERSION:
    "This project milestone changed while you were working. Refresh and try again.",
  PROJECT_MILESTONE_AT_RISK_REASON_REQUIRED:
    "Provide an at-risk reason before saving this milestone.",
  PROJECT_MILESTONE_CANCEL_REASON_REQUIRED:
    "Provide a cancellation reason before cancelling this milestone.",
  PROJECT_MILESTONE_NOT_FOUND: "This project milestone is no longer available.",
  PROJECT_MILESTONE_PERMISSION_DENIED:
    "You do not have permission to change milestones for this project.",
  PROJECT_TEMPLATE_CODE_DUPLICATE:
    "A project template with this code already exists for this company.",
  PROJECT_TEMPLATE_NOT_DRAFT: "Only draft project templates can be published.",
  PROJECT_TEMPLATE_NOT_FOUND: "This project template is no longer available.",
  PROJECT_TEMPLATE_PERMISSION_DENIED:
    "You do not have permission to configure project templates.",
  PROJECT_TEMPLATE_STATUS_SET_INCOMPLETE:
    "Project templates must include in-progress, completed, and cancelled task outcomes before publishing.",
  PROJECT_TEMPLATE_TASK_CODE_DUPLICATE:
    "Project template task codes must be unique.",
  PROJECT_TEMPLATE_MILESTONE_CODE_DUPLICATE:
    "Project template milestone codes must be unique.",
  PROJECT_TEMPLATE_TASK_STATUS_DISABLED:
    "A project template task uses a status that is not enabled for this template.",
  PROJECT_TEMPLATE_CHECKLIST_DUPLICATE:
    "Checklist item titles must be unique within each template task.",
  PROJECT_TEMPLATE_CONFIG_INVALID:
    "This project template configuration is invalid and cannot be applied.",
  PROJECT_TEMPLATE_EVIDENCE_CODE_DUPLICATE:
    "Each evidence requirement needs a unique code.",
  PROJECT_TEMPLATE_EVIDENCE_TASK_NOT_FOUND:
    "Choose an existing playbook task for this evidence requirement.",
  PROJECT_TEMPLATE_REQUIREMENT_TASK_NOT_FOUND:
    "Choose an existing playbook task for this requirement.",
  PROJECT_REQUIREMENT_ATTACHMENT_NOT_ALLOWED:
    "This requirement does not accept an uploaded attachment.",
  PROJECT_REQUIREMENT_DECISION_REVIEWER_REQUIRED:
    "Only the assigned reviewer can decide this requirement.",
  PROJECT_REQUIREMENT_CONTROL_PERMISSION_DENIED:
    "Only an authorized project manager, sponsor, administrator, or company manager can control requirement exceptions.",
  PROJECT_REQUIREMENT_EVIDENCE_FILE_REQUIRED:
    "Attach the required evidence file before submitting this requirement.",
  PROJECT_REQUIREMENT_EVIDENCE_MIME_MISMATCH:
    "The selected file type does not match this evidence requirement.",
  PROJECT_REQUIREMENT_EVIDENCE_NOTE_REQUIRED:
    "Record the required evidence note before submitting this requirement.",
  PROJECT_REQUIREMENT_EVIDENCE_TYPE_INVALID:
    "This requirement has an unsupported evidence type. Contact an administrator.",
  PROJECT_REQUIREMENT_EXCEPTION_INVALID_STATE:
    "Only pending, returned, or submitted requirements can be waived or cancelled.",
  PROJECT_REQUIREMENT_INVALID_DECISION_STATE:
    "Only a submitted requirement can be reviewed.",
  PROJECT_REQUIREMENT_INVALID_SUBMIT_STATE:
    "This requirement cannot be submitted in its current status.",
  PROJECT_REQUIREMENT_MATCHING_ATTACHMENT_REQUIRED:
    "Attach the required document or photo before submitting this requirement.",
  PROJECT_REQUIREMENT_CHECKLIST_INCOMPLETE:
    "Complete every required project checklist line before submitting a signoff package.",
  PROJECT_REQUIREMENT_NOT_FOUND:
    "This project requirement is no longer available.",
  PROJECT_REQUIREMENT_REVIEWER_NOT_ACTIVE_PROJECT_MEMBER:
    "Choose an active member of this project as the reviewer.",
  PROJECT_REQUIREMENT_REASSIGNMENT_INVALID_STATE:
    "A reviewer can only be reassigned while the requirement is pending, returned, or submitted.",
  PROJECT_REQUIREMENT_REVIEWER_UNCHANGED:
    "Choose a different active project member as reviewer.",
  PROJECT_REQUIREMENT_REQUIRED_CANCELLATION_DENIED:
    "A required requirement cannot be cancelled. Record an auditable waiver instead.",
  PROJECT_REQUIREMENT_RETURN_REASON_REQUIRED:
    "Explain why the requirement is being returned to its owner.",
  PROJECT_REQUIREMENT_SELF_DECISION_DENIED:
    "The person who submitted a requirement cannot approve it.",
  PROJECT_REQUIREMENT_SIGNOFF_REVIEWER_MUST_BE_INDEPENDENT:
    "Assign a reviewer who is independent from the requirement owner.",
  PROJECT_REQUIREMENT_SOURCE_RECORD_LINK_REQUIRED:
    "Link an authorized source record before submitting this requirement.",
  PROJECT_REQUIREMENT_STALE_VERSION:
    "This requirement changed while you were working. Refresh and review the latest status.",
  PROJECT_REQUIREMENT_SUBMISSION_OWNER_REQUIRED:
    "Only the assigned owner can submit this requirement.",
  PROJECT_TEMPLATE_REVISION_SOURCE_NOT_FOUND:
    "The source playbook is unavailable for creating a draft revision.",
  PROJECT_TEMPLATE_SIGNOFF_CODE_DUPLICATE:
    "Each signoff requirement needs a unique code.",
  PROJECT_TEMPLATE_STALE_VERSION:
    "This playbook changed while you were editing it. Refresh and review the latest version.",
  PROJECT_TEMPLATE_TASK_NOT_FOUND:
    "This playbook task is no longer available.",
  PROJECT_TEMPLATE_NOT_PUBLISHED:
    "Only published project templates can be used to create projects.",
  QUOTATION_RECOMMENDATION_ALREADY_SUBMITTED:
    "This supplier recommendation has already been submitted.",
  QUOTATION_RECOMMENDATION_NOT_APPROVED_FOR_PO:
    "Only approved supplier recommendations can create Purchase Orders.",
  QUOTATION_RECOMMENDATION_NOT_FOUND:
    "This supplier recommendation is no longer available.",
  QUOTATION_RECOMMENDATION_NOT_SUBMITTABLE:
    "Only draft supplier recommendations can be submitted.",
  QUOTATION_REQUEST_NOT_FOUND: "This quotation request is no longer available.",
  RECEIVING_DISCREPANCY_REASON_REQUIRED:
    "Rejected, damaged, or short quantities require a discrepancy reason.",
  RECEIVING_DISCREPANCY_EVIDENCE_REQUIRED:
    "Rejected, damaged, or short quantities require evidence when configured by policy.",
  RECEIVING_LINE_EXCEEDS_OUTSTANDING:
    "Received quantities cannot exceed the outstanding Purchase Order quantity.",
  RECEIVING_LINE_OUTCOME_EXCEEDS_DELIVERED:
    "Accepted, rejected, and damaged quantities cannot exceed the delivered quantity.",
  RECEIVING_QUANTITY_INVALID:
    "Receiving quantities must be zero or greater, with at least one quantity entered.",
  RECEIVING_STATUS_FILTER_INVALID:
    "The receiving status filter is not valid. Choose a listed status and try again.",
  RECEIVING_SUPPLIER_FILTER_INVALID:
    "The selected supplier filter is not valid for this workspace.",
  RECEIVING_PURCHASE_ORDER_FILTER_INVALID:
    "The selected Purchase Order filter is not valid for this workspace.",
  RECEIVING_RECEIVER_FILTER_INVALID:
    "The selected receiver filter is not valid for this workspace.",
  RECEIVING_DATE_FILTER_INVALID:
    "Enter valid receiving dates using YYYY-MM-DD.",
  RECEIVING_DATE_FILTER_RANGE_INVALID:
    "The receiving start date must be on or before the end date.",
  RECEIVING_DASHBOARD_PROFILE_SEARCH_TOO_LONG:
    "Use a shorter Receiving follow-up search.",
  RECEIVING_DASHBOARD_PROFILE_UNSUPPORTED:
    "That Receiving dashboard view is no longer available.",
  RECEIVING_FOLLOW_UP_REASON_UNAVAILABLE:
    "The Receiving follow-up reason is no longer available. Refresh and try again.",
  RECEIVING_SEARCH_QUERY_TOO_LONG:
    "Use a shorter Receiving search.",
  REQUESTER_ONLY_ACTION: "Only the original requester can perform this action.",
  ROLE_ASSIGNMENT_NOT_FOUND: "This role assignment is no longer available.",
  SELECTED_SUPPLIER_QUOTE_NOT_FOUND:
    "The selected supplier quote is no longer available.",
  SUPPLIER_QUOTE_LINE_DUPLICATE:
    "Each Purchase Request line can be quoted only once per supplier quote.",
  SUPPLIER_QUOTE_LINES_INCOMPLETE:
    "Supplier quotes must include every approved Purchase Request line.",
  SUPPLIER_QUOTE_LINES_LIMIT_EXCEEDED:
    "A supplier quote can include up to 100 Purchase Request lines.",
  SUPPLIER_QUOTE_LINES_REQUIRED:
    "Record at least one supplier quote line.",
  SUPPLIER_QUOTE_LINE_NOT_FOUND:
    "One of the selected supplier quote lines is no longer available.",
  SUPPLIER_QUOTE_IDEMPOTENCY_CONFLICT:
    "This quote submission key was already used for different quote details. Start a new quote task and try again.",
  SUPPLIER_QUOTE_TOTAL_NEGATIVE:
    "The quote discount cannot exceed the subtotal plus charges.",
  SELF_APPROVAL_BLOCKED:
    "You cannot approve, return, or reject your own request.",
  SELF_ROLE_MUTATION_BLOCKED:
    "You cannot change your own role assignments from this page.",
  SELF_SCOPE_MUTATION_BLOCKED:
    "You cannot change your own scope assignments from this page.",
  SENSITIVE_ROLE_ASSIGNMENT_BLOCKED:
    "Sensitive roles cannot be assigned from this screen.",
  SINGLE_SOURCE_JUSTIFICATION_REQUIRED:
    "A single-source recommendation requires a justification.",
  SUPPLIER_ITEM_LINK_NOT_FOUND:
    "This supplier item link is no longer available.",
  SUPPLIER_NOT_ACTIVE_FOR_PO:
    "The selected supplier is not eligible for normal Purchase Order creation under the current supplier-status policy.",
  SUPPLIER_NOT_ACTIVE_FOR_PO_ISSUE:
    "The selected supplier is not eligible for Purchase Order issue under the current supplier-status policy.",
  SUPPLIER_NOT_FOUND: "The selected supplier is no longer available.",
  TARGET_LOCATION_NOT_FOUND:
    "The selected target location is no longer available.",
  TARGET_ROLE_NOT_FOUND: "The selected target role is no longer available.",
  TARGET_USER_NOT_FOUND: "The selected target user is no longer available.",
  UOM_CONVERSION_NOT_FOUND:
    "The selected unit conversion is no longer available.",
  UOM_HAS_ACTIVE_ITEMS:
    "This UOM is still used by active items. Move those items to another UOM before deactivating it.",
  OPENING_BALANCE_ALREADY_EXISTS:
    "An active opening balance already exists for this location, item, and lot. Use reversal or a controlled stock adjustment for corrections.",
  OPENING_BALANCE_EVIDENCE_REQUIRED:
    "Opening balances require a signed count sheet, import file, or cutover evidence reference.",
  OPENING_BALANCE_EXISTING_STOCK_ACTIVITY:
    "Opening balances can only be posted before stock exists for this location, item, and lot.",
  STOCK_ADJUSTMENT_EXPIRY_REQUIRED:
    "The selected item requires an expiry date before an adjustment can be saved.",
  STOCK_ADJUSTMENT_INVENTORY_LOCATION_NOT_FOUND:
    "The selected inventory location is no longer available for your current scope.",
  STOCK_ADJUSTMENT_ITEM_NOT_FOUND:
    "The selected item is no longer available for stock adjustment.",
  STOCK_ADJUSTMENT_HAS_NO_LINES:
    "This stock adjustment needs at least one line before it can be submitted.",
  STOCK_ADJUSTMENT_LINE_REQUIRED:
    "Each adjustment line needs an item and quantity before the request can be saved.",
  STOCK_ADJUSTMENT_TOO_MANY_LINES:
    "A stock adjustment can include up to 100 lines. Split larger cutover files into separate requests.",
  STOCK_ADJUSTMENT_ALREADY_POSTED:
    "This stock adjustment has already been posted.",
  STOCK_ADJUSTMENT_ALREADY_REVERSED:
    "This stock adjustment has already been reversed.",
  STOCK_ADJUSTMENT_APPROVAL_ALREADY_SUBMITTED:
    "This stock adjustment has already been submitted for approval.",
  STOCK_ADJUSTMENT_NOT_CANCELLABLE:
    "This stock adjustment can no longer be cancelled.",
  STOCK_ADJUSTMENT_NOT_FOUND: "This stock adjustment is no longer available.",
  STOCK_ADJUSTMENT_NOT_APPROVED_FOR_POSTING:
    "Only approved stock adjustments can be posted.",
  STOCK_ADJUSTMENT_NOT_OPEN_FOR_SUBMIT:
    "Only open stock adjustment drafts can be submitted.",
  STOCK_ADJUSTMENT_NOT_POSTED_FOR_REVERSAL:
    "Only posted stock adjustments can be reversed.",
  STOCK_ADJUSTMENT_LOT_REQUIRED:
    "The selected item requires a lot number before an adjustment can be saved.",
  STOCK_ADJUSTMENT_LINE_ALREADY_REVERSED:
    "One of this adjustment's stock movements has already been reversed.",
  STOCK_ADJUSTMENT_LINE_POSTED_MOVEMENT_REQUIRED:
    "This adjustment cannot be reversed because a posted movement reference is missing.",
  STOCK_ADJUSTMENT_POSTING_STATE_CONFLICT:
    "This adjustment changed while posting. Refresh and review its latest status.",
  STOCK_ADJUSTMENT_QUANTITY_INVALID:
    "Enter an adjustment quantity greater than zero.",
  STOCK_ADJUSTMENT_REFERENCE_ALLOCATION_FAILED:
    "The stock adjustment reference could not be allocated. Try again.",
  STOCK_ADJUSTMENT_REVERSAL_ORIGINAL_MOVEMENT_INVALID:
    "This adjustment cannot be reversed because an original movement is invalid.",
  STOCK_ADJUSTMENT_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH:
    "This adjustment cannot be reversed because movement details no longer match.",
  STOCK_ADJUSTMENT_REVERSAL_STATE_CONFLICT:
    "This adjustment changed while reversing. Refresh and review its latest status.",
  STOCK_COUNT_HAS_NO_LINES:
    "Start the count and confirm it has snapshot lines before submitting.",
  STOCK_COUNT_HAS_UNCOUNTED_LINES:
    "All count lines need a counted quantity before submission.",
  STOCK_COUNT_INVENTORY_LOCATION_NOT_FOUND:
    "The selected inventory location is no longer available for your current scope.",
  STOCK_COUNT_LINE_NOT_FOUND: "One of the count lines is no longer available.",
  STOCK_COUNT_NOT_CANCELLABLE: "This count can no longer be cancelled.",
  STOCK_COUNT_NOT_DRAFT_FOR_START: "Only draft counts can be started.",
  STOCK_COUNT_NOT_FOUND: "This count is no longer available.",
  STOCK_COUNT_NOT_REVIEWED_FOR_ADJUSTMENT:
    "Only reviewed counts can generate a variance adjustment.",
  STOCK_COUNT_HAS_NO_VARIANCE_LINES:
    "This reviewed count has no variance lines to adjust.",
  STOCK_COUNT_NOT_OPEN_FOR_ENTRY:
    "Count entries can only be saved while the count is in progress or recount.",
  STOCK_COUNT_NOT_OPEN_FOR_SUBMIT:
    "Only in-progress or recount sessions can be submitted.",
  STOCK_COUNT_NOT_SUBMITTED_FOR_REVIEW:
    "Only submitted counts can be reviewed.",
  STOCK_COUNT_QUANTITY_INVALID: "Counted quantities must be zero or greater.",
  STOCK_COUNT_REFERENCE_ALLOCATION_FAILED:
    "The stock count reference could not be allocated. Try again.",
  STOCK_COUNT_SELF_REVIEW_BLOCKED:
    "A different authorized reviewer must review this count.",
  TRANSFER_LINE_ALREADY_DISPATCHED:
    "This transfer line has already been dispatched.",
  TRANSFER_LINE_ALREADY_RECEIVED:
    "This transfer line has already been received.",
  TRANSFER_LINE_REQUIRED:
    "Each transfer line needs an item and quantity before the request can be saved.",
  TRANSFER_HAS_NO_LINES:
    "This transfer request needs at least one line before the action can continue.",
  TRANSFER_TOO_MANY_LINES:
    "A transfer request can include up to 100 lines. Split larger transfers into separate requests.",
  TRANSFER_DESTINATION_INVENTORY_LOCATION_NOT_FOUND:
    "Your destination inventory location is no longer available.",
  TRANSFER_ITEM_NOT_FOUND:
    "The selected item is no longer available for transfer.",
  TRANSFER_NOT_CANCELLABLE: "This transfer can no longer be cancelled.",
  TRANSFER_NOT_DISPATCHED_FOR_RECEIPT:
    "Only dispatched, partially received, or disputed transfers can be received.",
  TRANSFER_NOT_DRAFT_FOR_SUBMIT: "Only draft transfers can be submitted.",
  TRANSFER_NOT_FOUND: "This transfer is no longer available.",
  TRANSFER_NOT_REQUESTED_FOR_DISPATCH:
    "Only requested transfers can be dispatched.",
  TRANSFER_QUANTITY_INVALID: "Enter a transfer quantity greater than zero.",
  TRANSFER_REFERENCE_ALLOCATION_FAILED:
    "The transfer reference could not be allocated. Try again.",
  TRANSFER_RECEIVER_MUST_DIFFER_FROM_DISPATCHER:
    "The user who dispatched a transfer cannot receive the same transfer.",
  TRANSFER_DISCREPANCY_NOT_SETTLEABLE:
    "Only disputed transfers can be settled.",
  TRANSFER_DISCREPANCY_NOT_FOUND:
    "This transfer has no recorded discrepancy to settle.",
  TRANSFER_DISCREPANCY_SELF_SETTLEMENT_NOT_ALLOWED:
    "The original requester cannot settle this transfer discrepancy.",
  TRANSFER_DISCREPANCY_DISPATCHER_SETTLEMENT_NOT_ALLOWED:
    "The dispatcher cannot settle this transfer discrepancy.",
  TRANSFER_DISCREPANCY_RECEIVER_SETTLEMENT_NOT_ALLOWED:
    "A receiver on the disputed transfer cannot settle the same discrepancy.",
  TRANSFER_DISCREPANCY_SETTLEMENT_STATE_CONFLICT:
    "This transfer changed while the discrepancy was being settled. Refresh and try again.",
  TRANSFER_SOURCE_DESTINATION_MUST_DIFFER:
    "Select a source inventory location different from the destination.",
  TRANSFER_SOURCE_INVENTORY_LOCATION_NOT_FOUND:
    "The selected source inventory location is no longer available.",
  UOM_NOT_FOUND: "The selected UOM is no longer available.",
  ONLY_LOCATION_SCOPE_MUTATION_SUPPORTED:
    "Only location scope assignments can be changed from this screen.",
  SCOPE_ASSIGNMENT_NOT_FOUND: "This scope assignment is no longer available.",
  APPROVAL_ROLE_MUTATION_BLOCKED:
    "Approval-sensitive role assignments cannot be changed from this screen.",
  WASTAGE_ALREADY_POSTED: "This wastage report has already been posted.",
  WASTAGE_ALREADY_REVERSED: "This wastage report has already been reversed.",
  WASTAGE_APPROVAL_ALREADY_SUBMITTED:
    "This wastage report has already been submitted for approval.",
  WASTAGE_EVIDENCE_REFERENCE_REQUIRED:
    "Evidence is required for this wastage type or policy flag.",
  WASTAGE_EXPIRY_REQUIRED:
    "The selected item requires an expiry date before wastage can be logged.",
  WASTAGE_INVENTORY_LOCATION_NOT_FOUND:
    "The selected inventory location is no longer available for your current scope.",
  WASTAGE_ITEM_NOT_FOUND:
    "The selected item is no longer available for wastage.",
  WASTAGE_LINE_REQUIRED:
    "Each wastage line needs an item and quantity before the report can be saved.",
  WASTAGE_LINE_ALREADY_REVERSED:
    "One of this report's wastage movements has already been reversed.",
  WASTAGE_LINE_POSTED_MOVEMENT_REQUIRED:
    "This report cannot be reversed because a posted movement reference is missing.",
  WASTAGE_LOT_REQUIRED:
    "The selected item requires a lot number before wastage can be logged.",
  WASTAGE_NOT_APPROVED_FOR_POSTING:
    "Only approved wastage reports can be posted.",
  WASTAGE_NOT_CANCELLABLE: "This wastage report can no longer be cancelled.",
  WASTAGE_NOT_OPEN_FOR_SUBMIT:
    "Only draft or returned wastage reports can be submitted.",
  WASTAGE_NOT_POSTED_FOR_REVERSAL:
    "Only posted wastage reports can be reversed.",
  WASTAGE_NOT_SUBMITTED_FOR_REVIEW:
    "Only submitted wastage reports can be reviewed.",
  WASTAGE_NOT_PENDING_APPROVAL:
    "This wastage report is no longer pending approval.",
  WASTAGE_POSTING_STATE_CONFLICT:
    "This report was changed while posting. Refresh and review its latest status.",
  WASTAGE_QUANTITY_INVALID: "Enter a wastage quantity greater than zero.",
  WASTAGE_REFERENCE_ALLOCATION_FAILED:
    "The wastage reference could not be allocated. Try again.",
  WASTAGE_REPORT_HAS_NO_LINES:
    "This wastage report needs at least one line before the action can continue.",
  WASTAGE_REPORT_NOT_FOUND: "This wastage report is no longer available.",
  WASTAGE_TOO_MANY_LINES:
    "A wastage report can include up to 100 lines. Split larger entries into separate reports.",
  WASTAGE_REVERSAL_ORIGINAL_MOVEMENT_INVALID:
    "This report cannot be reversed because an original movement is invalid.",
  WASTAGE_REVERSAL_ORIGINAL_MOVEMENT_MISMATCH:
    "This report cannot be reversed because movement details no longer match.",
  WASTAGE_REVERSAL_STATE_CONFLICT:
    "This report was changed while reversing. Refresh and review its latest status.",
  WASTAGE_SELF_REVIEW_DENIED:
    "The reporter cannot review their own wastage report.",
};

const safeActionCodePattern = /^[A-Z0-9_]+$/;

export function getActionErrorCode(error: unknown) {
  if (error instanceof Error && safeActionCodePattern.test(error.message)) {
    return error.message;
  }
  if (error instanceof Error && error.name === "ZodError") {
    return "VALIDATION_FAILED";
  }
  return "ACTION_FAILED";
}

export function actionErrorRedirectPath(pathname: string, error: unknown) {
  const params = new URLSearchParams({
    error: getActionErrorCode(error),
  });
  const separator = pathname.includes("?") ? "&" : "?";
  return `${pathname}${separator}${params.toString()}`;
}

export function getActionFeedback(
  searchParams: Record<string, string | string[] | undefined>,
): ActionFeedback | null {
  const rawCode = searchParams.error;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  if (!code || !safeActionCodePattern.test(code)) {
    return null;
  }

  return {
    code,
    message:
      actionFeedbackMessages[code] ??
      "The action could not be completed. Review the form and try again.",
    title: "Action not completed",
  };
}
