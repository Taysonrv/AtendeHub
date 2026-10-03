const $ = (selector) => document.querySelector(selector);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = (s) => s ? new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const late = (t) => t.status !== 'Concluído' && t.due_date < today();
let clients = [], tickets = [], view = 'dashboard', editing = '', selected = null, query = '', statusFilter = '', clientFilter = null, toastTimer;
async function api(url, method = 'GET', data) {
  const response = await fetch(`/api${url}`, { method, headers: data ? {'Content-Type':'application/json'} : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível concluir.'); return result;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000); }
async function refresh() { [clients,tickets] = await Promise.all([api('/clients'),api('/tickets')]); render(); }
const badge = (t) => `<span class="badge ${t.status === 'Concluído' ? 'done' : t.status === 'Em andamento' ? 'progress' : ''}">${esc(t.status)}</span>`;
function table(list) {
  if (!list.length) return '<div class="empty"><h3>Nenhum chamado por aqui</h3><p>Abra um chamado para acompanhar o próximo atendimento.</p></div>';
  return `<div class="table-wrap"><table><thead><tr><th>CHAMADO / CLIENTE</th><th>RESPONSÁVEL</th><th>SITUAÇÃO</th><th>PRIORIDADE</th><th>PRAZO</th></tr></thead><tbody>${list.map(t => `<tr><td><button class="ticket-title" data-ticket="${t.id}">${esc(t.title)}</button><span class="ticket-id">#${String(t.id).padStart(4,'0')} · ${esc(t.client_name)}</span></td><td>${esc(t.owner)}</td><td>${badge(t)}</td><td>${esc(t.priority)}</td><td class="${late(t)?'late':''}">${date(t.due_date)}${late(t)?'<span class="ticket-id late">Atrasado</span>':''}</td></tr>`).join('')}</tbody></table></div>`;
}
function render() {
  $('#page-title').textContent = {dashboard:'Visão geral',tickets:'Chamados',clients:'Clientes'}[view];
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active',b.dataset.view===view); b.setAttribute('aria-current',b.dataset.view===view?'page':'false'); });
  if (view === 'dashboard') {
    const stats = [['Em aberto',tickets.filter(t=>t.status!=='Concluído').length,'Aguardando conclusão'],['Em andamento',tickets.filter(t=>t.status==='Em andamento').length,'Atendimentos em execução'],['Atrasados',tickets.filter(late).length,'Prazos que precisam de atenção'],['Clientes',clients.length,'Relacionamentos cadastrados']];
    $('#content').innerHTML = `<div class="stats">${stats.map((s,i)=>`<div class="stat ${i===2?'warning':''}"><span>${s[0]}</span><strong>${s[1]}</strong><small>${s[2]}</small></div>`).join('')}</div><div class="card"><div class="card-heading"><div><h2>Atendimentos recentes</h2><p class="muted">Acompanhe o que precisa da sua equipe.</p></div><button data-view="tickets">Ver todos</button></div>${table(tickets.slice(0,6))}</div>`;
  } else if (view === 'tickets') {
    $('#content').innerHTML = `<div class="card"><div class="card-heading"><h2>Todos os chamados</h2><span class="muted">${tickets.length} cadastrados</span></div><div class="toolbar"><input id="search" aria-label="Buscar chamados" placeholder="Buscar título, cliente ou responsável" value="${esc(query)}"><select id="status-filter" aria-label="Filtrar situação">${['','Aberto','Em andamento','Concluído','Atrasados'].map(s=>`<option ${s===statusFilter?'selected':''}>${s||'Todas as situações'}</option>`).join('')}</select>${clientFilter?'<button id="clear-client">Todos os clientes</button>':''}</div><div id="ticket-list"></div></div>`;
    renderList(); $('#search').addEventListener('input', e=>{query=e.target.value;renderList();}); $('#status-filter').addEventListener('change',e=>{statusFilter=e.target.selectedIndex?e.target.value:'';renderList();}); $('#clear-client')?.addEventListener('click',()=>{clientFilter=null;render();});
  } else {
    $('#content').innerHTML = `<div class="card-heading"><div><h2>Seus clientes</h2><p class="muted">Contatos e histórico em um só lugar.</p></div><button class="primary" id="new-client">+ Novo cliente</button></div>${clients.length?`<div class="client-grid">${clients.map(c=>`<article class="client"><h3>${esc(c.name)}</h3><p>${esc(c.contact)||'Contato não informado'}</p><p>${esc(c.email)||'E-mail não informado'}</p><p>${tickets.filter(t=>t.client_id===c.id).length} chamado(s)</p><button data-client="${c.id}">Ver atendimentos</button></article>`).join('')}</div>`:'<div class="card empty"><h3>Seu primeiro cliente começa aqui</h3><p>Cadastre um cliente antes de abrir um chamado.</p></div>'}`;
    $('#new-client').addEventListener('click',()=>openEditor('client'));
  }
}
function renderList() {
  const q = query.toLocaleLowerCase('pt-BR'); const list = tickets.filter(t=>(!clientFilter||t.client_id===clientFilter)&&(!statusFilter||(statusFilter==='Atrasados'?late(t):t.status===statusFilter))&&`${t.title} ${t.client_name} ${t.owner}`.toLocaleLowerCase('pt-BR').includes(q));
  $('#ticket-list').innerHTML = list.length?table(list):'<div class="empty"><h3>Nenhum chamado encontrado</h3><p>Ajuste os filtros ou abra um novo atendimento.</p></div>';
}
function field(label,name,type='text',attrs='') { return `<label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" ${attrs}>`; }
function openEditor(type) {
  if (type==='ticket'&&!clients.length) { toast('Cadastre o primeiro cliente para abrir um chamado.'); openEditor('client'); return; }
  editing=type; $('#form-error').textContent=''; $('#dialog-title').textContent=type==='client'?'Novo cliente':'Novo chamado';
  $('#fields').innerHTML=type==='client'?field('Nome da empresa','name','text','required maxlength="200"')+field('Contato','contact','text','maxlength="200"')+field('E-mail','email','email','maxlength="254"'):`<label for="field-client_id">Cliente</label><select id="field-client_id" name="client_id" required>${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>${field('Título do chamado','title','text','required maxlength="200"')}<label for="field-description">Descrição</label><textarea id="field-description" name="description" required maxlength="5000"></textarea>${field('Responsável','owner','text','required maxlength="200"')}<div class="row"><div><label for="field-priority">Prioridade</label><select id="field-priority" name="priority"><option>Normal</option><option>Alta</option><option>Baixa</option></select></div><div>${field('Prazo','due_date','date',`required value="${today()}"`)}</div></div>`;
  $('#editor').showModal();
}
async function openDetail(id, reopen=true) {
  selected=tickets.find(t=>t.id===id); if (!selected) return;
  const events = await api(`/tickets/${id}/events`); const t=selected;
  $('#detail-title').textContent=`#${String(id).padStart(4,'0')} · ${t.title}`;
  $('#detail-content').innerHTML=`<div class="detail-meta">${badge(t)}<span class="muted">${esc(t.priority)} prioridade</span></div><p class="muted">${esc(t.client_name)} · ${esc(t.owner)} · Prazo ${date(t.due_date)}</p><p class="description">${esc(t.description)}</p><label for="detail-status">Situação do atendimento</label><select id="detail-status">${['Aberto','Em andamento','Concluído'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select><form id="note-form"><label for="note">Registrar andamento</label><textarea id="note" required maxlength="5000" placeholder="Descreva o atendimento ou a solução..."></textarea><div class="actions"><button class="primary" type="submit">Registrar atualização</button></div></form><h3>Histórico</h3>${events.map(e=>`<div class="event"><time>${new Date(e.created_at).toLocaleString('pt-BR')}</time><p>${esc(e.text)}</p></div>`).join('')}`;
  $('#detail-status').addEventListener('change',async e=>{ const control=e.target;control.disabled=true;try {await api(`/tickets/${id}`,'PATCH',{status:control.value});await refresh();await openDetail(id,false);toast('Situação atualizada.');}catch(error){control.value=t.status;toast(error.message);}finally{control.disabled=false;} });
  $('#note-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api(`/tickets/${id}/events`,'POST',{text:$('#note').value});await openDetail(id,false);toast('Atualização registrada.');}catch(error){toast(error.message);}finally{button.disabled=false;}});
  if(reopen) $('#detail').showModal();
}
document.addEventListener('click',async e=>{const nav=e.target.closest('[data-view]'),ticket=e.target.closest('[data-ticket]'),client=e.target.closest('[data-client]');if(nav){view=nav.dataset.view;clientFilter=null;render();}if(ticket){try{await openDetail(Number(ticket.dataset.ticket));}catch(error){toast(error.message);}}if(client){clientFilter=Number(client.dataset.client);query='';statusFilter='';view='tickets';render();}});
$('#new-ticket').addEventListener('click',()=>openEditor('ticket'));
$('#close-editor').addEventListener('click',()=>$('#editor').close());$('#cancel-editor').addEventListener('click',()=>$('#editor').close());$('#close-detail').addEventListener('click',()=>$('#detail').close());
$('#editor-form').addEventListener('submit',async e=>{e.preventDefault();$('#save').disabled=true;$('#form-error').textContent='';try{const data=Object.fromEntries(new FormData(e.target));await api(editing==='client'?'/clients':'/tickets','POST',data);$('#editor').close();await refresh();toast(editing==='client'?'Cliente cadastrado.':'Chamado aberto.');}catch(error){$('#form-error').textContent=error.message;}finally{$('#save').disabled=false;}});
refresh().catch(error=>{$('#content').innerHTML='<div class="card empty"><h3>Não foi possível carregar os atendimentos</h3><p>Recarregue a página para tentar novamente.</p></div>';toast(error.message);});
