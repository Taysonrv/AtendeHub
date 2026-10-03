import http from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDatabase } from './database.mjs';
import { authentication, failure, validEmail, validPassword, hashPassword, verifyPassword } from './auth.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const files = { '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/analytics.mjs':['analytics.mjs','text/javascript'], '/demo.mjs':['demo.mjs','text/javascript'], '/styles.css':['styles.css','text/css'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
const required = (value, label, max=200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw failure(400, `${label}: informe um valor entre 1 e ${max} caracteres.`);
  return value.trim();
};
async function body(req) {
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length;if(size>32000) throw failure(413,'Conteúdo muito grande.');chunks.push(chunk); }
  try { const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error();return data; }
  catch { throw failure(400,'Conteúdo inválido.'); }
}
export function createApp(databasePath=':memory:', options={}) {
  const db=openDatabase(databasePath);
  const auth=authentication(db,options);
  const attempts=new Map();
  const transaction = action => { db.exec('BEGIN IMMEDIATE');try { const result=action();db.exec('COMMIT');return result; } catch(e) { db.exec('ROLLBACK');throw e; } };
  const send = (res,status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data)); };
  const server=http.createServer(async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')) {
        const file=files[url.pathname];if(!file || req.method!=='GET') return send(res,404,{error:'Página não encontrada.'});
        res.writeHead(200,{'Content-Type':`${file[1]}; charset=utf-8`,'Cache-Control':'no-store'});return res.end(readFileSync(path.join(root,'public',file[0])));
      }
      if(req.method!=='GET') {
        const expectedOrigin=options.origin || `http://${req.headers.host}`;
        if(req.headers.origin && req.headers.origin!==expectedOrigin) throw failure(403,'Origem não autorizada.');
        if(req.headers['sec-fetch-site']==='cross-site') throw failure(403,'Origem não autorizada.');
        if(!(req.headers['content-type']||'').startsWith('application/json')) throw failure(415,'Use conteúdo JSON.');
      }
      if(['/api/auth/register','/api/auth/login'].includes(url.pathname) && req.method==='POST') {
        const now=Date.now();const key=req.socket.remoteAddress;
        for(const [address,item] of attempts) if(item.until<=now) attempts.delete(address);
        const attempt=attempts.get(key)||{count:0,until:now+15*60*1000};attempt.count++;attempts.set(key,attempt);
        if(attempt.count>20){res.setHeader('Retry-After',String(Math.ceil((attempt.until-now)/1000)));throw failure(429,'Muitas tentativas. Aguarde alguns minutos.');}
        const b=await body(req);
        const email=validEmail(b.email);
        if(url.pathname==='/api/auth/login') {
          const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
          const verified=await verifyPassword(b.password,user?.password_hash);
          if(!verified || !user?.active) throw failure(401,'E-mail ou senha inválidos.');
          auth.start(res,user.id);return send(res,200,{ok:true});
        }
        const name=required(b.name,'Seu nome');const company=required(b.company,'Empresa');
        const password=await hashPassword(validPassword(b.password));
        const id=transaction(()=>{
          if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw failure(409,'Não foi possível cadastrar esse e-mail. Use outro ou entre na sua conta.');
          const first=db.prepare('SELECT COUNT(*) AS count FROM organizations').get().count===0;
          const created=new Date().toISOString();
          const organization=Number(db.prepare('INSERT INTO organizations(name,created_at) VALUES(?,?)').run(company,created).lastInsertRowid);
          const userId=Number(db.prepare("INSERT INTO users(organization_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,'admin',?)").run(organization,name,email,password,created).lastInsertRowid);
          if(first) { db.prepare('UPDATE clients SET organization_id=? WHERE organization_id IS NULL').run(organization);db.prepare('UPDATE tickets SET organization_id=? WHERE organization_id IS NULL').run(organization); }
          return userId;
        });
        auth.start(res,id);return send(res,201,{ok:true});
      }
      if(url.pathname==='/api/auth/status' && req.method==='GET') return send(res,200,{initialized:db.prepare('SELECT COUNT(*) AS count FROM organizations').get().count>0});
      const user=auth.find(req);
      if(url.pathname==='/api/auth/logout' && req.method==='POST'){auth.end(res,user);return send(res,200,{ok:true});}
      if(!user) throw failure(401,'Entre na sua conta para continuar.');
      const org=user.organization_id;
      if(url.pathname==='/api/auth/me' && req.method==='GET') return send(res,200,auth.publicUser(user));
      if(url.pathname==='/api/auth/password' && req.method==='POST') {
        const b=await body(req);validPassword(b.password);
        const account=db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id);
        if(!await verifyPassword(b.current_password,account.password_hash)) throw failure(400,'A senha atual não confere.');
        const password=await hashPassword(b.password);
        transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(password,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);});
        auth.start(res,user.id);return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/team' && req.method==='GET') return send(res,200,db.prepare('SELECT id,name,email,role,active,created_at FROM users WHERE organization_id=? ORDER BY name').all(org));
      if(url.pathname==='/api/team' && req.method==='POST') {
        if(user.role!=='admin') throw failure(403,'Apenas administradores podem cadastrar usuários.');
        const b=await body(req);const name=required(b.name,'Nome');const email=validEmail(b.email);
        if(!['admin','agent'].includes(b.role)) throw failure(400,'Perfil inválido.');
        const password=await hashPassword(validPassword(b.password));
        const id=transaction(()=>{if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw failure(409,'Não foi possível cadastrar esse e-mail.');return Number(db.prepare('INSERT INTO users(organization_id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(org,name,email,password,b.role,new Date().toISOString()).lastInsertRowid);});
        return send(res,201,{id});
      }
      const teamMatch=url.pathname.match(/^\/api\/team\/(\d+)$/);
      if(teamMatch && req.method==='PATCH') {
        if(user.role!=='admin') throw failure(403,'Apenas administradores podem alterar usuários.');
        const id=Number(teamMatch[1]);const target=db.prepare('SELECT id,role,active FROM users WHERE id=? AND organization_id=?').get(id,org);
        if(!target) throw failure(404,'Usuário não encontrado.');
        if(id===user.id) throw failure(400,'Você não pode desativar sua própria conta.');
        const b=await body(req);if(typeof b.active!=='boolean') throw failure(400,'Situação inválida.');
        transaction(()=>{
          if(!b.active && target.role==='admin' && target.active && db.prepare("SELECT COUNT(*) AS count FROM users WHERE organization_id=? AND role='admin' AND active=1").get(org).count<=1) throw failure(400,'A empresa precisa de pelo menos um administrador ativo.');
          db.prepare('UPDATE users SET active=? WHERE id=? AND organization_id=?').run(b.active?1:0,id,org);if(!b.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        });
        return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/clients' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM clients WHERE organization_id=? ORDER BY name').all(org));
      if(url.pathname==='/api/clients' && req.method==='POST') {
        const b=await body(req);const name=required(b.name,'Nome');
        const contact=typeof b.contact==='string'?b.contact.trim().slice(0,200):'';
        const email=b.email?validEmail(b.email):'';
        const result=db.prepare('INSERT INTO clients(name,contact,email,created_at,organization_id) VALUES(?,?,?,?,?)').run(name,contact,email,new Date().toISOString(),org);
        return send(res,201,{id:Number(result.lastInsertRowid)});
      }
      const clientMatch=url.pathname.match(/^\/api\/clients\/(\d+)$/);
      if(clientMatch && req.method==='PATCH') {
        const id=Number(clientMatch[1]);if(!db.prepare('SELECT id FROM clients WHERE id=? AND organization_id=?').get(id,org)) throw failure(404,'Cliente não encontrado.');
        const b=await body(req);const name=required(b.name,'Nome');const contact=typeof b.contact==='string'?b.contact.trim().slice(0,200):'';const email=b.email?validEmail(b.email):'';
        db.prepare('UPDATE clients SET name=?,contact=?,email=? WHERE id=? AND organization_id=?').run(name,contact,email,id,org);return send(res,200,{ok:true});
      }
      if(url.pathname==='/api/tickets' && req.method==='GET') return send(res,200,db.prepare('SELECT t.*,c.name AS client_name FROM tickets t JOIN clients c ON c.id=t.client_id AND c.organization_id=t.organization_id WHERE t.organization_id=? ORDER BY t.id DESC').all(org));
      if(url.pathname==='/api/tickets' && req.method==='POST') {
        const b=await body(req);const title=required(b.title,'Título');const description=required(b.description,'Descrição',5000);
        const owner=db.prepare('SELECT id,name FROM users WHERE id=? AND organization_id=? AND active=1').get(Number(b.owner_id)||0,org);
        if(!owner) throw failure(400,'Selecione uma pessoa ativa da sua equipe.');
        if(!db.prepare('SELECT id FROM clients WHERE id=? AND organization_id=?').get(Number(b.client_id)||0,org)) throw failure(400,'Escolha um cliente da sua empresa.');
        if(!['Baixa','Normal','Alta'].includes(b.priority)) throw failure(400,'Prioridade inválida.');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date||'') || !Number.isFinite(Date.parse(b.due_date)) || new Date(b.due_date).toISOString().slice(0,10)!==b.due_date) throw failure(400,'Informe uma data válida.');
        const id=transaction(()=>{const now=new Date().toISOString();const result=db.prepare('INSERT INTO tickets(client_id,title,description,priority,owner,owner_id,due_date,created_at,organization_id) VALUES(?,?,?,?,?,?,?,?,?)').run(Number(b.client_id),title,description,b.priority,owner.name,owner.id,b.due_date,now,org);const ticketId=Number(result.lastInsertRowid);db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(ticketId,`Chamado aberto por ${user.name}. Responsável: ${owner.name}.`,now);return ticketId;});
        return send(res,201,{id});
      }
      const match=url.pathname.match(/^\/api\/tickets\/(\d+)(\/events)?$/);
      if(match) {
        const id=Number(match[1]);const ticket=db.prepare('SELECT * FROM tickets WHERE id=? AND organization_id=?').get(id,org);
        if(!ticket) throw failure(404,'Chamado não encontrado.');
        if(req.method==='GET' && match[2]) return send(res,200,db.prepare('SELECT * FROM events WHERE ticket_id=? ORDER BY id DESC').all(id));
        if(req.method==='POST' && match[2]) { const b=await body(req);const note=required(b.text,'Atualização',5000);db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(id,`${user.name}: ${note}`,new Date().toISOString());return send(res,201,{ok:true}); }
        if(req.method==='PATCH' && !match[2]) {
          const b=await body(req);
          transaction(()=>{
            const current=db.prepare('SELECT * FROM tickets WHERE id=? AND organization_id=?').get(id,org);
            if(!Number.isInteger(b.version)||b.version!==current.version) throw failure(409,'Este chamado foi atualizado. Feche e abra novamente para carregar a versão atual.');
            const next={...current};const changes=[];
            for(const [key,label,max] of [['title','Título',200],['description','Descrição',5000]]) if(key in b) {next[key]=required(b[key],label,max);if(next[key]!==current[key])changes.push(label);}
            if('client_id' in b){const client=db.prepare('SELECT id,name FROM clients WHERE id=? AND organization_id=?').get(Number(b.client_id)||0,org);if(!client)throw failure(400,'Escolha um cliente da sua empresa.');next.client_id=client.id;if(next.client_id!==current.client_id)changes.push(`Cliente: ${client.name}`);}
            if('owner_id' in b){const owner=db.prepare('SELECT id,name FROM users WHERE id=? AND organization_id=? AND active=1').get(Number(b.owner_id)||0,org);if(!owner)throw failure(400,'Selecione uma pessoa ativa da sua equipe.');next.owner_id=owner.id;next.owner=owner.name;if(next.owner_id!==current.owner_id)changes.push(`Responsável: ${owner.name}`);}
            if('priority' in b){if(!['Baixa','Normal','Alta'].includes(b.priority))throw failure(400,'Prioridade inválida.');next.priority=b.priority;if(next.priority!==current.priority)changes.push(`Prioridade: ${next.priority}`);}
            if('due_date' in b){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date||'')||!Number.isFinite(Date.parse(b.due_date))||new Date(b.due_date).toISOString().slice(0,10)!==b.due_date)throw failure(400,'Informe uma data válida.');next.due_date=b.due_date;if(next.due_date!==current.due_date)changes.push(`Prazo: ${next.due_date}`);}
            if('status' in b){if(!['Aberto','Em andamento','Concluído'].includes(b.status))throw failure(400,'Situação inválida.');next.status=b.status;}
            const now=new Date().toISOString();
            if(next.status!==current.status){
              if(next.status==='Concluído'){next.solution=required(b.solution,'Solução',5000);next.closed_at=now;changes.push(`Concluído. Solução: ${next.solution}`);}
              else {if(current.status==='Concluído'){next.closed_at=null;next.solution='';}changes.push(`Situação: ${next.status}`);}
            }
            if(!changes.length)return;
            db.prepare('UPDATE tickets SET client_id=?,title=?,description=?,priority=?,owner=?,owner_id=?,due_date=?,status=?,closed_at=?,solution=?,version=version+1 WHERE id=? AND organization_id=?').run(next.client_id,next.title,next.description,next.priority,next.owner,next.owner_id,next.due_date,next.status,next.closed_at,next.solution,id,org);
            db.prepare('INSERT INTO events(ticket_id,text,created_at) VALUES(?,?,?)').run(id,`${user.name}: ${changes.join(' · ')}`,now);
          });
          return send(res,200,{ok:true});
        }
      }
      throw failure(404,'Recurso não encontrado.');
    } catch(e) { send(res,e.status||500,{error:e.status?e.message:'Não foi possível concluir a operação.'}); }
  });
  server.on('close',()=>db.close());return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(root,'data'),{recursive:true});
  const port=Number(process.env.PORT||3100);
  createApp(path.join(root,'data','atendehub.sqlite'),{secureCookies:process.env.SECURE_COOKIES==='true',origin:process.env.APP_ORIGIN}).listen(port,'127.0.0.1',()=>console.log(`AtendeHub: http://127.0.0.1:${port}`));
}
