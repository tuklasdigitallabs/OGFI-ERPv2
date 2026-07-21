import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { SessionContext } from "../src/server/services/context";
import type {
  EvidenceAttachmentSourceType,
  archiveControlledEvidenceAttachment as archiveControlledEvidenceAttachmentType,
  assertControlledEvidenceSourceAccess as assertControlledEvidenceSourceAccessType,
  createControlledEvidenceAttachmentMetadataLink as createControlledEvidenceAttachmentMetadataLinkType,
  createControlledEvidenceAttachmentUploadLink as createControlledEvidenceAttachmentUploadLinkType,
  downloadControlledEvidenceAttachmentForSession as downloadControlledEvidenceAttachmentForSessionType,
  linkControlledEvidenceAttachment as linkControlledEvidenceAttachmentType,
} from "../src/server/services/attachments";
import { assertDisposableAuthorizationDatabaseConfigured } from "./authorizationDatabaseSafety";
import {
  authenticationSessionTokenHash,
  clearAuthenticatedRequest,
  configureAuthenticatedRequest,
} from "./authenticatedRequestHarness";

const expectedDatabase = assertDisposableAuthorizationDatabaseConfigured(process.env);

describe("controlled evidence database authorization matrix", () => {
  const suffix = randomUUID().slice(0, 8);
  const id = () => randomUUID();
  const ids = {
    tenant: id(), company: id(), adjacentCompany: id(), brand: id(), otherBrand: id(),
    location: id(), adjacentLocation: id(), adjacentCompanyLocation: id(),
    department: id(), otherDepartment: id(), foreignDepartment: id(), user: id(), role: id(), supplier: id(),
    accountClass: id(), ledgerAccount: id(), fiscalYear: id(), period: id(), authSession: id(),
    bankAccount: id(), bankStatement: id(), project: id(), restrictedProject: id(),
  };
  const authSessionToken = `evidence-authz-${randomUUID()}`;
  const sourceIds = new Map<EvidenceAttachmentSourceType, string>();
  const locationBoundTypes: EvidenceAttachmentSourceType[] = [];
  const noLocationTypes: EvidenceAttachmentSourceType[] = [];
  const controlledLinkIds = new Map<EvidenceAttachmentSourceType, string>();
  const attachmentId = id();
  const fixtureDate = new Date("2026-07-21T00:00:00.000Z");
  let prisma: PrismaClient;
  let session: SessionContext;
  let attachmentRoot: string | null = null;
  let archiveControlledEvidenceAttachment: typeof archiveControlledEvidenceAttachmentType;
  let assertControlledEvidenceSourceAccess: typeof assertControlledEvidenceSourceAccessType;
  let createControlledEvidenceAttachmentMetadataLink: typeof createControlledEvidenceAttachmentMetadataLinkType;
  let createControlledEvidenceAttachmentUploadLink: typeof createControlledEvidenceAttachmentUploadLinkType;
  let downloadControlledEvidenceAttachmentForSession: typeof downloadControlledEvidenceAttachmentForSessionType;
  let linkControlledEvidenceAttachment: typeof linkControlledEvidenceAttachmentType;

  const remember = (
    sourceType: EvidenceAttachmentSourceType,
    sourceRecordId: string,
    locationBound = true,
  ) => {
    sourceIds.set(sourceType, sourceRecordId);
    (locationBound ? locationBoundTypes : noLocationTypes).push(sourceType);
    return sourceRecordId;
  };

  beforeAll(async () => {
    ({ prisma } = await import("@ogfi/database"));
    ({
      archiveControlledEvidenceAttachment,
      assertControlledEvidenceSourceAccess,
      createControlledEvidenceAttachmentMetadataLink,
      createControlledEvidenceAttachmentUploadLink,
      downloadControlledEvidenceAttachmentForSession,
      linkControlledEvidenceAttachment,
    } = await import("../src/server/services/attachments"));
    await prisma.$connect();
    const identity = await prisma.$queryRaw<Array<{ currentDatabase: string }>>`
      SELECT current_database() AS "currentDatabase"
    `;
    if (identity[0]?.currentDatabase !== expectedDatabase) {
      throw new Error("AUTHORIZATION_DATABASE_IDENTITY_MISMATCH");
    }

    await prisma.tenant.create({
      data: { id: ids.tenant, name: `Evidence Matrix ${suffix}`, loginCode: `ev-${suffix}` },
    });
    await prisma.company.createMany({ data: [
      { id: ids.company, tenantId: ids.tenant, code: `EV-${suffix}`, legalName: `Evidence Company ${suffix}`, currencyCode: "PHP" },
      { id: ids.adjacentCompany, tenantId: ids.tenant, code: `EV-ADJ-${suffix}`, legalName: `Adjacent Evidence Company ${suffix}`, currencyCode: "PHP" },
    ] });
    await prisma.brand.createMany({ data: [
      { id: ids.brand, tenantId: ids.tenant, companyId: ids.company, code: `EV-B-${suffix}`, name: `Evidence Brand ${suffix}` },
      { id: ids.otherBrand, tenantId: ids.tenant, companyId: ids.company, code: `EV-OB-${suffix}`, name: `Other Evidence Brand ${suffix}` },
    ] });
    await prisma.department.createMany({ data: [
      { id: ids.department, tenantId: ids.tenant, companyId: ids.company, code: `EV-D-${suffix}`, name: `Evidence Department ${suffix}` },
      { id: ids.otherDepartment, tenantId: ids.tenant, companyId: ids.company, code: `EV-OD-${suffix}`, name: `Other Evidence Department ${suffix}` },
      { id: ids.foreignDepartment, tenantId: ids.tenant, companyId: ids.adjacentCompany, code: `EV-FD-${suffix}`, name: `Foreign Evidence Department ${suffix}` },
    ] });
    await prisma.location.createMany({ data: [
      { id: ids.location, tenantId: ids.tenant, companyId: ids.company, brandId: ids.brand, locationType: "BRANCH", code: `EV-L-${suffix}`, name: `Evidence Home ${suffix}` },
      { id: ids.adjacentLocation, tenantId: ids.tenant, companyId: ids.company, brandId: ids.brand, locationType: "BRANCH", code: `EV-A-${suffix}`, name: `Evidence Adjacent ${suffix}` },
      { id: ids.adjacentCompanyLocation, tenantId: ids.tenant, companyId: ids.adjacentCompany, locationType: "BRANCH", code: `EV-C-${suffix}`, name: `Evidence Other Company ${suffix}` },
    ] });
    await prisma.user.create({ data: { id: ids.user, tenantId: ids.tenant, email: `evidence-${suffix}@example.test`, displayName: `Evidence User ${suffix}` } });
    await prisma.role.create({ data: { id: ids.role, tenantId: ids.tenant, code: `EVIDENCE_${suffix}`, name: `Evidence Matrix ${suffix}` } });
    const permissionRows = await prisma.permission.findMany({ where: { tenantId: null }, select: { id: true, code: true } });
    await prisma.rolePermission.createMany({ data: permissionRows.map((permission) => ({ roleId: ids.role, permissionId: permission.id })) });
    await prisma.userRoleAssignment.create({ data: { userId: ids.user, roleId: ids.role } });
    await prisma.userScopeAssignment.createMany({ data: [
      { userId: ids.user, scopeType: "BRAND", scopeId: ids.brand, accessLevel: "VIEW" },
      { userId: ids.user, scopeType: "DEPARTMENT", scopeId: ids.department, accessLevel: "VIEW" },
      { userId: ids.user, scopeType: "LOCATION", scopeId: ids.location, accessLevel: "VIEW" },
    ] });
    session = {
      user: { id: ids.user, email: `evidence-${suffix}@example.test`, displayName: `Evidence User ${suffix}`, role: "Evidence Matrix" },
      context: { tenantId: ids.tenant, companyId: ids.company, companyName: "Evidence Company", brandId: ids.brand, brandName: "Evidence Brand", locationId: ids.location, locationName: "Evidence Home", locationType: "BRANCH" },
      authorizedLocations: [],
      permissionCodes: permissionRows.map((permission) => permission.code),
    };
    await prisma.authSession.create({
      data: {
        id: ids.authSession,
        tenantId: ids.tenant,
        userId: ids.user,
        tokenHash: authenticationSessionTokenHash(authSessionToken),
        status: "ACTIVE",
        assuranceLevel: "PASSWORD",
        privilegeEpochAtIssue: 0,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 2 * 60 * 60_000),
      },
    });
    configureAuthenticatedRequest({
      sessionToken: authSessionToken,
      selectedLocationId: ids.location,
    });

    await prisma.supplier.create({ data: { id: ids.supplier, tenantId: ids.tenant, companyId: ids.company, supplierCode: `EV-S-${suffix}`, legalName: `Evidence Supplier ${suffix}` } });
    await prisma.financeAccountClass.create({ data: { id: ids.accountClass, tenantId: ids.tenant, companyId: ids.company, code: `EV-AC-${suffix}`, name: "Evidence Assets", normalBalance: "DEBIT", statementSection: "BALANCE_SHEET" } });
    await prisma.chartOfAccount.create({ data: { id: ids.ledgerAccount, tenantId: ids.tenant, companyId: ids.company, accountClassId: ids.accountClass, code: `EV-GL-${suffix}`, name: "Evidence Bank", normalBalance: "DEBIT", postingAllowed: true } });
    await prisma.fiscalYear.create({ data: { id: ids.fiscalYear, tenantId: ids.tenant, companyId: ids.company, code: `EV-FY-${suffix}`, name: "Evidence FY", startDate: new Date("2026-01-01T00:00:00Z"), endDate: new Date("2026-12-31T23:59:59Z") } });
    await prisma.accountingPeriod.create({ data: { id: ids.period, tenantId: ids.tenant, companyId: ids.company, fiscalYearId: ids.fiscalYear, periodNumber: 7, code: `EV-P-${suffix}`, name: "Evidence Period", startDate: new Date("2026-07-01T00:00:00Z"), endDate: new Date("2026-07-31T23:59:59Z") } });
    await prisma.bankAccount.create({ data: { id: ids.bankAccount, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, ledgerAccountId: ids.ledgerAccount, publicReference: `EV-BA-${suffix}`, bankName: "Evidence Bank", maskedAccountNumber: "****1234", accountType: "CHECKING", createdByUserId: ids.user } });
    await prisma.bankStatement.create({ data: { id: ids.bankStatement, tenantId: ids.tenant, companyId: ids.company, bankAccountId: ids.bankAccount, publicReference: `EV-BS-${suffix}`, statementFrom: fixtureDate, statementTo: fixtureDate, statementDate: fixtureDate, sourceType: "TEST", sourceReference: `EV-BS-SRC-${suffix}`, sourceEventKey: `ev-bs-${suffix}`, createdByUserId: ids.user } });

    const apInvoiceId = remember("AP_INVOICE", id());
    await prisma.apInvoice.create({ data: { id: apInvoiceId, tenantId: ids.tenant, companyId: ids.company, publicReference: `EV-AP-${suffix}`, supplierId: ids.supplier, locationId: ids.adjacentLocation, supplierInvoiceNumber: `INV-${suffix}`, invoiceDate: fixtureDate, nonPoReason: "Authorization fixture", createdByUserId: ids.user } });
    const apLineId = remember("AP_INVOICE_LINE", id());
    await prisma.apInvoiceLine.create({ data: { id: apLineId, apInvoiceId, tenantId: ids.tenant, companyId: ids.company, lineNumber: 1, description: "Evidence line", invoicedQty: 1, unitPrice: 1, lineTotalAmount: 1 } });
    const creditId = remember("SUPPLIER_CREDIT_NOTE", id());
    await prisma.supplierCreditNote.create({ data: { id: creditId, tenantId: ids.tenant, companyId: ids.company, supplierId: ids.supplier, originalApInvoiceId: apInvoiceId, publicReference: `EV-CN-${suffix}`, supplierCreditNoteNumber: `CN-${suffix}`, creditDate: fixtureDate, creditAmount: 1, reasonCode: "TEST", reasonDescription: "Evidence matrix", createdByUserId: ids.user } });

    const paymentRequestId = remember("PAYMENT_REQUEST", id());
    await prisma.paymentRequest.create({ data: { id: paymentRequestId, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, supplierId: ids.supplier, publicReference: `EV-PR-${suffix}`, totalRequestedAmount: 1, requestedByUserId: ids.user, requestReason: "Evidence matrix" } });
    const paymentReleaseId = remember("PAYMENT_RELEASE", id());
    await prisma.paymentRelease.create({ data: { id: paymentReleaseId, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, supplierId: ids.supplier, paymentRequestId, bankAccountId: ids.bankAccount, publicReference: `EV-RL-${suffix}`, totalRequestedAmount: 1, releaseAmount: 1, sourceEventKey: `ev-release-${suffix}`, reason: "Evidence matrix", createdByUserId: ids.user } });
    const depositId = remember("BRANCH_CASH_DEPOSIT", id());
    await prisma.branchCashDeposit.create({ data: { id: depositId, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, bankAccountId: ids.bankAccount, publicReference: `EV-DEP-${suffix}`, depositDate: fixtureDate, amountPhp: 1, sourceEventKey: `ev-deposit-${suffix}`, declaredByUserId: ids.user } });
    const reconciliationId = remember("BANK_RECONCILIATION", id());
    await prisma.bankReconciliation.create({ data: { id: reconciliationId, tenantId: ids.tenant, companyId: ids.company, bankAccountId: ids.bankAccount, accountingPeriodId: ids.period, bankStatementId: ids.bankStatement, publicReference: `EV-REC-${suffix}`, preparedByUserId: ids.user, preparedAt: fixtureDate } });

    const expenseId = remember("EXPENSE_REQUEST", id());
    await prisma.expenseRequest.create({ data: { id: expenseId, tenantId: ids.tenant, companyId: ids.company, publicReference: `EV-EXP-${suffix}`, requestDate: fixtureDate, title: "Evidence expense", requestReason: "Evidence matrix", categoryCode: "TEST", brandId: ids.brand, locationId: ids.adjacentLocation, departmentId: ids.department, requestedByUserId: ids.user } });
    const expenseLineId = remember("EXPENSE_REQUEST_LINE", id());
    await prisma.expenseRequestLine.create({ data: { id: expenseLineId, expenseRequestId: expenseId, tenantId: ids.tenant, companyId: ids.company, lineNumber: 1, lineDate: fixtureDate, description: "Evidence expense line", categoryCode: "TEST", requestedAmountPhp: 1, lineTotalPhp: 1, createdByUserId: ids.user } });
    const cashRequestId = remember("CASH_ADVANCE_REQUEST", id());
    await prisma.cashAdvanceRequest.create({ data: { id: cashRequestId, tenantId: ids.tenant, companyId: ids.company, publicReference: `EV-CA-${suffix}`, requestedAmountPhp: 1, requestDate: fixtureDate, title: "Evidence cash advance", purpose: "Evidence matrix", categoryCode: "TEST", brandId: ids.brand, locationId: ids.adjacentLocation, departmentId: ids.department, requestedByUserId: ids.user } });
    const cashLiquidationId = remember("CASH_ADVANCE_LIQUIDATION", id());
    await prisma.cashAdvanceLiquidation.create({ data: { id: cashLiquidationId, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, cashAdvanceRequestId: cashRequestId, publicReference: `EV-CAL-${suffix}`, submittedByUserId: ids.user } });
    const cashLineId = remember("CASH_ADVANCE_LIQUIDATION_LINE", id());
    await prisma.cashAdvanceLiquidationLine.create({ data: { id: cashLineId, tenantId: ids.tenant, companyId: ids.company, locationId: ids.adjacentLocation, liquidationId: cashLiquidationId, lineNumber: 1, spendDate: fixtureDate, description: "Evidence cash line", categoryCode: "TEST", amountPhp: 1, createdByUserId: ids.user } });

    const fundId = remember("PETTY_CASH_FUND", id());
    await prisma.pettyCashFund.create({ data: { id: fundId, tenantId: ids.tenant, companyId: ids.company, publicReference: `EV-PCF-${suffix}`, code: `PCF-${suffix}`, name: "Evidence Petty Cash", brandId: ids.brand, locationId: ids.adjacentLocation, custodianUserId: ids.user, createdByUserId: ids.user } });
    const pettyRequestId = remember("PETTY_CASH_REQUEST", id());
    await prisma.pettyCashRequest.create({ data: { id: pettyRequestId, tenantId: ids.tenant, companyId: ids.company, pettyCashFundId: fundId, publicReference: `EV-PCR-${suffix}`, requestType: "DISBURSEMENT", requestedAmountPhp: 1, purpose: "Evidence", justification: "Evidence matrix", requestedByUserId: ids.user } });
    const pettyLiquidationId = remember("PETTY_CASH_LIQUIDATION", id());
    await prisma.pettyCashLiquidation.create({ data: { id: pettyLiquidationId, tenantId: ids.tenant, companyId: ids.company, pettyCashFundId: fundId, publicReference: `EV-PCL-${suffix}`, cycleStart: fixtureDate, cycleEnd: fixtureDate, submittedByUserId: ids.user } });
    const pettyLineId = remember("PETTY_CASH_LIQUIDATION_LINE", id());
    await prisma.pettyCashLiquidationLine.create({ data: { id: pettyLineId, tenantId: ids.tenant, companyId: ids.company, pettyCashFundId: fundId, liquidationId: pettyLiquidationId, lineNumber: 1, spendDate: fixtureDate, categoryCode: "TEST", description: "Evidence petty line", amountPhp: 1, createdByUserId: ids.user } });

    const closeRunId = remember("FINANCE_CLOSE_RUN", id(), false);
    await prisma.financeCloseRun.create({ data: { id: closeRunId, tenantId: ids.tenant, companyId: ids.company, accountingPeriodId: ids.period, publicReference: `EV-FCR-${suffix}`, initiatedByUserId: ids.user } });
    const closeItemId = remember("FINANCE_CLOSE_ITEM", id(), false);
    await prisma.financeCloseChecklistItem.create({ data: { id: closeItemId, tenantId: ids.tenant, companyId: ids.company, accountingPeriodId: ids.period, financeCloseRunId: closeRunId, checklistType: "AP_EXCEPTIONS", label: "Evidence review", sequence: 1 } });

    const employeeId = remember("WORKFORCE_EMPLOYEE", id());
    await prisma.employee.create({ data: { id: employeeId, tenantId: ids.tenant, companyId: ids.company, employeeCode: `EV-E-${suffix}`, legalName: "Evidence Employee", hireDate: fixtureDate, homeLocationId: ids.adjacentLocation, createdByUserId: ids.user } });
    const assignmentId = remember("WORKFORCE_ASSIGNMENT", id());
    await prisma.employeeAssignment.create({ data: { id: assignmentId, tenantId: ids.tenant, companyId: ids.company, employeeId, locationId: ids.adjacentLocation, brandId: ids.brand, departmentId: ids.department, effectiveFrom: fixtureDate, createdByUserId: ids.user } });
    const leaveId = remember("WORKFORCE_LEAVE", id());
    await prisma.employeeLeaveRequest.create({ data: { id: leaveId, tenantId: ids.tenant, companyId: ids.company, employeeId, locationId: ids.adjacentLocation, leaveType: "VACATION", requestedByUserId: ids.user, reason: "Evidence matrix", startDate: fixtureDate, endDate: fixtureDate, requestedMinutes: 480, sourceEventKey: `ev-leave-${suffix}`, createdByUserId: ids.user } });
    const overtimeId = remember("WORKFORCE_OVERTIME", id());
    await prisma.employeeOvertimeRecord.create({ data: { id: overtimeId, tenantId: ids.tenant, companyId: ids.company, employeeId, locationId: ids.adjacentLocation, overtimeType: "REGULAR", workedStartAt: fixtureDate, workedEndAt: new Date(fixtureDate.getTime() + 3_600_000), requestedMinutes: 60, reason: "Evidence matrix", requestedByUserId: ids.user, sourceEventKey: `ev-ot-${suffix}`, createdByUserId: ids.user } });
    const scheduleId = remember("WORKFORCE_SCHEDULE", id());
    await prisma.workforceSchedule.create({ data: { id: scheduleId, tenantId: ids.tenant, companyId: ids.company, brandId: ids.brand, locationId: ids.adjacentLocation, departmentId: ids.department, publicReference: `EV-WS-${suffix}`, scheduleDate: fixtureDate, shiftType: "OPENING", sourceEventKey: `ev-ws-${suffix}`, createdByUserId: ids.user } });
    const attendanceId = remember("WORKFORCE_ATTENDANCE_IMPORT", id());
    await prisma.attendanceImportBatch.create({ data: { id: attendanceId, tenantId: ids.tenant, companyId: ids.company, brandId: ids.brand, locationId: ids.adjacentLocation, publicReference: `EV-AI-${suffix}`, businessDate: fixtureDate, sourceType: "TEST", sourceReference: `ev-ai-${suffix}`, idempotencyKey: `ev-ai-${suffix}`, createdByUserId: ids.user } });

    await prisma.project.createMany({ data: [
      { id: ids.project, tenantId: ids.tenant, companyId: ids.company, code: `EV-PROJ-${suffix}`, name: "Evidence Project", projectType: "IMPLEMENTATION", locationId: ids.adjacentLocation, sponsorUserId: ids.user, managerUserId: ids.user, createdByUserId: ids.user, updatedByUserId: ids.user },
      { id: ids.restrictedProject, tenantId: ids.tenant, companyId: ids.company, code: `EV-RPROJ-${suffix}`, name: "Restricted Evidence Project", projectType: "IMPLEMENTATION", locationId: ids.adjacentLocation, sponsorUserId: ids.user, managerUserId: ids.user, isRestricted: true, createdByUserId: ids.user, updatedByUserId: ids.user },
    ] });
    await prisma.expenseRequest.update({
      where: { id: expenseId },
      data: { projectId: ids.project },
    });
    const requirementId = remember("PROJECT_REQUIREMENT", id(), false);
    await prisma.projectRequirement.create({ data: { id: requirementId, tenantId: ids.tenant, companyId: ids.company, projectId: ids.restrictedProject, kind: "EVIDENCE", code: `EV-REQ-${suffix}`, label: "Evidence requirement", ownerUserId: ids.user, createdByUserId: ids.user, updatedByUserId: ids.user } });

    attachmentRoot = await mkdtemp(path.join(tmpdir(), "ogfi-evidence-matrix-"));
    process.env.OGFI_PRIVATE_ATTACHMENT_ROOT = attachmentRoot;
    const objectKey = path.posix.join("controlled-evidence", ids.tenant, attachmentId, "matrix.txt");
    const buffer = Buffer.from("evidence authorization matrix");
    const filePath = path.join(attachmentRoot, ...objectKey.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    await prisma.attachment.create({ data: { id: attachmentId, tenantId: ids.tenant, storageProvider: "local-private", objectKey, originalFilename: "matrix.txt", mimeType: "text/plain", sizeBytes: buffer.byteLength, checksum: `sha256:${createHash("sha256").update(buffer).digest("hex")}`, uploadedByUserId: ids.user } });
    for (const [sourceType, sourceRecordId] of sourceIds) {
      const linkId = id();
      controlledLinkIds.set(sourceType, linkId);
      await prisma.controlledEvidenceAttachment.create({ data: { id: linkId, tenantId: ids.tenant, companyId: ids.company, sourceType, sourceRecordId, sourceKey: `${sourceRecordId}:HEADER`, attachmentId, createdByUserId: ids.user } });
    }
  }, 120_000);

  afterAll(async () => {
    clearAuthenticatedRequest();
    if (!prisma) return;
    await prisma.auditEvent.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.controlledEvidenceAttachment.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.attachment.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.projectRequirement.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.projectMember.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.project.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.attendanceImportBatch.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.workforceSchedule.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.employeeOvertimeRecord.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.employeeLeaveRequest.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.employeeAssignment.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.employee.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.financeCloseChecklistItem.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.financeCloseRun.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.pettyCashLiquidationLine.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.pettyCashLiquidation.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.pettyCashRequest.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.pettyCashFund.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.cashAdvanceLiquidationLine.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.cashAdvanceLiquidation.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.cashAdvanceRequest.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.expenseRequestLine.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.expenseRequest.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.bankReconciliation.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.branchCashDeposit.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.paymentRelease.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.paymentRequest.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.supplierCreditNote.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.apInvoiceLine.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.apInvoice.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.bankStatement.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.bankAccount.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.accountingPeriod.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.fiscalYear.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.chartOfAccount.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.financeAccountClass.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.supplier.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.authSession.deleteMany({ where: { id: ids.authSession } });
    await prisma.userScopeAssignment.deleteMany({ where: { userId: ids.user } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: ids.user } });
    await prisma.rolePermission.deleteMany({ where: { roleId: ids.role } });
    await prisma.role.deleteMany({ where: { id: ids.role } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.location.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.department.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.brand.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.company.deleteMany({ where: { tenantId: ids.tenant } });
    await prisma.tenant.deleteMany({ where: { id: ids.tenant } });
    await prisma.$disconnect();
    if (attachmentRoot) await rm(attachmentRoot, { recursive: true, force: true });
    delete process.env.OGFI_PRIVATE_ATTACHMENT_ROOT;
  }, 120_000);

  it("denies every location-bound evidence family at an adjacent location", async () => {
    expect(locationBoundTypes).toHaveLength(22);
    for (const sourceType of locationBoundTypes) {
      await expect(
        assertControlledEvidenceSourceAccess(session, sourceType, sourceIds.get(sourceType)!),
        sourceType,
      ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    }
  });

  it("allows all company-level evidence families without inventing a location scope", async () => {
    expect(noLocationTypes).toEqual(["FINANCE_CLOSE_RUN", "FINANCE_CLOSE_ITEM", "PROJECT_REQUIREMENT"]);
    await expect(assertControlledEvidenceSourceAccess(session, "FINANCE_CLOSE_RUN", sourceIds.get("FINANCE_CLOSE_RUN")!)).resolves.toBeUndefined();
    await expect(assertControlledEvidenceSourceAccess(session, "FINANCE_CLOSE_ITEM", sourceIds.get("FINANCE_CLOSE_ITEM")!)).resolves.toBeUndefined();
  });

  it("enforces restricted-project authorization for project requirement evidence", async () => {
    const sourceRecordId = sourceIds.get("PROJECT_REQUIREMENT")!;
    await expect(assertControlledEvidenceSourceAccess(session, "PROJECT_REQUIREMENT", sourceRecordId)).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await prisma.projectMember.create({ data: { tenantId: ids.tenant, companyId: ids.company, projectId: ids.restrictedProject, userId: ids.user, projectRole: "CONTRIBUTOR", addedByUserId: ids.user } });
    await expect(assertControlledEvidenceSourceAccess(session, "PROJECT_REQUIREMENT", sourceRecordId)).resolves.toBeUndefined();
    await prisma.projectMember.updateMany({ where: { projectId: ids.restrictedProject, userId: ids.user }, data: { status: "INACTIVE", removedAt: new Date(), removedByUserId: ids.user } });
    await expect(assertControlledEvidenceSourceAccess(session, "PROJECT_REQUIREMENT", sourceRecordId)).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
  });

  it("allows and downloads every location-bound source only after exact location assignment", async () => {
    await prisma.userScopeAssignment.create({ data: { userId: ids.user, scopeType: "LOCATION", scopeId: ids.adjacentLocation, accessLevel: "VIEW" } });
    for (const sourceType of locationBoundTypes) {
      await expect(assertControlledEvidenceSourceAccess(session, sourceType, sourceIds.get(sourceType)!), sourceType).resolves.toBeUndefined();
      await expect(downloadControlledEvidenceAttachmentForSession(session, { controlledEvidenceAttachmentId: controlledLinkIds.get(sourceType)! }), sourceType).resolves.toMatchObject({ originalFilename: "matrix.txt", mimeType: "text/plain" });
    }
  });

  it("rejects caller-selected view authority for evidence writes without leaving metadata, binary, or source mutations", async () => {
    const sourceRecordId = sourceIds.get("EXPENSE_REQUEST")!;
    const controlledEvidenceAttachmentId = controlledLinkIds.get("EXPENSE_REQUEST")!;
    const createPermission = await prisma.permission.findFirstOrThrow({
      where: { tenantId: null, code: "finance.expense_request.create" },
      select: { id: true },
    });
    const sourceBefore = await prisma.expenseRequest.findUniqueOrThrow({
      where: { id: sourceRecordId },
    });
    const persistenceBefore = {
      attachments: await prisma.attachment.count({ where: { tenantId: ids.tenant } }),
      links: await prisma.controlledEvidenceAttachment.count({ where: { tenantId: ids.tenant } }),
      archived: await prisma.controlledEvidenceAttachment.findUniqueOrThrow({
        where: { id: controlledEvidenceAttachmentId },
        select: { status: true, archivedAt: true, archiveReason: true },
      }),
      storageEntries: (await readdir(attachmentRoot!, { recursive: true })).length,
    };
    const callerSelectedViewPermission = "finance.expense_request.view";

    await prisma.rolePermission.deleteMany({
      where: { roleId: ids.role, permissionId: createPermission.id },
    });

    await expect(
      linkControlledEvidenceAttachment({
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId,
        attachmentId,
        requiredPermissionCode: callerSelectedViewPermission,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      createControlledEvidenceAttachmentMetadataLink({
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId,
        purpose: "EVIDENCE",
        requiredPermissionCode: callerSelectedViewPermission,
        attachment: {
          originalFilename: "denied-metadata.txt",
          mimeType: "text/plain",
          sizeBytes: 14,
          storageProvider: "manual-private-reference",
          objectKey: `denied/${suffix}/metadata.txt`,
        },
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      createControlledEvidenceAttachmentUploadLink({
        sourceType: "EXPENSE_REQUEST",
        sourceRecordId,
        purpose: "EVIDENCE",
        requiredPermissionCode: callerSelectedViewPermission,
        file: new File(["denied-binary"], "denied-upload.txt", {
          type: "text/plain",
        }),
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      archiveControlledEvidenceAttachment({
        controlledEvidenceAttachmentId,
        archiveReason: "Caller selected view permission must not authorize archive",
        requiredPermissionCode: callerSelectedViewPermission,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE");

    expect(await prisma.expenseRequest.findUniqueOrThrow({ where: { id: sourceRecordId } })).toEqual(sourceBefore);
    expect({
      attachments: await prisma.attachment.count({ where: { tenantId: ids.tenant } }),
      links: await prisma.controlledEvidenceAttachment.count({ where: { tenantId: ids.tenant } }),
      archived: await prisma.controlledEvidenceAttachment.findUniqueOrThrow({
        where: { id: controlledEvidenceAttachmentId },
        select: { status: true, archivedAt: true, archiveReason: true },
      }),
      storageEntries: (await readdir(attachmentRoot!, { recursive: true })).length,
    }).toEqual(persistenceBefore);

    await prisma.rolePermission.create({
      data: { roleId: ids.role, permissionId: createPermission.id },
    });
    const metadataLink = await createControlledEvidenceAttachmentMetadataLink({
      sourceType: "EXPENSE_REQUEST",
      sourceRecordId,
      purpose: "EVIDENCE",
      requiredPermissionCode: callerSelectedViewPermission,
      attachment: {
        originalFilename: "authorized-metadata.txt",
        mimeType: "text/plain",
        sizeBytes: 19,
        storageProvider: "manual-private-reference",
        objectKey: `authorized/${suffix}/metadata.txt`,
      },
    });
    const uploadLink = await createControlledEvidenceAttachmentUploadLink({
      sourceType: "EXPENSE_REQUEST",
      sourceRecordId,
      purpose: "EVIDENCE",
      requiredPermissionCode: callerSelectedViewPermission,
      file: new File(["authorized-binary"], "authorized-upload.txt", {
        type: "text/plain",
      }),
    });
    const archived = await archiveControlledEvidenceAttachment({
      controlledEvidenceAttachmentId: metadataLink.id,
      archiveReason: "Authorized writer regression path",
      requiredPermissionCode: callerSelectedViewPermission,
    });
    expect(uploadLink.storageProvider).toBe("local-private");
    expect(archived.status).toBe("ARCHIVED");
    expect(await prisma.expenseRequest.findUniqueOrThrow({ where: { id: sourceRecordId } })).toEqual(sourceBefore);
  });

  it("denies core-only period-close evidence writes and keeps archive denials non-enumerating", async () => {
    const periodClosePermission = await prisma.permission.findFirstOrThrow({
      where: { tenantId: null, code: "finance.period_close.manage" },
      select: { id: true },
    });
    const sourceRecordId = sourceIds.get("FINANCE_CLOSE_RUN")!;
    const linkId = controlledLinkIds.get("FINANCE_CLOSE_RUN")!;
    const nonexistentLinkId = randomUUID();
    const sourceBefore = await prisma.financeCloseRun.findUniqueOrThrow({
      where: { id: sourceRecordId },
    });
    const before = {
      links: await prisma.controlledEvidenceAttachment.count({ where: { tenantId: ids.tenant } }),
      attachments: await prisma.attachment.count({ where: { tenantId: ids.tenant } }),
      archiveState: await prisma.controlledEvidenceAttachment.findUniqueOrThrow({
        where: { id: linkId },
        select: { status: true, archivedAt: true, archiveReason: true },
      }),
      downloads: await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: "controlled_evidence_attachment.downloaded",
          entityId: linkId,
        },
      }),
      storageEntries: (await readdir(attachmentRoot!, { recursive: true })).length,
    };
    const denialsBefore = await prisma.auditEvent.count({
      where: {
        tenantId: ids.tenant,
        eventType: "controlled_evidence_attachment.denied",
      },
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: ids.role, permissionId: periodClosePermission.id },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: linkId,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    const { GET } = await import("../src/app/(app)/evidence/[id]/download/route");
    const routeResponse = await GET({} as never, {
      params: Promise.resolve({ id: linkId }),
    });
    expect(routeResponse.status).toBe(404);
    expect(routeResponse.headers.get("content-disposition")).toBeNull();
    expect(routeResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(await routeResponse.json()).toEqual({
      error: "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE",
    });

    const coreAdminCallerPermission = "core.administer";
    await expect(
      linkControlledEvidenceAttachment({
        sourceType: "FINANCE_CLOSE_RUN",
        sourceRecordId,
        attachmentId,
        requiredPermissionCode: coreAdminCallerPermission,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      createControlledEvidenceAttachmentMetadataLink({
        sourceType: "FINANCE_CLOSE_RUN",
        sourceRecordId,
        requiredPermissionCode: coreAdminCallerPermission,
        attachment: {
          originalFilename: "denied-close-metadata.txt",
          mimeType: "text/plain",
          sizeBytes: 21,
          storageProvider: "manual-private-reference",
          objectKey: `denied/${suffix}/close-metadata.txt`,
        },
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      createControlledEvidenceAttachmentUploadLink({
        sourceType: "FINANCE_CLOSE_RUN",
        sourceRecordId,
        requiredPermissionCode: coreAdminCallerPermission,
        file: new File(["denied-close-binary"], "denied-close-upload.txt", {
          type: "text/plain",
        }),
      }),
    ).rejects.toThrow("PERMISSION_DENIED");

    const archiveDenial = async (controlledEvidenceAttachmentId: string) => {
      try {
        await archiveControlledEvidenceAttachment({
          controlledEvidenceAttachmentId,
          archiveReason: "Non-enumerating period-close archive denial",
          requiredPermissionCode: coreAdminCallerPermission,
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await archiveDenial(linkId)).toBe(
      "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE",
    );
    expect(await archiveDenial(nonexistentLinkId)).toBe(
      "CONTROLLED_EVIDENCE_ATTACHMENT_NOT_AVAILABLE",
    );

    expect({
      links: await prisma.controlledEvidenceAttachment.count({ where: { tenantId: ids.tenant } }),
      attachments: await prisma.attachment.count({ where: { tenantId: ids.tenant } }),
      archiveState: await prisma.controlledEvidenceAttachment.findUniqueOrThrow({
        where: { id: linkId },
        select: { status: true, archivedAt: true, archiveReason: true },
      }),
      downloads: await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: "controlled_evidence_attachment.downloaded",
          entityId: linkId,
        },
      }),
      storageEntries: (await readdir(attachmentRoot!, { recursive: true })).length,
    }).toEqual(before);
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: "controlled_evidence_attachment.denied",
        },
      }),
    ).toBe(denialsBefore + 7);
    expect(await prisma.financeCloseRun.findUniqueOrThrow({ where: { id: sourceRecordId } })).toEqual(sourceBefore);
    await prisma.rolePermission.create({
      data: { roleId: ids.role, permissionId: periodClosePermission.id },
    });
  });

  it("denies known attachment bytes when the source brand conflicts with its location", async () => {
    const sourceRecordId = sourceIds.get("EXPENSE_REQUEST")!;
    const linkId = controlledLinkIds.get("EXPENSE_REQUEST")!;
    const downloadedBefore = await prisma.auditEvent.count({
      where: {
        tenantId: ids.tenant,
        eventType: "controlled_evidence_attachment.downloaded",
        entityId: linkId,
      },
    });
    await prisma.expenseRequest.update({
      where: { id: sourceRecordId },
      data: { brandId: ids.otherBrand },
    });

    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: linkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: "controlled_evidence_attachment.downloaded",
          entityId: linkId,
        },
      }),
    ).toBe(downloadedBefore);
    expect(
      await prisma.controlledEvidenceAttachment.count({ where: { id: linkId } }),
    ).toBe(1);
    expect(await prisma.attachment.count({ where: { id: attachmentId } })).toBe(1);
    await prisma.expenseRequest.update({
      where: { id: sourceRecordId },
      data: { brandId: ids.brand },
    });
  });

  it("denies known attachment bytes when the source department is outside the user's active department scope", async () => {
    const sourceRecordId = sourceIds.get("EXPENSE_REQUEST")!;
    const linkId = controlledLinkIds.get("EXPENSE_REQUEST")!;
    const downloadedBefore = await prisma.auditEvent.count({
      where: {
        tenantId: ids.tenant,
        eventType: "controlled_evidence_attachment.downloaded",
        entityId: linkId,
      },
    });
    await prisma.expenseRequest.update({
      where: { id: sourceRecordId },
      data: { departmentId: ids.otherDepartment },
    });

    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: linkId,
      }),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    expect(
      await prisma.auditEvent.count({
        where: {
          tenantId: ids.tenant,
          eventType: "controlled_evidence_attachment.downloaded",
          entityId: linkId,
        },
      }),
    ).toBe(downloadedBefore);
    expect(
      await prisma.controlledEvidenceAttachment.count({ where: { id: linkId } }),
    ).toBe(1);
    expect(await prisma.attachment.count({ where: { id: attachmentId } })).toBe(1);
    await prisma.expenseRequest.update({
      where: { id: sourceRecordId },
      data: { departmentId: ids.department },
    });
  });

  it("denies workforce evidence when authoritative dimensions are inconsistent", async () => {
    const assignmentId = sourceIds.get("WORKFORCE_ASSIGNMENT")!;
    await prisma.employeeAssignment.update({
      where: { id: assignmentId },
      data: { brandId: ids.otherBrand },
    });
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "WORKFORCE_ASSIGNMENT",
        assignmentId,
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await prisma.employeeAssignment.update({
      where: { id: assignmentId },
      data: { brandId: ids.brand },
    });

    const scheduleId = sourceIds.get("WORKFORCE_SCHEDULE")!;
    await prisma.workforceSchedule.update({
      where: { id: scheduleId },
      data: { departmentId: ids.foreignDepartment },
    });
    await expect(
      assertControlledEvidenceSourceAccess(
        session,
        "WORKFORCE_SCHEDULE",
        scheduleId,
      ),
    ).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await prisma.workforceSchedule.update({
      where: { id: scheduleId },
      data: { departmentId: ids.department },
    });
  });

  it("requires a live confidential capability to download workforce evidence", async () => {
    const confidentialPermissions = await prisma.permission.findMany({
      where: {
        tenantId: null,
        code: { in: ["workforce.manage", "core.administer"] },
      },
      select: { id: true },
    });
    await prisma.rolePermission.deleteMany({
      where: {
        roleId: ids.role,
        permissionId: { in: confidentialPermissions.map((row) => row.id) },
      },
    });
    await expect(
      downloadControlledEvidenceAttachmentForSession(session, {
        controlledEvidenceAttachmentId: controlledLinkIds.get(
          "WORKFORCE_EMPLOYEE",
        )!,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await prisma.rolePermission.createMany({
      data: confidentialPermissions.map((row) => ({
        roleId: ids.role,
        permissionId: row.id,
      })),
    });
  });

  it("keeps tenant and company boundaries non-enumerating", async () => {
    await prisma.expenseRequest.create({ data: { tenantId: ids.tenant, companyId: ids.adjacentCompany, publicReference: `EV-XCO-${suffix}`, requestDate: fixtureDate, title: "Cross company", requestReason: "Evidence boundary", categoryCode: "TEST", locationId: ids.adjacentCompanyLocation, requestedByUserId: ids.user } });
    const crossCompany = await prisma.expenseRequest.findFirstOrThrow({ where: { companyId: ids.adjacentCompany, publicReference: `EV-XCO-${suffix}` }, select: { id: true } });
    await expect(assertControlledEvidenceSourceAccess(session, "EXPENSE_REQUEST", crossCompany.id)).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
    await expect(assertControlledEvidenceSourceAccess(session, "EXPENSE_REQUEST", randomUUID())).rejects.toThrow("CONTROLLED_EVIDENCE_SOURCE_NOT_AVAILABLE");
  });
});
