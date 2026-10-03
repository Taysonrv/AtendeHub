import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

test('autenticação, isolamento entre empresas, permissões e revogação de sessões',async()=>{
  const server=createApp();server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const actor=()=>{
    let cookie='';
    return async(url,method='GET',data)=>{const response=await fetch(base+url,{method,headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];return {status:response.status,data:await response.json(),session};};
  };
  const a=actor(),b=actor(),agent=actor(),otherSession=actor();
  const password='senha-ficticia-de-teste';
  try {
    assert.equal((await a('/api/team')).status,401);
    assert.equal((await a('/api/auth/register','POST',{company:'A',name:'Administrador A',email:'a@example.com',password:'curta'})).status,400);
    const registered=await a('/api/auth/register','POST',{company:'A',name:'Administrador A',email:'a@example.com',password});assert.equal(registered.status,201);assert.match(registered.session,/HttpOnly/);assert.match(registered.session,/SameSite=Strict/);
    assert.equal((await a('/api/auth/me')).data.role,'admin');
    const client=(await a('/api/clients','POST',{name:'Cliente A'})).data;
    const payload={client_id:client.id,title:'Atendimento A',description:'Teste de acesso.',owner_id:(await a('/api/auth/me')).data.id,priority:'Normal',due_date:'2026-10-03'};
    const ticket=(await a('/api/tickets','POST',payload)).data;
    assert.equal((await b('/api/auth/register','POST',{company:'B',name:'Administrador B',email:'b@example.com',password})).status,201);
    assert.deepEqual((await b('/api/clients')).data,[]);assert.deepEqual((await b('/api/tickets')).data,[]);
    assert.equal((await b('/api/tickets','POST',payload)).status,400);
    assert.equal((await b(`/api/tickets/${ticket.id}/events`)).status,404);
    assert.equal((await b(`/api/tickets/${ticket.id}/events`,'POST',{text:'Tentativa externa'})).status,404);
    assert.equal((await b(`/api/tickets/${ticket.id}`,'PATCH',{status:'Concluído'})).status,404);
    const created=await a('/api/team','POST',{name:'Atendente A',email:'agent@example.com',password,role:'agent'});assert.equal(created.status,201);
    assert.equal((await agent('/api/auth/login','POST',{email:'agent@example.com',password})).status,200);
    assert.equal((await agent('/api/tickets')).data.length,1);
    assert.equal((await agent('/api/team','POST',{name:'Invasão',email:'x@example.com',password,role:'admin'})).status,403);
    assert.equal((await b(`/api/team/${created.data.id}`,'PATCH',{active:false})).status,404);
    assert.equal((await a(`/api/team/${created.data.id}`,'PATCH',{active:false})).status,200);
    assert.equal((await agent('/api/clients')).status,401);
    assert.equal((await agent('/api/auth/login','POST',{email:'agent@example.com',password})).status,401);
    await a(`/api/team/${created.data.id}`,'PATCH',{active:true});
    assert.equal((await agent('/api/auth/login','POST',{email:'agent@example.com',password})).status,200);
    const me=(await a('/api/auth/me')).data;assert.equal((await a(`/api/team/${me.id}`,'PATCH',{active:false})).status,400);
    assert.equal((await otherSession('/api/auth/login','POST',{email:'a@example.com',password})).status,200);
    assert.equal((await a('/api/auth/password','POST',{current_password:'errada',password:'outra-senha-ficticia'})).status,400);
    assert.equal((await a('/api/auth/password','POST',{current_password:password,password:'outra-senha-ficticia'})).status,200);
    assert.equal((await otherSession('/api/tickets')).status,401);
    assert.equal((await a('/api/auth/me')).status,200);
    await a('/api/auth/logout','POST',{});assert.equal((await a('/api/tickets')).status,401);
    assert.equal((await a('/api/auth/login','POST',{email:'a@example.com',password})).status,401);
    assert.equal((await a('/api/auth/login','POST',{email:'a@example.com',password:'outra-senha-ficticia'})).status,200);
    const team=(await a('/api/team')).data;assert.ok(team.every(user=>!('password_hash' in user)&&!('organization_id' in user)));assert.equal(team.length,2);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('migração preserva cadastros locais e associa somente à primeira empresa',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'atendehub-migration-'));const databasePath=path.join(directory,'old.sqlite');
  const db=new DatabaseSync(databasePath);db.exec("CREATE TABLE clients(id INTEGER PRIMARY KEY,name TEXT NOT NULL,contact TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);INSERT INTO clients(name,created_at) VALUES('Cliente legado fictício','2026-10-03');");db.close();
  const server=createApp(databasePath);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company:'Primeira empresa',name:'Teste',email:'primeiro@example.com',password:'senha-ficticia-de-teste'})});assert.equal(response.status,201);
    const cookie=response.headers.get('set-cookie').split(';')[0];const clients=await (await fetch(base+'/api/clients',{headers:{Cookie:cookie}})).json();assert.equal(clients.length,1);assert.equal(clients[0].name,'Cliente legado fictício');
    const second=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company:'Outra empresa',name:'Teste',email:'outro@example.com',password:'senha-ficticia-de-teste'})});assert.equal(second.status,201);
    const otherClients=await (await fetch(base+'/api/clients',{headers:{Cookie:second.headers.get('set-cookie').split(';')[0]}})).json();assert.deepEqual(otherClients,[]);
    const inspection=new DatabaseSync(databasePath);const hash=inspection.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash;assert.notEqual(hash,'senha-ficticia-de-teste');assert.match(hash,/^[a-f0-9]{32}:[a-f0-9]{128}$/);inspection.close();
  } finally {await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});

test('tentativas excessivas recebem limite e sessão expirada não autentica',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'atendehub-rate-'));const databasePath=path.join(directory,'test.sqlite');const server=createApp(databasePath);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({company:'Teste',name:'Teste',email:'teste@example.com',password:'senha-ficticia-de-teste'})});const cookie=response.headers.get('set-cookie').split(';')[0];
    const db=new DatabaseSync(databasePath);db.prepare('UPDATE sessions SET expires_at=?').run(Date.now()-1000);db.close();assert.equal((await fetch(base+'/api/clients',{headers:{Cookie:cookie}})).status,401);
    for(let i=0;i<20;i++){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await r.text();if(i===19){assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));}}
  } finally {await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true});}
});
