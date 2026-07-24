# Recording Supplier Quotes

Use `Quotes` → `Record Supplier Quote` to open the focused quote-capture task for an approved Purchase Request in your selected location.

The form uses a retry-safety key automatically. Re-submitting the same quote details after a network retry returns the original recorded quote; changing the details under the same retry key is rejected, so start a new quote task instead.

1. Select the approved Purchase Request and supplier.
2. Enter the quote reference, dates, terms, reason, and each quoted line's quantity, unit, price, availability, lead time, and notes.
3. Select `Record Supplier Quote`.

Recording a supplier quote only preserves a sourcing option. It does not select a supplier, submit a recommendation, issue a Purchase Order, or create inventory movement. Recommendation and approval remain separate controlled actions.

If no approved requests or supplier/unit-of-measure options are available, resolve the source configuration or approval first. The task remains scoped to the current company and location.

On `Quotes`, select one approved request in the comparison workspace to review its recorded supplier totals, line availability, lead time, terms, and recommendation status. Use `Record Recommendation` only when the selected supplier and required justifications are ready; submission starts approval and does not issue a Purchase Order. Tax/discount/freight breakdowns and quote attachments are not currently captured by this workspace, so do not treat the recorded total as a complete landed-cost comparison.
