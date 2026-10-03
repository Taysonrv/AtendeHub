const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
export function filterTickets(tickets, {query='', client=null, owner=null, priority=null, status=''} = {}, today) {
  return tickets.filter(t => (!client || t.client_id === Number(client)) &&
    (!owner || t.owner === owner) && (!priority || t.priority === priority) &&
    (!status || (status === 'Atrasados' ? t.status !== 'Concluído' && t.due_date < today : status === 'Pendentes' ? t.status !== 'Concluído' : t.status === status)) &&
    normalize(`${t.id} ${t.title} ${t.client_name} ${t.owner} ${t.description}`).includes(normalize(query)));
}
