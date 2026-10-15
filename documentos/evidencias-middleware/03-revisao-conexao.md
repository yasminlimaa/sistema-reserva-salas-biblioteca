# Revisão da conexão — 15/10/2026

O aluno implementou receive_logs.cjs e relatou conexão e canal abertos. Na revisão, importação, função async e os dois awaits estão corretos. O try/catch externo chama main() sem aguardar a Promise e, portanto, não captura rejeições dessa função.

Verificações executadas com Node 24.16.0: `node --check codigo/backend/demo-middleware/receive_logs.cjs` passou; exemplo isolado com função async que lança erro confirmou que o catch externo sem await não executa, enquanto .catch na Promise recebe a rejeição. Não foi aberta outra conexão AMQP durante esta revisão.

Código do aluno preservado. Próxima tarefa: substituir a chamada externa por main().catch(...), explicar a diferença entre erro síncrono e rejeição de Promise e revisar a correção antes de declarar exchange e fila.
