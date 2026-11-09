-- Serviço dono dos dados: Salas (RF02 e RF03).
-- Responsável pelo cadastro, capacidade, recursos (bloco/equipamentos) e estado (ativa/inativa).
-- A ocupação dos horários permanece sob autoridade exclusiva do serviço de Reservas.

CREATE SCHEMA salas;

CREATE TABLE salas.salas (
    sala_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    capacidade INTEGER NOT NULL,
    bloco TEXT,
    equipamentos TEXT[] NOT NULL DEFAULT '{}'::text[],
    ativa BOOLEAN NOT NULL DEFAULT true,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Nome obrigatório e não vazio (sem apenas espaços em branco).
    CONSTRAINT salas_nome_preenchido
        CHECK (btrim(nome) <> '' AND char_length(btrim(nome)) <= 80),

    -- Evita nomes duplicados no catálogo de salas.
    CONSTRAINT salas_nome_unico
        UNIQUE (nome),

    -- Capacidade mínima de 3 lugares (coerente com RF05: mínimo de 3 discentes por reserva).
    CONSTRAINT salas_capacidade_valida
        CHECK (capacidade >= 3 AND capacidade <= 50),

    -- Se informado, o bloco não pode ser string vazia.
    CONSTRAINT salas_bloco_valido
        CHECK (bloco IS NULL OR (btrim(bloco) <> '' AND char_length(btrim(bloco)) <= 60))
);

CREATE INDEX salas_ativa_capacidade_idx ON salas.salas (ativa, capacidade);

