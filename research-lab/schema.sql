PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  tour TEXT NOT NULL CHECK (tour IN ('ATP','WTA','CHALLENGER','ITF','OTHER')),
  category TEXT,
  tournament_id TEXT,
  tournament_name TEXT,
  scheduled_start_utc TEXT,
  match_date_utc TEXT NOT NULL,
  surface TEXT CHECK (surface IN ('Hard','Clay','Grass','Carpet','Unknown') OR surface IS NULL),
  player_a_id TEXT NOT NULL,
  player_b_id TEXT NOT NULL,
  player_a_name TEXT,
  player_b_name TEXT,
  match_status TEXT NOT NULL DEFAULT 'scheduled',
  winner_id TEXT,
  score TEXT,
  result_source TEXT,
  result_verified_at TEXT,
  CHECK (player_a_id <> player_b_id),
  CHECK (winner_id IS NULL OR winner_id IN (player_a_id, player_b_id))
);

CREATE TABLE IF NOT EXISTS match_results (
  result_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(match_id),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  match_status TEXT NOT NULL CHECK (match_status IN ('completed','retired','walkover','default','abandoned','cancelled','unknown')),
  winner_id TEXT,
  score TEXT,
  source TEXT NOT NULL,
  source_published_at TEXT,
  verified_at TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 0 CHECK (is_official IN (0,1)),
  UNIQUE (match_id, result_version),
);

CREATE TABLE IF NOT EXISTS model_versions (
  model_version_id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL CHECK (system_id IN ('PFE','ACE','SMA','HFA','AGG','MVE')),
  version_label TEXT NOT NULL,
  git_commit_sha TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  training_cutoff TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS system_outputs (
  output_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(match_id),
  system_id TEXT NOT NULL CHECK (system_id IN ('PFE','ACE','SMA','HFA')),
  model_version_id TEXT NOT NULL REFERENCES model_versions(model_version_id),
  prediction_created_at TEXT NOT NULL,
  data_cutoff_at TEXT NOT NULL,
  probability_a REAL,
  probability_b REAL,
  signal_a REAL,
  signal_b REAL,
  reliability REAL,
  coverage REAL,
  uncertainty REAL,
  status TEXT NOT NULL CHECK (status IN ('available','insufficient_data','abstain','error')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  missing_fields_json TEXT NOT NULL DEFAULT '[]',
  CHECK (probability_a IS NULL OR (probability_a > 0 AND probability_a < 1)),
  CHECK (probability_b IS NULL OR (probability_b > 0 AND probability_b < 1)),
  CHECK ((probability_a IS NULL AND probability_b IS NULL) OR
         (probability_a IS NOT NULL AND probability_b IS NOT NULL AND abs(probability_a + probability_b - 1.0) < 0.00001)),
  CHECK (signal_a IS NULL OR signal_a BETWEEN -1 AND 1),
  CHECK (signal_b IS NULL OR signal_b BETWEEN -1 AND 1),
  CHECK (reliability IS NULL OR reliability BETWEEN 0 AND 1),
  CHECK (coverage IS NULL OR coverage BETWEEN 0 AND 1),
  CHECK (data_cutoff_at <= prediction_created_at),
  UNIQUE (match_id, system_id, model_version_id, prediction_created_at)
);

CREATE TABLE IF NOT EXISTS aggregator_runs (
  run_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(match_id),
  aggregator_version_id TEXT NOT NULL REFERENCES model_versions(model_version_id),
  combination_id TEXT NOT NULL,
  prediction_created_at TEXT NOT NULL,
  data_cutoff_at TEXT NOT NULL,
  probability_a REAL,
  probability_b REAL,
  logit_score REAL,
  weights_json TEXT NOT NULL DEFAULT '{}',
  reliability_json TEXT NOT NULL DEFAULT '{}',
  contribution_pp_json TEXT NOT NULL DEFAULT '{}',
  systems_used_json TEXT NOT NULL DEFAULT '[]',
  systems_missing_json TEXT NOT NULL DEFAULT '[]',
  uncertainty REAL,
  abstained INTEGER NOT NULL DEFAULT 0 CHECK (abstained IN (0,1)),
  CHECK ((probability_a IS NULL AND probability_b IS NULL) OR
         (probability_a > 0 AND probability_a < 1 AND probability_b > 0 AND probability_b < 1
          AND abs(probability_a + probability_b - 1.0) < 0.00001)),
  CHECK (data_cutoff_at <= prediction_created_at),
  UNIQUE (match_id, aggregator_version_id, combination_id, prediction_created_at)
);

CREATE TABLE IF NOT EXISTS market_quotes (
  quote_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(match_id),
  bookmaker TEXT NOT NULL,
  market_type TEXT NOT NULL DEFAULT 'match_winner',
  selection_player_id TEXT NOT NULL,
  decimal_odds REAL NOT NULL CHECK (decimal_odds > 1),
  captured_at TEXT NOT NULL,
  source_timestamp TEXT,
  source_id TEXT,
  is_pre_match INTEGER NOT NULL DEFAULT 1 CHECK (is_pre_match IN (0,1))
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  evaluation_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  evaluation_window_start TEXT NOT NULL,
  evaluation_window_end TEXT NOT NULL,
  training_cutoff TEXT,
  dataset_version TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  sample_definition_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  limitations TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_outputs_match_system
  ON system_outputs(match_id, system_id, prediction_created_at);
CREATE INDEX IF NOT EXISTS idx_aggregator_runs_match_combo
  ON aggregator_runs(match_id, combination_id, prediction_created_at);
CREATE INDEX IF NOT EXISTS idx_market_quotes_match_time
  ON market_quotes(match_id, bookmaker, captured_at);

CREATE TRIGGER IF NOT EXISTS validate_quote_selection_insert
BEFORE INSERT ON market_quotes
WHEN NOT EXISTS (
  SELECT 1 FROM matches
  WHERE match_id = NEW.match_id
    AND NEW.selection_player_id IN (player_a_id, player_b_id)
)
BEGIN
  SELECT RAISE(ABORT, 'quote selection must belong to the match');
END;

CREATE TRIGGER IF NOT EXISTS validate_quote_selection_update
BEFORE UPDATE OF match_id, selection_player_id ON market_quotes
WHEN NOT EXISTS (
  SELECT 1 FROM matches
  WHERE match_id = NEW.match_id
    AND NEW.selection_player_id IN (player_a_id, player_b_id)
)
BEGIN
  SELECT RAISE(ABORT, 'quote selection must belong to the match');
END;

CREATE INDEX IF NOT EXISTS idx_match_results_match_version
  ON match_results(match_id, result_version);

CREATE TRIGGER IF NOT EXISTS validate_match_result_winner_insert
BEFORE INSERT ON match_results
WHEN NEW.winner_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM matches
  WHERE match_id = NEW.match_id
    AND NEW.winner_id IN (player_a_id, player_b_id)
)
BEGIN
  SELECT RAISE(ABORT, 'result winner must belong to the match');
END;

CREATE TRIGGER IF NOT EXISTS prevent_match_result_update
BEFORE UPDATE ON match_results
BEGIN
  SELECT RAISE(ABORT, 'match results are append-only; insert a new result_version');
END;

CREATE TRIGGER IF NOT EXISTS prevent_match_result_delete
BEFORE DELETE ON match_results
BEGIN
  SELECT RAISE(ABORT, 'match results are append-only');
END;

CREATE TRIGGER IF NOT EXISTS prevent_system_output_update
BEFORE UPDATE ON system_outputs
BEGIN
  SELECT RAISE(ABORT, 'system outputs are immutable; create a new model version or prediction');
END;

CREATE TRIGGER IF NOT EXISTS prevent_system_output_delete
BEFORE DELETE ON system_outputs
BEGIN
  SELECT RAISE(ABORT, 'system outputs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_aggregator_run_update
BEFORE UPDATE ON aggregator_runs
BEGIN
  SELECT RAISE(ABORT, 'aggregator runs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_aggregator_run_delete
BEFORE DELETE ON aggregator_runs
BEGIN
  SELECT RAISE(ABORT, 'aggregator runs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_market_quote_update
BEFORE UPDATE ON market_quotes
BEGIN
  SELECT RAISE(ABORT, 'market quote snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_market_quote_delete
BEFORE DELETE ON market_quotes
BEGIN
  SELECT RAISE(ABORT, 'market quote snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_model_version_update
BEFORE UPDATE ON model_versions
BEGIN
  SELECT RAISE(ABORT, 'model versions are immutable; create a new version');
END;

CREATE TRIGGER IF NOT EXISTS prevent_model_version_delete
BEFORE DELETE ON model_versions
BEGIN
  SELECT RAISE(ABORT, 'model versions are immutable');
END;
