# Requesting a Purchase Order amendment

When an eligible issued or approved Purchase Order needs a controlled change, use Request Amendment. The workspace shows the PO reference, company, location, supplier, and the approval/audit consequence. Enter a reason, expected delivery date, supplier notice details, and the proposed quantity, price, and note for each line.

Submitting creates an approval-controlled amendment request; it does not silently change the PO or inventory. If the PO status changed or another amendment is pending, the server may reject the request and the page should be refreshed.

If Request Amendment is unavailable, the Purchase Order detail explains whether
your permission is missing, the order is not issued, receiving activity exists,
another amendment or balance closure is pending, or the order has already been
received. These messages are read-only guidance; the server remains authoritative.
Validation or stale-state errors appear in the page feedback banner and mean that
no amendment was saved. Review the current PO and reopen the TaskSheet before
retrying. A pending amendment pauses receiving until an approval decision.
