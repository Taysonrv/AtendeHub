import { DatabaseSync } from 'node:sqlite';
export function openDatabase(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL REFERENCES organizations(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','agent')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), title TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL, owner TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Aberto', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), text TEXT NOT NULL, created_at TEXT NOT NULL);`);
  for (const table of ['clients','tickets']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='organization_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN organization_id INTEGER REFERENCES organizations(id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${table}_organization ON ${table}(organization_id)`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS events_ticket ON events(ticket_id); CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);');
  const ticketColumns = db.prepare('PRAGMA table_info(tickets)').all().map(c=>c.name);
  for(const [column,definition] of [['owner_id','INTEGER REFERENCES users(id)'],['closed_at','TEXT'],['solution',"TEXT NOT NULL DEFAULT ''"],['version','INTEGER NOT NULL DEFAULT 0']]) {
    if(!ticketColumns.includes(column)) db.exec(`ALTER TABLE tickets ADD COLUMN ${column} ${definition}`);
  }
  return db;
}
