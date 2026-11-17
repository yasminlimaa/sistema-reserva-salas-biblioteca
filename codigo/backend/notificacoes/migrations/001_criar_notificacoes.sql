-- Serviço dono dos dados: Notificações (RF09).
-- Persiste avisos ao responsável sobre confirmação, cancelamento e alteração de reservas,
-- garantindo deduplicação persistente pelo event_id (idempotência no consumo AMQP).

CREATE SCHEMA notificacoes;

CREATE TABLE notificacoes.avisos (
    aviso_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    reservation_id UUID NOT NULL,
    usuario_id UUID NOT NULL,
    room_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    texto TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fim TIMESTAMPTZ NOT NULL,
    lido BOOLEAN NOT NULL DEFAULT false,
    lido_em TIMESTAMPTZ,
    ocorreu_em TIMESTAMPTZ NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Deduplicação persistente de eventos entregues mais de uma vez pelo broker.
    CONSTRAINT avisos_event_id_unico
        UNIQUE (event_id),

    CONSTRAINT avisos_event_type_valido
        CHECK (event_type IN ('reserva.confirmada', 'reserva.cancelada', 'reserva.alterada')),

    CONSTRAINT avisos_texto_preenchido
        CHECK (btrim(texto) <> ''),

    CONSTRAINT avisos_intervalo_valido
        CHECK (fim > inicio),

    CONSTRAINT avisos_leitura_coerente
        CHECK (
            (lido = false AND lido_em IS NULL)
            OR (lido = true AND lido_em IS NOT NULL)
        )
);

CREATE INDEX avisos_usuario_criado_idx ON notificacoes.avisos (usuario_id, criado_em DESC);
CREATE INDEX avisos_usuario_nao_lidos_idx ON notificacoes.avisos (usuario_id)
    WHERE lido = false;

