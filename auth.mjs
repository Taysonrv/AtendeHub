import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const failure = (status, message) => Object.assign(new Error(message), { status });
export function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw failure(400, 'Informe um e-mail válido.');
  return value.trim().toLowerCase();
}
export function validPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw failure(400, 'Use uma senha entre 12 e 128 caracteres.');
  return value;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hash] = (encoded || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await derive(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export function authentication(db, { secureCookies = false } = {}) {
  const digest = token => createHash('sha256').update(token).digest('hex');
  const cookie = (token, maxAge) => `atendehub_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const publicUser = user => ({ id:user.id, name:user.name, email:user.email, role:user.role, organization_id:user.organization_id, organization_name:user.organization_name });
  return {
    publicUser,
    find(req) {
      const token = (req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('atendehub_session='))?.slice('atendehub_session='.length);
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      return db.prepare(`SELECT u.id,u.name,u.email,u.role,u.organization_id,o.name AS organization_name,s.token_hash
        FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.organization_id
        WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).get(digest(token), Date.now());
    },
    start(res, id) {
      const token=randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),id,Date.now()+8*60*60*1000);
      res.setHeader('Set-Cookie',cookie(token,8*60*60));
    },
    end(res,user) {
      if(user) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
      res.setHeader('Set-Cookie',cookie('',0));
    }
  };
}
