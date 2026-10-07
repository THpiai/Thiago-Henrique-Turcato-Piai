export function Registrar({ ir }: { ir: (tela: string) => void }) {
  const itens = [
    { tela: 'operacao', icone: '🚜', t: 'Operação', d: 'Plantio, pulverização, adubação, colheita…' },
    { tela: 'campo', icone: '🔍', t: 'Monitoramento', d: 'Praga, doença, daninha, falha, máquina' },
    { tela: 'chuva', icone: '🌧', t: 'Chuva', d: 'Leitura dos pluviômetros' },
    { tela: 'estoque', icone: '📦', t: 'Estoque', d: 'Entrada de nota, saída avulsa, inventário' },
  ]
  return (
    <div className="tela">
      <h1>Registrar</h1>
      <p className="mudo">Funciona sem sinal. O que você salvar fica no celular e sobe sozinho quando o sinal voltar.</p>
      <div className="menu">
        {itens.map((i) => (
          <button key={i.tela} onClick={() => ir(i.tela)}>
            <span className="icone">{i.icone}</span>
            <span><b>{i.t}</b><small>{i.d}</small></span>
          </button>
        ))}
      </div>
    </div>
  )
}
