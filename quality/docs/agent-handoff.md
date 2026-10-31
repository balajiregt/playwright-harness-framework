# Agent evidence handoff

Use an explicit reviewed snapshot of requirements, scenario/test inventory,
assertions and helper implementations. Preserve source conflicts and completeness
flags. Do not export repository code or ticket content without authorization for
the destination. Current CLI commands only preview local evidence.

`examples/lead-review.json` is the retained synthetic scaffold input contract.
Its embedded execution statuses are illustrative, not actual browser runs. Keep
expected labels and reviewer rationale separate from model packets.

The new coverage workflow will map requirements to implemented test evidence;
smoke selection will also need critical-journey policy, dependencies, durations,
reliability and a runtime budget. These new contracts are not implemented yet.
See [the evaluation scope](evaluation-scope.md).
