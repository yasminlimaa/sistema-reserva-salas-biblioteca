# Revisão do publicador — 15/10/2026

Inspecionados emit_logs.cjs e receive_logs.cjs. Ambos passaram em node --check com Node 24.16.0. Consumidor agora verifica msg === null antes de acessar content. Publicador declara o mesmo exchange logs/fanout não durável, serializa o evento sintético e publica um Buffer.

Correção solicitada ao aluno: no callback de setTimeout, aguardar/tratar a Promise de connection.close e remover process.exit(0), que pode interromper o fechamento assíncrono. main().catch não trata rejeições de um callback posterior que não faz parte de sua Promise.

Nenhum arquivo de código alterado pelo agente. Não foram executados os programas nem verificada a entrega nesta revisão. O atraso de 500 ms e o log de publicação não comprovam confirmação do broker. Depois da correção, testar um publicador e um consumidor e, em seguida, duas filas exclusivas com o mesmo evento.
