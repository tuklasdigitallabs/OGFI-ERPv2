import { prisma } from "@ogfi/database";
import {
  canUseBranchOperations,
  canUseFoodSafety,
  canUseIncidents,
  canUseMaintenance,
  canUseRecipesAndCosting
} from "./authorization";
import {
  getBranchOperationsDashboard,
  type BranchOperationsDashboard
} from "./branchOperations";
import type { SessionContext } from "./context";
import {
  getFoodSafetyDashboard,
  type FoodSafetyDashboard
} from "./foodSafety";
import { getIncidentDashboard, type IncidentDashboard } from "./incidents";
import {
  getMaintenanceDashboard,
  type MaintenanceDashboard
} from "./maintenance";
import { recordWorkflowNotifications } from "./notifications";
import { dateOnlyInTimeZone } from "./projectDates";
import {
  getFoodCostAnalysisDashboard,
  type FoodCostAnalysisDashboard
} from "./recipes";

type RestaurantOpsReminderKind =
  | "FOOD_COST_EXCEPTION"
  | "BRANCH_CHECKLIST_REVIEW_READY"
  | "BRANCH_CHECKLIST_EXCEPTION"
  | "FOOD_SAFETY_REVIEW_READY"
  | "FOOD_SAFETY_EXCEPTION"
  | "OPERATIONAL_INCIDENT_OPEN"
  | "MAINTENANCE_FOLLOW_UP";

const branchChecklistReviewStatuses = ["SUBMITTED", "MANAGER_REVIEW"] as const;
const foodSafetyReviewStatuses = ["SUBMITTED", "EXCEPTION_REVIEW"] as const;

type RestaurantOpsReminderInput = {
  reminderKind: RestaurantOpsReminderKind;
  priority: "CRITICAL" | "HIGH" | "NORMAL";
  title: string;
  body: string;
  deepLink: string;
  entityType: string;
  entityId?: string | null;
  sourceKey: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type RestaurantOpsReminderSource = {
  foodCost?: FoodCostAnalysisDashboard;
  branchOps?: BranchOperationsDashboard;
  foodSafety?: FoodSafetyDashboard;
  incidents?: IncidentDashboard;
  maintenance?: MaintenanceDashboard;
};

function phase2NotificationAccess(session: SessionContext) {
  return (
    canUseRecipesAndCosting(session.permissionCodes) ||
    canUseBranchOperations(session.permissionCodes) ||
    canUseFoodSafety(session.permissionCodes) ||
    canUseIncidents(session.permissionCodes) ||
    canUseMaintenance(session.permissionCodes)
  );
}

function priorityForSeverity(severity: string) {
  return severity === "CRITICAL" ? ("HIGH" as const) : ("NORMAL" as const);
}

export function buildRestaurantOpsReminderInputs(
  source: RestaurantOpsReminderSource
) {
  const reminders: RestaurantOpsReminderInput[] = [];

  if (source.foodCost) {
    const foodCost = source.foodCost;
    for (const row of foodCost.rows.filter((analysisRow) => analysisRow.status !== "WITHIN_TARGET")) {
      reminders.push({
        reminderKind: "FOOD_COST_EXCEPTION",
        priority:
          row.status === "ABOVE_TARGET" || row.status === "MISSING_COST"
            ? "HIGH"
            : "NORMAL",
        title: `Food cost follow-up: ${row.menuItemName}`,
        body: `${row.status.replaceAll("_", " ").toLowerCase()} in ${foodCost.locationName}. Review recipe cost, sales import, and actual ledger evidence.`,
        deepLink: "/recipes/analysis",
        entityType: "FoodCostAnalysis",
        entityId: row.menuItemId,
        sourceKey: `food-cost:${row.menuItemId}:${row.status}`,
        metadata: {
          menuItemName: row.menuItemName,
          status: row.status,
          netSalesAmount: row.netSalesAmount,
          theoreticalCost: row.theoreticalCost,
          actualCost: row.actualCost,
          source: "restaurant-ops-notification-scan"
        }
      });
    }
  }

  if (source.branchOps) {
    const branchOps = source.branchOps;
    for (const checklist of branchOps.checklists.filter((record) =>
      (branchChecklistReviewStatuses as readonly string[]).includes(record.status)
    )) {
      reminders.push({
        reminderKind: "BRANCH_CHECKLIST_REVIEW_READY",
        priority: checklist.exceptionCount > 0 ? "HIGH" : "NORMAL",
        title: `Checklist ready for review: ${checklist.checklistName}`,
        body: `${checklist.locationName} has a ${checklist.status.replaceAll("_", " ").toLowerCase()} checklist for ${checklist.businessDate}.`,
        deepLink: `/branch-operations/${checklist.id}`,
        entityType: "BranchOperationalChecklist",
        entityId: checklist.id,
        sourceKey: `branch-checklist-review:${checklist.id}:${checklist.status}`,
        metadata: {
          checklistName: checklist.checklistName,
          businessDate: checklist.businessDate,
          status: checklist.status,
          exceptionCount: checklist.exceptionCount,
          source: "restaurant-ops-notification-scan"
        }
      });
    }

    for (const checklist of branchOps.checklists.filter((record) => record.exceptionCount > 0)) {
      const hasCritical = checklist.lines.some(
        (line) => line.result === "EXCEPTION" && line.severity === "CRITICAL"
      );
      reminders.push({
        reminderKind: "BRANCH_CHECKLIST_EXCEPTION",
        priority: hasCritical ? "HIGH" : "NORMAL",
        title: `Checklist exception: ${checklist.checklistName}`,
        body: `${checklist.locationName} has ${checklist.exceptionCount} checklist exception${checklist.exceptionCount === 1 ? "" : "s"} for ${checklist.businessDate}.`,
        deepLink: `/branch-operations/${checklist.id}`,
        entityType: "BranchOperationalChecklist",
        entityId: checklist.id,
        sourceKey: `branch-checklist:${checklist.id}:${checklist.exceptionCount}`,
        metadata: {
          checklistName: checklist.checklistName,
          businessDate: checklist.businessDate,
          exceptionCount: checklist.exceptionCount,
          critical: hasCritical,
          source: "restaurant-ops-notification-scan"
        }
      });
    }
  }

  if (source.foodSafety) {
    const foodSafety = source.foodSafety;
    for (const log of foodSafety.logs.filter((record) =>
      (foodSafetyReviewStatuses as readonly string[]).includes(record.status)
    )) {
      reminders.push({
        reminderKind: "FOOD_SAFETY_REVIEW_READY",
        priority: log.exceptionCount > 0 ? "HIGH" : "NORMAL",
        title: `Food-safety log ready for review: ${log.title}`,
        body: `${log.locationName} has a ${log.status.replaceAll("_", " ").toLowerCase()} food-safety log for ${log.businessDate}.`,
        deepLink: `/food-safety/${log.id}`,
        entityType: "FoodSafetyLog",
        entityId: log.id,
        sourceKey: `food-safety-review:${log.id}:${log.status}`,
        metadata: {
          title: log.title,
          businessDate: log.businessDate,
          status: log.status,
          exceptionCount: log.exceptionCount,
          source: "restaurant-ops-notification-scan"
        }
      });
    }

    for (const log of foodSafety.logs.filter((record) => record.exceptionCount > 0)) {
      const hasCritical = log.readings.some(
        (reading) =>
          reading.result === "EXCEPTION" && reading.severity === "CRITICAL"
      );
      reminders.push({
        reminderKind: "FOOD_SAFETY_EXCEPTION",
        priority: hasCritical ? "CRITICAL" : "HIGH",
        title: `Food safety exception: ${log.title}`,
        body: `${log.locationName} has ${log.exceptionCount} food-safety exception${log.exceptionCount === 1 ? "" : "s"} for ${log.businessDate}.`,
        deepLink: `/food-safety/${log.id}`,
        entityType: "FoodSafetyLog",
        entityId: log.id,
        sourceKey: `food-safety:${log.id}:${log.exceptionCount}`,
        metadata: {
          title: log.title,
          businessDate: log.businessDate,
          exceptionCount: log.exceptionCount,
          critical: hasCritical,
          source: "restaurant-ops-notification-scan"
        }
      });
    }
  }

  if (source.incidents) {
    const incidents = source.incidents;
    for (const incident of incidents.incidents.filter((record) =>
      ["OPEN", "IN_PROGRESS", "PENDING_REVIEW"].includes(record.status)
    )) {
      reminders.push({
        reminderKind: "OPERATIONAL_INCIDENT_OPEN",
        priority: priorityForSeverity(incident.severity),
        title: `Incident follow-up: ${incident.incidentNumber}`,
        body: `${incident.title} remains ${incident.status.replaceAll("_", " ").toLowerCase()} at ${incident.locationName}.`,
        deepLink: `/incidents/${incident.id}`,
        entityType: "OperationalIncident",
        entityId: incident.id,
        sourceKey: `incident:${incident.id}:${incident.status}`,
        metadata: {
          incidentNumber: incident.incidentNumber,
          severity: incident.severity,
          status: incident.status,
          source: "restaurant-ops-notification-scan"
        }
      });
    }
  }

  if (source.maintenance) {
    const maintenance = source.maintenance;
    for (const ticket of maintenance.tickets.filter((record) =>
      ["OPEN", "IN_PROGRESS", "PENDING_VENDOR"].includes(record.status)
    )) {
      reminders.push({
        reminderKind: "MAINTENANCE_FOLLOW_UP",
        priority: priorityForSeverity(ticket.priority),
        title: `Maintenance follow-up: ${ticket.ticketNumber}`,
        body: `${ticket.assetName} remains ${ticket.status.replaceAll("_", " ").toLowerCase()} at ${ticket.locationName}.`,
        deepLink: `/maintenance/${ticket.id}`,
        entityType: "MaintenanceTicket",
        entityId: ticket.id,
        sourceKey: `maintenance:${ticket.id}:${ticket.status}`,
        metadata: {
          ticketNumber: ticket.ticketNumber,
          assetName: ticket.assetName,
          priority: ticket.priority,
          status: ticket.status,
          source: "restaurant-ops-notification-scan"
        }
      });
    }
  }

  return reminders;
}

async function collectRestaurantOpsReminders(session: SessionContext) {
  const source: RestaurantOpsReminderSource = {};

  await Promise.all([
    canUseRecipesAndCosting(session.permissionCodes)
      ? getFoodCostAnalysisDashboard(session).then((foodCost) => {
          source.foodCost = foodCost;
        })
      : Promise.resolve(),
    canUseBranchOperations(session.permissionCodes)
      ? getBranchOperationsDashboard(session).then((branchOps) => {
          source.branchOps = branchOps;
        })
      : Promise.resolve(),
    canUseFoodSafety(session.permissionCodes)
      ? getFoodSafetyDashboard(session).then((foodSafety) => {
          source.foodSafety = foodSafety;
        })
      : Promise.resolve(),
    canUseIncidents(session.permissionCodes)
      ? getIncidentDashboard(session).then((incidents) => {
          source.incidents = incidents;
        })
      : Promise.resolve(),
    canUseMaintenance(session.permissionCodes)
      ? getMaintenanceDashboard(session).then((maintenance) => {
          source.maintenance = maintenance;
        })
      : Promise.resolve()
  ]);

  return buildRestaurantOpsReminderInputs(source);
}

export async function runRestaurantOpsExceptionReminderScan(
  session: SessionContext,
  input: { asOf?: Date; timeZone?: string } = {}
) {
  if (!phase2NotificationAccess(session)) {
    throw new Error("PERMISSION_DENIED");
  }

  const asOf = input.asOf ?? new Date();
  const asOfDate = dateOnlyInTimeZone(asOf, input.timeZone);
  const reminders = await collectRestaurantOpsReminders(session);
  const emitted: Array<{ reminderKind: RestaurantOpsReminderKind; sourceKey: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (const reminder of reminders) {
      const notifications = await recordWorkflowNotifications(tx, {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        locationId: session.context.locationId,
        recipientUserIds: [session.user.id],
        notificationType: reminder.reminderKind,
        priority: reminder.priority,
        title: reminder.title,
        body: reminder.body,
        deepLink: reminder.deepLink,
        entityType: reminder.entityType,
        entityId: reminder.entityId ?? null,
        sourceEventKey: `restaurant-ops-exception:${session.context.tenantId}:${session.user.id}:${asOfDate}:${reminder.sourceKey}`,
        recipientBasis: "CURRENT_USER_AUTHORIZED_PHASE2_SCOPE",
        metadata: {
          ...reminder.metadata,
          asOfDate,
          sourceKey: reminder.sourceKey
        }
      });

      if (notifications.length > 0) {
        emitted.push({
          reminderKind: reminder.reminderKind,
          sourceKey: reminder.sourceKey
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        tenantId: session.context.tenantId,
        companyId: session.context.companyId,
        actorUserId: session.user.id,
        eventType: "notification.restaurant_ops_exception_scan",
        entityType: "Company",
        entityId: session.context.companyId,
        afterData: {
          scannedExceptionCount: reminders.length,
          reminderCount: emitted.length,
          asOfDate
        },
        metadata: { source: "restaurant-ops-notification-scan" }
      }
    });
  });

  return {
    scannedExceptionCount: reminders.length,
    reminderCount: emitted.length,
    reminders: emitted
  };
}
