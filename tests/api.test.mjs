import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('fluxo de atendimento, validação e persistência após reiniciar', async () => {
  const directory = mkdtempSync(path.join(tmpdir(),'atendehub-test-'));
  const dbPath = path.join(directory,'test.sqlite');
  let server = createApp(dbPath); server.listen(0,'127.0.0.1'); await once(server,'listening');
  let base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url,method='GET',data) => { const r=await fetch(base+url,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()}; };
  try {
    assert.equal((await call('/api/clients','POST',{name:' '})).status,400);
    const client=await call('/api/clients','POST',{name:'Empresa fictícia',email:'contato@example.com'}); assert.equal(client.status,201);
    const payload={client_id:client.data.id,title:'Impressora indisponível',description:'Verificar conexão.',owner:'Equipe de demonstração',priority:'Alta',due_date:'2026-10-03'};
    assert.equal((await call('/api/tickets','POST',{...payload,client_id:999})).status,400);
    assert.equal((await call('/api/tickets','POST',{...payload,due_date:'2026-02-30'})).status,400);
    const ticket=await call('/api/tickets','POST',payload);assert.equal(ticket.status,201);
    const id=ticket.data.id;
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{status:'Inválido'})).status,400);
    assert.equal((await call(`/api/tickets/${id}`,'PATCH',{status:'Em andamento'})).status,200);
    assert.equal((await call(`/api/tickets/${id}/events`,'POST',{text:'Conexão restabelecida.'})).status,201);
    await call(`/api/tickets/${id}`,'PATCH',{status:'Concluído'});
    assert.equal((await call(`/api/tickets/${id}/events`)).data.length,4);
    const forbidden=await fetch(base+'/api/clients',{method:'POST',headers:{Origin:'http://example.com','Content-Type':'application/json'},body:JSON.stringify({name:'Externo'})});assert.equal(forbidden.status,403);
    await new Promise(resolve=>server.close(resolve));server=createApp(dbPath);server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
    const saved=(await call('/api/tickets')).data;assert.equal(saved.length,1);assert.equal(saved[0].status,'Concluído');assert.equal(saved[0].client_name,'Empresa fictícia');
    assert.equal((await fetch(base+'/')).status,200);
  } finally { await new Promise(resolve=>server.close(resolve));rmSync(directory,{recursive:true,force:true}); }
});
