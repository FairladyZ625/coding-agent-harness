## Legacy Migration Preset Gate

`migration-full-cutover` can only be claimed when the final session proves all gates.
Accepted migrate-plan mode is necessary but not sufficient:

- final session result is `complete`
- `migrate-plan` mode is `declared-capability` or `v2-manifest`; `legacy-compat` is rejected
- strict check passes
- `migrate-verify --full-cutover` passes
- warnings/actions/residuals/strictDeferred are zero
- dashboard evidence is readable
- review has no open P0/P1/P2 blocker

Current achieved level: `{{migrationAchievedLevel}}`.
