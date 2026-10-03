export const localDate = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export function periodTickets(tickets, days = 0, now = new Date()) {
  if (!days) return tickets;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days + 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tickets.filter(t => new Date(t.created_at) >= start && new Date(t.created_at) < end);
}
export function summarize(tickets, now = new Date()) {
  const today = localDate(now);
  const count = status => tickets.filter(t => t.status === status).length;
  const pending = tickets.filter(t => t.status !== 'Concluído');
  return { total: tickets.length, open: count('Aberto'), progress: count('Em andamento'), completed: count('Concluído'), pending: pending.length, late: pending.filter(t=>t.due_date < today).length, high: pending.filter(t=>t.priority === 'Alta').length, completion: tickets.length ? Math.round(count('Concluído') / tickets.length * 100) : 0 };
}
export function groupTickets(tickets, field) {
  const groups = new Map();
  for (const t of tickets) { const name = t[field] || 'Não informado'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(t); }
  return [...groups].map(([name, items]) => ({ name, items, ...summarize(items) })).sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'pt-BR'));
}
export function dailyVolume(tickets, days = 7, now = new Date()) {
  return Array.from({length:days}, (_,i) => {
    const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()); d.setDate(d.getDate()-days+1+i);
    const key = localDate(d);
    return { name: d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}), total: tickets.filter(t=>localDate(t.created_at)===key).length, key };
  });
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function closureMetrics(tickets) {
  const completed=tickets.filter(t=>t.status==='Concluído');
  const measured=completed.filter(t=>t.closed_at && Number.isFinite(Date.parse(t.closed_at)) && Number.isFinite(Date.parse(t.created_at)) && Date.parse(t.closed_at)>=Date.parse(t.created_at));
  const averageHours=measured.length?measured.reduce((sum,t)=>sum+(Date.parse(t.closed_at)-Date.parse(t.created_at))/3600000,0)/measured.length:null;
  return { measured:measured.length, unmeasured:completed.length-measured.length, averageHours, onTime:measured.filter(t=>localDate(t.closed_at)<=t.due_date).length };
}
export function exportCsv(tickets) {
  const rows = [['Número','Cliente','Título','Responsável','Situação','Prioridade','Prazo','Criado em','Concluído em','Solução'], ...tickets.map(t=>[t.id,t.client_name,t.title,t.owner,t.status,t.priority,t.due_date,t.created_at,t.closed_at||'',t.solution||''])];
  return '\uFEFF' + rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
