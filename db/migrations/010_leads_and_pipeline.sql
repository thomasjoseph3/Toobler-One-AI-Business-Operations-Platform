-- F06: the pipeline (stages), lost reasons, how new leads are shared out, and the leads themselves.
--
-- Left out on purpose until their feature arrives (each is one small migration): team_id (F02), company_id (F05),
-- offering_id (F17), custom fields (F09), the temperature reason (F10).

-- One pipeline per business in Phase 1 (the unique index makes that a rule of the database).
CREATE TABLE app.pipelines (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pipelines_one_per_account ON app.pipelines (account_id);
CREATE TRIGGER pipelines_set_updated_at BEFORE UPDATE ON app.pipelines
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.pipelines');

-- The columns of the board. `kind` says what a stage means: open stages are in progress; Won and Lost close the lead.
CREATE TABLE app.pipeline_stages (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  pipeline_id uuid        NOT NULL REFERENCES app.pipelines (id),
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  -- Left to right on the board. Won and Lost are always the last two (the service keeps them there).
  sort        integer     NOT NULL CHECK (sort >= 0),
  kind        text        NOT NULL CHECK (kind IN ('open', 'won', 'lost')),
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Two stages of one business never share a name (checked ignoring capitals)
CREATE UNIQUE INDEX pipeline_stages_name_unique ON app.pipeline_stages (pipeline_id, lower(name));
-- Exactly one Won and one Lost stage per pipeline, so they can never be added twice or removed by mistake
CREATE UNIQUE INDEX pipeline_stages_one_won_one_lost ON app.pipeline_stages (pipeline_id, kind)
  WHERE kind IN ('won', 'lost');
CREATE INDEX pipeline_stages_in_order ON app.pipeline_stages (pipeline_id, sort);
CREATE TRIGGER pipeline_stages_set_updated_at BEFORE UPDATE ON app.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.pipeline_stages');

-- The reasons a manager offers when a lead is lost ("too costly", "went elsewhere"...).
CREATE TABLE app.lost_reasons (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  label      text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  sort       integer     NOT NULL CHECK (sort >= 0),
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lost_reasons_label_unique ON app.lost_reasons (account_id, lower(label));
CREATE TRIGGER lost_reasons_set_updated_at BEFORE UPDATE ON app.lost_reasons
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.lost_reasons');

-- How new leads are shared out. One row per business. 'by_offering' arrives with F17 (offerings).
CREATE TABLE app.assignment_rules (
  account_id           uuid PRIMARY KEY REFERENCES app.accounts (id),
  mode                 text        NOT NULL DEFAULT 'one_person' CHECK (mode IN ('one_person', 'round_robin')),
  -- For 'one_person': who gets every new lead
  user_id              uuid        REFERENCES app.users (id),
  -- For 'round_robin': who got the last new lead, so the next one goes to the person after them
  last_assigned_user_id uuid       REFERENCES app.users (id),
  created_by           jsonb,
  updated_by           jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER assignment_rules_set_updated_at BEFORE UPDATE ON app.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.assignment_rules');

-- One enquiry that might become a sale.
CREATE TABLE app.leads (
  id               uuid PRIMARY KEY,
  account_id       uuid        NOT NULL REFERENCES app.accounts (id),
  contact_id       uuid        NOT NULL REFERENCES app.contacts (id),
  stage_id         uuid        NOT NULL REFERENCES app.pipeline_stages (id),
  -- Until lead scoring (F10) every lead is 'unscored'
  temperature      text        NOT NULL DEFAULT 'unscored' CHECK (temperature IN ('unscored', 'hot', 'warm', 'cold')),
  -- What the person wants, in their words ("3 nights in December, 4 people")
  interest         text        CHECK (length(interest) <= 1000),
  date_from        date,
  date_to          date,
  party_size       integer     CHECK (party_size BETWEEN 1 AND 10000),
  -- Money in paise (whole numbers), never rupees with decimals
  budget_paise     bigint      CHECK (budget_paise >= 0),
  -- What the AI or staff promised ("we will call you back tomorrow") and when
  promise          text        CHECK (length(promise) <= 500),
  callback_at      timestamptz,
  owner_user_id    uuid        REFERENCES app.users (id),
  first_channel    text        NOT NULL DEFAULT 'manual'
                               CHECK (first_channel IN ('manual', 'web_chat', 'whatsapp', 'email', 'phone')),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  -- The reason as it was worded when the lead was lost, so renaming a reason later does not rewrite history
  lost_reason      text        CHECK (length(lost_reason) <= 80),
  -- Set when the lead reaches Won or Lost; cleared if it is reopened
  closed_at        timestamptz,
  deleted_at       timestamptz,
  created_by       jsonb,
  updated_by       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_dates_in_order CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from),
  -- A lead has a lost reason only when it is closed
  CONSTRAINT leads_lost_reason_needs_closed CHECK (lost_reason IS NULL OR closed_at IS NOT NULL)
);
-- The board and the list: per business, per stage, newest activity first
CREATE INDEX leads_board ON app.leads (account_id, stage_id, last_activity_at DESC, id DESC) WHERE deleted_at IS NULL;
-- "Does this person already have a lead?" (the open-lead rule, R6) and a contact's leads
CREATE INDEX leads_by_contact ON app.leads (account_id, contact_id, created_at DESC) WHERE deleted_at IS NULL;
-- "My leads" for a person
CREATE INDEX leads_by_owner ON app.leads (account_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON app.leads
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.leads');

-- Defence in depth, as for `contacts`: business code can add leads and change the editable columns only. It can never
-- delete a row (delete is soft) and never change the business, the contact or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.leads FROM app_user;
GRANT INSERT (id, account_id, contact_id, stage_id, temperature, interest, date_from, date_to, party_size, budget_paise,
              promise, callback_at, owner_user_id, first_channel, last_activity_at, created_by, updated_by, created_at,
              updated_at)
  ON app.leads TO app_user;
GRANT UPDATE (stage_id, temperature, interest, date_from, date_to, party_size, budget_paise, promise, callback_at,
              owner_user_id, last_activity_at, lost_reason, closed_at, deleted_at, updated_by, updated_at)
  ON app.leads TO app_user;

-- Stages and lost reasons are removed for real (a removed stage's leads are moved first), so those keep DELETE. The
-- business can never be changed on any of these tables.
REVOKE UPDATE ON app.pipelines, app.pipeline_stages, app.lost_reasons, app.assignment_rules FROM app_user;
GRANT UPDATE (name, updated_by, updated_at) ON app.pipelines TO app_user;
GRANT UPDATE (name, sort, updated_by, updated_at) ON app.pipeline_stages TO app_user;
GRANT UPDATE (label, sort, updated_by, updated_at) ON app.lost_reasons TO app_user;
GRANT UPDATE (mode, user_id, last_assigned_user_id, updated_by, updated_at) ON app.assignment_rules TO app_user;
-- The pipeline itself and the Won and Lost stages are never deleted by business code
REVOKE DELETE ON app.pipelines, app.assignment_rules FROM app_user;

-- Every business that exists today gets what a new business gets: the default pipeline (New, Contacted, Quoted, Won,
-- Lost), the five lost reasons, and "all new leads go to the person who signed up".
INSERT INTO app.pipelines (id, account_id, name, created_by, updated_by)
SELECT gen_random_uuid(), a.id, 'Sales pipeline', '{"kind":"system","id":null}'::jsonb, '{"kind":"system","id":null}'::jsonb
FROM app.accounts a;

INSERT INTO app.pipeline_stages (id, account_id, pipeline_id, name, sort, kind, created_by, updated_by)
SELECT gen_random_uuid(), p.account_id, p.id, s.name, s.sort, s.kind,
       '{"kind":"system","id":null}'::jsonb, '{"kind":"system","id":null}'::jsonb
FROM app.pipelines p
CROSS JOIN (VALUES ('New', 0, 'open'), ('Contacted', 1, 'open'), ('Quoted', 2, 'open'),
                   ('Won', 3, 'won'), ('Lost', 4, 'lost')) AS s (name, sort, kind);

INSERT INTO app.lost_reasons (id, account_id, label, sort, created_by, updated_by)
SELECT gen_random_uuid(), a.id, r.label, r.sort, '{"kind":"system","id":null}'::jsonb, '{"kind":"system","id":null}'::jsonb
FROM app.accounts a
CROSS JOIN (VALUES ('Too costly', 0), ('Went elsewhere', 1), ('Dates not available', 2), ('No reply', 3),
                   ('Other', 4)) AS r (label, sort);

INSERT INTO app.assignment_rules (account_id, mode, user_id, created_by, updated_by)
SELECT a.id, 'one_person',
       (SELECT u.id FROM app.users u WHERE u.account_id = a.id AND u.role = 'manager' ORDER BY u.created_at LIMIT 1),
       '{"kind":"system","id":null}'::jsonb, '{"kind":"system","id":null}'::jsonb
FROM app.accounts a;
