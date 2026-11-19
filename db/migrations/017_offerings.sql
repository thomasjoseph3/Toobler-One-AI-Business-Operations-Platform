-- F17 slice 0: what the business sells (offerings) and its time-limited promotions (offers).
--
-- The AI states these; it never works out a total. A price is always a "from" price in paise, with a GST note. An offering with
-- no price is allowed (the business does not share prices). Offerings and offers are soft deleted: a lead may point at an
-- offering, and the history must stay readable. The Phase 2 sales engine extends this same table (see the F17 brief).

CREATE TABLE app.offerings (
  id               uuid PRIMARY KEY,
  account_id       uuid        NOT NULL REFERENCES app.accounts (id),
  name             text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description      text        CHECK (length(description) <= 1000),
  -- Money in paise (whole numbers), never rupees with decimals. Null when the business does not share a price.
  from_price_paise bigint      CHECK (from_price_paise BETWEEN 0 AND 100000000000),
  -- In words: "per night", "per person"... (the screen offers a few; any short words are allowed)
  price_unit       text        CHECK (length(price_unit) BETWEEN 1 AND 40),
  gst_mode         text        CHECK (gst_mode IN ('included', 'plus', 'none')),
  season_note      text        CHECK (length(season_note) <= 300),
  includes         text        CHECK (length(includes) <= 500),
  -- A list of { "label": "...", "value": "..." } pairs, at most 10 (checked by the API)
  details          jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(details) = 'array'),
  active           boolean     NOT NULL DEFAULT true,
  sort             integer     NOT NULL CHECK (sort >= 0),
  -- The person who looks after this offering; new leads about it can go to them (migration 018)
  owner_user_id    uuid,
  deleted_at       timestamptz,
  created_by       jsonb,
  updated_by       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offerings_owner_same_business_fkey
    FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id),
  -- A price comes with its unit and its GST note, and the other way round: no half-described prices
  CONSTRAINT offerings_price_is_complete CHECK (
    (from_price_paise IS NULL AND price_unit IS NULL AND gst_mode IS NULL)
    OR (from_price_paise IS NOT NULL AND price_unit IS NOT NULL AND gst_mode IS NOT NULL)
  ),
  -- Lets a lead point at an offering of its own business only (migration 018)
  CONSTRAINT offerings_account_and_id UNIQUE (account_id, id)
);
-- One live offering per name in a business, ignoring capitals
CREATE UNIQUE INDEX offerings_name_unique ON app.offerings (account_id, lower(name)) WHERE deleted_at IS NULL;
-- The list in order
CREATE INDEX offerings_in_order ON app.offerings (account_id, sort, id) WHERE deleted_at IS NULL;
CREATE TRIGGER offerings_set_updated_at BEFORE UPDATE ON app.offerings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.offerings');

-- Defence in depth: business code can add offerings and change the editable columns only. It can never delete a row and never
-- change the business or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.offerings FROM app_user;
GRANT INSERT (id, account_id, name, description, from_price_paise, price_unit, gst_mode, season_note, includes, details, active,
              sort, owner_user_id, created_by, updated_by, created_at, updated_at)
  ON app.offerings TO app_user;
GRANT UPDATE (name, description, from_price_paise, price_unit, gst_mode, season_note, includes, details, active, sort,
              owner_user_id, deleted_at, updated_by, updated_at)
  ON app.offerings TO app_user;

CREATE TABLE app.offers (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  text       text        NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  -- The last day the offer is on, a plain date: it counts through the end of that day in the business's time zone
  ends_on    date        NOT NULL,
  deleted_at timestamptz,
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_by_end ON app.offers (account_id, ends_on) WHERE deleted_at IS NULL;
CREATE TRIGGER offers_set_updated_at BEFORE UPDATE ON app.offers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.offers');

REVOKE INSERT, UPDATE, DELETE ON app.offers FROM app_user;
GRANT INSERT (id, account_id, text, ends_on, created_by, updated_by, created_at, updated_at) ON app.offers TO app_user;
GRANT UPDATE (text, ends_on, deleted_at, updated_by, updated_at) ON app.offers TO app_user;
