import React from 'react';

export default function HistoricoChavesModal({ chaveData, onClose }) {
  if (!chaveData) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Histórico de Uso - {chaveData.sala}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#55615B' }}>
          <strong>Responsável Atual/Último:</strong> {chaveData.responsavel} ({chaveData.matricula})
        </div>

        <div className="historico-list">
          {chaveData.historico && chaveData.historico.length > 0 ? (
            chaveData.historico.map((item, index) => (
              <div key={index} className="historico-item">
                <div style={{ fontWeight: '600', color: '#15201B' }}>
                  {item.acao}
                </div>
                <div style={{ fontSize: '13px', color: '#55615B' }}>
                  Horário: {item.horario} | Registrado por: {item.operador}
                </div>
                {item.observacao && (
                  <div style={{ fontSize: '12px', color: '#8A1C12', marginTop: '2px' }}>
                    Nota: {item.observacao}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p style={{ color: '#757575', fontStyle: 'italic' }}>Nenhum histórico registrado hoje.</p>
          )}
        </div>

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button className="btn-action secondary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}