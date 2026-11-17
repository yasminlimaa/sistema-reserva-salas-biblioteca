-- Serviço dono dos dados: Usuários (RF01 e RNF05).
-- Responsável pelo cadastro, credenciais (hash de senha), sessões, perfis (discente/funcionario)
-- e validação de discentes participantes para o serviço de Reservas.

CREATE SCHEMA usuarios;

CREATE TABLE usuarios.usuarios (
    usuario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    matricula TEXT NOT NULL,
    unidade TEXT NOT NULL,
    telefone TEXT,
    perfil TEXT NOT NULL,
    senha_hash TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT usuarios_nome_valido
        CHECK (char_length(btrim(nome)) BETWEEN 3 AND 120),

    CONSTRAINT usuarios_email_unico
        UNIQUE (email),

    CONSTRAINT usuarios_matricula_unica
        UNIQUE (matricula),

    CONSTRAINT usuarios_unidade_valida
        CHECK (char_length(btrim(unidade)) BETWEEN 2 AND 100),

    CONSTRAINT usuarios_telefone_valido
        CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$'),

    CONSTRAINT usuarios_perfil_valido
        CHECK (perfil IN ('discente', 'funcionario')),

    -- Coerência entre perfil, formato de matrícula (SIGAA 8..15 dígitos vs SIAPE 7 dígitos) e domínio institucional.
    CONSTRAINT usuarios_regras_institucionais
        CHECK (
            (perfil = 'discente' AND matricula ~ '^\d{8,15}$' AND email LIKE '%@discente.ufma.br')
            OR (perfil = 'funcionario' AND matricula ~ '^\d{7}$' AND email LIKE '%@ufma.br')
        )
);

CREATE TABLE usuarios.sessoes (
    sessao_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios.usuarios (usuario_id),
    token_sha256 TEXT NOT NULL UNIQUE,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em TIMESTAMPTZ NOT NULL,
    revogada_em TIMESTAMPTZ,

    CONSTRAINT sessoes_validade_positiva
        CHECK (expira_em > criada_em)
);

CREATE INDEX usuarios_perfil_ativo_idx ON usuarios.usuarios (perfil, ativo);
CREATE INDEX sessoes_token_ativas_idx ON usuarios.sessoes (token_sha256)
    WHERE revogada_em IS NULL;

