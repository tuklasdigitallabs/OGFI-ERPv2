# DEC-0159 — Restore the web lint gate

Date: 2026-07-25  Status: Confirmed implementation decision

Removed three unused overflow state variables from the Purchase Request line editor that were left behind after the server-owned lookup contract replaced client-side overflow handling. No workflow, authorization, or data behavior changes. Web lint and TypeScript now pass together.
