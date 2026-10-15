# Phase 3 staging cost review

Status: decision record only. No staging resource has been created.

## Existing Supabase organization

- Organization: Vanavil Goalkeep Kickstarters
- Current plan: Free
- Existing active projects: 2
  - pre-kc2-pilot-Vidhan
  - Kirti Pilot KC
- Existing Tamahar branches: 0

Supabase Free currently allows two active free projects. Both slots are already occupied.

## Supabase branch cost

The Supabase API reports the default branch compute price for this organization as:

- USD 0.01344 per hour

Illustrative branch-compute-only amounts:

- 24 hours: USD 0.32256
- 7 days / 168 hours: USD 2.25792
- 30 days / 720 hours: USD 9.67680
- 31 days / 744 hours: USD 9.99936

These figures exclude other metered usage such as egress/disk overages.

Current Supabase documentation states that Branching requires a Pro organization. The organization is presently Free, so creating a branch requires a plan upgrade before branch usage can be incurred.

Current published Pro base subscription: USD 25/month. Paid organizations also bill project compute hourly; Supabase provides USD 10/month of compute credits at organization level. Branching compute is not covered by those compute credits.

With two existing Micro-equivalent projects plus one continuously running Micro branch, a rough full-month illustration is approximately:
- Pro subscription: USD 25
- two project compute instances: about USD 20 total
- organization compute credits: minus USD 10
- one continuously running branch: about USD 10
- approximate subtotal before other usage: USD 45/month

Actual billing depends on billing-cycle timing, compute size, how long the branch exists, and other usage.

## Lower-cost alternatives

### A. Local Supabase / CI-only isolated testing — recommended first step
Platform cost: USD 0.

Use Supabase CLI/local containers to apply the proposal, load synthetic fixtures, and run the RLS/security test suite. This gives strong schema/security validation without production access or branch charges.

Limitation: it does not provide a remotely hosted Supabase URL for an end-to-end Vercel Preview.

### B. Third Free Supabase project
Supabase API currently reports project creation cost as USD 0/month in this Free organization, but Free plan project quota is two active projects and both slots are already occupied.

A third active project therefore is not presently available in this organization without pausing an existing project, changing organization/account allocation, or upgrading. We will not pause or repurpose either existing project without explicit approval.

### C. Persistent/preview Supabase branch
Best fit for hosted Phase 3 staging and Vercel Preview integration, but it requires Pro and incurs branch usage. A persistent branch is operationally convenient for staging; an ephemeral preview branch is cheaper if kept only for focused test windows.

## Recommendation

1. Run Phase 3A migrations and RLS tests locally/CI first at USD 0 platform cost.
2. After those tests pass, create an ephemeral Supabase branch for a short hosted integration window rather than keeping a persistent branch running continuously.
3. Convert to persistent staging only if ongoing QA justifies the recurring usage.
4. Never copy production child data into the branch; use synthetic fixtures only.
