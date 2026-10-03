# AtendeHub

Aplicação web independente para organizar atendimentos de pequenas empresas de suporte e assistência técnica. Primeira versão para validação local, escrita do zero.

## Funcionalidades

- Cadastro de clientes e contatos.
- Abertura de chamados com prioridade, responsável e prazo.
- Busca e filtros por situação, atraso e cliente.
- Registro de andamento, conclusão e reabertura.
- Histórico de atualizações e painel de acompanhamento.
- Interface responsiva e persistência em SQLite.
- Painel escuro com cards interativos, gráficos de barras e rosca.
- Filtro por período de abertura, desempenho por responsável e relatórios.
- Exportação CSV e impressão de relatórios (use Salvar como PDF no navegador).
- Modo de demonstração com dados fictícios, sem gravação no banco.

## Executar

Requer Node.js 24 ou superior. Sem dependências externas.

```sh
npm start
```

Acesse http://127.0.0.1:3100. O banco é criado em `data/atendehub.sqlite`, ignorado pelo Git. Os cadastros permanecem entre reinicializações. A aplicação começa sem clientes ou chamados.

```sh
npm run check
npm test
```

## Limites desta versão

Esta versão não tem autenticação nem separação de dados entre empresas. O servidor aceita conexões somente da própria máquina. Use dados fictícios. Não exponha este servidor na internet nem utilize dados reais de clientes.

Antes de um piloto comercial: implementar contas, autorização e isolamento entre empresas; configurar hospedagem com HTTPS, backups e restauração; definir tratamento dos dados, suporte e cobrança.

O filtro de período considera a data de abertura. A situação mostrada nos indicadores é a situação atual dos chamados selecionados. O percentual concluído não mede SLA nem produtividade individual. O gráfico diário apresenta os últimos sete dias dentro do recorte selecionado. O modo de demonstração é somente leitura e não altera os registros locais.

## Independência

O projeto não contém código, histórico, dados, credenciais ou regras internas do TechLead Hub. Qualquer reutilização futura exige esclarecer os direitos e a autorização aplicável.
