# Role permission integrity guard

Role Detail now fails closed when a role contains an unsupported tenant permission link. The complete scoped view remains readable, but permission editing is disabled and direct mutation attempts make no audit or data changes until reconciliation.
