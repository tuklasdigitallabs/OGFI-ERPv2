console.error(
  [
    "PRODUCTION_AUTH_E2E_OUTER_ORCHESTRATOR_REQUIRED",
    "Run the production-authenticated browser lane through .github/workflows/ci.yml.",
    "Local execution is preflight-only and must reproduce that outer lifecycle on Linux,",
    "or from a repository stored in the WSL Linux filesystem (not /mnt/c).",
    "Native Windows execution is unsupported and never produces release evidence.",
  ].join(" "),
);
process.exitCode = 1;
