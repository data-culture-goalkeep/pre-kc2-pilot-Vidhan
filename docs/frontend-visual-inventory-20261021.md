# Tamahar frontend visual inventory (21 October 2026)

Inventory verified from `frontend/dist/app.js`, `frontend/dist/backend.js` and the static layout. **Code-present does not imply independently browser-tested.** All record-bearing views are scoped by existing authenticated Supabase reads. No new graphs were added as part of the attendance reliability/date fix.

| Module | Visual/type | Meaning and source | Scope/interaction | Provenance | Status/limitations |
|---|---|---|---|---|---|
| Monthly work | Children in view KPI | Accessible children count, `children` via `visibleChildren()` | Month/programme/search, though total itself not month-dependent | Existing before PR #6 | Implemented; records are scoped by RLS |
| Monthly work | Attendance rows KPI | Children with `backendAttendanceSummary` | Month/programme/search | Existing before PR #6 | Implemented; counts children with summaries, not literal month rows |
| Monthly work | Below 80% KPI | Child attendance `(P+PwC)/(P+PwC+A)`; threshold <80% | Month/programme/search | Existing before PR #6 | Implemented; only children with defined percentage |
| Monthly work | Therapy entries KPI | Session records in selected month | Month/programme/search | Existing before PR #6 | Implemented; entries not distinct people |
| Monthly work | Attendance review horizontal bars | Average of defined child-level attendance percentages per programme | Month/programme/search | Existing before PR #6 | Implemented; mean of percentages, **not** overall visit-weighted rate; groups with no values shown as zero |
| Monthly work | Children needing review table | Children whose monthly percentage <80% | Month/programme/search | Existing before PR #6 | Implemented; first 10 shown |
| Daily entry | Selected date attendance table, code/status pills | Effective imported + operational code per child/day, plus therapy | Current day, month, programme/search | Existing before PR #6; multi-select added in PR #6 | Implemented; write workflow subject to user authorization |
| Children | Children in view KPI | Count from `visibleChildren()` | Month/programme/search | Added in PR #6 | Implemented |
| Children | Attendance recorded KPI | Children with `backendAttendanceSummary.total > 0` | Month/programme/search | Added in PR #6 | Implemented |
| Children | Combined attendance KPI | Weighted `sum(present)/sum(total)`, `present=P+PwC`, `total=P+PwC+A` | Month/programme/search | Added in PR #6 | Implemented; `—` when denominator zero |
| Children | Programme groups KPI | Distinct groups represented in accessible children | Programme/search | Added in PR #6 | Implemented |
| Children | Children by programme horizontal bars | Number of children in each of four configured programmes | Programme/search | Added in PR #6 | Implemented; unmapped group not separately plotted |
| Children | Recorded student statuses horizontal bars | Distribution of `children.status`, missing as Not recorded | Programme/search | Added in PR #6 | Implemented |
| Children | Child table with attendance percentage | Per-child effective monthly summary | Month/programme/search | Existing before PR #6 | Implemented |
| General info | Severity horizontal bars | Child severity categories mild/moderate/severe/not recorded | Programme/search | Existing before PR #6 | Implemented; unexpected severity strings not in buckets |
| General info | Attendance by programme bars | Mean of defined child monthly attendance percentages | Month/programme/search | Existing before PR #6 | Implemented; unweighted mean, no-data displayed as zero |
| General info | Therapy participation bars | Distinct children with P-coded session of therapy type in month | Month/programme/search | Existing before PR #6 | Implemented; P-only therapy rule, not programme PwC rule |
| Child progress | Children, ADL, development and cross-scale KPI cards | Children count, ADL record count, development record count; cross-scale intentionally blank | Month/programme/search | Existing before PR #6 | Implemented; no fabricated cross-scale score |
| Child record overview | Monthly attendance KPI and assessment count card | Per-child effective daily attendance summary; ADL/development record counts | Child/month | Existing before PR #6 | Implemented |
| Child record attendance | Month-grid calendar with code pills | Daily effective attendance (Phase 1 plus operational overrides) | Child/month | Existing before PR #6 | Implemented; calendar not a chart |
| Child record attendance | Monthly percentage and absence list | Present/absent/total and daily reasons | Child/month | Existing before PR #6 | Implemented |
| Child record assessments | ADL and development tables | Imported Phase 1 assessment fields, no scale conversion | Child | Existing before PR #6 | Implemented |
| Child record therapy | Therapy session table/status pills | TH-* source and operational entries | Child/month | Existing before PR #6 | Implemented |
| Goals / behaviour / work skills | None | No approved Phase 1 persistence model | Child | Not present | Intentionally unsupported |

## Calculation and integrity notes
`frontend/dist/backend.js` computes effective programme summaries from the daily programme codes after operational overrides. `P` and `PwC` are present, `A` absent; `H`, `NS` and blank values are excluded. Total is `P+PwC+A`; percentage is `100*(P+PwC)/(P+PwC+A)` when total >0. Imported Phase 1 source totals remain unchanged.

The visual inventory reflects implemented source code. Authenticated browser rendering and production data correctness need an authorized smoke test. No screenshots or rendered checks are claimed in this inventory.
