# Core Administration controlled organization edits

## What changed

Authorized administrators can now edit approved descriptive fields for Companies, Brands, Departments, and Locations from the Organization Scope register. Each edit requires a reason and records before/after values in the audit history.

## Protected fields

Tenant ownership, company ownership, identifiers/codes, brand/location relationships, and location type remain immutable in the ordinary edit action so historical scope and operational records cannot be reclassified accidentally. Deactivation/archive remains a separate dependency-checked lifecycle action and is not yet enabled by this slice.

## Validation status

Core Administration service tests previously passed **45/45**, and the current short-mutation transport adds a shared application-level toast host plus explicit trusted-origin routes for Organization Scope create/update. A confirmed successful save closes and resets its modal before showing a dismissible success toast; a failed save keeps the entered values available and shows a user-safe error toast. The current source requires a fresh local rebuild and visible verification before this feedback behavior receives additional validation credit. Production-authenticated browser evidence, formal UAT, hosted recovery, and release approval remain separate gates.
