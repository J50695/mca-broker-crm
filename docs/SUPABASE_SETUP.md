# Supabase setup checklist

Do these steps once in the [Supabase Dashboard](https://supabase.com/dashboard). ~15 minutes.

## 1. Create project

1. **New project** → pick org, name (e.g. `mca-broker-crm`), strong DB password, region close to you.
2. Wait until the project is **Active**.

## 2. Run database migrations (SQL Editor)

Open **SQL Editor** → **New query**. Run each file **in order** (copy/paste full file → Run):

| Order | File |
|-------|------|
| 1 | `supabase/migrations/20250610180000_initial_schema.sql` |
| 2 | `supabase/migrations/20250610180100_storage_and_realtime.sql` |
| 3 | `supabase/migrations/20250611100000_funder_guidelines.sql` |
| 4 | `supabase/migrations/20250611110000_auth_agent_trigger.sql` |
| 5 | `supabase/seed.sql` |

If step 2 errors on realtime (`already member of publication`), skip that line — tables may already be added.

## 3. Create Storage bucket

1. **Storage** → **New bucket**
2. Name: `deal-documents`
3. **Private** (not public)
4. Create

Storage policies are created in migration 2 — they apply once the bucket exists.

## 4. Enable Auth email (for login)

1. **Authentication** → **Providers** → **Email** → enabled (default)
2. For dev you can turn off **Confirm email** under Email settings so signup works instantly.

## 5. Create your admin user

**Authentication** → **Users** → **Add user** → **Create new user**

- Email + password (your login)
- The `auth_agent_trigger` migration auto-creates an `agents` row with role **admin**.

Or sign up from the CRM login page after step 6.

## 6. Connect the React app

1. **Project Settings** → **API**
2. Copy **Project URL** and **anon public** key
3. In the project:

```bash
cd web
cp .env.example .env.local
```

Edit `web/.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

4. Run locally:

```bash
npm install
npm run dev
```

5. Open http://localhost:5173 → log in with the user from step 5.

## 7. Verify it works

In SQL Editor:

```sql
SELECT name, min_fico, min_monthly_revenue FROM funders ORDER BY name;
```

You should see **7 lenders** (OnDeck, Mulligan, IOU, Newport, FinTap, Forward, Everest).

In the app: empty pipeline is normal until you add deals.

## 8. Later — Edge Functions (automation)

When ready for intake + auto-submit + inbound email:

**Project Settings** → **Edge Functions** → secrets:

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | App + statement + email parsing |
| `RESEND_API_KEY` | Outbound/inbound email |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions DB access (from API settings) |
| `TWILIO_*` | SMS (optional) |

Deploy functions from CLI when that phase starts.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "permission denied" on pipeline | Not logged in, or no `agents` row for your user id |
| Realtime not updating | Check **Database** → **Publications** → `supabase_realtime` includes `deals` |
| Storage upload fails | Bucket must be named exactly `deal-documents`, private |
| Seed funders missing | Re-run `seed.sql` |
