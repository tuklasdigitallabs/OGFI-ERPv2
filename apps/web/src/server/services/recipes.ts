import { prisma, type Prisma } from "@ogfi/database";
import { z } from "zod";
import {
  assertPermissionAllowed,
  canUseRecipesAndCosting,
  permissions,
  requirePermission
} from "./authorization";
import { requireSessionContext, type SessionContext } from "./context";
import {
  assertPhase2WorkflowTransitionAllowed,
  getPhase2WorkflowActionsForStatus
} from "./phase2WorkflowPolicy";
import { parseDateOnlyUtc } from "./projectDates";

type RecipeWithCostingDetails = Prisma.RecipeGetPayload<{
  include: {
    brand: true;
    versions: {
      include: {
        yieldUom: true;
        servingUom: true;
        lines: {
          include: {
            item: true;
            subRecipeVersion: {
              include: {
                recipe: true;
                servingUom: true;
              };
            };
            uom: true;
          };
        };
        menuItems: {
          include: {
            prices: true;
          };
        };
      };
    };
  };
}>;

type RestaurantSalesImportLineWithMenuItem =
  Prisma.RestaurantSalesImportLineGetPayload<{
    include: {
      menuItem: true;
    };
  }>;

type InventoryMovementWithItem = Prisma.InventoryMovementGetPayload<{
  include: {
    item: true;
  };
}>;

type SupplierPriceSnapshot = {
  itemId: string;
  uomId: string;
  unitPrice: unknown;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
};

type ItemUomConversionSnapshot = {
  itemId: string;
  fromUomId: string;
  toUomId: string;
  conversionFactor: unknown;
};

const actualConsumptionMovementTypes = [
  "WASTAGE_OUT",
  "ADJUSTMENT_OUT",
  "COUNT_VARIANCE_OUT"
] as const;

export type RecipeCostingLineSummary = {
  id: string;
  lineNo: number;
  lineType: string;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  quantity: number;
  uomId: string;
  uomCode: string;
  latestUnitPrice: number | null;
  estimatedCost: number | null;
  costingNote: string | null;
  preparationNote: string | null;
};

export type RecipeCostingSummary = {
  id: string;
  menuItemId: string | null;
  recipeCode: string;
  recipeName: string;
  recipeType: string;
  brandName: string;
  versionId: string | null;
  versionNo: number | null;
  status: string;
  selectedVersionStatus: string;
  yieldQuantity: number | null;
  yieldUomId: string | null;
  yieldUomCode: string | null;
  servingQuantity: number | null;
  servingUomId: string | null;
  servingUomCode: string | null;
  targetFoodCostPercent: number | null;
  estimatedRecipeCost: number | null;
  estimatedServingCost: number | null;
  currentMenuPrice: number | null;
  estimatedFoodCostPercent: number | null;
  estimatedGrossMargin: number | null;
  menuItemName: string | null;
  lineCount: number;
  costedLineCount: number;
  pendingCostLineCount: number;
  costingStatus: "COSTED" | "PENDING_COST";
  lines: RecipeCostingLineSummary[];
  versionHistory: RecipeVersionHistorySummary[];
  openMenuPriceDecision: MenuPriceDecisionSummary | null;
};

export type RecipeVersionHistorySummary = {
  id: string;
  versionNo: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  approvedAt: string | null;
  yieldQuantity: number | null;
  yieldUomCode: string;
  servingQuantity: number | null;
  servingUomCode: string;
  targetFoodCostPercent: number | null;
  isSelectedCostingVersion: boolean;
};

export type MenuPriceDecisionSummary = {
  id: string;
  status: string;
  requestedPrice: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  evidenceReference: string | null;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  appliedByUserId: string | null;
  appliedAt: string | null;
};

export type FoodCostAnalysisSummary = {
  menuItemId: string;
  menuItemName: string;
  recipeName: string;
  quantitySold: number;
  netSalesAmount: number;
  theoreticalCost: number | null;
  theoreticalFoodCostPercent: number | null;
  targetFoodCostPercent: number | null;
  actualCost: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  status: "WITHIN_TARGET" | "ABOVE_TARGET" | "MISSING_COST" | "AWAITING_ACTUALS";
};

export type FoodCostAnalysisStatusCounts = Record<
  FoodCostAnalysisSummary["status"],
  number
>;

export type ActualConsumptionSummary = {
  itemId: string;
  itemCode: string;
  itemName: string;
  movementType: string;
  quantityBaseUom: number;
  totalCost: number;
};

export type FoodCostAnalysisFilteredSummary = {
  rowCount: number;
  quantitySold: number;
  netSalesAmount: number;
  theoreticalCost: number;
  theoreticalFoodCostPercent: number | null;
};

export type ActualConsumptionFilteredSummary = {
  rowCount: number;
  quantityBaseUom: number;
  totalCost: number;
};

export type FoodCostAnalysisDashboard = {
  businessDate: string | null;
  locationName: string;
  salesImportBatches: number;
  quantitySold: number;
  netSalesAmount: number;
  theoreticalCost: number;
  theoreticalFoodCostPercent: number | null;
  actualCost: number | null;
  varianceAmount: number | null;
  variancePercent: number | null;
  actualMovementCount: number;
  actualCostSource: string;
  statusCounts: FoodCostAnalysisStatusCounts;
  actualConsumptionRows: ActualConsumptionSummary[];
  rows: FoodCostAnalysisSummary[];
};

export type RecipeCostingExportFilters = {
  q?: string;
  type?: string;
  status?: string;
};

export type FoodCostAnalysisExportFilters = {
  q?: string;
  status?: string;
  actualQ?: string;
  movementType?: string;
  businessDate?: string;
};

export type FoodCostAnalysisDashboardOptions = {
  businessDate?: string | undefined;
};

export type RecipeCreateOptions = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    baseUomId: string;
    baseUomCode: string;
  }>;
  subRecipes: Array<{
    id: string;
    recipeId: string;
    code: string;
    name: string;
    type: string;
    versionNo: number;
    servingUomId: string;
    servingUomCode: string;
  }>;
  uoms: Array<{
    id: string;
    code: string;
    name: string;
  }>;
};

const recipeVersionWorkflowSchema = z.object({
  recipeVersionId: z.string().uuid(),
  action: z.string().min(1),
  reason: z.string().trim().optional(),
  evidenceReference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().optional()
});

const menuPriceDecisionSchema = z.object({
  menuItemId: z.string().uuid(),
  requestedPrice: z.coerce.number().positive(),
  currencyCode: z.string().trim().min(3).max(3).default("PHP"),
  effectiveFrom: z.string().trim().min(1),
  effectiveTo: z.string().trim().optional(),
  reason: z.string().trim().min(1),
  evidenceReference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().optional()
});

const menuPriceDecisionWorkflowSchema = z.object({
  menuPriceDecisionId: z.string().uuid(),
  action: z.string().min(1),
  reason: z.string().trim().optional(),
  evidenceReference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().optional()
});

const createDraftRecipeSchema = z.object({
  recipeCode: z.string().trim().min(2).max(60),
  recipeName: z.string().trim().min(3).max(160),
  recipeType: z.enum(["MENU", "SUB_RECIPE", "PREP"]),
  ownerDepartment: z.string().trim().max(120).optional(),
  yieldQuantity: z.coerce.number().positive(),
  yieldUomId: z.string().uuid(),
  servingQuantity: z.coerce.number().positive(),
  servingUomId: z.string().uuid(),
  targetFoodCostPercent: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional()
});

const createDraftRecipeLineSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  uomId: z.string().uuid(),
  preparationNote: z.string().trim().max(1000).optional()
});

const createRecipeRevisionDraftSchema = z.object({
  recipeId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  yieldQuantity: z.coerce.number().positive(),
  yieldUomId: z.string().uuid(),
  servingQuantity: z.coerce.number().positive(),
  servingUomId: z.string().uuid(),
  targetFoodCostPercent: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(1).max(1000)
});

const archiveRecipeSchema = z.object({
  recipeId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000)
});

const openRecipeVersionStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "RETURNED",
  "APPROVED"
] as const;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertRecipeAccess(session: SessionContext) {
  if (!canUseRecipesAndCosting(session.permissionCodes)) {
    assertPermissionAllowed(session.permissionCodes, permissions.recipeView);
  }
}

function dateOnlyOrNull(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function timestampOrNull(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function movementCost(movement: InventoryMovementWithItem) {
  const totalCost = numberOrNull(movement.totalCost);
  if (totalCost !== null) {
    return Math.abs(totalCost);
  }
  const unitCost = numberOrNull(movement.unitCost);
  if (unitCost === null) {
    return 0;
  }
  return Math.abs(Number(movement.quantityDeltaBaseUom)) * unitCost;
}

function summarizeActualConsumption(movements: InventoryMovementWithItem[]) {
  const summaries = new Map<string, ActualConsumptionSummary>();

  for (const movement of movements) {
    const key = `${movement.itemId}:${movement.movementType}`;
    const current = summaries.get(key) ?? {
      itemId: movement.itemId,
      itemCode: movement.item.itemCode,
      itemName: movement.item.itemName,
      movementType: movement.movementType,
      quantityBaseUom: 0,
      totalCost: 0
    };
    current.quantityBaseUom += Math.abs(Number(movement.quantityDeltaBaseUom));
    current.totalCost += movementCost(movement);
    summaries.set(key, current);
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      quantityBaseUom: Number(summary.quantityBaseUom.toFixed(6)),
      totalCost: Number(summary.totalCost.toFixed(2))
    }))
    .sort((left, right) => right.totalCost - left.totalCost);
}

function normalizedFilterText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function parseBusinessDateFilter(value?: string) {
  return value ? parseDateOnlyUtc(value) : null;
}

function dateOrNull(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function dateOnlyInputOrNull(value?: string | null) {
  if (!value?.trim()) {
    return null;
  }
  return parseDateOnlyUtc(value);
}

function hasFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function parseDraftRecipeLines(formData: FormData) {
  const activeLineNumbers = new Set<number>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("line.") || !hasFormValue(value)) {
      continue;
    }
    if (/^line\.\d+\.uomId$/.test(key)) {
      continue;
    }
    const match = key.match(/^line\.(\d+)\.[A-Za-z0-9]+$/);
    if (!match) {
      throw new Error("RECIPE_LINE_INDEX_INVALID");
    }
    activeLineNumbers.add(Number(match[1]));
  }

  const sortedLineNumbers = [...activeLineNumbers].sort((left, right) => left - right);
  if (sortedLineNumbers.length === 0) {
    throw new Error("RECIPE_LINES_REQUIRED");
  }
  if (sortedLineNumbers.length > 100) {
    throw new Error("RECIPE_LINES_LIMIT_EXCEEDED");
  }

  return sortedLineNumbers.map((lineNumber, index) => {
    const line = createDraftRecipeLineSchema.parse({
      itemId: formData.get(`line.${lineNumber}.itemId`),
      quantity: formData.get(`line.${lineNumber}.quantity`),
      uomId: formData.get(`line.${lineNumber}.uomId`),
      preparationNote: formData.get(`line.${lineNumber}.preparationNote`) || undefined
    });
    return {
      ...line,
      lineNo: index + 1
    };
  });
}

function parseRevisionLineOverrides(formData: FormData) {
  const overrides = new Map<
    number,
    {
      quantity?: number;
      preparationNote?: string | null;
      remove?: boolean;
      sortOrder?: number;
    }
  >();

  for (const [key, value] of formData.entries()) {
    const match = key.match(
      /^line\.(\d+)\.(quantity|preparationNote|remove|sortOrder)$/
    );
    if (!match) {
      continue;
    }
    const lineNo = Number(match[1]);
    if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > 100) {
      throw new Error("RECIPE_LINE_INDEX_INVALID");
    }
    const current = overrides.get(lineNo) ?? {};
    if (match[2] === "quantity") {
      const quantity = Number(value);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("RECIPE_REVISION_LINE_QUANTITY_INVALID");
      }
      current.quantity = quantity;
    } else if (match[2] === "remove") {
      current.remove = hasFormValue(value);
    } else if (match[2] === "sortOrder") {
      const sortOrder = Number(value);
      if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 100) {
        throw new Error("RECIPE_LINE_SORT_ORDER_INVALID");
      }
      current.sortOrder = sortOrder;
    } else if (typeof value === "string") {
      current.preparationNote = value.trim() || null;
    }
    overrides.set(lineNo, current);
  }

  return overrides;
}

function parseRevisionAddedLines(formData: FormData) {
  const activeLineNumbers = new Set<number>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("newLine.") || !hasFormValue(value)) {
      continue;
    }
    if (/^newLine\.\d+\.uomId$/.test(key)) {
      continue;
    }
    const match = key.match(/^newLine\.(\d+)\.[A-Za-z0-9]+$/);
    if (!match) {
      throw new Error("RECIPE_LINE_INDEX_INVALID");
    }
    activeLineNumbers.add(Number(match[1]));
  }

  return [...activeLineNumbers]
    .sort((left, right) => left - right)
    .map((lineNumber) => ({
      ...createDraftRecipeLineSchema.parse({
        itemId: formData.get(`newLine.${lineNumber}.itemId`),
        quantity: formData.get(`newLine.${lineNumber}.quantity`),
        uomId: formData.get(`newLine.${lineNumber}.uomId`),
        preparationNote:
          formData.get(`newLine.${lineNumber}.preparationNote`) || undefined
      }),
      sortOrder: parseRevisionSortOrder(
        formData.get(`newLine.${lineNumber}.sortOrder`),
        lineNumber
      ),
      requestedLineNo: lineNumber
    }));
}

function parseRevisionSortOrder(value: FormDataEntryValue | null, fallback: number) {
  if (!hasFormValue(value)) {
    return fallback;
  }
  const sortOrder = Number(value);
  if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 100) {
    throw new Error("RECIPE_LINE_SORT_ORDER_INVALID");
  }
  return sortOrder;
}

function parseRevisionAddedSubRecipeLines(formData: FormData) {
  const activeLineNumbers = new Set<number>();

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("newSubRecipe.") || !hasFormValue(value)) {
      continue;
    }
    if (/^newSubRecipe\.\d+\.sortOrder$/.test(key)) {
      continue;
    }
    const match = key.match(/^newSubRecipe\.(\d+)\.[A-Za-z0-9]+$/);
    if (!match) {
      throw new Error("RECIPE_LINE_INDEX_INVALID");
    }
    activeLineNumbers.add(Number(match[1]));
  }

  return [...activeLineNumbers]
    .sort((left, right) => left - right)
    .map((lineNumber) => ({
      subRecipeVersionId: z
        .string()
        .uuid()
        .parse(formData.get(`newSubRecipe.${lineNumber}.subRecipeVersionId`)),
      quantity: z.coerce
        .number()
        .positive()
        .parse(formData.get(`newSubRecipe.${lineNumber}.quantity`)),
      preparationNote: z
        .string()
        .trim()
        .max(1000)
        .optional()
        .parse(formData.get(`newSubRecipe.${lineNumber}.preparationNote`) || undefined) ?? null,
      sortOrder: parseRevisionSortOrder(
        formData.get(`newSubRecipe.${lineNumber}.sortOrder`),
        lineNumber
      ),
      requestedLineNo: lineNumber
    }));
}

function pickEffectiveSupplierPriceSnapshot(
  priceRows: SupplierPriceSnapshot[],
  itemId: string,
  effectiveAt?: Date | null
) {
  const itemPrices = priceRows
    .filter((row) => row.itemId === itemId)
    .sort((left, right) => {
      const effectiveDelta =
        right.effectiveFrom.getTime() - left.effectiveFrom.getTime();
      return effectiveDelta !== 0
        ? effectiveDelta
        : Number(right.unitPrice) - Number(left.unitPrice);
    });

  if (itemPrices.length === 0) {
    return null;
  }

  const matchedPrice = effectiveAt
    ? itemPrices.find(
        (row) =>
          row.effectiveFrom.getTime() <= effectiveAt.getTime() &&
          (!row.effectiveTo || row.effectiveTo.getTime() > effectiveAt.getTime())
      )
    : itemPrices.find((row) => row.effectiveTo === null || row.effectiveTo === undefined);

  return matchedPrice ?? itemPrices[0] ?? null;
}

export function pickEffectiveSupplierUnitPrice(
  priceRows: SupplierPriceSnapshot[],
  itemId: string,
  effectiveAt?: Date | null
) {
  return numberOrNull(
    pickEffectiveSupplierPriceSnapshot(priceRows, itemId, effectiveAt)?.unitPrice
  );
}

export function convertRecipeQuantityToPriceUom(
  quantity: number,
  itemId: string,
  fromUomId: string,
  priceUomId: string,
  conversions: ItemUomConversionSnapshot[]
) {
  if (fromUomId === priceUomId) {
    return quantity;
  }

  const conversion = conversions.find(
    (row) =>
      row.itemId === itemId &&
      row.fromUomId === fromUomId &&
      row.toUomId === priceUomId
  );
  if (!conversion) {
    return null;
  }
  const factor = numberOrNull(conversion.conversionFactor);
  return factor === null ? null : quantity * factor;
}

export function filterRecipeCostingSummaries(
  recipes: RecipeCostingSummary[],
  filters: RecipeCostingExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const recipeType = filters.type && filters.type !== "ALL" ? filters.type : null;
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;

  return recipes.filter((recipe) => {
    const matchesSearch =
      query.length === 0 ||
      [
        recipe.recipeCode,
        recipe.recipeName,
        recipe.recipeType,
        recipe.status,
        recipe.brandName,
        recipe.menuItemName ?? "",
        ...recipe.lines.flatMap((line) => [
          line.itemCode,
          line.itemName,
          line.preparationNote ?? ""
        ])
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesType = recipeType === null || recipe.recipeType === recipeType;
    const matchesStatus = status === null || recipe.status === status;
    return matchesSearch && matchesType && matchesStatus;
  });
}

export function filterFoodCostAnalysisRows(
  rows: FoodCostAnalysisSummary[],
  filters: FoodCostAnalysisExportFilters = {}
) {
  const query = normalizedFilterText(filters.q);
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;

  return rows.filter((row) => {
    const matchesSearch =
      query.length === 0 ||
      [row.menuItemName, row.recipeName, row.status]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesStatus = status === null || row.status === status;
    return matchesSearch && matchesStatus;
  });
}

export function filterActualConsumptionRows(
  rows: ActualConsumptionSummary[],
  filters: FoodCostAnalysisExportFilters = {}
) {
  const query = normalizedFilterText(filters.actualQ);
  const movementType =
    filters.movementType && filters.movementType !== "ALL"
      ? filters.movementType
      : null;

  return rows.filter((row) => {
    const matchesSearch =
      query.length === 0 ||
      [row.itemCode, row.itemName, row.movementType]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesMovementType =
      movementType === null || row.movementType === movementType;
    return matchesSearch && matchesMovementType;
  });
}

export async function getRecipeCreateOptions(
  session: SessionContext
): Promise<RecipeCreateOptions> {
  assertRecipeAccess(session);

  const [items, subRecipes, uoms] = await Promise.all([
    prisma.item.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      include: {
        baseUom: true
      },
      orderBy: [{ itemName: "asc" }]
    }),
    prisma.recipeVersion.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "PUBLISHED",
        recipe: {
          recipeType: { in: ["SUB_RECIPE", "PREP"] },
          status: "ACTIVE",
          ...(session.context.brandId
            ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
            : {})
        }
      },
      include: {
        recipe: true,
        servingUom: true
      },
      orderBy: [{ recipe: { recipeName: "asc" } }, { versionNo: "desc" }]
    }),
    prisma.uom.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        status: "ACTIVE"
      },
      orderBy: [{ uomCode: "asc" }]
    })
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      code: item.itemCode,
      name: item.itemName,
      baseUomId: item.baseUomId,
      baseUomCode: item.baseUom.uomCode
    })),
    subRecipes: subRecipes.map((version) => ({
      id: version.id,
      recipeId: version.recipeId,
      code: version.recipe.recipeCode,
      name: version.recipe.recipeName,
      type: version.recipe.recipeType,
      versionNo: version.versionNo,
      servingUomId: version.servingUomId,
      servingUomCode: version.servingUom.uomCode
    })),
    uoms: uoms.map((uom) => ({
      id: uom.id,
      code: uom.uomCode,
      name: uom.uomName
    }))
  };
}

export async function createDraftRecipe(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.recipeManage);
  const values = createDraftRecipeSchema.parse(Object.fromEntries(formData));
  const lines = parseDraftRecipeLines(formData);
  const targetFoodCostPercent = values.targetFoodCostPercent
    ? Number(values.targetFoodCostPercent)
    : null;
  if (
    targetFoodCostPercent !== null &&
    (!Number.isFinite(targetFoodCostPercent) ||
      targetFoodCostPercent <= 0 ||
      targetFoodCostPercent > 100)
  ) {
    throw new Error("RECIPE_TARGET_FOOD_COST_INVALID");
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const scopedUomIds = new Set(
      (
        await tx.uom.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
            id: {
              in: [
                values.yieldUomId,
                values.servingUomId,
                ...lines.map((line) => line.uomId)
              ]
            }
          },
          select: { id: true }
        })
      ).map((uom) => uom.id)
    );
    if (
      !scopedUomIds.has(values.yieldUomId) ||
      !scopedUomIds.has(values.servingUomId) ||
      lines.some((line) => !scopedUomIds.has(line.uomId))
    ) {
      throw new Error("RECIPE_LINE_UOM_NOT_FOUND");
    }

    const scopedItemIds = new Set(
      (
        await tx.item.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
            id: { in: lines.map((line) => line.itemId) }
          },
          select: { id: true }
        })
      ).map((item) => item.id)
    );
    if (lines.some((line) => !scopedItemIds.has(line.itemId))) {
      throw new Error("RECIPE_LINE_ITEM_NOT_FOUND");
    }

    let created;
    try {
      created = await txAny.recipe.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          brandId: session.context.brandId || null,
          recipeCode: values.recipeCode.toUpperCase(),
          recipeName: values.recipeName,
          recipeType: values.recipeType,
          ownerDepartment: values.ownerDepartment || null,
          status: "ACTIVE",
          createdByUserId: session.user.id,
          versions: {
            create: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              versionNo: 1,
              status: "DRAFT",
              yieldQuantity: values.yieldQuantity,
              yieldUomId: values.yieldUomId,
              servingQuantity: values.servingQuantity,
              servingUomId: values.servingUomId,
              targetFoodCostPercent,
              notes: values.notes || null,
              createdByUserId: session.user.id,
              lines: {
                create: lines.map((line) => ({
                  tenantId: session.context.tenantId,
                  companyId: session.context.companyId,
                  lineNo: line.lineNo,
                  lineType: "INGREDIENT",
                  itemId: line.itemId,
                  quantity: line.quantity,
                  uomId: line.uomId,
                  preparationNote: line.preparationNote || null
                }))
              }
            }
          }
        },
        include: {
          versions: {
            orderBy: { versionNo: "desc" },
            take: 1
          }
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("RECIPE_CODE_DUPLICATE");
      }
      throw error;
    }

    const version = created.versions[0];
    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "recipe.draft_created",
        entityType: "Recipe",
        entityId: created.id,
        beforeData: {},
        afterData: {
          recipeCode: created.recipeCode,
          recipeName: created.recipeName,
          recipeType: created.recipeType,
          status: created.status,
          versionId: version?.id,
          versionStatus: version?.status,
          lineCount: lines.length
        },
        metadata: {
          brandId: created.brandId,
          lineCount: lines.length,
          boundary: "recipe_draft_create_only_no_inventory_menu_price_pos_or_finance_mutation"
        }
      }
    });

    return created;
  });

  return recipe.id;
}

export async function createRecipeRevisionDraft(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.recipeManage);
  const values = createRecipeRevisionDraftSchema.parse(Object.fromEntries(formData));
  const lineOverrides = parseRevisionLineOverrides(formData);
  const addedLines = parseRevisionAddedLines(formData);
  const addedSubRecipeLines = parseRevisionAddedSubRecipeLines(formData);
  const targetFoodCostPercent = values.targetFoodCostPercent
    ? Number(values.targetFoodCostPercent)
    : null;
  if (
    targetFoodCostPercent !== null &&
    (!Number.isFinite(targetFoodCostPercent) ||
      targetFoodCostPercent <= 0 ||
      targetFoodCostPercent > 100)
  ) {
    throw new Error("RECIPE_TARGET_FOOD_COST_INVALID");
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const current = await txAny.recipe.findFirst({
      where: {
        id: values.recipeId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId
          ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
          : {})
      },
      include: {
        versions: {
          orderBy: { versionNo: "desc" },
          include: {
            lines: {
              orderBy: { lineNo: "asc" }
            }
          }
        }
      }
    });

    if (!current) {
      throw new Error("RECIPE_NOT_FOUND");
    }
    if (current.status === "ARCHIVED") {
      throw new Error("RECIPE_ARCHIVED_NOT_EDITABLE");
    }

    const sourceVersion = current.versions.find(
      (version: { id: string }) => version.id === values.sourceVersionId
    );
    if (!sourceVersion) {
      throw new Error("RECIPE_VERSION_NOT_FOUND");
    }
    if (!sourceVersion.lines.length) {
      throw new Error("RECIPE_LINES_REQUIRED");
    }

    const openVersion = current.versions.find(
      (version: { id: string; status: string }) =>
        version.id !== sourceVersion.id &&
        openRecipeVersionStatuses.includes(
          version.status as (typeof openRecipeVersionStatuses)[number]
        )
    );
    if (openVersion) {
      throw new Error("RECIPE_OPEN_VERSION_EXISTS");
    }

    const requestedUomIds = [
      values.yieldUomId,
      values.servingUomId,
      ...addedLines.map((line) => line.uomId)
    ];
    const scopedUomIds = new Set(
      (
        await tx.uom.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            status: "ACTIVE",
            id: { in: requestedUomIds }
          },
          select: { id: true }
        })
      ).map((uom) => uom.id)
    );
    if (requestedUomIds.some((uomId) => !scopedUomIds.has(uomId))) {
      throw new Error("RECIPE_LINE_UOM_NOT_FOUND");
    }

    if (addedLines.length) {
      const scopedItemIds = new Set(
        (
          await tx.item.findMany({
            where: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              status: "ACTIVE",
              id: { in: addedLines.map((line) => line.itemId) }
            },
            select: { id: true }
          })
        ).map((item) => item.id)
      );
      if (addedLines.some((line) => !scopedItemIds.has(line.itemId))) {
        throw new Error("RECIPE_LINE_ITEM_NOT_FOUND");
      }
    }

    const subRecipeVersionById = new Map<string, { id: string; recipeId: string; servingUomId: string }>();
    if (addedSubRecipeLines.length) {
      const subRecipeVersions = await txAny.recipeVersion.findMany({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          status: "PUBLISHED",
          id: { in: addedSubRecipeLines.map((line) => line.subRecipeVersionId) },
          recipe: {
            id: { not: current.id },
            recipeType: { in: ["SUB_RECIPE", "PREP"] },
            status: "ACTIVE",
            ...(session.context.brandId
              ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
              : {})
          }
        },
        select: {
          id: true,
          recipeId: true,
          servingUomId: true
        }
      });
      for (const version of subRecipeVersions) {
        subRecipeVersionById.set(version.id, version);
      }
      if (
        addedSubRecipeLines.some(
          (line) => !subRecipeVersionById.has(line.subRecipeVersionId)
        )
      ) {
        throw new Error("RECIPE_SUB_RECIPE_VERSION_NOT_FOUND");
      }
    }

    const copiedLines = sourceVersion.lines
      .filter((line: { lineNo: number }) => !lineOverrides.get(line.lineNo)?.remove)
      .map(
        (line: {
          lineNo: number;
          lineType: string;
          itemId: string | null;
          quantity: Prisma.Decimal | number | string;
          uomId: string;
          preparationNote: string | null;
          subRecipeVersionId?: string | null;
        }) => {
          const override = lineOverrides.get(line.lineNo);
          return {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            sourceLineNo: line.lineNo,
            sortOrder: override?.sortOrder ?? line.lineNo,
            lineType: line.lineType,
            itemId: line.itemId,
            subRecipeVersionId: line.subRecipeVersionId ?? null,
            quantity: override?.quantity ?? line.quantity,
            uomId: line.uomId,
            preparationNote:
              override && "preparationNote" in override
                ? override.preparationNote
                : line.preparationNote
          };
        }
      );
    const appendedLines = addedLines.map((line) => ({
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      sourceLineNo: null,
      sortOrder: line.sortOrder,
      lineType: "INGREDIENT",
      itemId: line.itemId,
      subRecipeVersionId: null,
      quantity: line.quantity,
      uomId: line.uomId,
      preparationNote: line.preparationNote || null
    }));
    const appendedSubRecipeLines = addedSubRecipeLines.map((line) => {
      const subRecipeVersion = subRecipeVersionById.get(line.subRecipeVersionId);
      if (!subRecipeVersion) {
        throw new Error("RECIPE_SUB_RECIPE_VERSION_NOT_FOUND");
      }
      return {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        sourceLineNo: null,
        sortOrder: line.sortOrder,
        lineType: "SUB_RECIPE",
        itemId: null,
        subRecipeVersionId: subRecipeVersion.id,
        quantity: line.quantity,
        uomId: subRecipeVersion.servingUomId,
        preparationNote: line.preparationNote
      };
    });
    const finalLines = [...copiedLines, ...appendedLines, ...appendedSubRecipeLines].sort((left, right) => {
      const orderDelta = left.sortOrder - right.sortOrder;
      if (orderDelta !== 0) {
        return orderDelta;
      }
      const leftSource = left.sourceLineNo ?? Number.MAX_SAFE_INTEGER;
      const rightSource = right.sourceLineNo ?? Number.MAX_SAFE_INTEGER;
      if (leftSource !== rightSource) {
        return leftSource - rightSource;
      }
      return String(left.itemId ?? "").localeCompare(String(right.itemId ?? ""));
    });
    if (finalLines.length === 0) {
      throw new Error("RECIPE_LINES_REQUIRED");
    }
    if (finalLines.length > 100) {
      throw new Error("RECIPE_LINES_LIMIT_EXCEEDED");
    }
    const existingKeys = new Set<string>();
    for (const line of copiedLines) {
      if (!line.itemId) {
        continue;
      }
      existingKeys.add(`${line.itemId}:${line.uomId}`);
    }
    const addedKeys = new Set<string>();
    for (const line of appendedLines) {
      const duplicateKey = `${line.itemId}:${line.uomId}`;
      if (existingKeys.has(duplicateKey) || addedKeys.has(duplicateKey)) {
        throw new Error("RECIPE_DUPLICATE_LINE_NOT_ALLOWED");
      }
      addedKeys.add(duplicateKey);
    }

    const nextVersionNo =
      Math.max(
        0,
        ...current.versions.map((version: { versionNo: number }) => version.versionNo)
      ) + 1;
    const created = await txAny.recipeVersion.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        recipeId: current.id,
        versionNo: nextVersionNo,
        status: "DRAFT",
        supersedesVersionId: sourceVersion.id,
        yieldQuantity: values.yieldQuantity,
        yieldUomId: values.yieldUomId,
        servingQuantity: values.servingQuantity,
        servingUomId: values.servingUomId,
        targetFoodCostPercent,
        notes: values.notes || null,
        reason: values.reason,
        createdByUserId: session.user.id,
        lines: {
          create: finalLines.map((line, index) => ({
            tenantId: line.tenantId,
            companyId: line.companyId,
            lineNo: index + 1,
            lineType: line.lineType,
            itemId: line.itemId,
            subRecipeVersionId: line.subRecipeVersionId,
            quantity: line.quantity,
            uomId: line.uomId,
            preparationNote: line.preparationNote
          }))
        }
      }
    });

    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "recipe.revision_draft_created",
        entityType: "Recipe",
        entityId: current.id,
        beforeData: {
          sourceVersionId: sourceVersion.id,
          sourceVersionNo: sourceVersion.versionNo,
          sourceVersionStatus: sourceVersion.status
        },
        afterData: {
          revisionVersionId: created.id,
          revisionVersionNo: created.versionNo,
          revisionVersionStatus: created.status,
          sourceLineCount: sourceVersion.lines.length,
          revisionLineCount: finalLines.length
        },
        metadata: {
          brandId: current.brandId,
          reason: values.reason,
          sourceVersionId: sourceVersion.id,
          addedLineCount: appendedLines.length,
          addedSubRecipeLineCount: appendedSubRecipeLines.length,
          removedLineCount: sourceVersion.lines.length - copiedLines.length,
          updatedLineCount: copiedLines.filter((line) =>
            lineOverrides.has(line.sourceLineNo ?? -1)
          ).length,
          reorderedLineCount: finalLines.filter(
            (line, index) => line.sourceLineNo !== null && line.sourceLineNo !== index + 1
          ).length,
          boundary: "recipe_revision_draft_only_no_inventory_menu_price_pos_or_finance_mutation"
        }
      }
    });

    return current;
  });

  return recipe.id;
}

export async function archiveRecipe(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.recipeArchive);
  const values = archiveRecipeSchema.parse(Object.fromEntries(formData));

  const recipe = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const current = await txAny.recipe.findFirst({
      where: {
        id: values.recipeId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId
          ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
          : {})
      },
      include: {
        versions: {
          select: {
            id: true,
            versionNo: true,
            status: true
          }
        }
      }
    });

    if (!current) {
      throw new Error("RECIPE_NOT_FOUND");
    }
    if (current.status === "ARCHIVED") {
      throw new Error("RECIPE_ALREADY_ARCHIVED");
    }
    const openVersion = current.versions.find(
      (version: { status: string }) =>
        openRecipeVersionStatuses.includes(
          version.status as (typeof openRecipeVersionStatuses)[number]
        )
    );
    if (openVersion) {
      throw new Error("RECIPE_OPEN_VERSION_BLOCKS_ARCHIVE");
    }

    const result = await txAny.recipe.updateMany({
      where: {
        id: current.id,
        status: current.status
      },
      data: {
        status: "ARCHIVED"
      }
    });
    if (result.count !== 1) {
      throw new Error("RECIPE_ARCHIVE_CONFLICT");
    }

    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "recipe.archived",
        entityType: "Recipe",
        entityId: current.id,
        beforeData: {
          status: current.status
        },
        afterData: {
          status: "ARCHIVED"
        },
        metadata: {
          brandId: current.brandId,
          reason: values.reason,
          boundary: "recipe_archive_only_no_inventory_menu_price_pos_or_finance_mutation"
        }
      }
    });

    return current;
  });

  return recipe.id;
}

export async function createMenuPriceDecision(formData: FormData) {
  const session = await requireSessionContext();
  await requirePermission(session, permissions.menuPriceDecide);
  const values = menuPriceDecisionSchema.parse(Object.fromEntries(formData));
  const effectiveFrom = parseDateOnlyUtc(values.effectiveFrom);
  const effectiveTo = dateOnlyInputOrNull(values.effectiveTo);

  if (!effectiveFrom) {
    throw new Error("MENU_PRICE_DECISION_EFFECTIVE_RANGE_INVALID");
  }
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new Error("MENU_PRICE_DECISION_EFFECTIVE_RANGE_INVALID");
  }

  const decision = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const menuItem = await txAny.menuItem.findFirst({
      where: {
        id: values.menuItemId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        ...(session.context.brandId
          ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
          : {})
      }
    });

    if (!menuItem) {
      throw new Error("MENU_ITEM_NOT_FOUND");
    }

    if (values.idempotencyKey) {
      const existing = await txAny.menuPriceDecision.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          menuItemId: menuItem.id,
          locationId: session.context.locationId,
          idempotencyKey: values.idempotencyKey
        }
      });
      if (existing) {
        return existing;
      }
    }

    const created = await txAny.menuPriceDecision.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: menuItem.brandId,
        menuItemId: menuItem.id,
        locationId: session.context.locationId,
        requestedPrice: values.requestedPrice,
        currencyCode: values.currencyCode.toUpperCase(),
        effectiveFrom,
        effectiveTo,
        status: "DRAFT",
        requestedByUserId: session.user.id,
        reason: values.reason,
        evidenceReference: values.evidenceReference || null,
        idempotencyKey: values.idempotencyKey || null
      }
    });

    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "menu_price_decision.created",
        entityType: "MenuPriceDecision",
        entityId: created.id,
        beforeData: {},
        afterData: {
          status: created.status,
          requestedPrice: Number(created.requestedPrice),
          currencyCode: created.currencyCode,
          effectiveFrom: dateOrNull(created.effectiveFrom),
          effectiveTo: dateOrNull(created.effectiveTo)
        },
        metadata: {
          menuItemId: menuItem.id,
          menuItemCode: menuItem.menuItemCode,
          locationId: session.context.locationId,
          reason: values.reason,
          evidenceReference: values.evidenceReference,
          boundary: "menu_price_decision_only_no_recipe_inventory_pos_or_finance_mutation"
        }
      }
    });

    return created;
  });

  return decision.id;
}

export async function transitionMenuPriceDecision(formData: FormData) {
  const session = await requireSessionContext();
  const values = menuPriceDecisionWorkflowSchema.parse(Object.fromEntries(formData));

  const decision = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const current = await txAny.menuPriceDecision.findFirst({
      where: {
        id: values.menuPriceDecisionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        AND: [
          ...(session.context.brandId
            ? [{ OR: [{ brandId: null }, { brandId: session.context.brandId }] }]
            : []),
          { OR: [{ locationId: null }, { locationId: session.context.locationId }] }
        ]
      }
    });

    if (!current) {
      throw new Error("MENU_PRICE_DECISION_NOT_FOUND");
    }

    if (values.idempotencyKey) {
      const existingTransition = await txAny.operationalStatusTransition.findFirst({
        where: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          targetEntityType: "MenuPriceDecision",
          targetEntityId: current.id,
          idempotencyKey: values.idempotencyKey
        }
      });
      if (existingTransition) {
        return current;
      }
    }

    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "MENU_PRICE_DECISION",
      action: values.action,
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.reason ?? null,
      evidenceReference: values.evidenceReference ?? null
    });
    await requirePermission(session, transition.permissionCode);

    if (
      ["APPROVE", "APPLY"].includes(values.action) &&
      current.requestedByUserId === session.user.id
    ) {
      throw new Error("MENU_PRICE_DECISION_SELF_APPROVAL_BLOCKED");
    }

    const overlappingPrices =
      values.action === "APPLY"
        ? await txAny.menuPrice.findMany({
            where: {
              tenantId: session.context.tenantId,
              companyId: session.context.companyId,
              menuItemId: current.menuItemId,
              locationId: current.locationId,
              ...(current.effectiveTo
                ? { effectiveFrom: { lt: current.effectiveTo } }
                : {}),
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gt: current.effectiveFrom } }
              ]
            },
            orderBy: { effectiveFrom: "asc" }
          })
        : [];
    const overlappingPrice = overlappingPrices[0];
    const supersededPrice =
      overlappingPrices.length === 1 &&
      overlappingPrice &&
      current.effectiveTo === null &&
      overlappingPrice.effectiveTo === null &&
      overlappingPrice.effectiveFrom < current.effectiveFrom
        ? overlappingPrice
        : null;

    if (overlappingPrices.length > 0 && !supersededPrice) {
      throw new Error("MENU_PRICE_EFFECTIVE_RANGE_OVERLAP");
    }

    const now = new Date();
    const result = await txAny.menuPriceDecision.updateMany({
      where: {
        id: current.id,
        status: current.status
      },
      data: {
        status: transition.toStatus,
        ...(values.action === "APPROVE"
          ? { approvedAt: now, approvedByUserId: session.user.id }
          : {}),
        ...(values.action === "APPLY"
          ? { appliedAt: now, appliedByUserId: session.user.id }
          : {}),
        ...(values.reason ? { reason: values.reason } : {}),
        ...(values.evidenceReference
          ? { evidenceReference: values.evidenceReference }
          : {})
      }
    });
    if (result.count !== 1) {
      throw new Error("MENU_PRICE_DECISION_TRANSITION_CONFLICT");
    }

    if (values.action === "APPLY") {
      if (supersededPrice) {
        const superseded = await txAny.menuPrice.updateMany({
          where: {
            id: supersededPrice.id,
            effectiveTo: null
          },
          data: {
            effectiveTo: current.effectiveFrom,
            status: "SUPERSEDED"
          }
        });
        if (superseded.count !== 1) {
          throw new Error("MENU_PRICE_EFFECTIVE_RANGE_CONFLICT");
        }
      }
      await txAny.menuPrice.create({
        data: {
          tenantId: session.context.tenantId,
          companyId: session.context.companyId,
          menuItemId: current.menuItemId,
          locationId: current.locationId,
          decisionId: current.id,
          status: "APPLIED",
          currencyCode: current.currencyCode,
          price: current.requestedPrice,
          effectiveFrom: current.effectiveFrom,
          effectiveTo: current.effectiveTo
        }
      });
    }

    const updated = await txAny.menuPriceDecision.findUniqueOrThrow({
      where: { id: current.id }
    });

    await txAny.operationalStatusTransition.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: current.brandId,
        locationId: current.locationId,
        targetEntityType: "MenuPriceDecision",
        targetEntityId: current.id,
        action: transition.action,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorUserId: session.user.id,
        reason: values.reason ?? null,
        evidenceReference: values.evidenceReference ?? null,
        idempotencyKey: values.idempotencyKey ?? null
      }
    });

    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: `menu_price_decision.${transition.action.toLowerCase()}`,
        entityType: "MenuPriceDecision",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          approvedAt: dateOrNull(current.approvedAt),
          approvedByUserId: current.approvedByUserId,
          appliedAt: dateOrNull(current.appliedAt),
          appliedByUserId: current.appliedByUserId
        },
        afterData: {
          status: updated.status,
          approvedAt: dateOrNull(updated.approvedAt),
          approvedByUserId: updated.approvedByUserId,
          appliedAt: dateOrNull(updated.appliedAt),
          appliedByUserId: updated.appliedByUserId
        },
        metadata: {
          menuItemId: current.menuItemId,
          locationId: current.locationId,
          action: transition.action,
          reason: values.reason,
          evidenceReference: values.evidenceReference,
          idempotencyKey: values.idempotencyKey,
          boundary:
            values.action === "APPLY"
              ? "menu_price_apply_inserts_effective_dated_price_only"
              : "menu_price_decision_transition_only_no_recipe_inventory_pos_or_finance_mutation"
        }
      }
    });

    return updated;
  }, { isolationLevel: "Serializable" });

  return decision.id;
}

export function getMenuPriceDecisionActionsForStatus(
  status: string,
  permissionCodes: string[]
) {
  return getPhase2WorkflowActionsForStatus(
    "MENU_PRICE_DECISION",
    status,
    permissionCodes
  );
}

export async function transitionRecipeVersion(formData: FormData) {
  const session = await requireSessionContext();
  const values = recipeVersionWorkflowSchema.parse(Object.fromEntries(formData));

  const recipeVersion = await prisma.$transaction(async (tx) => {
    const txAny = tx as Prisma.TransactionClient & Record<string, any>;
    const current = await txAny.recipeVersion.findFirst({
      where: {
        id: values.recipeVersionId,
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        recipe: {
          ...(session.context.brandId
            ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
            : {})
        }
      },
      include: {
        recipe: true
      }
    });

    if (!current) {
      throw new Error("RECIPE_VERSION_NOT_FOUND");
    }

    if (values.idempotencyKey) {
      const existingTransition = await txAny.recipeVersionTransition.findFirst({
        where: {
          recipeVersionId: current.id,
          idempotencyKey: values.idempotencyKey
        }
      });
      if (existingTransition) {
        return current;
      }
    }

    const transition = assertPhase2WorkflowTransitionAllowed({
      domain: "RECIPE_VERSION",
      action: values.action,
      fromStatus: current.status,
      permissionCodes: session.permissionCodes,
      reason: values.reason ?? null,
      evidenceReference: values.evidenceReference ?? null
    });
    await requirePermission(session, transition.permissionCode);

    if (
      ["APPROVE", "PUBLISH"].includes(values.action) &&
      current.createdByUserId === session.user.id
    ) {
      throw new Error("RECIPE_VERSION_SELF_APPROVAL_BLOCKED");
    }

    const now = new Date();
    const result = await txAny.recipeVersion.updateMany({
      where: {
        id: current.id,
        status: current.status
      },
      data: {
        status: transition.toStatus,
        ...(values.action === "APPROVE"
          ? { approvedAt: now, approvedByUserId: session.user.id }
          : {}),
        ...(values.action === "PUBLISH"
          ? {
              publishedAt: now,
              publishedByUserId: session.user.id,
              effectiveFrom: current.effectiveFrom ?? now
            }
          : {}),
        ...(values.reason ? { reason: values.reason } : {})
      }
    });
    if (result.count !== 1) {
      throw new Error("RECIPE_VERSION_TRANSITION_CONFLICT");
    }

    if (values.action === "PUBLISH") {
      await txAny.recipeVersion.updateMany({
        where: {
          recipeId: current.recipeId,
          id: { not: current.id },
          status: "PUBLISHED"
        },
        data: {
          status: "SUPERSEDED",
          effectiveTo: now
        }
      });
      await txAny.recipe.update({
        where: { id: current.recipeId },
        data: {
          currentVersionId: current.id,
          publishedVersionId: current.id
        }
      });
    }

    const updated = await txAny.recipeVersion.findUniqueOrThrow({
      where: { id: current.id }
    });

    await txAny.recipeVersionTransition.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        brandId: current.recipe.brandId,
        recipeId: current.recipeId,
        recipeVersionId: current.id,
        action: transition.action,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorUserId: session.user.id,
        approvedByUserId: ["APPROVE", "PUBLISH"].includes(values.action)
          ? session.user.id
          : null,
        approvedAt: ["APPROVE", "PUBLISH"].includes(values.action) ? now : null,
        reason: values.reason ?? null,
        evidenceReference: values.evidenceReference ?? null,
        idempotencyKey: values.idempotencyKey ?? null
      }
    });

    await txAny.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: `recipe_version.${transition.action.toLowerCase()}`,
        entityType: "RecipeVersion",
        entityId: updated.id,
        beforeData: {
          status: current.status,
          approvedAt: dateOrNull(current.approvedAt),
          approvedByUserId: current.approvedByUserId,
          publishedAt: dateOrNull(current.publishedAt),
          publishedByUserId: current.publishedByUserId
        },
        afterData: {
          status: updated.status,
          approvedAt: dateOrNull(updated.approvedAt),
          approvedByUserId: updated.approvedByUserId,
          publishedAt: dateOrNull(updated.publishedAt),
          publishedByUserId: updated.publishedByUserId
        },
        metadata: {
          recipeId: current.recipeId,
          recipeCode: current.recipe.recipeCode,
          action: transition.action,
          reason: values.reason,
          evidenceReference: values.evidenceReference,
          idempotencyKey: values.idempotencyKey,
          boundary: "recipe_version_transition_only_no_inventory_or_finance_mutation"
        }
      }
    });

    return updated;
  });

  return recipeVersion.id;
}

export function getRecipeVersionActionsForStatus(
  status: string,
  permissionCodes: string[]
) {
  return getPhase2WorkflowActionsForStatus(
    "RECIPE_VERSION",
    status,
    permissionCodes
  );
}

export function summarizeFoodCostAnalysisRows(
  rows: FoodCostAnalysisSummary[]
): FoodCostAnalysisFilteredSummary {
  const quantitySold = Number(
    rows.reduce((total, row) => total + row.quantitySold, 0).toFixed(2)
  );
  const netSalesAmount = Number(
    rows.reduce((total, row) => total + row.netSalesAmount, 0).toFixed(2)
  );
  const theoreticalCost = Number(
    rows.reduce((total, row) => total + (row.theoreticalCost ?? 0), 0).toFixed(2)
  );

  return {
    rowCount: rows.length,
    quantitySold,
    netSalesAmount,
    theoreticalCost,
    theoreticalFoodCostPercent:
      netSalesAmount > 0
        ? Number(((theoreticalCost / netSalesAmount) * 100).toFixed(2))
        : null
  };
}

export function summarizeActualConsumptionRows(
  rows: ActualConsumptionSummary[]
): ActualConsumptionFilteredSummary {
  return {
    rowCount: rows.length,
    quantityBaseUom: Number(
      rows.reduce((total, row) => total + row.quantityBaseUom, 0).toFixed(6)
    ),
    totalCost: Number(rows.reduce((total, row) => total + row.totalCost, 0).toFixed(2))
  };
}

export async function listRecipeCostingSummaries(
  session: SessionContext
): Promise<RecipeCostingSummary[]> {
  assertRecipeAccess(session);

  const where: Prisma.RecipeWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId
      ? { OR: [{ brandId: null }, { brandId: session.context.brandId }] }
      : {})
  };

  const recipes = await prisma.recipe.findMany({
    where,
    include: {
      brand: true,
      versions: {
        orderBy: [{ versionNo: "desc" }],
        include: {
          yieldUom: true,
          servingUom: true,
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              item: true,
              subRecipeVersion: {
                include: {
                  recipe: true,
                  servingUom: true
                }
              },
              uom: true
            }
          },
          menuItems: {
            include: {
              prices: {
                where: {
                  AND: [
                    {
                      OR: [
                        { locationId: null },
                        { locationId: session.context.locationId }
                      ]
                    },
                    {
                      OR: [
                        { effectiveTo: null },
                        { effectiveTo: { gt: new Date() } }
                      ]
                    }
                  ],
                  effectiveFrom: { lte: new Date() },
                },
                orderBy: [{ locationId: "desc" }, { effectiveFrom: "desc" }]
              }
            }
          }
        }
      }
    },
    orderBy: [{ recipeName: "asc" }]
  }) as RecipeWithCostingDetails[];

  const itemIds = Array.from(
    new Set(
      recipes.flatMap((recipe) =>
        recipe.versions.flatMap((version) =>
          version.lines.flatMap((line) => (line.itemId ? [line.itemId] : []))
        )
      )
    )
  );

  const [priceRows, conversions] = itemIds.length
    ? await Promise.all([
        prisma.supplierPriceHistory.findMany({
          where: {
            tenantId: session.context.tenantId,
            companyId: session.context.companyId,
            itemId: { in: itemIds }
          },
          orderBy: [{ itemId: "asc" }, { effectiveFrom: "desc" }]
        }),
        prisma.itemUomConversion.findMany({
          where: {
            itemId: { in: itemIds }
          }
        })
      ])
    : [[], []];

  return recipes.map((recipe) => {
    const version =
      recipe.versions.find((candidate) => candidate.status === "PUBLISHED") ??
      recipe.versions[0] ??
      null;
    const menuItem = version?.menuItems[0] ?? null;
    const menuPrice = menuItem?.prices[0] ?? null;
    const selectedVersionId = version?.id ?? null;

    const lines =
      version?.lines.map((line): RecipeCostingLineSummary => {
        const quantity = Number(line.quantity);
        const effectivePrice = line.itemId
          ? pickEffectiveSupplierPriceSnapshot(priceRows, line.itemId, version.effectiveFrom)
          : null;
        const latestUnitPrice = numberOrNull(effectivePrice?.unitPrice);
        const quantityInPriceUom =
          line.itemId && effectivePrice
            ? convertRecipeQuantityToPriceUom(
                quantity,
                line.itemId,
                line.uomId,
                effectivePrice.uomId,
                conversions
              )
            : null;
        const estimatedCost =
          latestUnitPrice === null || quantityInPriceUom === null
            ? null
            : Number((quantityInPriceUom * latestUnitPrice).toFixed(2));
        const costingNote = line.subRecipeVersionId
          ? "Linked sub-recipe cost is not flattened in this slice"
          : latestUnitPrice === null
            ? "No supplier price history"
            : quantityInPriceUom === null
              ? "Missing UOM conversion to supplier price unit"
              : null;

        return {
          id: line.id,
          lineNo: line.lineNo,
          lineType: line.lineType,
          itemId: line.itemId,
          itemCode:
            line.item?.itemCode ??
            line.subRecipeVersion?.recipe.recipeCode ??
            "SUB-RECIPE",
          itemName:
            line.item?.itemName ??
            line.subRecipeVersion?.recipe.recipeName ??
            "Sub-recipe",
          quantity,
          uomId: line.uomId,
          uomCode: line.uom.uomCode,
          latestUnitPrice,
          estimatedCost,
          costingNote,
          preparationNote: line.preparationNote
        };
      }) ?? [];

    const hasPendingLineCost = lines.some((line) => line.estimatedCost === null);
    const pendingCostLineCount = lines.filter(
      (line) => line.estimatedCost === null
    ).length;
    const costedLineCount = lines.length - pendingCostLineCount;
    const estimatedRecipeCost = hasPendingLineCost
      ? null
      : Number(
          lines
            .reduce((total, line) => total + (line.estimatedCost ?? 0), 0)
            .toFixed(2)
        );
    const yieldQuantity = numberOrNull(version?.yieldQuantity);
    const servingQuantity = numberOrNull(version?.servingQuantity);
    const estimatedServingCost =
      estimatedRecipeCost !== null && yieldQuantity && servingQuantity
        ? Number(((estimatedRecipeCost / yieldQuantity) * servingQuantity).toFixed(2))
        : null;
    const currentMenuPrice = numberOrNull(menuPrice?.price);
    const estimatedFoodCostPercent =
      currentMenuPrice && estimatedServingCost !== null
        ? Number(((estimatedServingCost / currentMenuPrice) * 100).toFixed(2))
        : null;
    const estimatedGrossMargin =
      currentMenuPrice && estimatedServingCost !== null
        ? Number((currentMenuPrice - estimatedServingCost).toFixed(2))
        : null;

    return {
      id: recipe.id,
      menuItemId: menuItem?.id ?? null,
      recipeCode: recipe.recipeCode,
      recipeName: recipe.recipeName,
      recipeType: recipe.recipeType,
      brandName: recipe.brand?.name ?? "Company-wide",
      versionId: version?.id ?? null,
      versionNo: version?.versionNo ?? null,
      status: recipe.status,
      selectedVersionStatus: version?.status ?? "NO_VERSION",
      yieldQuantity,
      yieldUomId: version?.yieldUomId ?? null,
      yieldUomCode: version?.yieldUom.uomCode ?? null,
      servingQuantity,
      servingUomId: version?.servingUomId ?? null,
      servingUomCode: version?.servingUom.uomCode ?? null,
      targetFoodCostPercent: numberOrNull(version?.targetFoodCostPercent),
      estimatedRecipeCost,
      estimatedServingCost,
      currentMenuPrice,
      estimatedFoodCostPercent,
      estimatedGrossMargin,
      menuItemName: menuItem?.menuItemName ?? null,
      lineCount: lines.length,
      costedLineCount,
      pendingCostLineCount,
      costingStatus: pendingCostLineCount > 0 ? "PENDING_COST" : "COSTED",
      lines,
      versionHistory: recipe.versions.map((candidate) => ({
        id: candidate.id,
        versionNo: candidate.versionNo,
        status: candidate.status,
        effectiveFrom: dateOnlyOrNull(candidate.effectiveFrom),
        effectiveTo: dateOnlyOrNull(candidate.effectiveTo),
        approvedAt: timestampOrNull(candidate.approvedAt),
        yieldQuantity: numberOrNull(candidate.yieldQuantity),
        yieldUomCode: candidate.yieldUom.uomCode,
        servingQuantity: numberOrNull(candidate.servingQuantity),
        servingUomCode: candidate.servingUom.uomCode,
        targetFoodCostPercent: numberOrNull(candidate.targetFoodCostPercent),
        isSelectedCostingVersion: candidate.id === selectedVersionId
      })),
      openMenuPriceDecision: null
    };
  });
}

export async function getRecipeCostingSummary(session: SessionContext, recipeId: string) {
  const recipes = await listRecipeCostingSummaries(session);
  const recipe = recipes.find((candidate) => candidate.id === recipeId) ?? null;
  if (!recipe?.menuItemId) {
    return recipe;
  }

  const txAny = prisma as typeof prisma & Record<string, any>;
  const decision = await txAny.menuPriceDecision.findFirst({
    where: {
      tenantId: session.context.tenantId,
      companyId: session.context.companyId,
      menuItemId: recipe.menuItemId,
      AND: [
        ...(session.context.brandId
          ? [{ OR: [{ brandId: null }, { brandId: session.context.brandId }] }]
          : []),
        { OR: [{ locationId: null }, { locationId: session.context.locationId }] }
      ],
      status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    ...recipe,
    openMenuPriceDecision: decision
      ? {
          id: decision.id,
          status: decision.status,
          requestedPrice: Number(decision.requestedPrice),
          currencyCode: decision.currencyCode,
          effectiveFrom: dateOnlyOrNull(decision.effectiveFrom) ?? "",
          effectiveTo: dateOnlyOrNull(decision.effectiveTo),
          reason: decision.reason,
          evidenceReference: decision.evidenceReference,
          requestedByUserId: decision.requestedByUserId,
          approvedByUserId: decision.approvedByUserId,
          approvedAt: timestampOrNull(decision.approvedAt),
          appliedByUserId: decision.appliedByUserId,
          appliedAt: timestampOrNull(decision.appliedAt)
        }
      : null
  };
}

export async function buildRecipeCostingExportRows(
  session: SessionContext,
  filters: RecipeCostingExportFilters = {}
) {
  const recipes = filterRecipeCostingSummaries(
    await listRecipeCostingSummaries(session),
    filters
  );
  return [
    [
      "Recipe Code",
      "Recipe Name",
      "Recipe Type",
      "Brand",
      "Version",
      "Recipe Status",
      "Version Status",
      "Menu Item",
      "Menu Price",
      "Recipe Cost",
      "Serving Cost",
      "Food Cost Percent",
      "Gross Margin",
      "Target Food Cost Percent",
      "Costing Status",
      "Costed Line Count",
      "Pending Cost Line Count",
      "Line No",
      "Line Type",
      "Item Code",
      "Item Name",
      "Quantity",
      "UOM",
      "Latest Unit Price",
      "Estimated Line Cost",
      "Costing Note",
      "Preparation Note"
    ],
    ...recipes.flatMap((recipe) =>
      recipe.lines.map((line) => [
        recipe.recipeCode,
        recipe.recipeName,
        recipe.recipeType,
        recipe.brandName,
        recipe.versionNo ?? "",
        recipe.status,
        recipe.selectedVersionStatus,
        recipe.menuItemName ?? "",
        recipe.currentMenuPrice ?? "",
        recipe.estimatedRecipeCost ?? "",
        recipe.estimatedServingCost ?? "",
        recipe.estimatedFoodCostPercent ?? "",
        recipe.estimatedGrossMargin ?? "",
        recipe.targetFoodCostPercent ?? "",
        recipe.costingStatus,
        recipe.costedLineCount,
        recipe.pendingCostLineCount,
        line.lineNo,
        line.lineType,
        line.itemCode,
        line.itemName,
        line.quantity,
        line.uomCode,
        line.latestUnitPrice ?? "",
        line.estimatedCost ?? "",
        line.costingNote ?? "",
        line.preparationNote ?? ""
      ])
    )
  ];
}

export async function buildRecipeRevisionWorkbookRows(
  session: SessionContext,
  recipeId: string
) {
  const recipe = await getRecipeCostingSummary(session, recipeId);
  if (!recipe) {
    throw new Error("RECIPE_NOT_FOUND");
  }

  return [
    [
      "Recipe Code",
      "Recipe Name",
      "Version",
      "Version Status",
      "Line No",
      "Line Type",
      "Current Item Code",
      "Current Item Name",
      "Current Quantity",
      "Current UOM",
      "Current Prep Note",
      "Planned Sort Order",
      "Planned Quantity",
      "Planned Prep Note",
      "Remove Line",
      "New Ingredient Code",
      "New Ingredient Quantity",
      "New Ingredient UOM",
      "New Sub-Recipe Code",
      "New Sub-Recipe Version",
      "New Sub-Recipe Quantity",
      "Change Note"
    ],
    ...recipe.lines.map((line) => [
      recipe.recipeCode,
      recipe.recipeName,
      recipe.versionNo ?? "",
      recipe.selectedVersionStatus,
      line.lineNo,
      line.lineType,
      line.lineType === "INGREDIENT" ? line.itemCode : "",
      line.itemName,
      line.quantity,
      line.uomCode,
      line.preparationNote ?? "",
      line.lineNo,
      line.quantity,
      line.preparationNote ?? "",
      "N",
      "",
      "",
      "",
      line.lineType === "SUB_RECIPE" ? line.itemCode : "",
      line.lineType === "SUB_RECIPE" ? recipe.versionNo ?? "" : "",
      line.lineType === "SUB_RECIPE" ? line.quantity : "",
      "Plan changes here; apply them through Create Revision Draft."
    ]),
    [
      recipe.recipeCode,
      recipe.recipeName,
      recipe.versionNo ?? "",
      recipe.selectedVersionStatus,
      "",
      "NEW_INGREDIENT",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "ITEM-CODE",
      "0",
      "UOM",
      "",
      "",
      "",
      "Template row only. New ingredient lines are applied through a draft revision."
    ],
    [
      recipe.recipeCode,
      recipe.recipeName,
      recipe.versionNo ?? "",
      recipe.selectedVersionStatus,
      "",
      "NEW_SUB_RECIPE_LINK",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "SUB-RECIPE-CODE",
      "PUBLISHED_VERSION",
      "0",
      "Template row only. Linked sub-recipes remain link-only; recursive cost flattening is not applied."
    ]
  ];
}

export async function getFoodCostAnalysisDashboard(
  session: SessionContext,
  options: FoodCostAnalysisDashboardOptions = {}
): Promise<FoodCostAnalysisDashboard> {
  assertRecipeAccess(session);

  const selectedBusinessDate = parseBusinessDateFilter(options.businessDate);
  const salesLineWhere: Prisma.RestaurantSalesImportLineWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    batch: { status: "POSTED" },
    ...(selectedBusinessDate ? { businessDate: selectedBusinessDate } : {})
  };
  const importBatchWhere: Prisma.RestaurantSalesImportBatchWhereInput = {
    tenantId: session.context.tenantId,
    companyId: session.context.companyId,
    ...(session.context.brandId ? { brandId: session.context.brandId } : {}),
    locationId: session.context.locationId,
    status: "POSTED",
    ...(selectedBusinessDate ? { businessDate: selectedBusinessDate } : {})
  };
  const [recipes, salesLines, importBatches, location] = await Promise.all([
    listRecipeCostingSummaries(session),
    prisma.restaurantSalesImportLine.findMany({
      where: salesLineWhere,
      include: {
        menuItem: true
      },
      orderBy: [{ businessDate: "desc" }, { menuItem: { menuItemName: "asc" } }]
    }) as Promise<RestaurantSalesImportLineWithMenuItem[]>,
    prisma.restaurantSalesImportBatch.findMany({
      where: importBatchWhere,
      orderBy: [{ businessDate: "desc" }]
    }),
    prisma.location.findUnique({
      where: { id: session.context.locationId },
      select: { name: true }
    })
  ]);

  const recipeByMenuItemId = new Map(
    recipes.flatMap((recipe) => (recipe.menuItemId ? [[recipe.menuItemId, recipe]] : []))
  );
  const salesByMenuItemId = new Map<
    string,
    {
      menuItemName: string;
      quantitySold: number;
      netSalesAmount: number;
    }
  >();

  for (const line of salesLines) {
    const current = salesByMenuItemId.get(line.menuItemId) ?? {
      menuItemName: line.menuItem.menuItemName,
      quantitySold: 0,
      netSalesAmount: 0
    };
    current.quantitySold += Number(line.quantitySold);
    current.netSalesAmount += Number(line.netSalesAmount);
    salesByMenuItemId.set(line.menuItemId, current);
  }

  const rows = Array.from(salesByMenuItemId.entries())
    .map(([menuItemId, sales]) => {
      const recipe = recipeByMenuItemId.get(menuItemId);
      const theoreticalCost =
        recipe?.estimatedServingCost === null || recipe?.estimatedServingCost === undefined
          ? null
          : Number((recipe.estimatedServingCost * sales.quantitySold).toFixed(2));
      const theoreticalFoodCostPercent =
        theoreticalCost === null || sales.netSalesAmount <= 0
          ? null
          : Number(((theoreticalCost / sales.netSalesAmount) * 100).toFixed(2));
      const aboveTarget =
        theoreticalFoodCostPercent !== null &&
        recipe?.targetFoodCostPercent !== null &&
        recipe?.targetFoodCostPercent !== undefined &&
        theoreticalFoodCostPercent > recipe.targetFoodCostPercent;
      const hasTarget =
        recipe?.targetFoodCostPercent !== null &&
        recipe?.targetFoodCostPercent !== undefined;

      return {
        menuItemId,
        menuItemName: sales.menuItemName,
        recipeName: recipe?.recipeName ?? "No linked recipe",
        quantitySold: Number(sales.quantitySold.toFixed(2)),
        netSalesAmount: Number(sales.netSalesAmount.toFixed(2)),
        theoreticalCost,
        theoreticalFoodCostPercent,
        targetFoodCostPercent: recipe?.targetFoodCostPercent ?? null,
        actualCost: null,
        varianceAmount: null,
        variancePercent: null,
        status:
          theoreticalCost === null
            ? "MISSING_COST"
            : aboveTarget
              ? "ABOVE_TARGET"
              : hasTarget
                ? "WITHIN_TARGET"
                : "AWAITING_ACTUALS"
      } satisfies FoodCostAnalysisSummary;
    })
    .sort((left, right) => right.netSalesAmount - left.netSalesAmount);
  const statusCounts = rows.reduce<FoodCostAnalysisStatusCounts>(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    {
      WITHIN_TARGET: 0,
      ABOVE_TARGET: 0,
      MISSING_COST: 0,
      AWAITING_ACTUALS: 0
    }
  );

  const theoreticalCost = Number(
    rows.reduce((total, row) => total + (row.theoreticalCost ?? 0), 0).toFixed(2)
  );
  const netSalesAmount = Number(
    rows.reduce((total, row) => total + row.netSalesAmount, 0).toFixed(2)
  );
  const quantitySold = Number(
    rows.reduce((total, row) => total + row.quantitySold, 0).toFixed(2)
  );
  const latestBusinessDate = selectedBusinessDate ?? importBatches[0]?.businessDate ?? null;
  const [inventoryLocation, actualMovements] = await (async () => {
    if (!latestBusinessDate) {
      return [null, [] as InventoryMovementWithItem[]] as const;
    }

    const periodStart = new Date(latestBusinessDate);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);

    const scopedInventoryLocation = await prisma.inventoryLocation.findFirst({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!scopedInventoryLocation) {
      return [null, [] as InventoryMovementWithItem[]] as const;
    }

    const movements = (await prisma.inventoryMovement.findMany({
      where: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        inventoryLocationId: scopedInventoryLocation.id,
        movementType: { in: [...actualConsumptionMovementTypes] },
        occurredAt: {
          gte: periodStart,
          lt: periodEnd
        },
        reversalOfMovementId: null
      },
      include: {
        item: true
      },
      orderBy: [{ occurredAt: "asc" }, { movementType: "asc" }]
    })) as InventoryMovementWithItem[];

    return [scopedInventoryLocation, movements] as const;
  })();
  const actualConsumptionRows = summarizeActualConsumption(actualMovements);
  const actualCost =
    actualConsumptionRows.length === 0
      ? null
      : Number(
          actualConsumptionRows
            .reduce((total, row) => total + row.totalCost, 0)
            .toFixed(2)
        );
  const varianceAmount =
    actualCost === null ? null : Number((actualCost - theoreticalCost).toFixed(2));
  const variancePercent =
    varianceAmount === null || theoreticalCost === 0
      ? null
      : Number(((varianceAmount / theoreticalCost) * 100).toFixed(2));

  return {
    businessDate: latestBusinessDate ? latestBusinessDate.toISOString().slice(0, 10) : null,
    locationName: location?.name ?? session.context.locationName,
    salesImportBatches: importBatches.length,
    quantitySold,
    netSalesAmount,
    theoreticalCost,
    theoreticalFoodCostPercent:
      netSalesAmount > 0 ? Number(((theoreticalCost / netSalesAmount) * 100).toFixed(2)) : null,
    actualCost,
    varianceAmount,
    variancePercent,
    actualMovementCount: actualMovements.length,
    actualCostSource: inventoryLocation
      ? "Posted inventory ledger outbound movements: wastage, adjustment-out, and count-variance-out."
      : "No scoped inventory location found for actual-consumption comparison.",
    statusCounts,
    actualConsumptionRows,
    rows
  };
}

export async function buildFoodCostAnalysisExportRows(
  session: SessionContext,
  filters: FoodCostAnalysisExportFilters = {}
) {
  const dashboard = await getFoodCostAnalysisDashboard(session, {
    businessDate: filters.businessDate
  });
  const rows = filterFoodCostAnalysisRows(dashboard.rows, filters);
  const actualRows = filterActualConsumptionRows(
    dashboard.actualConsumptionRows,
    filters
  );
  const filteredSalesSummary = summarizeFoodCostAnalysisRows(rows);
  const filteredActualSummary = summarizeActualConsumptionRows(actualRows);
  return [
    [
      "Location",
      "Business Date",
      "Sales Import Batches",
      "Menu Item",
      "Recipe",
      "Quantity Sold",
      "Net Sales Amount",
      "Theoretical Cost",
      "Theoretical Food Cost Percent",
      "Target Food Cost Percent",
      "Actual Cost",
      "Variance Amount",
      "Variance Percent",
      "Actual Movement Count",
      "Actual Cost Source",
      "Within Target Rows",
      "Above Target Rows",
      "Missing Cost Rows",
      "Awaiting Actuals Rows",
      "Actual Ledger Search",
      "Actual Movement Filter",
      "Filtered Sales Rows",
      "Filtered Quantity Sold",
      "Filtered Net Sales Amount",
      "Filtered Theoretical Cost",
      "Filtered Theoretical Food Cost Percent",
      "Filtered Actual Evidence Rows",
      "Filtered Actual Quantity",
      "Filtered Actual Cost",
      "Status"
    ],
    ...rows.map((row) => [
      dashboard.locationName,
      dashboard.businessDate ?? "",
      dashboard.salesImportBatches,
      row.menuItemName,
      row.recipeName,
      row.quantitySold,
      row.netSalesAmount,
      row.theoreticalCost ?? "",
      row.theoreticalFoodCostPercent ?? "",
      row.targetFoodCostPercent ?? "",
      dashboard.actualCost ?? "",
      dashboard.varianceAmount ?? "",
      dashboard.variancePercent ?? "",
      dashboard.actualMovementCount,
      dashboard.actualCostSource,
      dashboard.statusCounts.WITHIN_TARGET,
      dashboard.statusCounts.ABOVE_TARGET,
      dashboard.statusCounts.MISSING_COST,
      dashboard.statusCounts.AWAITING_ACTUALS,
      filters.actualQ ?? "",
      filters.movementType && filters.movementType !== "ALL" ? filters.movementType : "",
      filteredSalesSummary.rowCount,
      filteredSalesSummary.quantitySold,
      filteredSalesSummary.netSalesAmount,
      filteredSalesSummary.theoreticalCost,
      filteredSalesSummary.theoreticalFoodCostPercent ?? "",
      filteredActualSummary.rowCount,
      filteredActualSummary.quantityBaseUom,
      filteredActualSummary.rowCount === 0 ? "" : filteredActualSummary.totalCost,
      row.status
    ])
  ];
}
