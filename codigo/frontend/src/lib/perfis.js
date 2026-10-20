// Regras por tipo de usuário no cadastro. Ajustar aqui quando a equipe fechar as regras de negócio.
// Matrícula de funcionário: assumida como SIAPE (7 dígitos). Domínio de funcionário: assumido como @ufma.br.
export const CONFIG_CADASTRO = {
  discente: {
    titulo: 'Cadastro de discente',
    rotuloMatricula: 'Matrícula',
    regexMatricula: /^\d{8,15}$/,
    mensagemMatricula: 'A matrícula deve conter de 8 a 15 números.',
    rotuloUnidade: 'Curso',
    mensagemUnidade: 'Informe seu curso.',
    dominio: '@discente.ufma.br',
    buscaMatricula: true,
    aceite:
      'Li e aceito as regras de uso das salas: mínimo de 3 discentes por reserva e devolução da chave até o fim do horário.',
  },
  funcionario: {
    titulo: 'Cadastro de funcionário',
    rotuloMatricula: 'Matrícula SIAPE',
    regexMatricula: /^\d{7}$/,
    mensagemMatricula: 'A matrícula SIAPE tem 7 números.',
    rotuloUnidade: 'Setor',
    mensagemUnidade: 'Informe seu setor.',
    dominio: '@ufma.br',
    buscaMatricula: false,
    aceite:
      'Li e aceito as regras de uso das salas e me comprometo com a devolução das chaves e com o uso das funções do meu perfil.',
  },
}
