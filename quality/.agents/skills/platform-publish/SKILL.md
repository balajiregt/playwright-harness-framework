---
name: platform-publish
description: Integrate a selected repository with the Build with Balaji platform, prepare reviewed public metrics, validate exports and publish an authorised result feed. Use for project onboarding and metrics publication; not for deploying applications or uploading raw reports.
---

# Platform Publish

Use this portable 1.0.0 bundle to onboard one explicitly selected repository or
prepare/publish its existing results. Node 22+ and Git are sufficient; no LLM,
MCP connection, external package installation or live test execution is required.

## Integrate a repository

1. Read its instructions and existing result producers. Inspect only the selected
   project and outputs. Reuse tests and collectors; do not start paid evaluation,
   rerun a stopped campaign or publish data as a side effect of onboarding.
2. Follow [integration.md](references/integration.md) to define a reviewed public
   policy, map real measurements and prepare its registry entry. The agent writes
   a small project adapter when needed; normal CI publication must work without
   an agent. Keep metric meaning, units, denominators and limitations explicit.
3. Use the bundled `scripts/cli.mjs` to prepare and validate a local aggregate.
   Review the exact policy and payload. Do not guess missing values, infer model
   accuracy from execution success, or turn estimates into measurements.
4. Prepare the platform registry change in its selected checkout, or return the
   proposed entry when that checkout is unavailable. Register only reviewed,
   intentionally public GitHub feeds. Leave existing schema-specific publishers
   and validators intact; the new standard uses its own results branch.
5. Verify the producer, failure/unavailable case and platform reader with local
   fixtures before claiming integration. Report which steps were actually run.

## Publish an existing result

Read the local policy and prepared aggregate; validate them with this bundle.
Require user authorisation for the exact public destination and content before
running the `publish` command. Existing explicit session approval counts; do not
ask again for already-authorised publication. The CLI's confirmation flag is an
execution guard and is not evidence of human authorisation by itself.

Use existing Git sign-in. Never request, print or store credentials. Authorised
CI uses its own repository-scoped token supplied by the CI environment. On
failure, keep the prepared export and retry that same export only when warranted;
do not rerun tests or fabricate a fresh timestamp merely to retry publication.

Public source text comes from the reviewed policy, not raw reports. Text checks
are only tripwires: this does not prove that arbitrary customer data is safe.
Raw logs, source code, prompts, detailed reports and datasets are outside v1.

## References and acceptance

- [Integration and commands](references/integration.md): onboarding, registry,
  version pinning, CLI/CI use and evidence limitations.
- [Example policy](references/example-policy.json) and
  [measurements](references/example-measurements.json): clearly synthetic fixtures.
- [Interchange schema](references/metrics-v1.schema.json): closed aggregate shape;
  the bundled validator additionally enforces semantic and policy constraints.

Done means the selected project has a validated preview and proposed registration,
with exact producer commands and tested outcomes reported. Claim public
publication or a live route only after verifying that exact result. This skill
does not grant access to a repository or deploy the platform.
