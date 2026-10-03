const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
export function sortTickets(tickets, order='recent') {
  const priorities={Alta:0,Normal:1,Baixa:2};
  return [...tickets].sort((a,b)=>{
    const recent=Number(b.id)-Number(a.id);
    if(order==='oldest')return -recent;
    if(order==='deadline')return String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))||recent;
    if(order==='priority')return (priorities[a.priority]??3)-(priorities[b.priority]??3)||recent;
    if(order==='client')return String(a.client_name||'').localeCompare(String(b.client_name||''),'pt-BR')||recent;
    return recent;
  });
}
export function ticketPage(tickets, page=1, size=10) {
  const pages=Math.max(1,Math.ceil(tickets.length/size));
  const current=Math.max(1,Math.min(pages,page));
  return {items:tickets.slice((current-1)*size,current*size),page:current,pages,total:tickets.length};
}
export function filterTickets(tickets, {query='', client=null, owner=null, priority=null, status=''} = {}, today) {
  return tickets.filter(t => (!client || t.client_id === Number(client)) &&
    (!owner || t.owner === owner) && (!priority || t.priority === priority) &&
    (!status || (status === 'Atrasados' ? t.status !== 'Concluído' && t.due_date < today : status === 'Pendentes' ? t.status !== 'Concluído' : t.status === status)) &&
    normalize(`${t.id} ${t.title} ${t.client_name} ${t.owner} ${t.description}`).includes(normalize(query)));
}
