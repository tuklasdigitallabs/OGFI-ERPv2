# Production-authenticated browser harness

This harness is owned by the hosted Linux `production-authenticated-browser`
CI job. The job is the required outer orchestrator: it builds immutable images,
creates private database and TLS lifecycles, captures transient secret scan
needles, runs Playwright, verifies teardown, and admits only sanitized evidence.

`pnpm test:e2e:production-authenticated` intentionally fails closed because the
inner Playwright command is unsafe without that outer lifecycle. Local execution
is preflight-only and receives no release credit. A local preflight must run on
Linux or from a repository stored in the WSL Linux filesystem (for example,
under `/home`); native Windows and repositories mounted through `/mnt/c` are not
supported for this evidence topology.
