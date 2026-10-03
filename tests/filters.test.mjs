import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterTickets} from '../public/filters.mjs';
const items=[
  {id:12,title:'Conexão indisponível',description:'Roteador',client_id:1,client_name:'São José',owner:'João',priority:'Alta',status:'Aberto',due_date:'2026-10-01'},
  {id:13,title:'Impressora',description:'Conexão USB',client_id:2,client_name:'Loja',owner:'Maria',priority:'Normal',status:'Concluído',due_date:'2026-10-01'},
  {id:14,title:'Cadastro',description:'',client_id:1,client_name:'São José',owner:'João',priority:'Baixa',status:'Em andamento',due_date:'2026-10-03'}
];
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
