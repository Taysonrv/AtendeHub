export function demonstration(now = new Date()) {
  const names = ['Órbita Tecnologia','Nova Clínica','Studio Atlas','Mercado Aurora','Vértice Contabilidade'];
  const clients = names.map((name,i)=>({id:i+1,name,contact:'Equipe de demonstração',email:`cliente${i+1}@example.com`}));
  const subjects = ['Configuração de acesso','Impressora sem conexão','Atualização do sistema','Revisão de permissões','Instalação de aplicativo','Conexão com a rede','Ajuste de integração','Backup e recuperação'];
  const owners = ['Ana Costa','Lucas Almeida','Marina Silva','Pedro Santos'];
  const tickets = Array.from({length:48},(_,i)=>{
    const created=new Date(now);created.setDate(created.getDate()-(i*11%28));created.setHours(9+i%8,20,0,0);
    const due=new Date(now);due.setDate(due.getDate()+((i%9)-3));
    const status=i%5<2?'Concluído':i%5===2?'Aberto':'Em andamento';
    return {id:1000+i,client_id:i%5+1,client_name:names[i%5],title:subjects[i%8],description:'Atendimento fictício para demonstração visual. Nenhum dado é gravado no banco.',owner:owners[i%4],priority:i%4===0?'Alta':i%4===1?'Baixa':'Normal',due_date:`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}`,status,created_at:created.toISOString()};
  });
  tickets.sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return {clients,tickets};
}
