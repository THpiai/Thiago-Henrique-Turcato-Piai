import { Icone } from '../components/Icone'

export function Registrar({ ir }: { ir: (tela: string) => void }) {
  const itens = [
    { tela: 'operacao', icone: 'trator', t: 'Operação', d: 'Plantio, pulverização, adubação, colheita…' },
    { tela: 'campo', icone: 'lupa', t: 'Monitoramento', d: 'Praga, doença, daninha, falha, máquina' },
    { tela: 'chuva', icone: 'chuva', t: 'Chuva', d: 'Leitura dos pluviômetros' },
    { tela: 'estoque', icone: 'estoque', t: 'Estoque', d: 'Entrada de nota, saída avulsa, inventário' },
  ]
  return (
    <div className="tela">
      <h1>Registrar</h1>
      <p className="mudo">Funciona sem sinal. O que você salvar fica no celular e sobe sozinho quando o sinal voltar.</p>
      <div className="menu">
        {itens.map((i) => (
          <button key={i.tela} onClick={() => ir(i.tela)}>
            <span className="icone"><Icone n={i.icone} t={26} /></span>
            <span><b>{i.t}</b><small>{i.d}</small></span>
            <Icone n="seta" t={18} className="seta" />
          </button>
        ))}
      </div>
    </div>
  )
}
