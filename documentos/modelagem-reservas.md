# Modelagem do serviço de Reservas

Revisão em 20/10/2026 a partir da tentativa do aluno. Modelo proposto para a primeira migração; ainda não há SQL implementado nem banco verificado.

## Propriedade dos dados

| Serviço | Dados próprios |
|---|---|
| Usuários | Identidade, cadastro, perfil e autenticação |
| Salas | Cadastro e ativação |
| Reservas | Reserva, intervalo, responsável, participantes e cancelamento |
| Chaves | Retirada, devolução e movimentações |
| Notificações | Avisos ao responsável e seu processamento |

Reservas referencia os identificadores internos de usuários e salas, sem copiar os cadastros nem escrever nos dados privados desses serviços. Matrícula pertence ao cadastro de Usuários; o formato do identificador interno deve ser acordado com esse serviço. Não se presume Supabase Auth.

Referências entre serviços são relações conceituais e não exigem chaves estrangeiras entre schemas. Existência, perfil de discente e sala ativa serão validados pelos contratos dos serviços. Dados fictícios não comprovam essas validações.

## 1. Reserva

Finalidade: registrar qual sala será ocupada, por qual intervalo e sob responsabilidade de quem, preservando os dados após cancelamento.

| Atributo proposto | Significado | Obrigatório |
|---|---|---|
| reserva_id | Identificador único da reserva | Sim |
| sala_id | Referência à sala | Sim |
| responsavel_id | Referência ao usuário responsável | Sim |
| inicio | Data e hora de início, com convenção de fuso definida | Sim |
| fim | Data e hora de término, com a mesma convenção | Sim |
| status | Proposta inicial: confirmada ou cancelada | Sim |
| criada_em | Instante de criação do registro | Sim |
| cancelada_em | Instante de cancelamento | Quando cancelada |

Chave primária: reserva_id. Não é necessário um segundo número de reserva neste incremento.

Relacionamentos: cada reserva tem uma sala e um responsável; ambos podem estar associados a várias reservas ao longo do tempo. Cada reserva tem vários vínculos de participação.

Regras:

- Início deve ser anterior ao fim. A duração é calculada pela diferença; não guardar uma duração independente.
- Decisão confirmada pelo aluno em 20/10/2026: duração positiva e de no máximo duas horas. Reservas menores são permitidas; fim deve ser menor ou igual a inicio + duas horas.
- A data está incluída nos instantes de início e fim; os campos genéricos data/horario deixam de ser necessários.
- Sala e responsável não são únicos isoladamente.
- Uma reserva confirmada exige pelo menos três discentes distintos e válidos.
- Status e cancelada_em devem ser coerentes: confirmada sem instante de cancelamento; cancelada com esse instante.
- Cancelar preserva o registro e seus participantes, mas libera o horário.
- Preservar a reserva cancelada não equivale a manter todas as versões de suas edições. Auditoria completa será tratada no incremento correspondente.

## 2. Participação em reserva

Finalidade: representar um vínculo entre uma reserva e um discente, em vez de armazenar a lista em texto.

| Atributo proposto | Significado | Obrigatório |
|---|---|---|
| reserva_id | Reserva à qual pertence esta participação | Sim |
| discente_id | Identificador do discente em Usuários | Sim |

Identificador proposto: chave composta (reserva_id, discente_id). A combinação não se repete; o discente pode aparecer em outra reserva.

O vínculo com Reserva deve ter chave estrangeira local, pois as duas estruturas pertencem ao mesmo serviço. Não repetir data e horário aqui: essas informações pertencem à reserva. Uma eventual estrutura adicional de ocupações será documentada junto à estratégia de concorrência.

Cardinalidade: reservas e discentes têm relação muitos-para-muitos, representada pelas participações. Cada participação pertence a exatamente uma reserva e referencia um discente.

A quantidade de participantes é obtida contando os vínculos, sem um contador independente sujeito a divergência.

## 3. Responsável e exemplo fictício

responsavel_id identifica quem responde pela reserva; as participações identificam quem vai ocupar a sala.

Decisão confirmada pelo aluno em 20/10/2026: o responsável é discente e obrigatoriamente integra os participantes. Conta uma única vez no mínimo de três. A persistência deverá garantir que responsavel_id corresponda a uma participação da própria reserva.

Os identificadores abaixo são rótulos didáticos, não tipos SQL definidos.

| reserva_id | sala_id | responsavel_id | inicio | fim | status | criada_em | cancelada_em |
|---|---|---|---|---|---|---|---|
| reserva-demo-01 | sala-demo-01 | discente-a | 2026-10-21T14:00:00-03:00 | 2026-10-21T15:00:00-03:00 | confirmada | 2026-10-20T10:00:00-03:00 | ausente |

| reserva_id | discente_id |
|---|---|
| reserva-demo-01 | discente-a |
| reserva-demo-01 | discente-b |
| reserva-demo-01 | discente-c |

O exemplo segue a decisão de responsável participante e tem duração de uma hora, válida dentro do máximo de duas horas. São três discentes fictícios distintos; não houve validação contra Usuários ou Salas.

## 4. Requisitos e políticas pendentes

Confirmados nos requisitos: mínimo de três discentes distintos e válidos; impedir sobreposição da mesma sala e de qualquer participante, inclusive em salas diferentes; cancelar liberando horário e preservando histórico; validar identidade, permissões e sala ativa no fluxo integrado.

Decisões adicionais confirmadas pelo aluno em 20/10/2026: responsável discente incluído nos participantes e duração máxima de duas horas (não duração fixa). A duração máxima, antes pendente, passa a compor as restrições planejadas para a primeira migração.

As duas propostas abaixo permanecem pendentes e não serão aplicadas como restrições na primeira migração:

| Informação | Esclarecimento necessário |
|---|---|
| Cancelamento após dez minutos sem comparecimento | Confirmar aprovação e como/por quem o comparecimento será verificado |
| Espera de uma hora após a reserva anterior | Confirmar aprovação; se vale por sala, responsável ou participante; se limita o horário reservado ou a criação da próxima reserva |

Outras decisões necessárias:

- Acordar formatos dos identificadores com Usuários e Salas.
- Confirmar convenção de intervalos. A proposta [inicio, fim) permite horários adjacentes; eventual espera obrigatória é uma política adicional.
- Definir proteção de concorrência antes de considerar o banco funcional para criar, alterar e cancelar reservas.

Nenhuma política pendente foi implementada nesta revisão.

## 5. Revisão das respostas e cenários

| Cenário | Resultado esperado e representação |
|---|---|
| Discente repetido na mesma reserva | Rejeitar pela unicidade do par reserva/discente; não contar duas vezes |
| Mesmo discente em reservas diferentes | Permitido sem sobreposição, sujeito a políticas adicionais que forem aprovadas |
| Reserva cancelada | Manter registro e participantes; marcar status e cancelada_em; liberar ocupação |
| Apenas dois discentes | Não confirmar; a chave composta não garante sozinha o mínimo de três |
| Responsável ausente dos participantes | Rejeitar, mesmo que haja três outros discentes |
| Intervalo de 15h a 17h | Aceitar quanto à duração; demais regras ainda precisam ser satisfeitas |
| Intervalo de 15h a 16h | Aceitar quanto à duração; não é obrigatório completar duas horas |
| Intervalo de 15h a 17h01 | Rejeitar por ultrapassar duas horas |
| Fim igual ou anterior ao início | Rejeitar por intervalo inválido |
| Reservas conflitantes simultâneas na mesma sala | Impedir confirmação de ambas |
| Reservas conflitantes simultâneas em salas diferentes com discente comum | Impedir confirmação de ambas |

O mínimo de três envolve vários registros e não é garantido por uma simples validação de coluna da reserva. A persistência deverá gravar reserva e participações atomicamente e verificar essa regra. Os conflitos precisam de proteção transacional ou restrições equivalentes, com teste concorrente real. Consultar disponibilidade e inserir depois, sem proteção, não é suficiente. Todos os caminhos de criação, alteração e cancelamento precisam seguir a estratégia escolhida.

## 6. Revisão e próximo incremento

Corrigidos: ausência de responsável/status na lista de atributos, intervalo ambíguo, identificador da participação e repetição de horário nos vínculos. A ideia do aluno de preservar cancelamento foi mantida; a proposta usa status e instante para registrar o fato explicitamente. Novas políticas foram separadas dos requisitos confirmados.

Verificação: revisão documental; nenhuma execução de SQL ou alteração da demo. Não há comprovação de banco pronto nesta etapa.

Próximo incremento: resolver as decisões que afetam o esquema, escolher tipos e preparar a primeira migração versionada de Reservas, seguida de dados fictícios e verificações de integridade. O aluno continuará escrevendo a parte central em tarefas pequenas, com revisão antes da aplicação ao banco.
