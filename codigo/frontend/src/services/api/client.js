export class ApiError extends Error {
  constructor(message, { status, codigo, correlationId } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.correlationId = correlationId
  }
}

function urlComQuery(baseUrl, caminho, query) {
  const base = baseUrl.replace(/\/+$/, '')
  const destino = `${base}/${caminho.replace(/^\/+/, '')}`
  const relativa = destino.startsWith('/')
  const url = new URL(destino, relativa ? 'http://frontend.local' : undefined)
  for (const [chave, valor] of Object.entries(query || {})) {
    if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(chave, String(valor))
  }
  return relativa ? `${url.pathname}${url.search}` : url.toString()
}

async function lerCorpo(resposta) {
  const texto = await resposta.text()
  if (!texto) return { dados: null, jsonInvalido: false }
  try {
    return { dados: JSON.parse(texto), jsonInvalido: false }
  } catch {
    return { dados: null, jsonInvalido: true }
  }
}

// O token pertence ao chamador. Esta camada nunca o persiste no navegador.
export function criarClienteHttp(baseUrl) {
  if (!baseUrl) throw new Error('A URL base da API não foi configurada.')

  async function requisitar(caminho, { metodo = 'GET', token, corpo, query, sinal } = {}) {
    let resposta
    try {
      const headers = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      if (corpo !== undefined) headers['Content-Type'] = 'application/json'

      resposta = await fetch(urlComQuery(baseUrl, caminho, query), {
        method: metodo,
        headers,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: sinal,
      })
    } catch (erro) {
      if (erro?.name === 'AbortError') throw erro
      throw new ApiError('Não foi possível conectar ao serviço. Tente novamente.')
    }

    const { dados, jsonInvalido } = await lerCorpo(resposta)
    if (!resposta.ok) {
      throw new ApiError(
        dados?.mensagem || `Não foi possível concluir a operação (${resposta.status}).`,
        { status: resposta.status, codigo: dados?.codigo, correlationId: dados?.correlation_id },
      )
    }
    if (jsonInvalido) {
      throw new ApiError('O serviço retornou uma resposta JSON inválida.', { status: resposta.status })
    }
    return dados
  }

  return {
    get: (caminho, opcoes = {}) => requisitar(caminho, { ...opcoes, metodo: 'GET' }),
    post: (caminho, corpo, opcoes = {}) => requisitar(caminho, { ...opcoes, metodo: 'POST', corpo }),
  }
}
