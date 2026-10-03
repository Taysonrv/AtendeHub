import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
export function createApp(databasePath = ':memory:') {
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id), title TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL, owner TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Aberto', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id), text TEXT NOT NULL, created_at TEXT NOT NULL);`);
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const required = (value, label, max = 200) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw Object.assign(new Error(`${label}: informe um valor entre 1 e ${max} caracteres.`), { status: 400 }); return value.trim(); };
  async function body(req) {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 32000) throw Object.assign(new Error('Conteúdo muito grande.'), { status: 413 }); }
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Conteúdo inválido.'), { status: 400 }); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/') && req.method !== 'GET') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'Origem não autorizada.' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Use conteúdo JSON.' });
      }
      if (url.pathname === '/api/clients' && req.method === 'GET') return send(res, 200, db.prepare('SELECT * FROM clients ORDER BY name').all());
      if (url.pathname === '/api/clients' && req.method === 'POST') {
        const b = await body(req); const name = required(b.name, 'Nome');
        const contact = typeof b.contact === 'string' ? b.contact.trim().slice(0, 200) : '';
        const email = typeof b.email === 'string' ? b.email.trim().slice(0, 254) : '';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'E-mail inválido.' });
        const result = db.prepare('INSERT INTO clients(name,contact,email,created_at) VALUES(?,?,?,?)').run(name, contact, email, new Date().toISOString());
        return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (url.pathname === '/api/tickets' && req.method === 'GET') return send(res, 200, db.prepare('SELECT t.*, c.name AS client_name FROM tickets t JOIN clients c ON c.id=t.client_id ORDER BY t.id DESC').all());
      if (url.pathname === '/api/tickets' && req.method === 'POST') {
        const b = await body(req); const title = required(b.title, 'Título'); const description = required(b.description, 'Descrição', 5000); const owner = required(b.owner, 'Responsável');
        if (!db.prepare('SELECT id FROM clients WHERE id=?').get(Number(b.client_id) || 0)) return send(res, 400, { error: 'Escolha um cliente cadastrado.' });
        if (!['Baixa', 'Normal', 'Alta'].includes(b.priority)) return send(res, 400, { error: 'Prioridade inválida.' });
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date || '') || !Number.isFinite(Date.parse(b.due_date)) || new Date(b.due_date).toISOString().slice(0, 10) !== b.due_date) return send(res, 400, { error: 'Informe uma data válida.' });
        db.exec('BEGIN');
        try {
          const now = new Date().toISOString();
          const result = db.prepare('INSERT INTO tickets(client_id,title,description,priority,owner,due_date,created_at) VALUES(?,?,?,?,?,?,?)').run(Number(b.client_id),title,description,b.priority,owner,b.due_date,now);
          const id = Number(result.lastInsertRowid); db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(id,'Chamado aberto.',now); db.exec('COMMIT'); return send(res, 201, { id });
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      }
      const match = url.pathname.match(/^\/api\/tickets\/(\d+)(\/events)?$/);
      if (match) {
        const id = Number(match[1]); const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
        if (!ticket) return send(res, 404, { error: 'Chamado não encontrado.' });
        if (req.method === 'GET' && match[2]) return send(res, 200, db.prepare('SELECT * FROM events WHERE ticket_id=? ORDER BY id DESC').all(id));
        if (req.method === 'POST' && match[2]) { const b = await body(req); const note = required(b.text, 'Atualização', 5000); db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(id,note,new Date().toISOString()); return send(res, 201, { ok: true }); }
        if (req.method === 'PATCH' && !match[2]) {
          const b = await body(req); if (!['Aberto','Em andamento','Concluído'].includes(b.status)) return send(res, 400, { error: 'Situação inválida.' });
          if (b.status !== ticket.status) {
            db.exec('BEGIN'); try { db.prepare('UPDATE tickets SET status=? WHERE id=?').run(b.status,id); db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(id,`Situação alterada para ${b.status}.`,new Date().toISOString()); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
          }
          return send(res, 200, { ok: true });
        }
      }
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Recurso não encontrado.' });
      const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/styles.css': ['styles.css','text/css'], '/favicon.svg': ['favicon.svg','image/svg+xml'] };
      const file = files[url.pathname]; if (!file || req.method !== 'GET') return send(res, 404, { error: 'Página não encontrada.' });
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(readFileSync(path.join(root,'public',file[0])));
    } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Não foi possível concluir a operação.' }); }
  });
  server.on('close', () => db.close()); return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(root,'data'), { recursive: true });
  createApp(path.join(root,'data','atendehub.sqlite')).listen(Number(process.env.PORT || 3100), '127.0.0.1', () => console.log('AtendeHub: http://127.0.0.1:3100'));
}
