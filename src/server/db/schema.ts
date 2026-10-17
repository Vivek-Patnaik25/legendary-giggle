import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function getDatabasePath(dbUrl?: string): string {
  const url = dbUrl || process.env.DATABASE_URL || 'sqlite://./data/pantry.db';
  if (url === ':memory:') {
    return ':memory:';
  }
  let cleanPath = url.replace(/^sqlite:\/\//, '');
  let absolutePath = path.isAbsolute(cleanPath)
    ? cleanPath
    : path.resolve(process.cwd(), cleanPath);
  let dir = path.dirname(absolutePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // If target directory is unwritable (e.g. /var/data on Render Free tier without a mounted disk),
    // automatically fallback to local project ./data directory
    console.warn(`[Database] Warning: Cannot create database directory at '${dir}'. Falling back to local './data' directory.`);
    const fallbackDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    absolutePath = path.resolve(fallbackDir, 'pantry.db');
  }

  return absolutePath;
}

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || getDatabasePath();
  const db = new Database(resolvedPath);

  // Configure SQLite WAL mode and busy timeout for safe concurrent multi-process access
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

export function runMigrations(db: Database.Database): void {
  // Ensure versioned schema migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
  const appliedVersions = new Set(applied.map(a => a.version));

  // Migration 001: Core relational schema
  if (!appliedVersions.has(1)) {
    db.transaction(() => {
      db.exec(`
        -- Users
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Sessions
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Households
        CREATE TABLE households (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          weekly_waste_target REAL DEFAULT 2.0, -- Max wasted items allowed per week for streak
          timezone TEXT DEFAULT 'UTC',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at DATETIME DEFAULT NULL
        );

        -- Household Members (RBAC: owner, member, guest)
        CREATE TABLE members (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('owner', 'member', 'guest')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at DATETIME DEFAULT NULL,
          UNIQUE(household_id, user_id)
        );

        -- Household Invites
        CREATE TABLE invites (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          code TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK(role IN ('member', 'guest')),
          inviter_user_id TEXT NOT NULL REFERENCES users(id),
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME DEFAULT NULL,
          redeemed_at DATETIME DEFAULT NULL,
          redeemed_by_user_id TEXT REFERENCES users(id) DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Items (Inventory)
        CREATE TABLE items (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'general',
          location TEXT NOT NULL CHECK(location IN ('fridge', 'freezer', 'pantry')) DEFAULT 'fridge',
          initial_quantity REAL NOT NULL DEFAULT 1,
          current_quantity REAL NOT NULL DEFAULT 1,
          unit TEXT NOT NULL DEFAULT 'piece',
          expiry_date TEXT DEFAULT NULL, -- Format YYYY-MM-DD
          is_frozen INTEGER DEFAULT 0,
          frozen_at TEXT DEFAULT NULL,
          claimed_by_user_id TEXT REFERENCES users(id) DEFAULT NULL,
          notes TEXT DEFAULT '',
          barcode TEXT DEFAULT NULL,
          is_leftover INTEGER DEFAULT 0,
          status TEXT NOT NULL CHECK(status IN ('active', 'consumed', 'wasted')) DEFAULT 'active',
          created_by_user_id TEXT NOT NULL REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_at DATETIME DEFAULT NULL
        );

        -- Quantity Operation Deltas (Supports safe concurrent modifications)
        CREATE TABLE item_deltas (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          delta REAL NOT NULL,
          unit TEXT NOT NULL,
          reason TEXT NOT NULL CHECK(reason IN ('initial', 'cook', 'waste', 'adjust')),
          idempotency_key TEXT UNIQUE DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Scoreboard Events (Feeds household score, streaks, and weekly targets)
        CREATE TABLE scoreboard_events (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
          event_type TEXT NOT NULL CHECK(event_type IN ('rescued', 'wasted')),
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          date TEXT NOT NULL, -- YYYY-MM-DD
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Badges
        CREATE TABLE badges (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          badge_key TEXT NOT NULL,
          unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT DEFAULT '{}',
          UNIQUE(household_id, badge_key)
        );

        -- Score & System Audit Logs
        CREATE TABLE audit_logs (
          id TEXT PRIMARY KEY,
          household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES users(id) DEFAULT NULL,
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          details TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Key-Value Cache (for barcodes and external lookups)
        CREATE TABLE cache_entries (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Distributed Background Job Locks
        CREATE TABLE job_locks (
          job_name TEXT PRIMARY KEY,
          locked_by TEXT NOT NULL,
          locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL
        );

        -- Local Development Inbox for Verification & Reset Tokens
        CREATE TABLE local_messages (
          id TEXT PRIMARY KEY,
          recipient_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          token TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Performance & Concurrency Indexes
        CREATE INDEX idx_items_household_active ON items(household_id, status) WHERE deleted_at IS NULL;
        CREATE INDEX idx_items_expiry ON items(household_id, expiry_date) WHERE deleted_at IS NULL AND status = 'active';
        CREATE INDEX idx_members_lookup ON members(household_id, user_id) WHERE deleted_at IS NULL;
        CREATE INDEX idx_deltas_item ON item_deltas(item_id);
        CREATE INDEX idx_scoreboard_household_date ON scoreboard_events(household_id, date);
        CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
      `);

      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (1, 'initial_schema')").run();
    })();
  }

  // Migration 002: Analytics event tracking & guest accounts
  if (!appliedVersions.has(2)) {
    db.transaction(() => {
      // Add is_guest column if not exists
      try {
        db.exec("ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0;");
      } catch {
        // column may already exist
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id TEXT PRIMARY KEY,
          household_id TEXT,
          user_id TEXT,
          event_type TEXT NOT NULL,
          event_data TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_analytics_hh ON analytics_events(household_id);
      `);

      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (2, 'analytics_and_guest_accounts')").run();
    })();
  }
}
