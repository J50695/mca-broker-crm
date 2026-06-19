# MCA Broker CRM

Greenfield MCA broker/ISO CRM — intake automation, auto-submit to matched lenders, inbound email status updates, client portal, and sales pipeline.

## Stack

- **Frontend:** React + Vite + Tailwind + `@hello-pangea/dnd`
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime, Edge Functions)
- **Hosting:** Netlify
- **Automation:** Resend/SendGrid (email), Anthropic Claude (parsing), Twilio (SMS, optional)

## Project structure

```
mca-broker-crm/
├── supabase/
│   ├── migrations/     # Run these in Supabase SQL Editor
│   ├── seed.sql        # Optional funder seed (replace with your lender list)
│   └── functions/      # Edge Functions (intake, auto-submit, inbound email)
└── web/                # React app
```

## Setup

### 1. Supabase

**Full checklist:** see [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)

Quick version:

1. Create a new project at [supabase.com](https://supabase.com)
2. Run all migrations + `seed.sql` in SQL Editor (see setup doc)
3. Create Storage bucket **`deal-documents`** (private)
4. Create a user under Authentication (first user becomes admin)
5. Copy project URL + anon key to `web/.env.local`:

```bash
cp web/.env.example web/.env.local
```

### 2. Frontend

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

### 3. Seed funders

Run migrations, then `supabase/seed.sql` in SQL Editor. Lender criteria are parsed from your ISO PDFs — see `docs/lenders.md`.

## Pipeline columns

1. **New Intake** — sorted by receipt date → avg true deposits → lowest DTI
2. No Contact
3. Contacted / Follow Up
4. Chasing
5. Offer Received — No Contact
6. Offer Received — Not Interested
7. Funded
8. No Offer
9. Follow Up — No Offer
10. Default

## Automation flow

1. Agent uploads application + **3–4 months** bank statements
2. Edge Function extracts PII + financial snapshot (Claude vision)
3. If qualified → **auto-match funders → auto-send** submissions
4. Inbound ISO/funder emails update submissions + client portal + deal stage
5. Sales reps work contact columns; full history lives in **Client Portal**

## Build order (multi-agent)

| Phase | Status |
|-------|--------|
| Agent 1 — Schema + Supabase | ✅ Done |
| Agent 2 — Pipeline board UI | 🟡 Started (basic board) |
| Agent 3 — Funder matching + submit | ⬜ Pending |
| Agent 4 — Team comms | ⬜ Pending |
| Agent 5 — Email automation + portal polish | ⬜ Pending |
| Agent 7 — Document intake / extraction | ⬜ Pending |
| Agent 8 — Auth + roles + polish | ⬜ Pending |

## Environment variables (Edge Functions)

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | App + statement + email parsing |
| `RESEND_API_KEY` | Outbound proposals + inbound webhook |
| `TWILIO_*` | SMS notifications (optional) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions DB access |
