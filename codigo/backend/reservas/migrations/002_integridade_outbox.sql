-- Não corrige dados anteriores silenciosamente: interromper se precisarem de revisão.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM reservas.reservas r
    WHERE (SELECT count(*) FROM reservas.reserva_participantes p WHERE p.reserva_id = r.reserva_id) < 3
       OR NOT EXISTS (SELECT 1 FROM reservas.reserva_participantes p
                      WHERE p.reserva_id = r.reserva_id AND p.discente_id = r.responsavel_id)
  ) THEN
    RAISE EXCEPTION 'Há reservas antigas sem três participantes ou sem responsável participante. Revisar antes da migração.';
  END IF;
END $$;

ALTER TABLE reservas.reservas ADD CONSTRAINT responsavel_participante_fk
  FOREIGN KEY (reserva_id, responsavel_id)
  REFERENCES reservas.reserva_participantes (reserva_id, discente_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION reservas.verificar_minimo_participantes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, reservas AS $$
DECLARE
  identificador uuid;
  alvos uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN alvos := ARRAY[NEW.reserva_id];
  ELSIF TG_OP = 'DELETE' THEN alvos := ARRAY[OLD.reserva_id];
  ELSE alvos := ARRAY[OLD.reserva_id, NEW.reserva_id];
  END IF;
  FOREACH identificador IN ARRAY alvos LOOP
    PERFORM 1 FROM reservas.reservas WHERE reserva_id = identificador FOR UPDATE;
    IF FOUND AND (SELECT count(*) FROM reservas.reserva_participantes
                  WHERE reserva_id = identificador) < 3 THEN
      RAISE EXCEPTION 'Reserva exige ao menos três participantes distintos'
        USING ERRCODE = '23514', CONSTRAINT = 'reserva_minimo_tres';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER reserva_minimo_tres
AFTER INSERT OR UPDATE ON reservas.reservas
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION reservas.verificar_minimo_participantes();

CREATE CONSTRAINT TRIGGER participacao_minimo_tres
AFTER INSERT OR UPDATE OR DELETE ON reservas.reserva_participantes
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION reservas.verificar_minimo_participantes();

CREATE INDEX reservas_sala_intervalo_idx ON reservas.reservas (sala_id, inicio, fim)
  WHERE status = 'confirmada';
CREATE INDEX participacoes_discente_idx ON reservas.reserva_participantes (discente_id, reserva_id);

CREATE TABLE reservas.outbox (
  event_id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES reservas.reservas (reserva_id),
  event_type text NOT NULL CHECK (event_type IN ('reserva.confirmada', 'reserva.cancelada')),
  payload jsonb NOT NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  publicada_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas BETWEEN 0 AND 5),
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  falhou_em timestamptz
);
CREATE INDEX outbox_pendentes_idx ON reservas.outbox (proxima_tentativa_em, criada_em)
  WHERE publicada_em IS NULL AND falhou_em IS NULL;
