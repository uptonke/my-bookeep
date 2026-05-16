-- =========================================================
-- Personal Accounting App Schema for Supabase
-- 單人版記帳系統
-- 不含：Auth / RLS / 多人協作 / 外幣 / 投資追蹤
-- 安全版：不使用 DROP TABLE，不刪舊資料
-- =========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_year INTEGER NOT NULL UNIQUE CHECK (budget_year BETWEEN 2000 AND 2100),
  name TEXT,
  annual_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  carryover_from_previous NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','e_wallet','credit_card','loan','asset','other')),
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_date DATE,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, type)
);

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'saving' CHECK (goal_type IN ('saving','debt_reduction','travel','emergency_fund','purchase','other')),
  target_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_date DATE,
  target_date DATE,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id UUID NOT NULL REFERENCES public.years(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'expense' CHECK (item_type IN ('expense','income','saving','other')),
  planned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  period_type TEXT NOT NULL DEFAULT 'annual' CHECK (period_type IN ('annual','monthly','weekly','custom')),
  start_date DATE,
  end_date DATE,
  rollover_mode TEXT NOT NULL DEFAULT 'none' CHECK (rollover_mode IN ('none','carryover','overspend_to_next')),
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  budget_item_id UUID REFERENCES public.budget_items(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  merchant TEXT,
  payment_method TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared','pending','cancelled')),
  necessity_level TEXT NOT NULL DEFAULT 'other' CHECK (necessity_level IN ('survival','quality','luxury','investment','other')),
  cashflow_nature TEXT NOT NULL DEFAULT 'variable' CHECK (cashflow_nature IN ('fixed','variable','one_time')),
  control_level TEXT NOT NULL DEFAULT 'controllable' CHECK (control_level IN ('controllable','semi_controllable','non_controllable')),
  is_reimbursable BOOLEAN NOT NULL DEFAULT FALSE,
  reimbursement_status TEXT NOT NULL DEFAULT 'none' CHECK (reimbursement_status IN ('none','pending','reimbursed')),
  receipt_url TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_transfer_check CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND account_id <> to_account_id)
    OR (type <> 'transfer' AND to_account_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.transaction_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  file_name TEXT,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  budget_item_id UUID REFERENCES public.budget_items(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly','custom')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_generated_at TIMESTAMPTZ,
  merchant TEXT,
  payment_method TEXT,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_transactions_transfer_check CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND account_id <> to_account_id)
    OR (type <> 'transfer' AND to_account_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.credit_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  issuer TEXT,
  card_name TEXT NOT NULL,
  statement_day INTEGER CHECK (statement_day BETWEEN 1 AND 31),
  payment_due_day INTEGER CHECK (payment_due_day BETWEEN 1 AND 31),
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  annual_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
  reward_type TEXT CHECK (reward_type IN ('cashback','points','miles','none','other')),
  reward_rate NUMERIC(8,4),
  autopay_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credit_card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  statement_date DATE,
  due_date DATE,
  statement_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','overdue','cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  loan_type TEXT NOT NULL DEFAULT 'other' CHECK (loan_type IN ('student_loan','personal_loan','mortgage','car_loan','credit_card_debt','installment','other')),
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  creditor TEXT,
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_principal NUMERIC(14,2) NOT NULL DEFAULT 0,
  annual_interest_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  repayment_method TEXT CHECK (repayment_method IN ('equal_payment','equal_principal','interest_only','custom')),
  monthly_payment NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid_off','paused','cancelled')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yearly_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_id UUID NOT NULL UNIQUE REFERENCES public.years(id) ON DELETE CASCADE,
  actual_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_expense NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_cashflow NUMERIC(14,2) NOT NULL DEFAULT 0,
  available_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  remaining_budget NUMERIC(14,2) NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_years_budget_year ON public.years(budget_year);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON public.accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON public.accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_type ON public.categories(type);
CREATE INDEX IF NOT EXISTS idx_budget_items_year ON public.budget_items(year_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON public.transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_budget_item ON public.transactions(budget_item_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON public.recurring_transactions(next_due_date);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON public.recurring_transactions(is_active);
CREATE INDEX IF NOT EXISTS idx_credit_card_statements_due_date ON public.credit_card_statements(due_date);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
CREATE INDEX IF NOT EXISTS idx_goals_status ON public.goals(status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
  trg TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'app_settings','years','accounts','categories','tags','goals','budget_items',
    'transactions','recurring_transactions','credit_cards','credit_card_statements',
    'loans','yearly_closings'
  ]
  LOOP
    trg := 'set_updated_at_' || tbl;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = trg
      AND tgrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
        trg, tbl
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.v_transactions_full AS
SELECT
  t.*,
  EXTRACT(YEAR FROM t.transaction_date)::INTEGER AS tx_year,
  EXTRACT(MONTH FROM t.transaction_date)::INTEGER AS tx_month,
  a.name AS account_name,
  a.type AS account_type,
  ta.name AS to_account_name,
  c.name AS category_name,
  c.type AS category_type,
  bi.name AS budget_item_name,
  COALESCE((
    SELECT string_agg(DISTINCT tg.name, ', ')
    FROM public.transaction_tags tt
    JOIN public.tags tg ON tg.id = tt.tag_id
    WHERE tt.transaction_id = t.id
  ), '') AS tags
FROM public.transactions t
LEFT JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.accounts ta ON ta.id = t.to_account_id
LEFT JOIN public.categories c ON c.id = t.category_id
LEFT JOIN public.budget_items bi ON bi.id = t.budget_item_id;

CREATE OR REPLACE VIEW public.v_account_balances AS
SELECT
  a.id,
  a.name,
  a.type,
  a.initial_balance,
  a.initial_balance + COALESCE(SUM(
    CASE
      WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
      WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
      WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
      WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
      ELSE 0
    END
  ), 0) AS current_balance,
  a.is_active,
  a.sort_order,
  a.created_at,
  a.updated_at
FROM public.accounts a
LEFT JOIN public.transactions t
  ON (t.account_id = a.id OR t.to_account_id = a.id)
  AND t.status <> 'cancelled'
GROUP BY a.id;

CREATE OR REPLACE VIEW public.v_year_budget_summary AS
WITH tx AS (
  SELECT
    EXTRACT(YEAR FROM transaction_date)::INTEGER AS budget_year,
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS actual_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS actual_expense
  FROM public.transactions
  WHERE status <> 'cancelled'
  GROUP BY EXTRACT(YEAR FROM transaction_date)::INTEGER
),
budget AS (
  SELECT year_id, COALESCE(SUM(planned_amount), 0) AS planned_total
  FROM public.budget_items
  WHERE is_active = TRUE
  GROUP BY year_id
)
SELECT
  y.id AS year_id,
  y.budget_year,
  y.name,
  y.annual_budget,
  y.carryover_from_previous,
  y.annual_budget + y.carryover_from_previous AS available_budget,
  COALESCE(b.planned_total, 0) AS planned_total,
  COALESCE(tx.actual_income, 0) AS actual_income,
  COALESCE(tx.actual_expense, 0) AS actual_expense,
  COALESCE(tx.actual_income, 0) - COALESCE(tx.actual_expense, 0) AS net_cashflow,
  y.annual_budget + y.carryover_from_previous - COALESCE(tx.actual_expense, 0) AS remaining_budget,
  CASE
    WHEN y.annual_budget + y.carryover_from_previous = 0 THEN 0
    ELSE ROUND(COALESCE(tx.actual_expense, 0) / NULLIF(y.annual_budget + y.carryover_from_previous, 0) * 100, 2)
  END AS budget_used_pct,
  y.is_closed,
  y.note,
  y.created_at,
  y.updated_at
FROM public.years y
LEFT JOIN tx ON tx.budget_year = y.budget_year
LEFT JOIN budget b ON b.year_id = y.id;

CREATE OR REPLACE VIEW public.v_budget_item_summary AS
SELECT
  bi.id AS budget_item_id,
  bi.year_id,
  y.budget_year,
  bi.name,
  bi.item_type,
  bi.planned_amount,
  bi.period_type,
  bi.rollover_mode,
  c.name AS category_name,
  c.type AS category_type,
  COALESCE(SUM(CASE WHEN t.status <> 'cancelled' AND t.type = bi.item_type THEN t.amount ELSE 0 END), 0) AS actual_amount,
  bi.planned_amount - COALESCE(SUM(CASE WHEN t.status <> 'cancelled' AND t.type = bi.item_type THEN t.amount ELSE 0 END), 0) AS remaining_amount,
  CASE
    WHEN bi.planned_amount = 0 THEN 0
    ELSE ROUND(COALESCE(SUM(CASE WHEN t.status <> 'cancelled' AND t.type = bi.item_type THEN t.amount ELSE 0 END), 0) / NULLIF(bi.planned_amount, 0) * 100, 2)
  END AS used_pct,
  bi.is_active,
  bi.sort_order,
  bi.note
FROM public.budget_items bi
JOIN public.years y ON y.id = bi.year_id
LEFT JOIN public.categories c ON c.id = bi.category_id
LEFT JOIN public.transactions t ON t.budget_item_id = bi.id
GROUP BY bi.id, y.budget_year, c.name, c.type;

CREATE OR REPLACE VIEW public.v_category_spending AS
SELECT
  EXTRACT(YEAR FROM t.transaction_date)::INTEGER AS budget_year,
  EXTRACT(MONTH FROM t.transaction_date)::INTEGER AS budget_month,
  t.type,
  c.id AS category_id,
  COALESCE(c.name, '未分類') AS category_name,
  COALESCE(SUM(t.amount), 0) AS total_amount,
  COUNT(*) AS transaction_count
FROM public.transactions t
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.status <> 'cancelled'
GROUP BY
  EXTRACT(YEAR FROM t.transaction_date)::INTEGER,
  EXTRACT(MONTH FROM t.transaction_date)::INTEGER,
  t.type,
  c.id,
  c.name;

CREATE OR REPLACE VIEW public.v_monthly_cashflow AS
SELECT
  EXTRACT(YEAR FROM transaction_date)::INTEGER AS budget_year,
  EXTRACT(MONTH FROM transaction_date)::INTEGER AS budget_month,
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS net_cashflow,
  COUNT(*) AS transaction_count
FROM public.transactions
WHERE status <> 'cancelled'
GROUP BY
  EXTRACT(YEAR FROM transaction_date)::INTEGER,
  EXTRACT(MONTH FROM transaction_date)::INTEGER
ORDER BY budget_year, budget_month;

CREATE OR REPLACE VIEW public.v_t_account_entries AS
SELECT
  t.id AS transaction_id,
  t.transaction_date,
  t.type,
  t.amount,
  t.note,
  'Expense: ' || COALESCE(c.name, '未分類支出') AS debit_side,
  'Asset: ' || a.name AS credit_side
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.type = 'expense' AND t.status <> 'cancelled'

UNION ALL

SELECT
  t.id AS transaction_id,
  t.transaction_date,
  t.type,
  t.amount,
  t.note,
  'Asset: ' || a.name AS debit_side,
  'Income: ' || COALESCE(c.name, '未分類收入') AS credit_side
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
LEFT JOIN public.categories c ON c.id = t.category_id
WHERE t.type = 'income' AND t.status <> 'cancelled'

UNION ALL

SELECT
  t.id AS transaction_id,
  t.transaction_date,
  t.type,
  t.amount,
  t.note,
  'Asset: ' || ta.name AS debit_side,
  'Asset: ' || a.name AS credit_side
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
JOIN public.accounts ta ON ta.id = t.to_account_id
WHERE t.type = 'transfer' AND t.status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.close_year_and_create_next(
  p_budget_year INTEGER,
  p_create_next BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  closed_year INTEGER,
  actual_income NUMERIC,
  actual_expense NUMERIC,
  net_cashflow NUMERIC,
  remaining_budget NUMERIC,
  next_year_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_year_id UUID;
  v_annual_budget NUMERIC(14,2);
  v_carryover NUMERIC(14,2);
  v_actual_income NUMERIC(14,2);
  v_actual_expense NUMERIC(14,2);
  v_net_cashflow NUMERIC(14,2);
  v_available_budget NUMERIC(14,2);
  v_remaining_budget NUMERIC(14,2);
  v_next_year_id UUID;
BEGIN
  SELECT id, annual_budget, carryover_from_previous
  INTO v_year_id, v_annual_budget, v_carryover
  FROM public.years
  WHERE budget_year = p_budget_year;

  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'Year % does not exist', p_budget_year;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)
  INTO v_actual_income, v_actual_expense
  FROM public.transactions
  WHERE status <> 'cancelled'
    AND EXTRACT(YEAR FROM transaction_date)::INTEGER = p_budget_year;

  v_net_cashflow := v_actual_income - v_actual_expense;
  v_available_budget := v_annual_budget + v_carryover;
  v_remaining_budget := v_available_budget - v_actual_expense;

  INSERT INTO public.yearly_closings (
    year_id, actual_income, actual_expense, net_cashflow, available_budget, remaining_budget, closed_at
  )
  VALUES (
    v_year_id, v_actual_income, v_actual_expense, v_net_cashflow, v_available_budget, v_remaining_budget, NOW()
  )
  ON CONFLICT (year_id)
  DO UPDATE SET
    actual_income = EXCLUDED.actual_income,
    actual_expense = EXCLUDED.actual_expense,
    net_cashflow = EXCLUDED.net_cashflow,
    available_budget = EXCLUDED.available_budget,
    remaining_budget = EXCLUDED.remaining_budget,
    closed_at = NOW(),
    updated_at = NOW();

  UPDATE public.years SET is_closed = TRUE, updated_at = NOW() WHERE id = v_year_id;

  IF p_create_next THEN
    INSERT INTO public.years (
      budget_year, name, annual_budget, carryover_from_previous
    )
    VALUES (
      p_budget_year + 1,
      (p_budget_year + 1)::TEXT || ' 年度預算',
      v_annual_budget,
      v_remaining_budget
    )
    ON CONFLICT (budget_year)
    DO UPDATE SET
      carryover_from_previous = EXCLUDED.carryover_from_previous,
      updated_at = NOW()
    RETURNING id INTO v_next_year_id;
  ELSE
    v_next_year_id := NULL;
  END IF;

  closed_year := p_budget_year;
  actual_income := v_actual_income;
  actual_expense := v_actual_expense;
  net_cashflow := v_net_cashflow;
  remaining_budget := v_remaining_budget;
  next_year_id := v_next_year_id;
  RETURN NEXT;
END;
$$;

INSERT INTO public.app_settings (key, value, note)
VALUES
  ('app_name', '"個人記帳系統"', '前端顯示名稱'),
  ('base_currency', '"TWD"', '只作為顯示用，本版不做外幣換算'),
  ('schema_version', '"1.0.0"', '資料庫版本')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO public.years (budget_year, name, annual_budget, carryover_from_previous)
VALUES (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER || ' 年度預算', 0, 0)
ON CONFLICT (budget_year) DO NOTHING;

INSERT INTO public.accounts (name, type, initial_balance, sort_order)
VALUES
  ('現金', 'cash', 0, 1),
  ('銀行帳戶', 'bank', 0, 2),
  ('電子支付', 'e_wallet', 0, 3),
  ('信用卡', 'credit_card', 0, 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (name, type, icon, color, sort_order)
VALUES
  ('薪資', 'income', 'briefcase', '#2563eb', 1),
  ('打工', 'income', 'clock', '#2563eb', 2),
  ('獎金', 'income', 'gift', '#2563eb', 3),
  ('利息', 'income', 'percent', '#2563eb', 4),
  ('退款', 'income', 'rotate-ccw', '#2563eb', 5),
  ('其他收入', 'income', 'plus-circle', '#2563eb', 99),
  ('餐飲', 'expense', 'utensils', '#ef4444', 1),
  ('交通', 'expense', 'bus', '#ef4444', 2),
  ('住宿', 'expense', 'home', '#ef4444', 3),
  ('娛樂', 'expense', 'ticket', '#ef4444', 4),
  ('購物', 'expense', 'shopping-bag', '#ef4444', 5),
  ('旅遊', 'expense', 'plane', '#ef4444', 6),
  ('學習', 'expense', 'book-open', '#ef4444', 7),
  ('醫療保健', 'expense', 'heart-pulse', '#ef4444', 8),
  ('訂閱', 'expense', 'repeat', '#ef4444', 9),
  ('房租', 'expense', 'building', '#ef4444', 10),
  ('水電瓦斯', 'expense', 'bolt', '#ef4444', 11),
  ('通訊', 'expense', 'wifi', '#ef4444', 12),
  ('稅費', 'expense', 'receipt', '#ef4444', 13),
  ('保險', 'expense', 'shield', '#ef4444', 14),
  ('其他支出', 'expense', 'minus-circle', '#ef4444', 99),
  ('帳戶轉帳', 'transfer', 'repeat-2', '#64748b', 1),
  ('信用卡繳款', 'transfer', 'credit-card', '#64748b', 2)
ON CONFLICT (name, type) DO NOTHING;

INSERT INTO public.tags (name, color, note)
VALUES
  ('必要', '#0f766e', '生存或固定必要支出'),
  ('非必要', '#f97316', '可刪減支出'),
  ('娛樂預算', '#7c3aed', '年度娛樂預算追蹤'),
  ('旅行', '#0284c7', '旅行相關'),
  ('可報銷', '#16a34a', '之後可請款或報銷'),
  ('衝動消費', '#dc2626', '事後檢討用')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.credit_cards (account_id, issuer, card_name, statement_day, payment_due_day, credit_limit, reward_type, reward_rate)
SELECT a.id, NULL, '信用卡', NULL, NULL, 0, 'none', 0
FROM public.accounts a
WHERE a.name = '信用卡'
ON CONFLICT (account_id) DO NOTHING;

ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.years DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_statements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.yearly_closings DISABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.app_settings,
  public.years,
  public.accounts,
  public.categories,
  public.tags,
  public.goals,
  public.budget_items,
  public.transactions,
  public.transaction_tags,
  public.transaction_documents,
  public.recurring_transactions,
  public.credit_cards,
  public.credit_card_statements,
  public.loans,
  public.loan_payments,
  public.yearly_closings
TO anon, authenticated;

GRANT SELECT ON TABLE
  public.v_transactions_full,
  public.v_account_balances,
  public.v_year_budget_summary,
  public.v_budget_item_summary,
  public.v_category_spending,
  public.v_monthly_cashflow,
  public.v_t_account_entries
TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.close_year_and_create_next(INTEGER, BOOLEAN)
TO anon, authenticated;

COMMIT;
