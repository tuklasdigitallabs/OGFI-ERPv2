# Administration: Role Permission Matrix

Role Detail permission review now uses a bounded server-backed matrix with
permission search and Sensitive, Overrides, and Recommended Drift filters.
Paging is review-only: saving a filtered page preserves the role’s enabled
permissions that are outside the visible page and continues to require the
existing reason, authorization, MFA, and audit controls.
