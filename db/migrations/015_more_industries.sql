-- F16: more everyday kinds of business a person can pick at sign-up. The three that already have their own extra business
-- questions (travel agent, car dealer, wedding planner; see the knowledge module) now exist, so those extras take effect.
-- The others get the general questions only for now. A reference table: no account_id, read-only for the app role.
-- ON CONFLICT DO NOTHING keeps a re-run, or an industry the platform already added by hand, untouched.

INSERT INTO app.industries (id, label, sort_order) VALUES
  ('restaurant_cafe', 'Restaurant, cafe or catering',  25),
  ('travel_agent',    'Travel agent or tour operator', 35),
  ('wedding_planner', 'Wedding or event planner',      37),
  ('car_dealer',      'Car or bike dealer',            55),
  ('auto_service',    'Garage or vehicle service',     56),
  ('salon_spa',       'Salon, spa or beauty',          65),
  ('gym_fitness',     'Gym, yoga or fitness studio',   66)
ON CONFLICT (id) DO NOTHING;
