-- SPF-002: reconcile intentional project scope constraints and missing review indexes.
-- Constraints are installed and validated before their predecessors are removed so
-- existing cross-scope data fails the migration without weakening integrity.

BEGIN;

ALTER TABLE "Project"
  ADD CONSTRAINT "spf002_project_brand_fk"
  FOREIGN KEY ("brandId", "tenantId", "companyId")
  REFERENCES "Brand"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "spf002_project_brand_fk";
ALTER TABLE "Project" DROP CONSTRAINT "Project_brandId_tenantId_companyId_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "spf002_project_brand_fk" TO "Project_brandId_tenantId_companyId_fkey";

ALTER TABLE "Project"
  ADD CONSTRAINT "spf002_project_location_fk"
  FOREIGN KEY ("locationId", "tenantId", "companyId")
  REFERENCES "Location"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "spf002_project_location_fk";
ALTER TABLE "Project" DROP CONSTRAINT "Project_locationId_tenantId_companyId_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "spf002_project_location_fk" TO "Project_locationId_tenantId_companyId_fkey";

ALTER TABLE "Project"
  ADD CONSTRAINT "spf002_project_department_fk"
  FOREIGN KEY ("departmentId", "tenantId", "companyId")
  REFERENCES "Department"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "spf002_project_department_fk";
ALTER TABLE "Project" DROP CONSTRAINT "Project_departmentId_tenantId_companyId_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "spf002_project_department_fk" TO "Project_departmentId_tenantId_companyId_fkey";

ALTER TABLE "Project"
  ADD CONSTRAINT "spf002_project_cost_center_fk"
  FOREIGN KEY ("costCenterId", "tenantId", "companyId")
  REFERENCES "CostCenter"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "spf002_project_cost_center_fk";
ALTER TABLE "Project" DROP CONSTRAINT "Project_costCenterId_tenantId_companyId_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "spf002_project_cost_center_fk" TO "Project_costCenterId_tenantId_companyId_fkey";

ALTER TABLE "ProjectRequirement"
  ADD CONSTRAINT "spf002_project_requirement_project_fk"
  FOREIGN KEY ("projectId", "tenantId", "companyId")
  REFERENCES "Project"("id", "tenantId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProjectRequirement" VALIDATE CONSTRAINT "spf002_project_requirement_project_fk";
ALTER TABLE "ProjectRequirement" DROP CONSTRAINT "ProjectRequirement_projectId_fkey";
ALTER TABLE "ProjectRequirement" RENAME CONSTRAINT "spf002_project_requirement_project_fk" TO "ProjectRequirement_projectId_tenantId_companyId_fkey";

ALTER TABLE "ProjectRequirement"
  ADD CONSTRAINT "spf002_project_requirement_task_fk"
  FOREIGN KEY ("taskId", "tenantId", "companyId", "projectId")
  REFERENCES "ProjectTask"("id", "tenantId", "companyId", "projectId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProjectRequirement" VALIDATE CONSTRAINT "spf002_project_requirement_task_fk";
ALTER TABLE "ProjectRequirement" DROP CONSTRAINT "ProjectRequirement_taskId_fkey";
ALTER TABLE "ProjectRequirement" RENAME CONSTRAINT "spf002_project_requirement_task_fk" TO "ProjectRequirement_taskId_tenantId_companyId_projectId_fkey";

ALTER TABLE "ProjectAttachment"
  ADD CONSTRAINT "spf002_project_attachment_requirement_fk"
  FOREIGN KEY ("requirementId", "tenantId", "companyId", "projectId")
  REFERENCES "ProjectRequirement"("id", "tenantId", "companyId", "projectId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProjectAttachment" VALIDATE CONSTRAINT "spf002_project_attachment_requirement_fk";
ALTER TABLE "ProjectAttachment" DROP CONSTRAINT "ProjectAttachment_requirementId_tenantId_companyId_projectId_fkey";
ALTER TABLE "ProjectAttachment" RENAME CONSTRAINT "spf002_project_attachment_requirement_fk" TO "ProjectAttachment_requirementId_tenantId_companyId_projectId_fkey";

ALTER TABLE "ProjectRecordLink"
  ADD CONSTRAINT "spf002_project_record_link_requirement_fk"
  FOREIGN KEY ("requirementId", "tenantId", "companyId", "projectId")
  REFERENCES "ProjectRequirement"("id", "tenantId", "companyId", "projectId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProjectRecordLink" VALIDATE CONSTRAINT "spf002_project_record_link_requirement_fk";
ALTER TABLE "ProjectRecordLink" DROP CONSTRAINT "ProjectRecordLink_requirementId_tenantId_companyId_projectId_fkey";
ALTER TABLE "ProjectRecordLink" RENAME CONSTRAINT "spf002_project_record_link_requirement_fk" TO "ProjectRecordLink_requirementId_tenantId_companyId_projectId_fkey";

CREATE INDEX "ProjectRequirement_tenantId_companyId_ownerUserId_status_idx"
  ON "ProjectRequirement"("tenantId", "companyId", "ownerUserId", "status");
CREATE INDEX "ProjectRequirement_tenantId_companyId_reviewerUserId_status_idx"
  ON "ProjectRequirement"("tenantId", "companyId", "reviewerUserId", "status");

COMMIT;
