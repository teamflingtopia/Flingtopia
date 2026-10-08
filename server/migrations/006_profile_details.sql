ALTER TABLE users
  ADD COLUMN custom_gender text NOT NULL DEFAULT '' CHECK(length(custom_gender)<=60),
  ADD COLUMN connection_goals text[] NOT NULL DEFAULT '{}' CHECK(cardinality(connection_goals)<=4),
  ADD COLUMN languages text[] NOT NULL DEFAULT '{}' CHECK(cardinality(languages)<=10),
  ADD COLUMN social_links jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(social_links)='object');
