-- Lender roster seeded from ISO guideline PDFs (June 2025)
-- Source PDFs: docs/lender-sources/

DELETE FROM funders WHERE slug IN (
  'ondeck', 'mulligan', 'iou-financial', 'newport-bc', 'fintap', 'forward-financing', 'everest'
);

INSERT INTO funders (
  slug, name, min_fico, min_monthly_revenue, min_time_in_business_months,
  excluded_industries, max_factor_rate, max_advance, typical_turnaround_days,
  contact_email, email_domain, submission_method, is_active, guidelines
) VALUES

-- OnDeck (ondeck 25.pdf)
(
  'ondeck',
  'OnDeck',
  625,
  8333.33,
  12,
  ARRAY[
    'trucking', 'law', 'legal', 'lawyer', 'lawyers', 'attorney'
  ],
  1.50,
  250000,
  2,
  'partnersupport@ondeck.com',
  'ondeck.com',
  'portal',
  true,
  '{
    "product": "term_loan_and_loc",
    "sweet_spot": {"min_fico": 675, "min_monthly_revenue": 25000, "min_tib_months": 24, "min_avg_daily_balance": 3000},
    "min_avg_daily_balance": 1000,
    "bank_statements_months": 3,
    "max_existing_mca_payoffs": 2,
    "max_tax_liens": 100000,
    "no_bankruptcy_years": 2,
    "decision_hours": 2,
    "funding_days": "1-2",
    "positions": "1st",
    "notes": "Submit via Partner Portal. Docs to docs@ondeck.com. Ineligible industries list on partner portal."
  }'::jsonb
),

-- Mulligan Funding (Mulligan Guidelines.pdf)
(
  'mulligan',
  'Mulligan Funding',
  625,
  62500,
  6,
  ARRAY[
    'nonprofit', 'non-profit', 'trucking', 'transportation', 'logistics', 'freight',
    'legal', 'law', 'attorney', 'financial services', 'bank', 'credit union', 'lender',
    'insurance', 'real estate', 'gambling', 'cannabis', 'marijuana', 'cbd', 'vape',
    'adult entertainment', 'pawn', 'collection', 'payroll', 'crypto', 'atm',
    'trucking', 'auto sales', 'gun', 'firearm', 'travel agency', 'hotel', 'motel'
  ],
  NULL,
  5000000,
  1,
  'partner@mulliganfunding.com',
  'mulliganfunding.com',
  'email',
  true,
  '{
    "product": "business_loan",
    "min_annual_revenue": 750000,
    "terms_months": "3-24",
    "positions": "1st_only",
    "bank_statements_months": 3,
    "tax_returns_over_350k": true,
    "soft_pull_only": true,
    "all_50_states": true,
    "construction_min_fico": 675,
    "notes": "1st position only. Funding up to $5MM. Commission paid day after funding."
  }'::jsonb
),

-- IOU Financial (iou 2025.pdf) — Core tier baseline for matching
(
  'iou-financial',
  'IOU Financial',
  650,
  8000,
  12,
  ARRAY[
    'adult entertainment', 'rehab', 'ambulance', 'atm', 'attorney', 'legal', 'law',
    'bail bonding', 'bank', 'credit union', 'mortgage', 'collection', 'school', 'college',
    'construction ground-up', 'debt reduction', 'tax reduction', 'energy', 'factoring',
    'farming', 'gym', 'fitness', 'flea market', 'supplement', 'holistic', 'home healthcare',
    'hookah', 'fortune telling', 'investment', 'logistics', 'freight', 'lottery', 'gambling',
    'marijuana', 'mining', 'pawn', 'money services', 'nonprofit', 'staffing', 'oil gas',
    'payday', 'precious metal', 'real estate', 'roofing', 'solar', 'stock brokerage',
    'tax preparer', 'taxi', 'limo', 'towing', 'transportation', 'trucking', 'used car',
    'vape', 'vehicle manufacturing', 'wireless'
  ],
  1.35,
  150000,
  3,
  'submissions@ioufinancial.com',
  'ioufinancial.com',
  'email',
  true,
  '{
    "product": "core",
    "tiers": {
      "core": {"min": 15000, "max": 150000, "min_fico": 650, "min_tib_months": 12, "min_adb": 3000},
      "mid_market": {"min": 150001, "max": 300000, "min_fico": 650, "min_tib_months": 24},
      "premier": {"min": 300001, "max": 850000, "min_fico": 700, "min_tib_months": 60},
      "premier_plus": {"min": 500000, "max": 1500000, "min_fico": 700, "min_tib_months": 60}
    },
    "positions": "1st_and_2nd",
    "bank_statements_months": 3,
    "min_deposits_per_month": 8,
    "excluded_states": ["MT", "NV", "SD", "VT", "HI", "ND"],
    "ca_license_required": true,
    "notes": "Core product used for baseline matching. 2nd position adds +1 to buy rate."
  }'::jsonb
),

-- Newport Business Capital (newport 2025.pdf)
(
  'newport-bc',
  'Newport Business Capital',
  500,
  20000,
  9,
  ARRAY[
    'sole proprietorship', 'sole proprietor', 'consulting', 'farm', 'gas station',
    'adult entertainment', 'cannabis', 'trucking broker', 'logistics broker',
    'financial services', 'investing', 'tax consulting', 'real estate', 'property management',
    'home based ecommerce', 'home based retail', 'nail salon', 'law firm', 'legal',
    'collection', 'insurance', 'auto sales', 'event planner', 'venue', 'security',
    'entertainment production'
  ],
  NULL,
  200000,
  2,
  'submissions@newportbc.com',
  'newportbc.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_months": "7-12",
    "positions": "1st_only",
    "min_avg_daily_balance": 2000,
    "min_deposits_per_month": 5,
    "max_negative_days_with_od": 3,
    "max_negative_days_without_od": 1,
    "no_sole_proprietorships": true,
    "no_open_bankruptcy": true,
    "bankruptcy_satisfied_months": 6,
    "max_competitor_consolidation": 1,
    "min_net_after_payoff_percent": 65,
    "excluded_states": ["VA", "UT"],
    "origination_fee_percent": 3.5,
    "max_commission_points": 10,
    "notes": "CC kborth@newportbc.com on submissions. Weekly ACH typical."
  }'::jsonb
),

-- FinTap (fintap 2025.pdf)
(
  'fintap',
  'FinTap',
  600,
  20000,
  24,
  ARRAY[
    'auto sales', 'legal', 'law', 'attorney', 'financial services', 'thc', 'cannabis'
  ],
  1.50,
  1000000,
  3,
  'submissions@fintap.com',
  'fintap.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_weeks": "24-48",
    "max_commission_points": 15,
    "buy_rate_start": 1.25,
    "min_fico_new_1st_no_mca_history": 650,
    "min_tib_new_1st_no_mca_history": 48,
    "max_negative_days_3mo": 6,
    "high_risk_min_monthly_revenue": 50000,
    "high_risk_industries": ["trucking", "construction", "farm"],
    "positions": "1st_to_3rd",
    "focus": "clean_2nd_and_3rd",
    "buyout_net_percent": 50,
    "excluded_states_registration": ["VA", "MO"],
    "notes": "CC BD rep on submissions. Vantage score used."
  }'::jsonb
),

-- Forward Financing (Forward Intro Kit)
(
  'forward-financing',
  'Forward Financing',
  500,
  10000,
  12,
  ARRAY[
    'adult entertainment', 'auto sales', 'auction', 'lottery', 'gaming', 'gambling',
    'bail bonds', 'mlm', 'multi-level marketing', 'cannabis', 'nonprofit', 'non-profit',
    'religious', 'drug paraphernalia', 'pawn', 'firearms', 'guns', 'ammunition',
    'precious metals', 'crypto', 'cryptocurrency', 'lending', 'financing', 'publicly traded',
    'debt collection', 'bankruptcy lawyer', 'real estate investment', 'check cashing',
    'money wiring', 'oil gas'
  ],
  1.595,
  300000,
  2,
  'submissions@forwardfinancing.com',
  'forwardfinancing.com',
  'email',
  true,
  '{
    "product": "revenue_based_financing",
    "terms_months": "3-12",
    "positions": "2nd_and_3rd",
    "bc_paper": true,
    "max_total_gross_reserve_percent": 40,
    "max_negative_days_per_month": 5,
    "no_declines_last_30_days": true,
    "no_late_mortgage_2mo": true,
    "no_dismissed_bankruptcy_1yr": true,
    "strict_tib": "12_months_minimum_no_rounding",
    "bank_statements_months": 3,
    "notes": "Do NOT submit 10-11 month TIB files. 1st positions with challenged credit considered case-by-case."
  }'::jsonb
),

-- Everest Business Funding (everest 2025.pdf — vision extract)
(
  'everest',
  'Everest Business Funding',
  500,
  5000,
  3,
  ARRAY[
    'financial institution', 'financial services', 'bank', 'credit union', 'lender',
    'auto sales', 'automobile', 'car dealer', 'attorney', 'attorneys', 'legal', 'law',
    'transportation', 'trucking', 'logistics', 'freight'
  ],
  1.30,
  NULL,
  2,
  'newdeals@ev-bf.com',
  'ev-bf.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_months": 12,
    "min_advance": 5000,
    "max_negative_days": 5,
    "max_nsf": 5,
    "buy_rate_start": 1.15,
    "max_commission_points": 15,
    "bank_statements_months": 3,
    "business_bank_account_required": true,
    "submission_subject": "New Deal - {{business_name}}",
    "one_deal_per_email": true,
    "new_thread_per_submission": true,
    "contracts_email": "contracts@ev-bf.com",
    "renewals_email": "renewals@ev-bf.com",
    "support_email": "isosupport@ev-bf.com",
    "treasury_email": "treasury@ev-bf.com",
    "renewal_paid_percent": 50,
    "renewal_mtd_required_after_day": 15,
    "existing_mca_balance_required": true,
    "notes": "Restricted: Financial Institutions, Auto Sales, Attorneys, Transportation. Fax (888) 493-4091. ISO support (888) 342-5709."
  }'::jsonb
);

-- MCA debit name patterns (statement matching)
INSERT INTO known_mca_funders (name, match_patterns)
SELECT v.name, v.patterns
FROM (VALUES
  ('OnDeck', ARRAY['ONDECK', 'ON DECK']),
  ('Forward Financing', ARRAY['FORWARD FIN', 'FORWARD FINANCING']),
  ('Mulligan Funding', ARRAY['MULLIGAN']),
  ('IOU Financial', ARRAY['IOU FIN', 'IOU FINANCIAL']),
  ('Newport Business Capital', ARRAY['NEWPORT', 'NEWPORT BC']),
  ('FinTap', ARRAY['FINTAP', 'FIN TAP']),
  ('Everest Business Funding', ARRAY['EVEREST', 'EV-BF', 'EV BF']),
  ('Pearl Capital', ARRAY['PEARL', 'PEARL CAP']),
  ('Kapitus', ARRAY['KAPITUS', 'STRATEGIC FUNDING']),
  ('Credibly', ARRAY['CREDIBLY']),
  ('Rapid Finance', ARRAY['RAPID FIN', 'RAPID ADVANCE']),
  ('Fundbox', ARRAY['FUNDBOX'])
) AS v(name, patterns)
WHERE NOT EXISTS (
  SELECT 1 FROM known_mca_funders k WHERE k.name = v.name
);
