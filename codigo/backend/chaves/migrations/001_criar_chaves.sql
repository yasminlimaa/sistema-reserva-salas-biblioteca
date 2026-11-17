-- Serviço dono dos dados: Chaves (RF10, RF11 e RF12).
-- Registra retirada pelo responsável, devolução, cálculo de atraso e histórico de movimentações.

CREATE SCHEMA chaves;

CREATE TABLE chaves.entregas (
    reserva_id UUID PRIMARY KEY,
    sala_id UUID NOT NULL,
    responsavel_id UUID NOT NULL,
    inicio_previsto TIMESTAMPTZ NOT NULL,
    fim_previsto TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'retirada',
    retirada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    devolvida_em TIMESTAMPTZ,
    devolvida_com_atraso BOOLEAN NOT NULL DEFAULT false,
    atraso_minutos INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT entregas_intervalo_valido
        CHECK (fim_previsto > inicio_previsto),

    CONSTRAINT entregas_status_valido
        CHECK (status IN ('retirada', 'devolvida')),

    CONSTRAINT entregas_atraso_nao_negativo
        CHECK (atraso_minutos >= 0),

    CONSTRAINT entregas_coerencia_devolucao
        CHECK (
            (status = 'retirada' AND devolvida_em IS NULL)
            OR (status = 'devolvida' AND devolvida_em IS NOT NULL AND devolvida_em >= retirada_em)
        )
);

CREATE TABLE chaves.movimentacoes (
    movimentacao_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reserva_id UUID NOT NULL REFERENCES chaves.entregas (reserva_id),
    sala_id UUID NOT NULL,
    responsavel_id UUID NOT NULL,
    tipo TEXT NOT NULL,
    acao TEXT NOT NULL,
    operador_id UUID NOT NULL,
    operador_nome TEXT NOT NULL,
    observacao TEXT,
    ocorrida_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT movimentacoes_tipo_valido
        CHECK (tipo IN ('retirada', 'devolucao')),

    CONSTRAINT movimentacoes_acao_preenchida
        CHECK (btrim(acao) <> ''),

    CONSTRAINT movimentacoes_operador_preenchido
        CHECK (btrim(operador_nome) <> '')
);

CREATE INDEX entregas_sala_status_idx ON chaves.entregas (sala_id, status);
CREATE INDEX movimentacoes_reserva_ordem_idx ON chaves.movimentacoes (reserva_id, ocorrida_em);

