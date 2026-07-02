import { prisma } from "./client";

const ids = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  companyId: "00000000-0000-4000-8000-000000000002",
  brandId: "00000000-0000-4000-8000-000000000003",
  locationId: "00000000-0000-4000-8000-000000000004",
  userId: "00000000-0000-4000-8000-000000000005",
  requesterRoleId: "00000000-0000-4000-8000-000000000006",
  approverRoleId: "00000000-0000-4000-8000-000000000007",
  createPermissionId: "00000000-0000-4000-8000-000000000008",
  submitPermissionId: "00000000-0000-4000-8000-000000000009",
  approvalRuleId: "00000000-0000-4000-8000-000000000010",
  approvalRuleStepId: "00000000-0000-4000-8000-000000000011",
  approverUserId: "00000000-0000-4000-8000-000000000012",
  approvePermissionId: "00000000-0000-4000-8000-000000000013",
  adminUserId: "00000000-0000-4000-8000-000000000014",
  adminRoleId: "00000000-0000-4000-8000-000000000015",
  administerPermissionId: "00000000-0000-4000-8000-000000000016",
  secondaryAdminUserId: "00000000-0000-4000-8000-000000000901",
  chromiumScopeCandidateUserId: "00000000-0000-4000-8000-000000000017",
  mobileScopeCandidateUserId: "00000000-0000-4000-8000-000000000018",
  supplierId: "00000000-0000-4000-8000-000000000019",
  supplierContactId: "00000000-0000-4000-8000-000000000020",
  itemCategoryId: "00000000-0000-4000-8000-000000000021",
  kilogramUomId: "00000000-0000-4000-8000-000000000022",
  gramUomId: "00000000-0000-4000-8000-000000000023",
  itemId: "00000000-0000-4000-8000-000000000024",
  itemConversionId: "00000000-0000-4000-8000-000000000025",
  supplierItemLinkId: "00000000-0000-4000-8000-000000000026",
  supplierPriceHistoryId: "00000000-0000-4000-8000-000000000027",
  quoteManagePermissionId: "00000000-0000-4000-8000-000000000028",
  quoteApprovePermissionId: "00000000-0000-4000-8000-000000000029",
  quotationRecommendationApprovalRuleId: "00000000-0000-4000-8000-000000000030",
  quotationRecommendationApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000031",
  purchaseOrderViewPermissionId: "00000000-0000-4000-8000-000000000032",
  purchaseOrderCreatePermissionId: "00000000-0000-4000-8000-000000000033",
  purchaseOrderSubmitPermissionId: "00000000-0000-4000-8000-000000000034",
  purchaseOrderApprovePermissionId: "00000000-0000-4000-8000-000000000035",
  purchaseOrderApprovalRuleId: "00000000-0000-4000-8000-000000000036",
  purchaseOrderApprovalRuleStepId: "00000000-0000-4000-8000-000000000037",
  purchaseOrderIssuePermissionId: "00000000-0000-4000-8000-000000000038",
  inventoryLocationId: "00000000-0000-4000-8000-000000000039",
  receivingViewPermissionId: "00000000-0000-4000-8000-000000000040",
  receivingCreatePermissionId: "00000000-0000-4000-8000-000000000041",
  receivingPostPermissionId: "00000000-0000-4000-8000-000000000042",
  inventoryBalanceViewPermissionId: "00000000-0000-4000-8000-000000000043",
  inventoryLedgerViewPermissionId: "00000000-0000-4000-8000-000000000044",
  transferViewPermissionId: "00000000-0000-4000-8000-000000000045",
  transferCreatePermissionId: "00000000-0000-4000-8000-000000000046",
  transferSubmitPermissionId: "00000000-0000-4000-8000-000000000047",
  transferCancelPermissionId: "00000000-0000-4000-8000-000000000048",
  warehouseLocationId: "00000000-0000-4000-8000-000000000049",
  warehouseInventoryLocationId: "00000000-0000-4000-8000-000000000050",
  transferDispatchPermissionId: "00000000-0000-4000-8000-000000000051",
  transferReceivePermissionId: "00000000-0000-4000-8000-000000000052",
  stockCountViewPermissionId: "00000000-0000-4000-8000-000000000053",
  stockCountCreatePermissionId: "00000000-0000-4000-8000-000000000054",
  stockCountEnterPermissionId: "00000000-0000-4000-8000-000000000055",
  stockCountSubmitPermissionId: "00000000-0000-4000-8000-000000000056",
  stockCountReviewPermissionId: "00000000-0000-4000-8000-000000000057",
  stockCountCancelPermissionId: "00000000-0000-4000-8000-000000000058",
  purchaseOrderCancelPermissionId: "00000000-0000-4000-8000-000000000059",
  wastageViewPermissionId: "00000000-0000-4000-8000-000000000060",
  wastageCreatePermissionId: "00000000-0000-4000-8000-000000000061",
  wastageSubmitPermissionId: "00000000-0000-4000-8000-000000000062",
  wastageReviewPermissionId: "00000000-0000-4000-8000-000000000063",
  wastageCancelPermissionId: "00000000-0000-4000-8000-000000000064",
  wastageApprovePermissionId: "00000000-0000-4000-8000-000000000065",
  wastageApprovalRuleId: "00000000-0000-4000-8000-000000000066",
  wastageApprovalRuleStepId: "00000000-0000-4000-8000-000000000067",
  wastagePostPermissionId: "00000000-0000-4000-8000-000000000068",
  wastageReversePermissionId: "00000000-0000-4000-8000-000000000069",
  stockAdjustmentViewPermissionId: "00000000-0000-4000-8000-000000000070",
  stockAdjustmentCreatePermissionId: "00000000-0000-4000-8000-000000000071",
  stockAdjustmentSubmitPermissionId: "00000000-0000-4000-8000-000000000072",
  stockAdjustmentCancelPermissionId: "00000000-0000-4000-8000-000000000073",
  purchaseOrderCloseRemainingPermissionId:
    "00000000-0000-4000-8000-000000000074",
  purchaseOrderBalanceClosureApprovalRuleId:
    "00000000-0000-4000-8000-000000000075",
  purchaseOrderBalanceClosureApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000076",
  wastagePolicyId: "00000000-0000-4000-8000-000000000077",
  stockAdjustmentApprovePermissionId: "00000000-0000-4000-8000-000000000078",
  stockAdjustmentPostPermissionId: "00000000-0000-4000-8000-000000000079",
  stockAdjustmentReversePermissionId: "00000000-0000-4000-8000-000000000080",
  stockAdjustmentApprovalRuleId: "00000000-0000-4000-8000-000000000081",
  stockAdjustmentApprovalRuleStepId: "00000000-0000-4000-8000-000000000082",
  receivingReversePermissionId: "00000000-0000-4000-8000-000000000083",
  stockCountVarianceApprovalRuleId: "00000000-0000-4000-8000-000000000084",
  stockCountVarianceApprovalRuleStepId: "00000000-0000-4000-8000-000000000085",
  transferReceiptReversePermissionId: "00000000-0000-4000-8000-000000000086",
  purchaseOrderAmendPermissionId: "00000000-0000-4000-8000-000000000098",
  purchaseOrderAmendmentApprovalRuleId: "00000000-0000-4000-8000-000000000099",
  purchaseOrderAmendmentApprovalRuleStepId:
    "00000000-0000-4000-8000-000000000100",
  projectViewPermissionId: "00000000-0000-4000-8000-000000000087",
  projectCreatePermissionId: "00000000-0000-4000-8000-000000000088",
  projectManagePermissionId: "00000000-0000-4000-8000-000000000089",
  projectManageMembersPermissionId: "00000000-0000-4000-8000-000000000090",
  projectTemplateViewPermissionId: "00000000-0000-4000-8000-000000000091",
  projectTemplateConfigurePermissionId: "00000000-0000-4000-8000-000000000092",
  projectRiskCreatePermissionId: "00000000-0000-4000-8000-000000000093",
  projectRiskUpdatePermissionId: "00000000-0000-4000-8000-000000000094",
  projectRiskResolvePermissionId: "00000000-0000-4000-8000-000000000095",
  projectRiskArchivePermissionId: "00000000-0000-4000-8000-000000000096",
  transferDiscrepancySettlePermissionId: "00000000-0000-4000-8000-000000000097",
};

async function resetDemoData() {
  await prisma.projectRecordLink.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectRisk.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectBlocker.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectAttachment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectComment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTaskChecklistItem.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTaskAssignee.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectMilestone.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectActivityEvent.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTask.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectMember.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.project.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.projectTemplate.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.approvalInstanceStep.deleteMany({
    where: { approvalInstance: { companyId: ids.companyId } },
  });
  await prisma.approvalInstance.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.notification.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.goodsReceiptLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.goodsReceipt.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryTransferReceiptLine.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.inventoryTransferReceipt.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.inventoryTransferLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryTransfer.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.wastageLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.wastageReport.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockAdjustmentLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockAdjustment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockCountLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.stockCountSession.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryMovement.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.inventoryBalance.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.purchaseOrderBalanceClosure.deleteMany({
    where: { companyId: ids.companyId },
  });
  await prisma.purchaseOrderAmendment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseOrderLine.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseOrder.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.quotationRecommendation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierQuotationLine.deleteMany({
    where: { supplierQuotation: { companyId: ids.companyId } },
  });
  await prisma.supplierQuotation.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.quotationRequest.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseRequestComment.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.purchaseRequestLine.deleteMany({
    where: { purchaseRequest: { companyId: ids.companyId } },
  });
  await prisma.purchaseRequest.deleteMany({ where: { companyId: ids.companyId } });

  await prisma.auditEvent.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.operationalReasonCode.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierPriceHistory.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierItemLink.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.supplierContact.deleteMany({
    where: { supplier: { companyId: ids.companyId } },
  });
  await prisma.supplier.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.itemUomConversion.deleteMany({
    where: { item: { companyId: ids.companyId } },
  });
  await prisma.item.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.itemCategory.deleteMany({ where: { companyId: ids.companyId } });
  await prisma.uom.deleteMany({ where: { companyId: ids.companyId } });
}

async function seedOperationalReasonCodes() {
  const reasonCodes = [
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "OPENING_BALANCE",
      label: "Opening balance cutover",
      appliesTo: "OPENING_BALANCE",
      requiresEvidence: true,
      sortOrder: 10,
      notes: "Initial stock entry supported by signed count sheet or import file.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "COUNT_VARIANCE",
      label: "Approved count variance",
      appliesTo: "INCREASE,DECREASE",
      requiresEvidence: true,
      sortOrder: 20,
      notes: "Difference confirmed during a stock count review.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "SYSTEM_CORRECTION",
      label: "System correction",
      appliesTo: "INCREASE,DECREASE",
      requiresEvidence: true,
      sortOrder: 30,
      notes: "Correction for documented encoding or migration issue.",
    },
    {
      workflow: "STOCK_ADJUSTMENT",
      code: "SUPPLIER_CREDIT_RETURN",
      label: "Supplier credit or return correction",
      appliesTo: "DECREASE",
      requiresEvidence: true,
      sortOrder: 40,
      notes: "Inventory decrease tied to approved supplier return evidence.",
    },
    {
      workflow: "WASTAGE",
      code: "SPOILAGE_EXPIRY",
      label: "Spoilage or expired item",
      appliesTo: "FOOD",
      requiresEvidence: true,
      sortOrder: 10,
      notes: "Expired, spoiled, or quality-failed food item.",
    },
    {
      workflow: "WASTAGE",
      code: "PREP_TRIM_LOSS",
      label: "Preparation trim loss",
      appliesTo: "FOOD",
      requiresEvidence: false,
      sortOrder: 20,
      notes: "Normal trim loss from prep with quantity control.",
    },
    {
      workflow: "WASTAGE",
      code: "KITCHEN_ERROR",
      label: "Kitchen preparation error",
      appliesTo: "FOOD",
      requiresEvidence: true,
      sortOrder: 30,
      notes: "Batch or station error requiring management review.",
    },
    {
      workflow: "WASTAGE",
      code: "DAMAGED_PACKAGING",
      label: "Damaged packaging or storage handling",
      appliesTo: "FOOD,PACKAGING",
      requiresEvidence: true,
      sortOrder: 40,
      notes: "Damaged in storage, handling, or internal movement.",
    },
  ];

  for (const reason of reasonCodes) {
    await prisma.operationalReasonCode.upsert({
      where: {
        companyId_workflow_code: {
          companyId: ids.companyId,
          workflow: reason.workflow,
          code: reason.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        ...reason,
      },
      update: {
        label: reason.label,
        appliesTo: reason.appliesTo,
        requiresEvidence: reason.requiresEvidence,
        sortOrder: reason.sortOrder,
        notes: reason.notes,
        status: "ACTIVE",
      },
    });
  }
}

async function seedRestaurantDemoCatalog() {
  const uoms = [
    { code: "EA", name: "Each", type: "count", precision: 0 },
    { code: "PACK", name: "Pack", type: "count", precision: 0 },
    { code: "TRAY", name: "Tray", type: "count", precision: 0 },
    { code: "SACK", name: "Sack", type: "count", precision: 0 },
    { code: "L", name: "Liter", type: "volume", precision: 3 },
    { code: "CASE", name: "Case", type: "count", precision: 0 },
  ];
  const uomByCode = new Map<string, string>([
    ["KG", ids.kilogramUomId],
    ["G", ids.gramUomId],
  ]);

  for (const uom of uoms) {
    const record = await prisma.uom.upsert({
      where: {
        companyId_uomCode: {
          companyId: ids.companyId,
          uomCode: uom.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        uomCode: uom.code,
        uomName: uom.name,
        uomType: uom.type,
        decimalPrecision: uom.precision,
      },
      update: {
        uomName: uom.name,
        uomType: uom.type,
        decimalPrecision: uom.precision,
        status: "ACTIVE",
      },
    });
    uomByCode.set(uom.code, record.id);
  }

  const categories = [
    {
      code: "PROTEIN-FRESH",
      name: "Fresh Meat and Poultry",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "DRY-GOODS",
      name: "Dry Goods and Staples",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: false,
    },
    {
      code: "DAIRY-CHILLED",
      name: "Dairy and Chilled Goods",
      inventoryClass: "food",
      expiry: true,
      lot: true,
      photo: true,
    },
    {
      code: "PACKAGING",
      name: "Packaging and Disposables",
      inventoryClass: "packaging",
      expiry: false,
      lot: false,
      photo: false,
    },
  ];
  const categoryByCode = new Map<string, string>([[ "PRODUCE-FRESH", ids.itemCategoryId ]]);

  for (const category of categories) {
    const record = await prisma.itemCategory.upsert({
      where: {
        companyId_categoryCode: {
          companyId: ids.companyId,
          categoryCode: category.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        categoryCode: category.code,
        categoryName: category.name,
        inventoryClass: category.inventoryClass,
        requiresExpiryTracking: category.expiry,
        requiresLotTracking: category.lot,
        defaultWastageRequiresPhoto: category.photo,
      },
      update: {
        categoryName: category.name,
        inventoryClass: category.inventoryClass,
        requiresExpiryTracking: category.expiry,
        requiresLotTracking: category.lot,
        defaultWastageRequiresPhoto: category.photo,
        status: "ACTIVE",
      },
    });
    categoryByCode.set(category.code, record.id);
  }

  const suppliers = [
    {
      code: "LUZON-POULTRY",
      legalName: "Luzon Poultry and Meats Corporation",
      tradingName: "Luzon Poultry",
      paymentTerms: "Net 7 after verified receiving",
      contact: {
        name: "Carlo Navarro",
        role: "Sales Coordinator",
        email: "carlo.navarro@luzonpoultry.example",
        phone: "+63-917-555-0191",
      },
    },
    {
      code: "PACIFIC-PANTRY",
      legalName: "Pacific Pantry Dry Goods Inc.",
      tradingName: "Pacific Pantry",
      paymentTerms: "Net 15 after verified receiving",
      contact: {
        name: "Jessa Lim",
        role: "Account Specialist",
        email: "jessa.lim@pacificpantry.example",
        phone: "+63-917-555-0192",
      },
    },
    {
      code: "METRO-PACKAGING",
      legalName: "Metro Food Packaging Supplies",
      tradingName: "Metro Packaging",
      paymentTerms: "Net 30 after verified receiving",
      contact: {
        name: "Ramon Uy",
        role: "Customer Success Lead",
        email: "ramon.uy@metropackaging.example",
        phone: "+63-917-555-0193",
      },
    },
  ];
  const supplierByCode = new Map<string, string>([[ "FRESHFARM-MNL", ids.supplierId ]]);

  for (const supplier of suppliers) {
    const record = await prisma.supplier.upsert({
      where: {
        companyId_supplierCode: {
          companyId: ids.companyId,
          supplierCode: supplier.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierCode: supplier.code,
        legalName: supplier.legalName,
        tradingName: supplier.tradingName,
        paymentTerms: supplier.paymentTerms,
      },
      update: {
        legalName: supplier.legalName,
        tradingName: supplier.tradingName,
        paymentTerms: supplier.paymentTerms,
        status: "ACTIVE",
      },
    });
    supplierByCode.set(supplier.code, record.id);

    await prisma.supplierContact.upsert({
      where: { id: `10000000-0000-4000-8000-${supplier.code === "LUZON-POULTRY" ? "000000000191" : supplier.code === "PACIFIC-PANTRY" ? "000000000192" : "000000000193"}` },
      create: {
        id: `10000000-0000-4000-8000-${supplier.code === "LUZON-POULTRY" ? "000000000191" : supplier.code === "PACIFIC-PANTRY" ? "000000000192" : "000000000193"}`,
        supplierId: record.id,
        ...supplier.contact,
        isPrimary: true,
      },
      update: {
        supplierId: record.id,
        ...supplier.contact,
        isPrimary: true,
      },
    });
  }

  const items = [
    {
      code: "CHICKEN-THIGH-KG",
      name: "Chicken Thigh Fillet",
      category: "PROTEIN-FRESH",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "LUZON-POULTRY",
      supplierSku: "LPM-CHIX-THIGH-001",
      supplierName: "Chicken Thigh Fillet, Fresh",
      unitPrice: 215,
      leadTimeDays: 2,
    },
    {
      code: "JASMINE-RICE-25KG",
      name: "Jasmine Rice 25kg Sack",
      category: "DRY-GOODS",
      baseUom: "SACK",
      purchaseUom: "SACK",
      issueUom: "KG",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-RICE-JAS-25",
      supplierName: "Jasmine Rice, 25kg Sack",
      unitPrice: 1580,
      leadTimeDays: 3,
    },
    {
      code: "CANOLA-OIL-17L",
      name: "Canola Oil 17L Tin",
      category: "DRY-GOODS",
      baseUom: "L",
      purchaseUom: "CASE",
      issueUom: "L",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-OIL-CAN-17L",
      supplierName: "Canola Oil, 17L Tin",
      unitPrice: 2250,
      leadTimeDays: 3,
    },
    {
      code: "EGGS-TRAY-30",
      name: "Large Eggs Tray 30s",
      category: "DAIRY-CHILLED",
      baseUom: "TRAY",
      purchaseUom: "TRAY",
      issueUom: "EA",
      supplier: "LUZON-POULTRY",
      supplierSku: "LPM-EGG-L-30",
      supplierName: "Large Eggs, Tray of 30",
      unitPrice: 285,
      leadTimeDays: 1,
    },
    {
      code: "MOZZARELLA-BLOCK-KG",
      name: "Mozzarella Block",
      category: "DAIRY-CHILLED",
      baseUom: "KG",
      purchaseUom: "KG",
      issueUom: "G",
      supplier: "PACIFIC-PANTRY",
      supplierSku: "PPD-DAIRY-MOZZ-KG",
      supplierName: "Mozzarella Block",
      unitPrice: 430,
      leadTimeDays: 4,
    },
    {
      code: "TAKEOUT-BOWL-750ML",
      name: "Takeout Bowl 750ml",
      category: "PACKAGING",
      baseUom: "PACK",
      purchaseUom: "CASE",
      issueUom: "EA",
      supplier: "METRO-PACKAGING",
      supplierSku: "MFP-BOWL-750-CASE",
      supplierName: "750ml Takeout Bowl, Case",
      unitPrice: 980,
      leadTimeDays: 5,
    },
  ];

  for (const [index, item] of items.entries()) {
    const record = await prisma.item.upsert({
      where: {
        companyId_itemCode: {
          companyId: ids.companyId,
          itemCode: item.code,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        itemCode: item.code,
        itemName: item.name,
        itemCategoryId: categoryByCode.get(item.category)!,
        itemType: "inventory",
        baseUomId: uomByCode.get(item.baseUom)!,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        issueUomId: uomByCode.get(item.issueUom)!,
        trackInventory: true,
        trackExpiry: item.category !== "PACKAGING",
        trackLot: item.category !== "PACKAGING",
        requiresReceivingInspection: item.category !== "PACKAGING",
      },
      update: {
        itemName: item.name,
        itemCategoryId: categoryByCode.get(item.category)!,
        itemType: "inventory",
        baseUomId: uomByCode.get(item.baseUom)!,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        issueUomId: uomByCode.get(item.issueUom)!,
        trackInventory: true,
        trackExpiry: item.category !== "PACKAGING",
        trackLot: item.category !== "PACKAGING",
        requiresReceivingInspection: item.category !== "PACKAGING",
        status: "ACTIVE",
      },
    });

    const link = await prisma.supplierItemLink.upsert({
      where: {
        supplierId_itemId_purchaseUomId: {
          supplierId: supplierByCode.get(item.supplier)!,
          itemId: record.id,
          purchaseUomId: uomByCode.get(item.purchaseUom)!,
        },
      },
      create: {
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        purchaseUomId: uomByCode.get(item.purchaseUom)!,
        supplierSku: item.supplierSku,
        supplierItemName: item.supplierName,
        leadTimeDays: item.leadTimeDays,
        minOrderQty: 1,
        preferredRank: 1,
      },
      update: {
        supplierSku: item.supplierSku,
        supplierItemName: item.supplierName,
        leadTimeDays: item.leadTimeDays,
        minOrderQty: 1,
        preferredRank: 1,
        status: "ACTIVE",
      },
    });

    await prisma.supplierPriceHistory.upsert({
      where: {
        id: `10000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`,
      },
      create: {
        id: `10000000-0000-4000-8000-${String(index + 301).padStart(12, "0")}`,
        tenantId: ids.tenantId,
        companyId: ids.companyId,
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        supplierItemLinkId: link.id,
        uomId: uomByCode.get(item.purchaseUom)!,
        currencyCode: "PHP",
        unitPrice: item.unitPrice,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
      update: {
        supplierId: supplierByCode.get(item.supplier)!,
        itemId: record.id,
        supplierItemLinkId: link.id,
        uomId: uomByCode.get(item.purchaseUom)!,
        currencyCode: "PHP",
        unitPrice: item.unitPrice,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
      },
    });
  }
}

async function main() {
  const tenantName = process.env.DEMO_TENANT_NAME ?? "OGFI Restaurant Group";
  const companyName = process.env.DEMO_COMPANY_NAME ?? "OGFI Foods Corporation";
  const brandName = process.env.DEMO_BRAND_NAME ?? "Golden Spoon Bistro";
  const locationName = process.env.DEMO_LOCATION_NAME ?? "Golden Spoon - BGC";
  const userEmail =
    process.env.DEMO_USER_EMAIL ?? "storekeeper.bgc@ogfi.example";
  const approverEmail =
    process.env.DEMO_APPROVER_EMAIL ?? "ops.approver@ogfi.example";
  const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "erp.admin@ogfi.example";
  const shouldResetDemoData = process.env.DEMO_RESET_DATA === "true";

  if (shouldResetDemoData) {
    await resetDemoData();
    console.log("Cleared local demo operational, project, supplier, and item data.");
  }

  await prisma.tenant.upsert({
    where: { id: ids.tenantId },
    create: {
      id: ids.tenantId,
      name: tenantName,
      defaultTimezone: "Asia/Manila",
    },
    update: {
      name: tenantName,
    },
  });

  await prisma.company.upsert({
    where: { id: ids.companyId },
    create: {
      id: ids.companyId,
      tenantId: ids.tenantId,
      code: "OGFI",
      legalName: companyName,
      tradingName: companyName,
      currencyCode: "PHP",
      timezone: "Asia/Manila",
    },
    update: {
      code: "OGFI",
      legalName: companyName,
      tradingName: companyName,
    },
  });

  await prisma.brand.upsert({
    where: { id: ids.brandId },
    create: {
      id: ids.brandId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "GSB",
      name: brandName,
    },
    update: {
      code: "GSB",
      name: brandName,
    },
  });

  await prisma.location.upsert({
    where: { id: ids.locationId },
    create: {
      id: ids.locationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      brandId: ids.brandId,
      code: "GSB-BGC",
      name: locationName,
      locationType: "BRANCH",
      timezone: "Asia/Manila",
    },
    update: {
      code: "GSB-BGC",
      name: locationName,
    },
  });

  await prisma.location.upsert({
    where: { id: ids.warehouseLocationId },
    create: {
      id: ids.warehouseLocationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      code: "MAIN-WAREHOUSE",
      name: "Main Warehouse",
      locationType: "WAREHOUSE",
      timezone: "Asia/Manila",
    },
    update: {
      name: "Main Warehouse",
      status: "ACTIVE",
    },
  });

  await prisma.inventoryLocation.upsert({
    where: { id: ids.inventoryLocationId },
    create: {
      id: ids.inventoryLocationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.locationId,
      code: "GSB-BGC-STOCK",
      name: `${locationName} Dry and Cold Storage`,
      storageType: "DEFAULT",
    },
    update: {
      code: "GSB-BGC-STOCK",
      name: `${locationName} Dry and Cold Storage`,
      status: "ACTIVE",
    },
  });

  await prisma.inventoryLocation.upsert({
    where: { id: ids.warehouseInventoryLocationId },
    create: {
      id: ids.warehouseInventoryLocationId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      locationId: ids.warehouseLocationId,
      code: "MAIN-WAREHOUSE-STOCK",
      name: "Main Warehouse Dry and Cold Storage",
      storageType: "DEFAULT",
    },
    update: {
      name: "Main Warehouse Dry and Cold Storage",
      status: "ACTIVE",
    },
  });

  await prisma.supplier.upsert({
    where: { id: ids.supplierId },
    create: {
      id: ids.supplierId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierCode: "FRESHFARM-MNL",
      legalName: "FreshFarm Produce Trading Corporation",
      tradingName: "FreshFarm Manila",
      paymentTerms: "Net 15 after verified receiving",
    },
    update: {
      supplierCode: "FRESHFARM-MNL",
      legalName: "FreshFarm Produce Trading Corporation",
      tradingName: "FreshFarm Manila",
      paymentTerms: "Net 15 after verified receiving",
    },
  });

  await prisma.supplierContact.upsert({
    where: { id: ids.supplierContactId },
    create: {
      id: ids.supplierContactId,
      supplierId: ids.supplierId,
      name: "Mara Santos",
      role: "Key Account Manager",
      email: "mara.santos@freshfarm.example",
      phone: "+63-917-555-0184",
      isPrimary: true,
    },
    update: {
      name: "Mara Santos",
      role: "Key Account Manager",
      email: "mara.santos@freshfarm.example",
      phone: "+63-917-555-0184",
      isPrimary: true,
    },
  });

  await prisma.itemCategory.upsert({
    where: { id: ids.itemCategoryId },
    create: {
      id: ids.itemCategoryId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      categoryCode: "PRODUCE-FRESH",
      categoryName: "Fresh Produce",
      inventoryClass: "food",
      requiresExpiryTracking: true,
      requiresLotTracking: true,
      defaultWastageRequiresPhoto: true,
    },
    update: {
      categoryCode: "PRODUCE-FRESH",
      categoryName: "Fresh Produce",
      inventoryClass: "food",
      requiresExpiryTracking: true,
      requiresLotTracking: true,
      defaultWastageRequiresPhoto: true,
    },
  });

  await prisma.uom.upsert({
    where: {
      companyId_uomCode: {
        companyId: ids.companyId,
        uomCode: "KG",
      },
    },
    create: {
      id: ids.kilogramUomId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      uomCode: "KG",
      uomName: "Kilogram",
      uomType: "weight",
      decimalPrecision: 3,
    },
    update: {
      uomName: "Kilogram",
      uomType: "weight",
      decimalPrecision: 3,
    },
  });

  await prisma.uom.upsert({
    where: {
      companyId_uomCode: {
        companyId: ids.companyId,
        uomCode: "G",
      },
    },
    create: {
      id: ids.gramUomId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      uomCode: "G",
      uomName: "Gram",
      uomType: "weight",
      decimalPrecision: 0,
    },
    update: {
      uomName: "Gram",
      uomType: "weight",
      decimalPrecision: 0,
    },
  });

  await prisma.item.upsert({
    where: { id: ids.itemId },
    create: {
      id: ids.itemId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      itemCode: "TOMATO-ROMA-KG",
      itemName: "Roma Tomato",
      itemCategoryId: ids.itemCategoryId,
      itemType: "inventory",
      baseUomId: ids.kilogramUomId,
      purchaseUomId: ids.kilogramUomId,
      issueUomId: ids.gramUomId,
      trackInventory: true,
      trackExpiry: true,
      trackLot: true,
      requiresReceivingInspection: true,
    },
    update: {
      itemCode: "TOMATO-ROMA-KG",
      itemName: "Roma Tomato",
      itemCategoryId: ids.itemCategoryId,
      itemType: "inventory",
      baseUomId: ids.kilogramUomId,
      purchaseUomId: ids.kilogramUomId,
      issueUomId: ids.gramUomId,
      trackInventory: true,
      trackExpiry: true,
      trackLot: true,
      requiresReceivingInspection: true,
    },
  });

  await prisma.itemUomConversion.upsert({
    where: {
      itemId_fromUomId_toUomId: {
        itemId: ids.itemId,
        fromUomId: ids.kilogramUomId,
        toUomId: ids.gramUomId,
      },
    },
    create: {
      id: ids.itemConversionId,
      itemId: ids.itemId,
      fromUomId: ids.kilogramUomId,
      toUomId: ids.gramUomId,
      conversionFactor: 1000,
      roundingRule: "none",
    },
    update: {
      conversionFactor: 1000,
      roundingRule: "none",
    },
  });

  await prisma.supplierItemLink.upsert({
    where: {
      supplierId_itemId_purchaseUomId: {
        supplierId: ids.supplierId,
        itemId: ids.itemId,
        purchaseUomId: ids.kilogramUomId,
      },
    },
    create: {
      id: ids.supplierItemLinkId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierId: ids.supplierId,
      itemId: ids.itemId,
      purchaseUomId: ids.kilogramUomId,
      supplierSku: "FFM-ROMA-TOM-001",
      supplierItemName: "Roma Tomato, Grade A",
      leadTimeDays: 3,
      minOrderQty: 1,
      preferredRank: 1,
    },
    update: {
      supplierSku: "FFM-ROMA-TOM-001",
      supplierItemName: "Roma Tomato, Grade A",
      leadTimeDays: 3,
      minOrderQty: 1,
      preferredRank: 1,
      status: "ACTIVE",
    },
  });

  await prisma.supplierPriceHistory.upsert({
    where: { id: ids.supplierPriceHistoryId },
    create: {
      id: ids.supplierPriceHistoryId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      supplierId: ids.supplierId,
      itemId: ids.itemId,
      supplierItemLinkId: ids.supplierItemLinkId,
      uomId: ids.kilogramUomId,
      currencyCode: "PHP",
      unitPrice: 128,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
    update: {
      supplierItemLinkId: ids.supplierItemLinkId,
      uomId: ids.kilogramUomId,
      currencyCode: "PHP",
      unitPrice: 128,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  await seedRestaurantDemoCatalog();

  await prisma.user.upsert({
    where: { id: ids.userId },
    create: {
      id: ids.userId,
      tenantId: ids.tenantId,
      email: userEmail,
      displayName: "Bianca Reyes",
    },
    update: {
      email: userEmail,
      displayName: "Bianca Reyes",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.chromiumScopeCandidateUserId },
    create: {
      id: ids.chromiumScopeCandidateUserId,
      tenantId: ids.tenantId,
      email: "branch.runner.bgc@ogfi.example",
      displayName: "Paolo Cruz",
    },
    update: {
      email: "branch.runner.bgc@ogfi.example",
      displayName: "Paolo Cruz",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.mobileScopeCandidateUserId },
    create: {
      id: ids.mobileScopeCandidateUserId,
      tenantId: ids.tenantId,
      email: "inventory.clerk.bgc@ogfi.example",
      displayName: "Lia Mendoza",
    },
    update: {
      email: "inventory.clerk.bgc@ogfi.example",
      displayName: "Lia Mendoza",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.adminUserId },
    create: {
      id: ids.adminUserId,
      tenantId: ids.tenantId,
      email: adminEmail,
      displayName: "Nico Valdez",
    },
    update: {
      email: adminEmail,
      displayName: "Nico Valdez",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.secondaryAdminUserId },
    create: {
      id: ids.secondaryAdminUserId,
      tenantId: ids.tenantId,
      email: "systems.admin@ogfi.example",
      displayName: "Mara dela Cruz",
    },
    update: {
      email: "systems.admin@ogfi.example",
      displayName: "Mara dela Cruz",
      status: "ACTIVE",
    },
  });

  await prisma.user.upsert({
    where: { id: ids.approverUserId },
    create: {
      id: ids.approverUserId,
      tenantId: ids.tenantId,
      email: approverEmail,
      displayName: "Alyssa Tan",
    },
    update: {
      email: approverEmail,
      displayName: "Alyssa Tan",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_REQUESTER",
      },
    },
    create: {
      id: ids.requesterRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_REQUESTER",
      name: "Branch Storekeeper",
    },
    update: {
      name: "Branch Storekeeper",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_APPROVER",
      },
    },
    create: {
      id: ids.approverRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_APPROVER",
      name: "Operations Approver",
    },
    update: {
      name: "Operations Approver",
    },
  });

  await prisma.role.upsert({
    where: {
      tenantId_code: {
        tenantId: ids.tenantId,
        code: "CONFIGURED_ADMIN",
      },
    },
    create: {
      id: ids.adminRoleId,
      tenantId: ids.tenantId,
      code: "CONFIGURED_ADMIN",
      name: "ERP Administrator",
    },
    update: {
      name: "ERP Administrator",
    },
  });

  await prisma.permission.upsert({
    where: { code: "core.administer" },
    create: {
      id: ids.administerPermissionId,
      code: "core.administer",
      module: "core",
      action: "administer",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.create" },
    create: {
      id: ids.createPermissionId,
      code: "purchasing.purchase_request.create",
      module: "purchasing",
      action: "purchase_request.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.approve" },
    create: {
      id: ids.approvePermissionId,
      code: "purchasing.purchase_request.approve",
      module: "purchasing",
      action: "purchase_request.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_request.submit" },
    create: {
      id: ids.submitPermissionId,
      code: "purchasing.purchase_request.submit",
      module: "purchasing",
      action: "purchase_request.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.quote.manage" },
    create: {
      id: ids.quoteManagePermissionId,
      code: "purchasing.quote.manage",
      module: "purchasing",
      action: "quote.manage",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.quote.approve" },
    create: {
      id: ids.quoteApprovePermissionId,
      code: "purchasing.quote.approve",
      module: "purchasing",
      action: "quote.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.view" },
    create: {
      id: ids.purchaseOrderViewPermissionId,
      code: "purchasing.purchase_order.view",
      module: "purchasing",
      action: "purchase_order.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.create" },
    create: {
      id: ids.purchaseOrderCreatePermissionId,
      code: "purchasing.purchase_order.create",
      module: "purchasing",
      action: "purchase_order.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.submit" },
    create: {
      id: ids.purchaseOrderSubmitPermissionId,
      code: "purchasing.purchase_order.submit",
      module: "purchasing",
      action: "purchase_order.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.approve" },
    create: {
      id: ids.purchaseOrderApprovePermissionId,
      code: "purchasing.purchase_order.approve",
      module: "purchasing",
      action: "purchase_order.approve",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.issue" },
    create: {
      id: ids.purchaseOrderIssuePermissionId,
      code: "purchasing.purchase_order.issue",
      module: "purchasing",
      action: "purchase_order.issue",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.cancel" },
    create: {
      id: ids.purchaseOrderCancelPermissionId,
      code: "purchasing.purchase_order.cancel",
      module: "purchasing",
      action: "purchase_order.cancel",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.close_remaining" },
    create: {
      id: ids.purchaseOrderCloseRemainingPermissionId,
      code: "purchasing.purchase_order.close_remaining",
      module: "purchasing",
      action: "purchase_order.close_remaining",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "purchasing.purchase_order.amend" },
    create: {
      id: ids.purchaseOrderAmendPermissionId,
      code: "purchasing.purchase_order.amend",
      module: "purchasing",
      action: "purchase_order.amend",
      description:
        "Request controlled amendments for issued, unreceived purchase orders",
    },
    update: {
      module: "purchasing",
      action: "purchase_order.amend",
      description:
        "Request controlled amendments for issued, unreceived purchase orders",
    },
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.view" },
    create: {
      id: ids.receivingViewPermissionId,
      code: "inventory.receiving.view",
      module: "inventory",
      action: "receiving.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.balance.view" },
    create: {
      id: ids.inventoryBalanceViewPermissionId,
      code: "inventory.balance.view",
      module: "inventory",
      action: "balance.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.ledger.view" },
    create: {
      id: ids.inventoryLedgerViewPermissionId,
      code: "inventory.ledger.view",
      module: "inventory",
      action: "ledger.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.view" },
    create: {
      id: ids.transferViewPermissionId,
      code: "inventory.transfer.view",
      module: "inventory",
      action: "transfer.view",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.create" },
    create: {
      id: ids.transferCreatePermissionId,
      code: "inventory.transfer.create",
      module: "inventory",
      action: "transfer.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.submit" },
    create: {
      id: ids.transferSubmitPermissionId,
      code: "inventory.transfer.submit",
      module: "inventory",
      action: "transfer.submit",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.cancel" },
    create: {
      id: ids.transferCancelPermissionId,
      code: "inventory.transfer.cancel",
      module: "inventory",
      action: "transfer.cancel",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.dispatch" },
    create: {
      id: ids.transferDispatchPermissionId,
      code: "inventory.transfer.dispatch",
      module: "inventory",
      action: "transfer.dispatch",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.receive" },
    create: {
      id: ids.transferReceivePermissionId,
      code: "inventory.transfer.receive",
      module: "inventory",
      action: "transfer.receive",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.receipt.reverse" },
    create: {
      id: ids.transferReceiptReversePermissionId,
      code: "inventory.transfer.receipt.reverse",
      module: "inventory",
      action: "transfer.receipt.reverse",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.transfer.discrepancy.settle" },
    create: {
      id: ids.transferDiscrepancySettlePermissionId,
      code: "inventory.transfer.discrepancy.settle",
      module: "inventory",
      action: "transfer.discrepancy.settle",
    },
    update: {},
  });

  const stockCountPermissions = [
    {
      id: ids.stockCountViewPermissionId,
      code: "inventory.stock_count.view",
      action: "stock_count.view",
    },
    {
      id: ids.stockCountCreatePermissionId,
      code: "inventory.stock_count.create",
      action: "stock_count.create",
    },
    {
      id: ids.stockCountEnterPermissionId,
      code: "inventory.stock_count.enter",
      action: "stock_count.enter",
    },
    {
      id: ids.stockCountSubmitPermissionId,
      code: "inventory.stock_count.submit",
      action: "stock_count.submit",
    },
    {
      id: ids.stockCountReviewPermissionId,
      code: "inventory.stock_count.review",
      action: "stock_count.review",
    },
    {
      id: ids.stockCountCancelPermissionId,
      code: "inventory.stock_count.cancel",
      action: "stock_count.cancel",
    },
  ];
  for (const permission of stockCountPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  const wastagePermissions = [
    {
      id: ids.wastageViewPermissionId,
      code: "inventory.wastage.view",
      action: "wastage.view",
    },
    {
      id: ids.wastageCreatePermissionId,
      code: "inventory.wastage.create",
      action: "wastage.create",
    },
    {
      id: ids.wastageSubmitPermissionId,
      code: "inventory.wastage.submit",
      action: "wastage.submit",
    },
    {
      id: ids.wastageApprovePermissionId,
      code: "inventory.wastage.approve",
      action: "wastage.approve",
    },
    {
      id: ids.wastagePostPermissionId,
      code: "inventory.wastage.post",
      action: "wastage.post",
    },
    {
      id: ids.wastageReversePermissionId,
      code: "inventory.wastage.reverse",
      action: "wastage.reverse",
    },
    {
      id: ids.wastageReviewPermissionId,
      code: "inventory.wastage.review",
      action: "wastage.review",
    },
    {
      id: ids.wastageCancelPermissionId,
      code: "inventory.wastage.cancel",
      action: "wastage.cancel",
    },
  ];
  for (const permission of wastagePermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  const stockAdjustmentPermissions = [
    {
      id: ids.stockAdjustmentViewPermissionId,
      code: "inventory.stock_adjustment.view",
      action: "stock_adjustment.view",
    },
    {
      id: ids.stockAdjustmentCreatePermissionId,
      code: "inventory.stock_adjustment.create",
      action: "stock_adjustment.create",
    },
    {
      id: ids.stockAdjustmentSubmitPermissionId,
      code: "inventory.stock_adjustment.submit",
      action: "stock_adjustment.submit",
    },
    {
      id: ids.stockAdjustmentApprovePermissionId,
      code: "inventory.stock_adjustment.approve",
      action: "stock_adjustment.approve",
    },
    {
      id: ids.stockAdjustmentPostPermissionId,
      code: "inventory.stock_adjustment.post",
      action: "stock_adjustment.post",
    },
    {
      id: ids.stockAdjustmentReversePermissionId,
      code: "inventory.stock_adjustment.reverse",
      action: "stock_adjustment.reverse",
    },
    {
      id: ids.stockAdjustmentCancelPermissionId,
      code: "inventory.stock_adjustment.cancel",
      action: "stock_adjustment.cancel",
    },
  ];
  for (const permission of stockAdjustmentPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "inventory",
        action: permission.action,
      },
      update: {},
    });
  }

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.create" },
    create: {
      id: ids.receivingCreatePermissionId,
      code: "inventory.receiving.create",
      module: "inventory",
      action: "receiving.create",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.post" },
    create: {
      id: ids.receivingPostPermissionId,
      code: "inventory.receiving.post",
      module: "inventory",
      action: "receiving.post",
    },
    update: {},
  });

  await prisma.permission.upsert({
    where: { code: "inventory.receiving.reverse" },
    create: {
      id: ids.receivingReversePermissionId,
      code: "inventory.receiving.reverse",
      module: "inventory",
      action: "receiving.reverse",
    },
    update: {},
  });

  const projectPermissions = [
    {
      id: ids.projectViewPermissionId,
      code: "projects.project.view",
      action: "project.view",
    },
    {
      id: ids.projectCreatePermissionId,
      code: "projects.project.create",
      action: "project.create",
    },
    {
      id: ids.projectManagePermissionId,
      code: "projects.project.manage",
      action: "project.manage",
    },
    {
      id: ids.projectManageMembersPermissionId,
      code: "projects.project.manage_members",
      action: "project.manage_members",
    },
    {
      id: ids.projectRiskCreatePermissionId,
      code: "projects.risk.create",
      action: "risk.create",
    },
    {
      id: ids.projectRiskUpdatePermissionId,
      code: "projects.risk.update",
      action: "risk.update",
    },
    {
      id: ids.projectRiskResolvePermissionId,
      code: "projects.risk.resolve",
      action: "risk.resolve",
    },
    {
      id: ids.projectRiskArchivePermissionId,
      code: "projects.risk.archive",
      action: "risk.archive",
    },
    {
      id: ids.projectTemplateViewPermissionId,
      code: "projects.template.view",
      action: "template.view",
    },
    {
      id: ids.projectTemplateConfigurePermissionId,
      code: "projects.template.configure",
      action: "template.configure",
    },
  ];
  for (const permission of projectPermissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: permission.id,
        code: permission.code,
        module: "projects",
        action: permission.action,
      },
      update: {},
    });
  }

  await prisma.rolePermission.createMany({
    data: [
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.createPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.submitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.wastageSubmitPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentCreatePermissionId,
      },
      {
        roleId: ids.requesterRoleId,
        permissionId: ids.stockAdjustmentSubmitPermissionId,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: [
      {
        roleId: ids.approverRoleId,
        permissionId: ids.approvePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.quoteApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.purchaseOrderApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.wastageReviewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.stockAdjustmentApprovePermissionId,
      },
      {
        roleId: ids.approverRoleId,
        permissionId: ids.transferDiscrepancySettlePermissionId,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.rolePermission.createMany({
    data: [
      {
        roleId: ids.adminRoleId,
        permissionId: ids.administerPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.quoteManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.createPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.submitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.approvePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.quoteApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderIssuePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderCloseRemainingPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.purchaseOrderAmendPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.inventoryBalanceViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.inventoryLedgerViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferDispatchPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferReceivePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferReceiptReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.transferDiscrepancySettlePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountEnterPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockCountCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastagePostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageReviewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.wastageCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentSubmitPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentApprovePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentPostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.stockAdjustmentCancelPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingPostPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.receivingReversePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectManagePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectManageMembersPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskCreatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskUpdatePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskResolvePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectRiskArchivePermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectTemplateViewPermissionId,
      },
      {
        roleId: ids.adminRoleId,
        permissionId: ids.projectTemplateConfigurePermissionId,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.userRoleAssignment.deleteMany({
    where: {
      userId: {
        in: [
          ids.userId,
          ids.approverUserId,
          ids.adminUserId,
          ids.secondaryAdminUserId,
          ids.chromiumScopeCandidateUserId,
          ids.mobileScopeCandidateUserId,
        ],
      },
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.userId,
      roleId: ids.requesterRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.approverUserId,
      roleId: ids.approverRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.adminUserId,
      roleId: ids.adminRoleId,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      userId: ids.secondaryAdminUserId,
      roleId: ids.adminRoleId,
    },
  });

  await prisma.userScopeAssignment.deleteMany({
    where: {
      userId: {
        in: [
          ids.userId,
          ids.approverUserId,
          ids.adminUserId,
          ids.secondaryAdminUserId,
          ids.chromiumScopeCandidateUserId,
          ids.mobileScopeCandidateUserId,
        ],
      },
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.userId,
      scopeType: "LOCATION",
      scopeId: ids.locationId,
      accessLevel: "OPERATE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.approverUserId,
      scopeType: "LOCATION",
      scopeId: ids.locationId,
      accessLevel: "APPROVE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.adminUserId,
      scopeType: "LOCATION",
      scopeId: ids.locationId,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.adminUserId,
      scopeType: "LOCATION",
      scopeId: ids.warehouseLocationId,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.adminUserId,
      scopeType: "COMPANY",
      scopeId: ids.companyId,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.secondaryAdminUserId,
      scopeType: "LOCATION",
      scopeId: ids.locationId,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.secondaryAdminUserId,
      scopeType: "LOCATION",
      scopeId: ids.warehouseLocationId,
      accessLevel: "MANAGE",
    },
  });
  await prisma.userScopeAssignment.create({
    data: {
      userId: ids.secondaryAdminUserId,
      scopeType: "COMPANY",
      scopeId: ids.companyId,
      accessLevel: "MANAGE",
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.approvalRuleId },
    create: {
      id: ids.approvalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PURCHASE_REQUEST",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
      },
    },
    update: {
      transactionType: "PURCHASE_REQUEST",
      isActive: true,
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.approvalRuleStepId },
    create: {
      id: ids.approvalRuleStepId,
      approvalRuleId: ids.approvalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.quotationRecommendationApprovalRuleId },
    create: {
      id: ids.quotationRecommendationApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "QuotationRecommendation",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        od04Pending: true,
        appliesTo: "supplier_selection",
      },
    },
    update: {
      transactionType: "QuotationRecommendation",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        od04Pending: true,
        appliesTo: "supplier_selection",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.quotationRecommendationApprovalRuleStepId },
    create: {
      id: ids.quotationRecommendationApprovalRuleStepId,
      approvalRuleId: ids.quotationRecommendationApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.quotationRecommendationApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderApprovalRuleId },
    create: {
      id: ids.purchaseOrderApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrder",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_approval",
      },
    },
    update: {
      transactionType: "PurchaseOrder",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderBalanceClosureApprovalRuleId },
    create: {
      id: ids.purchaseOrderBalanceClosureApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrderBalanceClosure",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_remaining_balance_closure",
      },
    },
    update: {
      transactionType: "PurchaseOrderBalanceClosure",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "po_remaining_balance_closure",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderBalanceClosureApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderBalanceClosureApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderBalanceClosureApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderBalanceClosureApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.purchaseOrderAmendmentApprovalRuleId },
    create: {
      id: ids.purchaseOrderAmendmentApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "PurchaseOrderAmendment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "issued_unreceived_po_amendment",
      },
    },
    update: {
      transactionType: "PurchaseOrderAmendment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "issued_unreceived_po_amendment",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.purchaseOrderAmendmentApprovalRuleStepId },
    create: {
      id: ids.purchaseOrderAmendmentApprovalRuleStepId,
      approvalRuleId: ids.purchaseOrderAmendmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.purchaseOrderAmendmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.wastageApprovalRuleId },
    create: {
      id: ids.wastageApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "WastageReport",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_wastage_approval",
      },
    },
    update: {
      transactionType: "WastageReport",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_wastage_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.wastageApprovalRuleStepId },
    create: {
      id: ids.wastageApprovalRuleStepId,
      approvalRuleId: ids.wastageApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.wastageApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.stockAdjustmentApprovalRuleId },
    create: {
      id: ids.stockAdjustmentApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "StockAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_stock_adjustment_approval",
      },
    },
    update: {
      transactionType: "StockAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "non_posting_stock_adjustment_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.stockAdjustmentApprovalRuleStepId },
    create: {
      id: ids.stockAdjustmentApprovalRuleStepId,
      approvalRuleId: ids.stockAdjustmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.stockAdjustmentApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.approvalRule.upsert({
    where: { id: ids.stockCountVarianceApprovalRuleId },
    create: {
      id: ids.stockCountVarianceApprovalRuleId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      transactionType: "StockCountVarianceAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "count_variance_stock_adjustment_approval",
      },
    },
    update: {
      transactionType: "StockCountVarianceAdjustment",
      priority: 100,
      isActive: true,
      scopeFilters: {
        source: "local-demo-sample-data",
        appliesTo: "count_variance_stock_adjustment_approval",
      },
    },
  });

  await prisma.approvalRuleStep.upsert({
    where: { id: ids.stockCountVarianceApprovalRuleStepId },
    create: {
      id: ids.stockCountVarianceApprovalRuleStepId,
      approvalRuleId: ids.stockCountVarianceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
    update: {
      approvalRuleId: ids.stockCountVarianceApprovalRuleId,
      stepOrder: 1,
      approverType: "ROLE",
      roleId: ids.approverRoleId,
      required: true,
    },
  });

  await prisma.wastagePolicy.upsert({
    where: { id: ids.wastagePolicyId },
    create: {
      id: ids.wastagePolicyId,
      tenantId: ids.tenantId,
      companyId: ids.companyId,
      name: "Default wastage evidence and repeat-loss policy",
      policyVersion: "2026-06-demo",
      priority: 100,
      isActive: true,
      minimumEstimatedCost: 5000,
      requiresEvidence: true,
      repeatLookbackDays: 30,
      repeatItemLocationCount: 3,
      repeatReporterCount: 5,
      notes:
        "Demo policy: high-value wastage requires evidence and repeat patterns are flagged for review.",
    },
    update: {
      name: "Default wastage evidence and repeat-loss policy",
      policyVersion: "2026-06-demo",
      priority: 100,
      isActive: true,
      minimumEstimatedCost: 5000,
      requiresEvidence: true,
      repeatLookbackDays: 30,
      repeatItemLocationCount: 3,
      repeatReporterCount: 5,
      notes:
        "Demo policy: high-value wastage requires evidence and repeat patterns are flagged for review.",
    },
  });

  await seedOperationalReasonCodes();

  console.log(
    "Seeded local Core Administration, restaurant supplier, item, and reason-code demo data.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
