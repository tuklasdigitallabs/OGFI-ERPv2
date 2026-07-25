# Company Context bounded access register

Company Context now uses a bounded, read-only Company Access register. It reports the exact request-time count of active, currently effective company assignments for active users in the current tenant, supports name/email search, and provides URL-backed pagination from 10 to 100 rows.

Brands and Locations remain summary counts with a handoff to Organization Scope rather than duplicated unbounded lists. Access changes remain in User Access.

Disposable PostgreSQL, responsive browser/mobile, hosted recovery/deployment, and UAT evidence remain required for production readiness.
