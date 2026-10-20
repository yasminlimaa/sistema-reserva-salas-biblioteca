# Preparação do consumidor — 14/10/2026

O aluno informou que acessou Overview: zero conexões, canais, filas e consumidores; oito exchanges. Esse relato confirma acesso visual ao painel, sem comprovar tráfego AMQP.

Criada a pasta `codigo/backend/demo-middleware`, com manifesto npm privado, requisito Node 24, `.nvmrc` e exclusão de node_modules e .env do Git.

Executado `npm install --save-exact amqplib`: instalada versão `2.2.0`, com package-lock.json. A tentativa inicial falhou com ENOTFOUND no sandbox; a repetição autorizada concluiu com Node 20.15.0/npm 10.7.0 e aviso EBADENGINE referente ao requisito Node 24 da demo.

Depois da instalação, a importação de amqplib e a existência de sua função connect foram verificadas explicitamente com o executável `/Users/gabriel.andre/.nvm/versions/node/v24.16.0/bin/node` (v24.16.0), com sucesso. Isso valida carregamento da biblioteca, não comunicação com o broker. Usar `nvm use` nesta pasta antes dos próximos exercícios.

Nenhum publicador ou consumidor implementado nesta etapa. Próxima tarefa do aluno: criar receive_logs.cjs, importar a biblioteca, abrir conexão e canal dentro de função async, tratar falha na chamada dessa função e imprimir mensagem de sucesso somente após a abertura do canal.
