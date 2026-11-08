// eventId é opcional para diagnósticos/testes direcionados; o worker usa todos os pendentes.
export async function dispatchOne(pool, publisher, eventId = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Só há confirmação/cancelamento: o cancelamento aguarda todas as confirmações da reserva.
    const { rows: [event] } = await client.query(`SELECT e.event_id, e.payload FROM reservas.outbox e
      WHERE e.publicada_em IS NULL AND e.falhou_em IS NULL AND e.proxima_tentativa_em <= now()
        AND ($1::uuid IS NULL OR e.event_id = $1)
        AND NOT EXISTS (
          SELECT 1 FROM reservas.outbox anterior
          WHERE e.event_type = 'reserva.cancelada' AND anterior.reservation_id = e.reservation_id
            AND anterior.event_type = 'reserva.confirmada' AND anterior.publicada_em IS NULL
        )
      ORDER BY e.criada_em, e.event_id LIMIT 1 FOR UPDATE OF e SKIP LOCKED`, [eventId]);
    if (!event) { await client.query('COMMIT'); return null; }
    let published = false;
    try {
      await publisher.publish(event.payload);
      published = true;
    } catch {
      // Quarentena persistida após cinco falhas; não há retry infinito.
      await client.query(`UPDATE reservas.outbox SET tentativas = tentativas + 1,
        proxima_tentativa_em = now() + (LEAST(60, power(2, tentativas + 1)) * interval '1 second'),
        falhou_em = CASE WHEN tentativas + 1 >= 5 THEN now() ELSE NULL END
        WHERE event_id = $1`, [event.event_id]);
    }
    if (published) {
      await client.query(`UPDATE reservas.outbox SET publicada_em = now(), tentativas = tentativas + 1
        WHERE event_id = $1`, [event.event_id]);
    }
    // Crash após confirmação e antes deste commit pode reenviar o mesmo event_id.
    await client.query('COMMIT');
    return { event_id: event.event_id, publicado: published };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
