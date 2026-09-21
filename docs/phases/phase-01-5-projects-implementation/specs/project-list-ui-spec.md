# Project List UI Specification

## Purpose

Provide manager-friendly, filterable task/project data without forcing board use.

## Project list columns

Project code, name, type, status, sponsor, Project Manager, scope, target date, progress, overdue tasks, blockers, next milestone.

## Task list columns

Task key, title, project, status, priority, owner, assignees, due date, overdue age, blocker state, linked-record count, updated at.

## Controls

Search, filters, saved views where authorized, sort, column visibility, bulk export, and row click to detail. Bulk task status changes are out of scope unless an explicit later control design is approved.

## Workspace presentation

The Projects workspace uses URL-backed tabs for Overview, Members, Risks, and Activity. Members and Risks are server-paginated and retain the current company, project-membership, and assigned-scope authorization when changing pages. The Overview tab contains project health and the project registry; tab changes must preserve direct links and browser navigation.

The Work Boards workspace uses the configured board on desktop and a labeled task list on mobile. Mobile task actions remain the same controlled status transitions as the desktop card actions; drag-and-drop is not required for task completion.
