CREATE TABLE "Recipe" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "recipeCode" TEXT NOT NULL,
  "recipeName" TEXT NOT NULL,
  "recipeType" TEXT NOT NULL DEFAULT 'MENU',
  "ownerDepartment" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeVersion" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "recipeId" UUID NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "yieldQuantity" DECIMAL(18,6) NOT NULL,
  "yieldUomId" UUID NOT NULL,
  "servingQuantity" DECIMAL(18,6) NOT NULL,
  "servingUomId" UUID NOT NULL,
  "targetFoodCostPercent" DECIMAL(9,4),
  "notes" TEXT,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" UUID,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecipeLine" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "recipeVersionId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "lineType" TEXT NOT NULL DEFAULT 'INGREDIENT',
  "itemId" UUID,
  "subRecipeVersionId" UUID,
  "quantity" DECIMAL(18,6) NOT NULL,
  "uomId" UUID NOT NULL,
  "yieldLossPercent" DECIMAL(9,4),
  "preparationNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "brandId" UUID,
  "menuItemCode" TEXT NOT NULL,
  "menuItemName" TEXT NOT NULL,
  "menuCategory" TEXT,
  "currentRecipeVersionId" UUID,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuPrice" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  "locationId" UUID,
  "currencyCode" TEXT NOT NULL,
  "price" DECIMAL(18,6) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MenuPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Recipe_companyId_recipeCode_key" ON "Recipe"("companyId", "recipeCode");
CREATE INDEX "Recipe_tenantId_companyId_brandId_status_idx" ON "Recipe"("tenantId", "companyId", "brandId", "status");

CREATE UNIQUE INDEX "RecipeVersion_recipeId_versionNo_key" ON "RecipeVersion"("recipeId", "versionNo");
CREATE INDEX "RecipeVersion_tenantId_companyId_status_idx" ON "RecipeVersion"("tenantId", "companyId", "status");

CREATE UNIQUE INDEX "RecipeLine_recipeVersionId_lineNo_key" ON "RecipeLine"("recipeVersionId", "lineNo");
CREATE INDEX "RecipeLine_tenantId_companyId_idx" ON "RecipeLine"("tenantId", "companyId");
CREATE INDEX "RecipeLine_itemId_idx" ON "RecipeLine"("itemId");
CREATE INDEX "RecipeLine_subRecipeVersionId_idx" ON "RecipeLine"("subRecipeVersionId");

CREATE UNIQUE INDEX "MenuItem_companyId_menuItemCode_key" ON "MenuItem"("companyId", "menuItemCode");
CREATE INDEX "MenuItem_tenantId_companyId_brandId_status_idx" ON "MenuItem"("tenantId", "companyId", "brandId", "status");

CREATE INDEX "MenuPrice_tenantId_companyId_menuItemId_effectiveFrom_idx" ON "MenuPrice"("tenantId", "companyId", "menuItemId", "effectiveFrom");
CREATE INDEX "MenuPrice_locationId_idx" ON "MenuPrice"("locationId");

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_yieldUomId_fkey" FOREIGN KEY ("yieldUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_servingUomId_fkey" FOREIGN KEY ("servingUomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_subRecipeVersionId_fkey" FOREIGN KEY ("subRecipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "Uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_currentRecipeVersionId_fkey" FOREIGN KEY ("currentRecipeVersionId") REFERENCES "RecipeVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MenuPrice" ADD CONSTRAINT "MenuPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuPrice" ADD CONSTRAINT "MenuPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuPrice" ADD CONSTRAINT "MenuPrice_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuPrice" ADD CONSTRAINT "MenuPrice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
