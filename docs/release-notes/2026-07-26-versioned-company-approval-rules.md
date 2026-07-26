# Versioned company Approval Rules

Core Administration now supports controlled company Approval Rule creation,
revision, activation, and deactivation. Rules are immutable versions: a revision
creates an inactive successor, and activation changes routing only for future
submissions. Existing approval cycles retain their original version and steps.

The initial composer is deliberately bounded to supported transaction types, ordered
role steps, and the default or Purchase Request emergency route. Tenant-wide rules,
legacy named-user routes, and generic condition builders remain read-only/unavailable
until their policy and runtime matching contracts are approved.

Lifecycle changes require selected-company Manage authority, tenant-role and Core
Administration permissions, current privileged-MFA proof, a reason, eligible roles,
and current version checks. Under external authentication, verified privileged-MFA
evidence is required instead of a local runtime step-up. Deactivating a route can
block new submissions but does not cancel in-flight approvals.
