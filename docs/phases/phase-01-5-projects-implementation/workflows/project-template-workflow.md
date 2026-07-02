# Project Template Workflow

## Purpose

Control reusable templates so implementation work starts with consistent statuses, checklist items, milestones, roles, and reminders.

## Template ownership

Project Administrators own company-wide templates. Project Managers may create project-specific templates only where policy allows.

## Workflow

1. Create template draft with project type, allowed company/brand/location scope, status set, default roles, task groups, checklists, milestones, and notification defaults.
2. Validate template against system rules: required active/completed/cancelled outcome, no duplicate status keys, allowed roles, valid reminder values.
3. Submit template for optional review/approval if company policy requires it.
4. Publish approved template.
5. When applied to a project, clone template content into project-specific records.
6. Changes to a published template affect future projects only. Active projects are not silently changed.
7. Archive a template instead of deleting it when it is no longer approved for use.

## Controls

Templates may not add a task action that claims to approve or mutate linked ERP records. Any formal approval must route through the ERP approval engine or a documented project gate.

## Current implementation note

Published templates use a versioned `configJson` shape with task statuses,
starter tasks, checklist items, and milestones. Project creation copies the
template snapshot and clones starter project tasks/checklist items/milestones
inside the same transaction. Default owners resolve to the project manager,
sponsor, or creator; unresolved advanced owner policies, reminders,
dependencies, and automation are deferred.
