import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterTickets,sortTickets,ticketPage} from '../public/filters.mjs';
const items=[
  {id:12,title:'Conexão indisponível',description:'Roteador',client_id:1,client_name:'São José',owner:'João',priority:'Alta',status:'Aberto',due_date:'2026-10-01'},
  {id:13,title:'Impressora',description:'Conexão USB',client_id:2,client_name:'Loja',owner:'Maria',priority:'Normal',status:'Concluído',due_date:'2026-10-01'},
  {id:14,title:'Cadastro',description:'',client_id:1,client_name:'São José',owner:'João',priority:'Baixa',status:'Em andamento',due_date:'2026-10-03'}
];
test('ordenação é estável nos empates e não altera a lista original',()=>{
  assert.deepEqual(sortTickets(items,'recent').map(t=>t.id),[14,13,12]);
  assert.deepEqual(sortTickets(items,'priority').map(t=>t.id),[12,13,14]);
  assert.deepEqual(sortTickets(items,'deadline').map(t=>t.id),[13,12,14]);
  assert.deepEqual(items.map(t=>t.id),[12,13,14]);
});
test('paginação mantém todos os resultados e corrige página após reduzir filtros',()=>{
  const rows=Array.from({length:23},(_,id)=>({id}));
  assert.equal(ticketPage(rows,3,10).items.length,3);
  assert.deepEqual(ticketPage(rows,3,10).items.map(t=>t.id),[20,21,22]);
  assert.equal(ticketPage(rows.slice(0,2),3,10).page,1);
  assert.deepEqual(ticketPage([],4,10),{items:[],page:1,pages:1,total:0});
  assert.equal(rows.length,23);
});
test('busca ignora acentos e encontra descrição e número',()=>{
  assert.deepEqual(filterTickets(items,{query:' CONEXAO '},'2026-10-03').map(t=>t.id),[12,13]);
  assert.deepEqual(filterTickets(items,{query:'sao jose'},'2026-10-03').map(t=>t.id),[12,14]);
  assert.deepEqual(filterTickets(items,{query:'13'},'2026-10-03').map(t=>t.id),[13]);
});
test('filtros combinados respeitam prazo, situação, cliente e responsável',()=>{
  assert.deepEqual(filterTickets(items,{client:'1',owner:'João',priority:'Alta',status:'Atrasados'},'2026-10-03').map(t=>t.id),[12]);
  assert.deepEqual(filterTickets(items,{status:'Pendentes'},'2026-10-03').map(t=>t.id),[12,14]);
  assert.equal(filterTickets(items,{client:1,owner:'Maria'},'2026-10-03').length,0);
  assert.equal(filterTickets(items,{},'2026-10-03').length,3);
});
