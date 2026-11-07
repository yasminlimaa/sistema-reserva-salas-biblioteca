-- RASCUNHO DIDÁTICO: migração incompleta, não aplicar ao banco ainda.
-- Serviço dono dos dados: Reservas.
-- Escrever a primeira tentativa abaixo destes comentários.
--
-- Etapa 1: criar o schema reservas e a tabela reservas.reservas.
-- Tipos propostos para o protótipo:
--   reserva_id, sala_id, responsavel_id: uuid.
--   inicio, fim, criada_em, cancelada_em: timestamptz.
--   status: text.
-- UUID para referências externas é uma proposta de contrato, a acordar
-- com Usuários e Salas antes da integração; não vincular a auth.users.
--
-- Definir chave primária, obrigatoriedade, valores padrão e CHECKs:
--   intervalo positivo e duração máxima de duas horas;
--   status confirmada/cancelada;
--   coerência entre status e cancelada_em.
--
-- Etapa 2, após revisão: tabela reservas.reserva_participantes,
-- chave composta e chave estrangeira para a reserva local.
--
-- Etapas seguintes: garantir responsável participante e mínimo de três;
-- proteger conflitos por sala e discente sob concorrência; configurar
-- permissões por serviço; validar com dados fictícios e banco real.
-- Uma tabela com CHECKs de linha não garante essas regras adicionais.

CREATE SCHEMA reservas;

CREATE TABLE reservas.reservas(
    reserva_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sala_id UUID NOT NULL,
    responsavel_id UUID NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmada',
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now() ,
    cancelada_em TIMESTAMPTZ,

    CONSTRAINT reservas_intervalo_positivo
        CHECK (fim > inicio),

    CONSTRAINT reservas_duracao_maxima
        CHECK (fim - inicio <= interval '2 hours'),

    CONSTRAINT reservas_status_valido
        CHECK (status in ('confirmada', 'cancelada')),


    CONSTRAINT reservas_status_cancelada_em
        CHECK ((status = 'confirmada' AND cancelada_em IS NULL) OR
                (status = 'cancelada' AND cancelada_em IS NOT NULL))
);


CREATE TABLE reservas.reserva_participantes(
    reserva_id UUID NOT NULL,
    discente_id UUID NOT NULL,

    CONSTRAINT reserva_participantes_pk
        PRIMARY KEY (reserva_id, discente_id),

    CONSTRAINT reserva_participantes_reserva_fk
        FOREIGN KEY (reserva_id)
        REFERENCES reservas.reservas (reserva_id)
);
