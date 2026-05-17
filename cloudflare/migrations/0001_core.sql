CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  current_version_id TEXT NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'anonymous',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_artifacts_visibility_updated_at
  ON artifacts (visibility, updated_at DESC);

CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('html', 'mdx')),
  rendered_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  thumbnail_key TEXT,
  checksum TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  source_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'agent' CHECK (created_by IN ('agent', 'user', 'system')),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE INDEX idx_artifact_versions_artifact_created_at
  ON artifact_versions (artifact_id, created_at DESC);

CREATE TABLE artifact_shares (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'comment', 'fork')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE INDEX idx_artifact_shares_artifact_id
  ON artifact_shares (artifact_id);

CREATE TABLE artifact_tags (
  artifact_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, tag),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE INDEX idx_artifact_tags_tag
  ON artifact_tags (tag);

CREATE TABLE artifact_categories (
  artifact_id TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, category),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE INDEX idx_artifact_categories_category
  ON artifact_categories (category);
