import { prisma, Prisma } from "@ogfi/database";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { permissions, requirePermission } from "./authorization";
import { assertAuthorizedLocation, requireSessionContext, type SessionContext } from "./context";
import {
  recordApprovalStepReadyNotification
} from "./notifications";
import {
  assertAnyEligibleApprovalActorForStep,
  configureApprovalStepRouting
} from "./approvalRouting";
import { getApprovalRoutingPolicy } from "./approvalRoutingRegistry";
import { PURCHASE_REQUEST_MAX_LINES } from "../../lib/workflowLimits";
import { getPurchasingControlPolicy } from "./policySettings";

const optionalDateSchema = z
  .string()
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalTextSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z
    .string()
    .max(500)
    .transform((value) => value.trim())
    .optional()
);

const optionalNonNegativeIntegerSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().nonnegative().optional()
);

const createSupplierQuoteHeaderSchema = z.object({
  purchaseRequestId: z.string().uuid(),
  supplierId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200).transform((value) => value.trim()),
  quoteReference: z.string().min(1).max(80).transform((value) => value.trim()),
  quoteDate: z.string().min(1),
  validityDate: optionalDateSchema,
  terms: optionalTextSchema,
  reason: z.string().min(5).max(500)
});

const createSupplierQuoteLineSchema = z.object({
  sourcePrLineId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  uomId: z.string().uuid(),
  unitPrice: z.coerce.number().positive(),
  availabilityStatus: z.string().min(1).max(80).transform((value) => value.trim()),
  leadTimeDays: optionalNonNegativeIntegerSchema,
  notes: optionalTextSchema
});

const createQuotationRecommendationSchema = z.object({
  quotationRequestId: z.string().uuid(),
  selectedSupplierQuotationId: z.string().uuid(),
  selectionReason: z.string().min(5).max(500).transform((value) => value.trim()),
  nonLowestJustification: optionalTextSchema,
  singleSourceJustification: optionalTextSchema
});

const submitQuotationRecommendationSchema = z.object({
  quotationRecommendationId: z.string().uuid()
});

export function assertApprovedPurchaseRequestForQuote(status: string) {
  if (status !== "APPROVED") {
    throw new Error("PURCHASE_REQUEST_NOT_APPROVED_FOR_QUOTE");
  }
}

export function getLowestQuoteIds(
  quotes: Array<{ id: string; totalAmount: number }>
) {
  if (quotes.length === 0) {
    return new Set<string>();
  }

  const lowestAmount = Math.min(...quotes.map((quote) => quote.totalAmount));
  return new Set(
    quotes
      .filter((quote) => quote.totalAmount === lowestAmount)
      .map((quote) => quote.id)
  );
}

export function evaluateQuotationRecommendation(
  quotes: Array<{ id: string; totalAmount: number; currencyCode: string }>,
  selectedSupplierQuotationId: string
) {
  if (quotes.length === 0) {
    throw new Error("NO_SUPPLIER_QUOTES_FOR_RECOMMENDATION");
  }

  const selectedQuote = quotes.find(
    (quote) => quote.id === selectedSupplierQuotationId
  );
  if (!selectedQuote) {
    throw new Error("SELECTED_SUPPLIER_QUOTE_NOT_FOUND");
  }

  const currencyCodes = new Set(quotes.map((quote) => quote.currencyCode));
  if (currencyCodes.size !== 1) {
    throw new Error("MIXED_CURRENCY_QUOTES_UNSUPPORTED");
  }

  const lowestEvaluatedTotal = Math.min(
    ...quotes.map((quote) => quote.totalAmount)
  );

  return {
    selectedEvaluatedTotal: selectedQuote.totalAmount,
    lowestEvaluatedTotal,
    quoteCount: quotes.length,
    currencyCode: selectedQuote.currencyCode,
    isLowestEvaluatedCost: selectedQuote.totalAmount === lowestEvaluatedTotal
  };
}

export function assertQuotationRecommendationJustification(values: {
  quoteCount: number;
  isLowestEvaluatedCost: boolean;
  comparisonRequired?: boolean | undefined;
  minimumQuotes?: number | undefined;
  nonLowestJustification?: string | undefined;
  singleSourceJustification?: string | undefined;
}) {
  if (
    values.quoteCount === 1 &&
    !values.singleSourceJustification?.trim()
  ) {
    throw new Error("SINGLE_SOURCE_JUSTIFICATION_REQUIRED");
  }

  if (
    values.comparisonRequired &&
    values.minimumQuotes &&
    values.quoteCount < values.minimumQuotes &&
    !values.singleSourceJustification?.trim()
  ) {
    throw new Error("QUOTE_SHORTFALL_JUSTIFICATION_REQUIRED");
  }

  if (
    !values.isLowestEvaluatedCost &&
    !values.nonLowestJustification?.trim()
  ) {
    throw new Error("NON_LOWEST_JUSTIFICATION_REQUIRED");
  }
}

function getFormValues(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => String(value));
}

export function parseSupplierQuoteLineInputs(formData: FormData) {
  const sourcePrLineIds = getFormValues(formData, "sourcePrLineId");
  if (sourcePrLineIds.length > PURCHASE_REQUEST_MAX_LINES) {
    throw new Error("SUPPLIER_QUOTE_LINES_LIMIT_EXCEEDED");
  }
  if (sourcePrLineIds.length === 0) {
    const legacySourcePrLineId = String(formData.get("legacySourcePrLineId") ?? "");
    if (!legacySourcePrLineId) {
      throw new Error("SUPPLIER_QUOTE_LINES_REQUIRED");
    }

    return [
      createSupplierQuoteLineSchema.parse({
        sourcePrLineId: legacySourcePrLineId,
        quantity: formData.get("quantity"),
        uomId: formData.get("uomId"),
        unitPrice: formData.get("unitPrice"),
        availabilityStatus: formData.get("availabilityStatus"),
        leadTimeDays: formData.get("leadTimeDays"),
        notes: formData.get("notes")
      })
    ];
  }

  const quantities = getFormValues(formData, "lineQuantity");
  const uomIds = getFormValues(formData, "lineUomId");
  const unitPrices = getFormValues(formData, "lineUnitPrice");
  const availabilityStatuses = getFormValues(formData, "lineAvailabilityStatus");
  const leadTimeDays = getFormValues(formData, "lineLeadTimeDays");
  const notes = getFormValues(formData, "lineNotes");

  return sourcePrLineIds.map((sourcePrLineId, index) =>
    createSupplierQuoteLineSchema.parse({
      sourcePrLineId,
      quantity: quantities[index],
      uomId: uomIds[index],
      unitPrice: unitPrices[index],
      availabilityStatus: availabilityStatuses[index],
      leadTimeDays: leadTimeDays[index],
      notes: notes[index]
    })
  );
}

export async function listQuoteOptions(session: SessionContext) {
  await requirePermission(session, permissions.quoteManage);

  const [suppliers, uoms] = await Promise.all([
    prisma.supplier.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { supplierCode: "asc" }
    }),
    prisma.uom.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: { uomCode: "asc" }
    })
  ]);

  return {
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      legalName: supplier.legalName
    })),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      uomCode: uom.uomCode,
      uomName: uom.uomName
    }))
  };
}

type QuoteRequestPageOptions = { page?: number; pageSize?: number };

const quoteRequestPageWhere = (session: SessionContext) => ({
  tenantId: session.context.tenantId,
  companyId: session.context.companyId,
  requestLocationId: session.context.locationId,
  status: "APPROVED" as const
});

export async function listQuoteRequests(
  session: SessionContext,
  options: QuoteRequestPageOptions = {}
) {
  await requirePermission(session, permissions.quoteManage);

  const hasPaging = options.page !== undefined;
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const page = Math.max(options.page ?? 1, 1);

  const requests = await prisma.purchaseRequest.findMany({
    where: quoteRequestPageWhere(session),
    ...(hasPaging ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    include: {
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          item: true,
          uom: true
        }
      },
      quotationRequests: {
        include: {
          recommendations: {
            include: {
              selectedSupplierQuotation: {
                include: {
                  supplier: true
                }
              },
              preparedBy: true
            },
            orderBy: { version: "desc" },
            take: 1
          },
          supplierQuotes: {
            include: {
              supplier: true,
              lines: {
                orderBy: { id: "asc" },
                include: {
                  item: true,
                  sourcePrLine: true,
                  uom: true
                }
              }
            },
            orderBy: { createdAt: "desc" }
          }
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return requests.map((request) => {
    const line = request.lines[0];
    const quotationRequest = request.quotationRequests[0] ?? null;
    const quotes = request.quotationRequests.flatMap((quotationRequest) =>
      quotationRequest.supplierQuotes.map((quote) => ({
        id: quote.id,
        quoteReference: quote.quoteReference,
        supplierName: quote.supplier.tradingName ?? quote.supplier.legalName,
        totalAmount: Number(quote.totalAmount),
        currencyCode: quote.currencyCode,
        quoteDate: quote.quoteDate.toISOString().slice(0, 10),
        status: quote.status,
        line: quote.lines[0]
          ? {
              quantity: Number(quote.lines[0].quantity),
              uomCode: quote.lines[0].uom.uomCode,
              unitPrice: Number(quote.lines[0].unitPrice),
              availabilityStatus: quote.lines[0].availabilityStatus,
              leadTimeDays: quote.lines[0].leadTimeDays
            }
          : null
        ,
        lines: quote.lines.map((quoteLine) => ({
          id: quoteLine.id,
          sourcePrLineId: quoteLine.sourcePrLineId,
          itemName:
            quoteLine.item?.itemName ??
            quoteLine.sourcePrLine?.description ??
            "Quoted line",
          quantity: Number(quoteLine.quantity),
          uomCode: quoteLine.uom.uomCode,
          unitPrice: Number(quoteLine.unitPrice),
          lineTotal: Number(quoteLine.lineTotal),
          availabilityStatus: quoteLine.availabilityStatus,
          leadTimeDays: quoteLine.leadTimeDays,
          notes: quoteLine.notes ?? null
        }))
      }))
    );
    const lowestQuoteIds = getLowestQuoteIds(quotes);
    const recommendation = quotationRequest?.recommendations[0] ?? null;

    return {
      id: request.id,
      publicReference: request.publicReference,
      quotationRequestId: quotationRequest?.id ?? null,
      requiredDate: request.requiredDate.toISOString().slice(0, 10),
      line: {
        id: line?.id ?? "",
        uomId: line?.uomId ?? null,
        itemName: line?.item?.itemName ?? null,
        description: line?.description ?? "No line",
        requestedQty: Number(line?.requestedQty ?? 0),
        uomCode: line?.uom?.uomCode ?? line?.uomCode ?? ""
      },
      lines: request.lines.map((requestLine) => ({
        id: requestLine.id,
        lineNumber: requestLine.lineNumber,
        itemName: requestLine.item?.itemName ?? null,
        description: requestLine.description,
        requestedQty: Number(requestLine.requestedQty),
        uomId: requestLine.uomId ?? null,
        uomCode: requestLine.uom?.uomCode ?? requestLine.uomCode,
        purpose: requestLine.purpose
      })),
      quotes: quotes.map((quote) => ({
        ...quote,
        isLowestRecordedCost: lowestQuoteIds.has(quote.id)
      })),
      recommendation: recommendation
        ? {
            id: recommendation.id,
            status: recommendation.status,
            selectedSupplierQuotationId:
              recommendation.selectedSupplierQuotationId,
            selectedSupplierName:
              recommendation.selectedSupplierQuotation.supplier.tradingName ??
              recommendation.selectedSupplierQuotation.supplier.legalName,
            selectedQuoteReference:
              recommendation.selectedSupplierQuotation.quoteReference,
            selectedEvaluatedTotal: Number(
              recommendation.selectedEvaluatedTotal
            ),
            lowestEvaluatedTotal: Number(
              recommendation.lowestEvaluatedTotal
            ),
            quoteCount: recommendation.quoteCount,
            isLowestEvaluatedCost: recommendation.isLowestEvaluatedCost,
            selectionReason: recommendation.selectionReason,
            nonLowestJustification:
              recommendation.nonLowestJustification ?? null,
            singleSourceJustification:
              recommendation.singleSourceJustification ?? null,
            preparedByName: recommendation.preparedBy.displayName,
            createdAt: recommendation.createdAt.toISOString()
          }
        : null
    };
  });
}

export async function listQuoteRequestsPage(
  session: SessionContext,
  options: { page?: number; pageSize?: number } = {}
) {
  await requirePermission(session, permissions.quoteManage);
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const requestedPage = Math.max(options.page ?? 1, 1);
  const totalItems = await prisma.purchaseRequest.count({
    where: quoteRequestPageWhere(session)
  });
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const items = await listQuoteRequests(session, { page, pageSize });
  return { items, totalItems, page, pageSize, pageCount };
}

export async function createSupplierQuote(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.quoteManage);
  const values = createSupplierQuoteHeaderSchema.parse(Object.fromEntries(formData));
  const submittedLines = parseSupplierQuoteLineInputs(formData);

  const [request, supplier, uoms, company] = await Promise.all([
    prisma.purchaseRequest.findFirst({
      where: {
        id: values.purchaseRequestId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId
      },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" }
        }
      }
    }),
    prisma.supplier.findFirst({
      where: {
        id: values.supplierId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.uom.findMany({
      where: {
        id: { in: [...new Set(submittedLines.map((line) => line.uomId))] },
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      }
    }),
    prisma.company.findFirst({
      where: {
        id: session.context.companyId,
        tenantId: session.context.tenantId
      },
      select: { currencyCode: true }
    })
  ]);

  if (!request) {
    throw new Error("PURCHASE_REQUEST_NOT_FOUND");
  }
  assertAuthorizedLocation(session, request.requestLocationId);
  assertApprovedPurchaseRequestForQuote(request.status);
  if (request.lines.length === 0) {
    throw new Error("PURCHASE_REQUEST_LINE_NOT_FOUND");
  }
  if (!supplier) {
    throw new Error("SUPPLIER_NOT_FOUND");
  }
  if (!company) {
    throw new Error("COMPANY_NOT_FOUND");
  }

  const requestLineIds = new Set(request.lines.map((line) => line.id));
  const submittedLineIds = new Set<string>();
  for (const line of submittedLines) {
    if (submittedLineIds.has(line.sourcePrLineId)) {
      throw new Error("SUPPLIER_QUOTE_LINE_DUPLICATE");
    }
    submittedLineIds.add(line.sourcePrLineId);
    if (!requestLineIds.has(line.sourcePrLineId)) {
      throw new Error("SUPPLIER_QUOTE_LINE_NOT_FOUND");
    }
  }
  if (submittedLineIds.size !== requestLineIds.size) {
    throw new Error("SUPPLIER_QUOTE_LINES_INCOMPLETE");
  }

  const uomIds = new Set(uoms.map((uom) => uom.id));
  if (submittedLines.some((line) => !uomIds.has(line.uomId))) {
    throw new Error("UOM_NOT_FOUND");
  }

  const requestLinesById = new Map(request.lines.map((line) => [line.id, line]));
  const quoteLines = submittedLines.map((line) => {
    const requestLine = requestLinesById.get(line.sourcePrLineId);
    if (!requestLine) {
      throw new Error("SUPPLIER_QUOTE_LINE_NOT_FOUND");
    }
    const lineTotal = line.quantity * line.unitPrice;
    return {
      sourcePrLineId: requestLine.id,
      itemId: requestLine.itemId,
      quantity: line.quantity,
      uomId: line.uomId,
      unitPrice: line.unitPrice,
      lineTotal,
      availabilityStatus: line.availabilityStatus,
      leadTimeDays: line.leadTimeDays ?? null,
      notes: line.notes ?? null
    };
  });
  const totalAmount = quoteLines.reduce((total, line) => total + line.lineTotal, 0);

  const canonicalRequest = {
    version: "supplier-quote-v1",
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    actorUserId: session.user.id,
    purchaseRequestId: request.id,
    requestLocationId: request.requestLocationId,
    supplierId: supplier.id,
    quoteReference: values.quoteReference,
    quoteDate: values.quoteDate,
    validityDate: values.validityDate ?? null,
    terms: values.terms ?? null,
    lines: [...quoteLines]
      .sort((left, right) => left.sourcePrLineId.localeCompare(right.sourcePrLineId))
      .map((line) => ({
        sourcePrLineId: line.sourcePrLineId,
        quantity: line.quantity.toFixed(6),
        uomId: line.uomId,
        unitPrice: line.unitPrice.toFixed(6),
        availabilityStatus: line.availabilityStatus,
        leadTimeDays: line.leadTimeDays,
        notes: line.notes
      }))
  };
  const idempotencyRequestHash = createHash("sha256")
    .update(JSON.stringify(canonicalRequest))
    .digest("hex");

  try {
    return await prisma.$transaction(async (tx) => {
    const quotationRequest = await tx.quotationRequest.upsert({
      where: { purchaseRequestId: request.id },
      create: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        publicReference: `QR-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        purchaseRequestId: request.id,
        requiredDate: request.requiredDate,
        createdByUserId: session.user.id
      },
      update: {}
    });

    const existingQuotes = await tx.$queryRaw<Array<{ id: string; "idempotencyRequestHash": string | null }>>(Prisma.sql`
      SELECT "id", "idempotencyRequestHash"
      FROM "SupplierQuotation"
      WHERE "tenantId" = ${session.context.tenantId}::uuid
        AND "companyId" = ${session.context.companyId}::uuid
        AND "idempotencyKey" = ${values.idempotencyKey}
      LIMIT 1
    `);
    const existingQuote = existingQuotes[0];
    if (existingQuote) {
      if (existingQuote.idempotencyRequestHash !== idempotencyRequestHash) {
        throw new Error("SUPPLIER_QUOTE_IDEMPOTENCY_CONFLICT");
      }
      return existingQuote.id;
    }

    const quoteId = randomUUID();
    const quoteRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "SupplierQuotation" (
        "id", "quotationRequestId", "tenantId", "companyId", "supplierId",
        "idempotencyKey", "idempotencyRequestHash", "quoteReference", "quoteDate",
        "currencyCode", "totalAmount", "validityDate", "terms", "status", "createdAt"
      ) VALUES (
        ${quoteId}::uuid, ${quotationRequest.id}::uuid, ${session.context.tenantId}::uuid,
        ${session.context.companyId}::uuid, ${supplier.id}::uuid, ${values.idempotencyKey},
        ${idempotencyRequestHash}, ${values.quoteReference}, ${new Date(`${values.quoteDate}T00:00:00.000Z`)},
        ${company.currencyCode}, ${totalAmount}, ${values.validityDate ? new Date(`${values.validityDate}T00:00:00.000Z`) : null},
        ${values.terms ?? null}, 'RECORDED', NOW()
      ) RETURNING "id"
    `);
    const quote = quoteRows[0];
    if (!quote) {
      throw new Error("SUPPLIER_QUOTE_CREATE_FAILED");
    }
    for (const line of quoteLines) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SupplierQuotationLine" (
          "id", "supplierQuotationId", "sourcePrLineId", "itemId", "quantity", "uomId",
          "unitPrice", "lineTotal", "availabilityStatus", "leadTimeDays", "notes"
        ) VALUES (
          ${randomUUID()}::uuid, ${quote.id}::uuid, ${line.sourcePrLineId}::uuid, ${line.itemId}::uuid,
          ${line.quantity}, ${line.uomId}::uuid, ${line.unitPrice}, ${line.lineTotal},
          ${line.availabilityStatus}, ${line.leadTimeDays}, ${line.notes}
        )
      `);
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "supplier_quote.created",
        entityType: "PurchaseRequest",
        entityId: request.id,
        metadata: {
          quotationRequestId: quotationRequest.id,
          supplierQuotationId: quote.id,
          supplierCode: supplier.supplierCode,
          lineCount: quoteLines.length,
          reason: values.reason
        }
      }
    });
    return quote.id;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.some((target) => String(target).includes("idempotencyKey"))
    ) {
      const existingQuotes = await prisma.$queryRaw<Array<{ id: string; idempotencyRequestHash: string | null }>>(Prisma.sql`
        SELECT "id", "idempotencyRequestHash"
        FROM "SupplierQuotation"
        WHERE "tenantId" = ${session.context.tenantId}::uuid
          AND "companyId" = ${session.context.companyId}::uuid
          AND "idempotencyKey" = ${values.idempotencyKey}
        LIMIT 1
      `);
      if (existingQuotes[0]?.idempotencyRequestHash === idempotencyRequestHash) {
        return existingQuotes[0].id;
      }
      throw new Error("SUPPLIER_QUOTE_IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}

export async function createQuotationRecommendation(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.quoteManage);
  const values = createQuotationRecommendationSchema.parse(
    Object.fromEntries(formData)
  );

  const quotationRequest = await prisma.quotationRequest.findFirst({
    where: {
      id: values.quotationRequestId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      purchaseRequest: {
        include: {
          lines: true
        }
      },
      supplierQuotes: {
        include: {
          supplier: true,
          lines: {
            include: {
              uom: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      },
      recommendations: {
        where: {
          status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] }
        },
        take: 1
      }
    }
  });

  if (!quotationRequest) {
    throw new Error("QUOTATION_REQUEST_NOT_FOUND");
  }
  assertAuthorizedLocation(
    session,
    quotationRequest.purchaseRequest.requestLocationId
  );
  assertApprovedPurchaseRequestForQuote(quotationRequest.purchaseRequest.status);
  if (quotationRequest.recommendations.length > 0) {
    throw new Error("ACTIVE_QUOTATION_RECOMMENDATION_EXISTS");
  }

  const quoteValues = quotationRequest.supplierQuotes.map((quote) => ({
    id: quote.id,
    totalAmount: Number(quote.totalAmount),
    currencyCode: quote.currencyCode
  }));
  const evaluation = evaluateQuotationRecommendation(
    quoteValues,
    values.selectedSupplierQuotationId
  );
  const purchasingPolicy = await getPurchasingControlPolicy(session);
  const requestEstimatedTotal = quotationRequest.purchaseRequest.lines.reduce(
    (total, line) => total + Number(line.estimatedLineTotal),
    0
  );
  const quotationComparisonRequired =
    requestEstimatedTotal >= purchasingPolicy.quotationRequiredThresholdPhp;
  assertQuotationRecommendationJustification({
    ...evaluation,
    comparisonRequired: quotationComparisonRequired,
    minimumQuotes: purchasingPolicy.minimumQuotes,
    nonLowestJustification: values.nonLowestJustification,
    singleSourceJustification: values.singleSourceJustification
  });

  const selectedQuote = quotationRequest.supplierQuotes.find(
    (quote) => quote.id === values.selectedSupplierQuotationId
  );
  if (!selectedQuote) {
    throw new Error("SELECTED_SUPPLIER_QUOTE_NOT_FOUND");
  }

  const latestRecommendation = await prisma.quotationRecommendation.findFirst({
    where: { quotationRequestId: quotationRequest.id },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  const version = (latestRecommendation?.version ?? 0) + 1;

  const evaluationSnapshot = {
    purchaseRequestId: quotationRequest.purchaseRequestId,
    publicReference: quotationRequest.publicReference,
    approvalRoute: {
      documentType: "QuotationRecommendation",
      requiredBeforePurchaseOrder: true,
      status: "DRAFT_NOT_SUBMITTED"
    },
    purchasingPolicy: {
      requestEstimatedTotal,
      quotationComparisonRequired,
      quotationRequiredThresholdPhp:
        purchasingPolicy.quotationRequiredThresholdPhp,
      minimumQuotes: purchasingPolicy.minimumQuotes
    },
    selectedSupplierQuotationId: selectedQuote.id,
    quotes: quotationRequest.supplierQuotes.map((quote) => ({
      id: quote.id,
      supplierId: quote.supplierId,
      supplierName: quote.supplier.tradingName ?? quote.supplier.legalName,
      quoteReference: quote.quoteReference,
      quoteDate: quote.quoteDate.toISOString(),
      currencyCode: quote.currencyCode,
      totalAmount: Number(quote.totalAmount),
      validityDate: quote.validityDate?.toISOString() ?? null,
      terms: quote.terms,
      lines: quote.lines.map((line) => ({
        sourcePrLineId: line.sourcePrLineId,
        quantity: Number(line.quantity),
        uomCode: line.uom.uomCode,
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        availabilityStatus: line.availabilityStatus,
        leadTimeDays: line.leadTimeDays,
        notes: line.notes
      }))
    }))
  };

  await prisma.$transaction(async (tx) => {
    const recommendation = await tx.quotationRecommendation.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        quotationRequestId: quotationRequest.id,
        selectedSupplierQuotationId: selectedQuote.id,
        preparedByUserId: session.user.id,
        status: "DRAFT",
        currencyCode: evaluation.currencyCode,
        selectedEvaluatedTotal: evaluation.selectedEvaluatedTotal,
        lowestEvaluatedTotal: evaluation.lowestEvaluatedTotal,
        quoteCount: evaluation.quoteCount,
        isLowestEvaluatedCost: evaluation.isLowestEvaluatedCost,
        selectionReason: values.selectionReason,
        nonLowestJustification: values.nonLowestJustification ?? null,
        singleSourceJustification: values.singleSourceJustification ?? null,
        evaluationSnapshot,
        version
      }
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "quotation_recommendation.created",
        entityType: "PurchaseRequest",
        entityId: quotationRequest.purchaseRequestId,
        metadata: {
          quotationRequestId: quotationRequest.id,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId: selectedQuote.id,
          selectedSupplierCode: selectedQuote.supplier.supplierCode,
          selectedEvaluatedTotal: evaluation.selectedEvaluatedTotal,
          lowestEvaluatedTotal: evaluation.lowestEvaluatedTotal,
          quoteCount: evaluation.quoteCount,
          requestEstimatedTotal,
          quotationComparisonRequired,
          quotationRequiredThresholdPhp:
            purchasingPolicy.quotationRequiredThresholdPhp,
          minimumQuotes: purchasingPolicy.minimumQuotes,
          isLowestEvaluatedCost: evaluation.isLowestEvaluatedCost,
          selectionReason: values.selectionReason,
          nonLowestJustification: values.nonLowestJustification ?? null,
          singleSourceJustification:
            values.singleSourceJustification ?? null
        }
      }
    });
  });
}

export async function submitQuotationRecommendation(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.quoteManage);
  const values = submitQuotationRecommendationSchema.parse(
    Object.fromEntries(formData)
  );

  const recommendation = await prisma.quotationRecommendation.findFirst({
    where: {
      id: values.quotationRecommendationId,
      tenantId: session.context.tenantId,
      companyId: session.context.companyId
    },
    include: {
      quotationRequest: {
        include: {
          purchaseRequest: {
            include: {
              lines: true
            }
          },
          supplierQuotes: true
        }
      },
      selectedSupplierQuotation: {
        include: {
          supplier: true
        }
      }
    }
  });

  if (!recommendation) {
    throw new Error("QUOTATION_RECOMMENDATION_NOT_FOUND");
  }
  if (recommendation.status !== "DRAFT") {
    throw new Error("QUOTATION_RECOMMENDATION_NOT_SUBMITTABLE");
  }

  assertAuthorizedLocation(
    session,
    recommendation.quotationRequest.purchaseRequest.requestLocationId
  );
  assertApprovedPurchaseRequestForQuote(
    recommendation.quotationRequest.purchaseRequest.status
  );
  const purchasingPolicy = await getPurchasingControlPolicy(session);
  const requestEstimatedTotal = recommendation.quotationRequest.purchaseRequest.lines.reduce(
    (total, line) => total + Number(line.estimatedLineTotal),
    0
  );
  const quotationComparisonRequired =
    requestEstimatedTotal >= purchasingPolicy.quotationRequiredThresholdPhp;
  assertQuotationRecommendationJustification({
    quoteCount: recommendation.quoteCount,
    isLowestEvaluatedCost: recommendation.isLowestEvaluatedCost,
    comparisonRequired: quotationComparisonRequired,
    minimumQuotes: purchasingPolicy.minimumQuotes,
    nonLowestJustification: recommendation.nonLowestJustification ?? undefined,
    singleSourceJustification:
      recommendation.singleSourceJustification ?? undefined
  });

  const approvalRule = await prisma.approvalRule.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      transactionType: "QuotationRecommendation",
      isActive: true
    },
    include: {
      steps: {
        orderBy: { stepOrder: "asc" }
      }
    },
    orderBy: { priority: "asc" }
  });

  if (!approvalRule || approvalRule.steps.length === 0) {
    throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.quotationRecommendation.updateMany({
      where: {
        id: recommendation.id,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "DRAFT",
      },
      data: {
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new Error("QUOTATION_RECOMMENDATION_ALREADY_SUBMITTED");
    }

    const existingApproval = await tx.approvalInstance.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "QuotationRecommendation",
        documentId: recommendation.id,
        status: "PENDING"
      }
    });

    if (existingApproval) {
      throw new Error("QUOTATION_RECOMMENDATION_ALREADY_SUBMITTED");
    }

    const firstStep = approvalRule.steps[0];
    if (!firstStep) {
      throw new Error("APPROVAL_RULE_NOT_CONFIGURED");
    }

    const routedSteps = approvalRule.steps.map((step, index) => ({
      ...step,
      approvalInstanceStepId: randomUUID(),
      activationStatus: index === 0 ? "PENDING" as const : "WAITING" as const
    }));
    const firstRoutedStep = routedSteps[0];
    if (!firstRoutedStep) throw new Error("APPROVAL_RULE_NOT_CONFIGURED");

    const approvalInstance = await tx.approvalInstance.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        documentType: "QuotationRecommendation",
        documentId: recommendation.id,
        approvalRuleId: approvalRule.id,
        currentStepOrder: firstStep.stepOrder,
        steps: {
          create: routedSteps.map((step) => ({
            id: step.approvalInstanceStepId,
            stepOrder: step.stepOrder,
            assignedRoleId: step.roleId,
            assignedUserId: step.userId,
            status: step.activationStatus
          }))
        }
      }
    });

    const prohibitedActors = Array.from(new Map([
      [recommendation.preparedByUserId, {
        userId: recommendation.preparedByUserId,
        reasonCode: "PREPARER"
      }],
      [recommendation.quotationRequest.purchaseRequest.requesterUserId, {
        userId: recommendation.quotationRequest.purchaseRequest.requesterUserId,
        reasonCode: "REQUESTER"
      }]
    ]).values());
    for (const step of routedSteps) {
      await configureApprovalStepRouting(tx, {
        approvalInstanceStepId: step.approvalInstanceStepId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        routingPolicy: getApprovalRoutingPolicy("QuotationRecommendation"),
        requiredPermissionCode: permissions.quoteApprove,
        dueAt: recommendation.quotationRequest.purchaseRequest.requiredDate,
        activationAudit: {
          actorUserId: session.user.id,
          source: "quotation-recommendation-submission"
        },
        scopeGroups: [{
          groupOrder: 1,
          targetMatchMode: "ANY",
          targets: [{
            scopeType: "LOCATION",
            companyId: session.context.companyId,
            locationId:
              recommendation.quotationRequest.purchaseRequest.requestLocationId
          }]
        }],
        prohibitedActors
      });
    }
    await assertAnyEligibleApprovalActorForStep(tx, {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId,
      ...(firstRoutedStep.userId
        ? { actorUserId: firstRoutedStep.userId }
        : {})
    });

    await tx.quotationRecommendation.update({
      where: { id: recommendation.id },
      data: { updatedAt: new Date() },
    });

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "quotation_recommendation.submitted",
        entityType: "PurchaseRequest",
        entityId: recommendation.quotationRequest.purchaseRequestId,
        beforeData: { status: "DRAFT" },
        afterData: { status: "PENDING_APPROVAL" },
        metadata: {
          quotationRequestId: recommendation.quotationRequestId,
          quotationRecommendationId: recommendation.id,
          selectedSupplierQuotationId:
            recommendation.selectedSupplierQuotationId,
          approvalInstanceId: approvalInstance.id,
          approvalRuleId: approvalRule.id
        }
      }
    });

    if (firstRoutedStep.userId) {
      const purchaseRequest = recommendation.quotationRequest.purchaseRequest;
      await recordApprovalStepReadyNotification(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: purchaseRequest.requestLocationId,
        approvalInstanceId: approvalInstance.id,
        approvalInstanceStepId: firstRoutedStep.approvalInstanceStepId,
        stepOrder: firstRoutedStep.stepOrder,
        recipientUserId: firstRoutedStep.userId,
        publicReference: purchaseRequest.publicReference,
        locationName: session.context.locationName,
        entityLabel: "Quotation recommendation",
        entityType: "PurchaseRequest",
        entityId: purchaseRequest.id,
        routingContext: {
          assignedRoleId: firstRoutedStep.roleId,
          requiredPermissionCode: permissions.quoteApprove,
          scopeType: "LOCATION_CONTEXT",
          scopeId: purchaseRequest.requestLocationId
        }
      });
    }
  });
}
