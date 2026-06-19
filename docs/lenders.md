# Lender roster (from ISO guideline PDFs)

Seeded into `funders` via `supabase/seed.sql`. Source files in `docs/lender-sources/`.

| Slug | Lender | Min FICO | Min monthly revenue | Min TIB | Max advance | Contact |
|------|--------|----------|---------------------|---------|-------------|---------|
| ondeck | OnDeck | 625 | ~$8.3k ($100k/yr) | 12 mo | $250k | partnersupport@ondeck.com (portal) |
| mulligan | Mulligan Funding | 625 | ~$62.5k ($750k/yr) | 6 mo | $5M | partner@mulliganfunding.com |
| iou-financial | IOU Financial (Core) | 650 | ~$8k+ | 12 mo | $150k (Core) | submissions@ioufinancial.com |
| newport-bc | Newport Business Capital | 500 | $20k | 9 mo | $200k | submissions@newportbc.com |
| fintap | FinTap | 600 | $20k | 24 mo | $1M | submissions@fintap.com |
| forward-financing | Forward Financing | 500 | $10k | 12 mo | $300k | submissions@forwardfinancing.com |
| everest | Everest Business Funding | 500 | $5k deposits/mo | 3 mo | TBD | newdeals@ev-bf.com |

## Everest

Extracted from image PDF via page render (see `docs/lender-sources/everest-pages/`).

- Up to 12-month program; buy rate from 1.15; up to 15 pts upsell
- Max 5 negative days; max 5 NSFs
- Restricted: Financial Institutions, Auto Sales, Attorneys, Transportation
- Submissions: `newdeals@ev-bf.com` — subject `New Deal - [Legal Name]`
- Contracts: `contracts@ev-bf.com` | Renewals: `renewals@ev-bf.com` (50% paid)
- Support: `isosupport@ev-bf.com` | (888) 342-5709

## Per-lender notes

### OnDeck
- Sweet spot: $300k+ annual revenue, 675+ FICO, 2+ years TIB, $3k/mo avg balance
- 3 months bank statements; decision ~2 hours; portal submission
- Excludes trucking, lawyers (see full ineligible list in portal)

### Mulligan Funding
- $750k+ annual revenue; 6+ months TIB; 1st position only
- 3 months bank statements; soft pull only
- Large prohibited industry list (see PDF page 4)

### IOU Financial
- Multiple tiers (Core / Mid / Premier / Premier Plus) — matcher uses **Core** as baseline
- 3 months statements; 8 deposits/month; min ADB $3k (Core)
- Excluded states: MT, NV, SD, VT, HI, ND

### Newport Business Capital
- MCA 7–12 months; 1st position; min $20k/mo gross, $2k ADB, 5 deposits/mo
- Max 3 negative days (with OD) / 1 (without)
- Excluded states: VA, UT; no sole proprietorships

### FinTap
- Terms 24–48 weeks; 1st–3rd position; focus on clean 2nd/3rd
- 600+ Vantage (650+ for new 1st without MCA history)
- &lt;6 negative days in past 3 months

### Forward Financing
- 2nd/3rd position RBF; B/C paper; factor cap 1.595
- Strict 12+ months TIB (will not round 10–11 months)
- Max 5 negative days/mo; max 40% total gross reserve

## Updating

1. Edit `supabase/seed.sql` or update rows in Supabase admin
2. Re-run seed or `UPDATE funders SET ... WHERE slug = '...'`
3. Everest max advance not listed in PDF — update `max_advance` when you know their cap
