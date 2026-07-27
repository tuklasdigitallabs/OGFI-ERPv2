# Workforce leave legacy action guard — July 27, 2026

Leave requests linked to a governed approval graph are now handled through the
Approval Inbox when controlled routing is enabled. Legacy Workforce approve,
return, reject, and cancel actions fail closed for graph-backed requests while
normalized routing is disabled, preventing source and approval-graph status
from diverging.

Graph-free historical leave records retain their documented legacy actions,
subject to permission, scope, reason, segregation-of-duties, and audit checks.
This change does not enable controlled routing or introduce payroll, payment,
inventory, or journal posting.
