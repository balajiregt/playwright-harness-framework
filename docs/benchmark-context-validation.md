# Framework impact: context audit

12 October 2026. The benchmark audits the information supplied to an agent before
comparing completed QA work, decisions, time and resource use. Test execution is
one acceptance check for an engineering deliverable, not the framework's sole
value measure.

The inspected source/graph route permissions, owning test/page/assertion paths,
and manager direct-route calls agree with the current CRM source. The manager
flow already visits Leads and Admin users and asserts path-specific denial. An
older benchmark task description incorrectly called those checks missing; the
new campaign treats this as an existing-coverage decision.

Two context limitations remain visible: the sample manifest declares localStorage
authentication, and capture recipes inject that state without establishing the
API's HttpOnly session cookie. UI capture alone therefore does not demonstrate an
authenticated API session. Existing capture files also have no complete source
fingerprint, so capture freshness is unmeasured. These findings are retained in
the benchmark rather than silently corrected only for the guided condition.

A separate runtime preflight found that `signInAs` returned before the asynchronous
login finished. It now waits for the dashboard ready signal. Both trial conditions
use this same helper revision. The application and role rules are unchanged.

The source-grounded audit, paired trials, frozen protocol and public result feed
are maintained in [the benchmark repository](https://github.com/balajiregt/framework-benchmark-dashboard/tree/main/impact).
Results are descriptive sample-app evidence, not production productivity claims.
