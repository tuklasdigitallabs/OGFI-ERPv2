# Responsive workspace controls hardened

## What changed

Shared pagination and high-frequency inventory/procurement controls now keep labels such as `Previous` and `Next` on one line, preserve 44px touch targets, and wrap or stack as a group when a workspace panel becomes narrow. This applies across organization administration, finance pagination, procurement registers, receiving filters, and inventory/store-operation workspaces.

## Operator impact

Pagination remains readable on mobile and in nested workspace panels. The control group may move to a second line at narrow widths; the action itself and the selected record context remain unchanged.

## Validation status

The local Chromium and Pixel 7 responsive suites passed **18/18** across administration, receiving, inventory control, and procurement visible surfaces. Web lint and typecheck also passed. This is a local usability hardening change and does not provide production-authenticated browser, formal UAT, hosted recovery, or release-approval evidence.

Organization Scope registry filters now use the full available workspace width. Brand, Department, and Location search fields offer native matching suggestions from the currently authorized result page while the existing server-side filter remains authoritative for the full registry.
