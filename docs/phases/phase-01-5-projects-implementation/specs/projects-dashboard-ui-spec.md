# Projects Dashboard UI Specification

## Purpose

Provide role-aware project visibility without overwhelming users with generic portfolio charts.

## Desktop

- Top context bar: Company, optional brand/location filter, date/filter controls.
- My Tasks: due today, overdue, blocked, review-required.
- Project Health: project name, status, progress, overdue count, blocker count, next milestone, owner.
- At-Risk panel: high-severity risks, delayed milestone, overdue critical task.
- Recent Activity panel: scoped, searchable project activity.

## Mobile

Default to My Tasks and urgent actions. Project portfolio appears as compact cards with status, next milestone, overdue, and blocked labels.

## Empty/error states

Show role-specific empty states, such as `No assigned tasks today` or `No projects in your scope`. Do not imply user can create a project unless permission allows it.
