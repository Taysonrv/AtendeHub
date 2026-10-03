import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { closureMetrics } from '../public/analytics.mjs';
test('edição, atribuição, conclusão com solução, reabertura e conflito de versão',async()=>{
  const server=createApp();server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const call=async(url,method='GET',data)=>{const r=await fetch(base+url,{method,headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
  try{
    await call('/api/auth/register','POST',{company:'Teste',name:'Admin',email:'teste@example.com',password:'senha-ficticia-de-teste'});const me=(await call('/api/auth/me')).data;
    const client=(await call('/api/clients','POST',{name:'Cliente inicial'})).data;
    assert.equal((await call(`/api/clients/${client.id}`,'PATCH',{name:'Cliente atualizado',contact:'Contato fictício',email:'cliente@example.com'})).status,200);
    const agent=(await call('/api/team','POST',{name:'Atendente',email:'atendente@example.com',role:'agent',password:'senha-ficticia-de-teste'})).data;
    const payload={client_id:client.id,title:'Chamado',description:'Descrição inicial',owner_id:me.id,priority:'Normal',due_date:'2026-10-03'};
    assert.equal((await call('/api/tickets','POST',{...payload,owner_id:9999})).status,400);
    const id=(await call('/api/tickets','POST',payload)).data.id;
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{owner_id:agent.id,title:'Chamado atualizado',priority:'Alta',version:0})).status,200);
    let ticket=(await call('/api/tickets')).data[0];assert.equal(ticket.owner,'Atendente');assert.equal(ticket.client_name,'Cliente atualizado');assert.equal(ticket.version,1);
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{title:'Edição desatualizada',version:0})).status,409);
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{status:'Concluído',version:1})).status,400);
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{status:'Concluído',solution:'Acesso restabelecido.',version:1})).status,200);
    ticket=(await call('/api/tickets')).data[0];assert.ok(ticket.closed_at);assert.equal(ticket.solution,'Acesso restabelecido.');assert.equal(closureMetrics([ticket]).measured,1);
    await call(`/api/tickets/${id}`,'PATCH',{status:'Aberto',version:2});ticket=(await call('/api/tickets')).data[0];assert.equal(ticket.closed_at,null);assert.equal(ticket.solution,'');assert.equal(closureMetrics([ticket]).measured,0);
    assert.ok((await call(`/api/tickets/${id}/events`)).data.some(e=>e.text.includes('Acesso restabelecido.')));
    await call(`/api/team/${agent.id}`,'PATCH',{active:false});assert.equal((await call(`/api/tickets/${id}`,'PATCH',{owner_id:agent.id,version:3})).status,400);
    const before=(await call('/api/tickets')).data[0];assert.equal(before.version,3);
    await call('/api/auth/register','POST',{company:'Outra',name:'Outra pessoa',email:'outro@example.com',password:'senha-ficticia-de-teste'});
    assert.equal((await call(`/api/clients/${client.id}`,'PATCH',{name:'Tentativa externa'})).status,404);
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{title:'Tentativa externa',version:3})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('tempo até conclusão exclui registros antigos e datas inconsistentes',()=>{
  const rows=[{status:'Concluído',created_at:'2026-10-01T12:00:00Z',closed_at:'2026-10-01T14:00:00Z',due_date:'2026-10-02'},{status:'Concluído',created_at:'2026-10-01T12:00:00Z',closed_at:null,due_date:'2026-10-02'},{status:'Concluído',created_at:'2026-10-01T12:00:00Z',closed_at:'2026-09-30T14:00:00Z',due_date:'2026-10-02'},{status:'Aberto',created_at:'2026-10-01T12:00:00Z',closed_at:'2026-10-01T14:00:00Z',due_date:'2026-10-02'}];
  assert.deepEqual(closureMetrics(rows),{measured:1,unmeasured:2,averageHours:2,onTime:1});assert.equal(closureMetrics([]).averageHours,null);
});
