import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, periodTickets, dailyVolume, exportCsv } from '../public/analytics.mjs';
test('indicadores consideram atraso apenas em pendentes e filtram dias locais',()=>{
  const now=new Date(2026,9,3,12);
  const items=[{id:1,status:'Concluído',priority:'Alta',due_date:'2026-09-20',created_at:new Date(2026,9,3,9).toISOString()},{id:2,status:'Aberto',priority:'Alta',due_date:'2026-10-02',created_at:new Date(2026,8,30,10).toISOString()},{id:3,status:'Em andamento',priority:'Normal',due_date:'2026-10-03',created_at:new Date(2026,9,4,10).toISOString()}];
  assert.deepEqual(summarize(items,now),{total:3,open:1,progress:1,completed:1,pending:2,late:1,high:1,completion:33});
  assert.deepEqual(periodTickets(items,3,now).map(t=>t.id),[1]);
  assert.equal(dailyVolume(items,7,now).at(-1).total,1);
  assert.equal(summarize([],now).completion,0);
});
test('exportação preserva acentos, aspas e neutraliza fórmulas de planilha',()=>{
  const csv=exportCsv([{id:1,client_name:'=HYPERLINK("x")',title:'Título; "teste"',owner:' @SUM(1)',status:'Aberto',priority:'Alta',due_date:'2026-10-03',created_at:'2026-10-03'}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"Título; ""teste"""'));assert.ok(csv.includes('"\' @SUM(1)"'));
});
