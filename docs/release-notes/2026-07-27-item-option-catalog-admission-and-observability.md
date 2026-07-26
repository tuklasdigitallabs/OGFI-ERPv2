# Item option searches now recover without losing the draft

**Release scope:** Phase I Item Master — local implementation checkpoint; hosted calibration and UAT remain pending.

Item Master now protects Category, UOM, and Item option searches with bounded
browser, edge, and application admission controls. Create Item and Conversion
selectors cancel superseded searches, ignore stale responses, and keep selections
and entered form values when a lookup is busy or unavailable.

When the service asks the browser to wait, Retry is temporarily disabled. It
becomes available after the bounded cooldown and must be chosen manually; the
screen does not submit or retry automatically. Conversion's Item, From UOM, and To
UOM selectors recover independently.

The server still rechecks authentication, selected-company scope, permissions,
active records, and all Item/conversion rules. This change does not create or
change Items, approvals, inventory, reports, exports, or lifecycle authority.

Production limit values are not approved by this checkpoint. Hosted load,
shared-NAT, restart, alert, rollback, responsive-browser, and UAT evidence remains
required before Master Data or Phase I can be called production-ready.
