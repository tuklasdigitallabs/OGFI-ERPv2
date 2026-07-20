# Worker App Rules

Follow the root `AGENTS.md`. This worker owns background job execution only. It must not decide approval policy or mutate controlled records without using the same domain services and audit rules as the web app.
