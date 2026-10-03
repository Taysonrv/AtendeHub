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
- Contas por empresa com login e sessões de oito horas.
- Isolamento dos clientes e chamados de cada empresa no servidor.
- Equipe com perfis de administrador e atendente; ativação e desativação de acesso.
- Alteração da própria senha, encerrando as outras sessões.
- Edição de clientes e chamados com registro das mudanças do chamado no histórico.
- Atribuição de novos chamados a usuários ativos da própria empresa.
- Conclusão com solução obrigatória e data registrada; reabertura preserva a solução anterior no histórico.
- Proteção contra sobrescrever uma edição feita por outra pessoa.
- Relatórios com tempo corrido até a conclusão, conclusões dentro do prazo e solução no CSV.

## Executar

Requer Node.js 24 ou superior. Sem dependências externas.

```sh
npm start
```

Acesse http://127.0.0.1:3100. Na primeira execução, crie a conta da empresa; ela terá o perfil de administrador. Nenhuma senha padrão é criada. O banco é criado em `data/atendehub.sqlite`, ignorado pelo Git. Os cadastros permanecem entre reinicializações.

Instalações anteriores à versão 0.3 preservam os cadastros e os associam à primeira empresa cadastrada. Empresas criadas depois começam sem clientes ou chamados. Cada e-mail de acesso pertence a uma única empresa nesta versão.

Em **Minha equipe**, administradores cadastram outros usuários e definem uma senha inicial de pelo menos 12 caracteres. Compartilhe essa senha diretamente com a pessoa; ela pode alterá-la na própria conta. Desativar um usuário encerra suas sessões imediatamente. Atendentes acessam os atendimentos e relatórios da empresa, mas não administram usuários.

```sh
npm run check
npm test
```

## Limites desta versão

O servidor aceita conexões somente da própria máquina. Use dados fictícios. Esta versão continua voltada à validação local e ainda não foi preparada para exposição na internet.

Antes de um piloto comercial: configurar hospedagem com HTTPS, backups e restauração; implementar recuperação de senha e convites; definir tratamento dos dados, suporte e cobrança. Não há verificação de e-mail nem recuperação de senha nesta versão.

As senhas são protegidas com scrypt e salt aleatório. O navegador recebe um cookie HttpOnly/SameSite; o banco armazena somente o resumo criptográfico do token da sessão. Cadastro e login têm limite de tentativas por endereço. O modo local usa HTTP. Uma hospedagem futura deve configurar `APP_ORIGIN` com a origem HTTPS correta e `SECURE_COOKIES=true`, além de adaptar o servidor e a infraestrutura; configurar somente essas variáveis não publica nem torna esta instalação pronta para produção.

O filtro de período considera a data de abertura. A situação mostrada nos indicadores é a situação atual dos chamados selecionados. O percentual concluído não mede SLA nem produtividade individual. O gráfico diário apresenta os últimos sete dias dentro do recorte selecionado. O modo de demonstração é somente leitura e não altera os registros locais.

O tempo até a conclusão considera horas corridas desde a abertura até a última conclusão, incluindo esperas e reaberturas; não mede esforço de trabalho nem SLA. Chamados antigos sem data de conclusão ficam fora desse cálculo. Reabrir um chamado remove sua data e solução do estado atual, mantendo a solução anterior no histórico. Os responsáveis antigos em texto são preservados; ao editar esse chamado, escolha uma pessoa ativa da equipe.

## Independência

O projeto não contém código, histórico, dados, credenciais ou regras internas do TechLead Hub. Qualquer reutilização futura exige esclarecer os direitos e a autorização aplicável.

A central de chamados permite combinar busca por número, título, descrição e nomes (sem distinção de acentos), situação, cliente, responsável e prioridade. A exportação da central inclui apenas a seleção visível; os relatórios continuam exportando o período completo.
