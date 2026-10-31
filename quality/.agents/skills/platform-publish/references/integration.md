# Integrate with the platform

## Publication policy and input

Start from `example-policy.json`, replacing the example project, repository and
methodology URL with the selected project's actual public identifiers. Keep it
in that repo as `.platform-publish.json`. Author the labels and limitations
deliberately: they will be public. `scope` is explicitly `synthetic`, `local` or
`production`; it is not an assertion that a result is independently verified.

The current target is `platform-results/metrics.json` in that same public GitHub
repository. Existing `benchmark-results` feeds remain a separate legacy contract.
There are no browser write credentials or central shared publisher token.

The repo's adapter produces the shape in `example-measurements.json` from its
existing result files. Every configured metric must be present. Unmeasured means
`value: null, state: "unavailable"`; it never means zero. Use `estimated` for
estimates. `sampleSize` is a real count or null, not an invented denominator.
Accuracy requires actual reviewed labels; this generic contract does not compute
accuracy or prove a producer's claim. A blocked/unavailable run has no measured
or estimated result. A failed run may retain measurements that were collected.

`observedAt` is the actual run observation time, not publication or retry time;
use UTC with milliseconds. `revision` is the observed source commit or null when
unknown, and `dirty` records whether it had local changes. Export source freshness
and metric derivation belong to the project's tested adapter; JSON validation
alone cannot establish them. Do not add this fixture's numbers to a real feed.

## Deterministic commands

Resolve the installed skill path, then use its `scripts/cli.mjs`. Replace
`/path/to/platform-publish` below with that discovered location:

```sh
node /path/to/platform-publish/scripts/cli.mjs prepare --config .platform-publish.json --input measurements.json --output prepared-metrics.json
node /path/to/platform-publish/scripts/cli.mjs validate --config .platform-publish.json --input prepared-metrics.json
```

Preparation has no network access and refuses to overwrite an existing export.
Both the reviewed policy and export are content-bound. Changing the policy or
tampering with a prepared value requires preparing and reviewing another export.
Keep intermediate measurements and prepared exports in ignored project output
folders unless explicitly designated public fixtures.

Only after authorisation of that payload and public repository:

```sh
node /path/to/platform-publish/scripts/cli.mjs publish --config .platform-publish.json --input prepared-metrics.json --confirm-publication
```

It preserves up to 50 runs, orders them by observation time, avoids duplicate
commits, preserves unrelated branch files and retries non-force pushes up to
three times. An old result cannot become newest just because publication was
retried. It never executes the repo's tests or arbitrary shell snippets.

For authorised CI, pin the skill bundle to a reviewed commit/archive digest,
keep GitHub Actions permissions repository-scoped (`contents: write`), and pass
the job token as `GH_PLATFORM_TOKEN` when `GITHUB_ACTIONS=true`. Keep actions pinned
to reviewed immutable commits. Do not add an automatic publishing trigger merely
because a repo was onboarded; reuse its approved execution/publication policy.

## Registry entry

Add an entry to `public/data/platform-registry.json` in the platform checkout:

```json
{
  "id": "example-project",
  "title": "Example project",
  "description": "Replace with an approved public description.",
  "kind": "experiment",
  "repository": "https://github.com/example-owner/example-project",
  "demoUrl": null,
  "route": "/projects/example-project",
  "sources": [{
    "id": "metrics", "format": "metrics-v1",
    "repository": "https://github.com/example-owner/example-project",
    "branch": "platform-results", "path": "metrics.json", "legacyProject": null
  }]
}
```

`kind` may be `application`, `framework` or `experiment`. A route is reserved
metadata for the platform's routed UI; registry validation does not create a
page. Do not claim the route is live until that UI has been implemented and
verified. A project may exist without a metrics feed or demo. Separate analysis
entries reserve `/analyses/{id}` and refer to one or more registered project IDs.
They do not upload article bodies or raw datasets through the metrics publisher.

Run `npm run platform:check`, `npm test` and `npm run build` in the platform.
Its `readStandardMetrics` reader supports the standard feed without project-
specific frontend code; existing specialised result shapes retain their own
validators. Registry/code changes need a reviewed platform deployment. Later
metrics updates do not. New result types still require an explicit renderer.

## Distribution and limitations

The canonical skill lives at `.agents/skills/platform-publish` in the platform
repository. Copy the complete folder to a target repo's `.agents/skills`, or to
the user's skills directory. Preserve the bundle manifest and pin its reviewed
digest/commit. Upgrade deliberately; do not edit copied publishers independently.
The platform browser validator is generated from this same contract and checked
for byte equality in CI. Version 1.0.0 intentionally has no npm dependencies.

Only explicitly registered public GitHub result feeds are supported in v1.
Private repos require a separate authenticated ingestion design; never make
them public or embed their credentials to bypass this boundary. Format checks,
content hashes and Git permissions are not independent review of the evidence.
