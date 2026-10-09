import type { TabelaSync } from './db'

/** Regras de cada formulário. As mesmas faixas estão no banco (migração 0009), que recusa
 *  o que escapar daqui; aqui o aviso aparece na hora, ainda sem sinal. */
type Faixa = [min: number, max: number, nome: string]
type Regras = { numeros?: Record<string, Faixa>; textos?: Record<string, number>; data?: string }

const LAT: Faixa = [-90, 90, 'Latitude'], LNG: Faixa = [-180, 180, 'Longitude']
const REGRAS: Partial<Record<TabelaSync, Regras>> = {
  talhoes: { numeros: { area_ha: [0.01, 5000, 'Área (ha)'] }, textos: { nome: 80, observacao: 2000 } },
  insumos: {
    numeros: { estoque_minimo: [0, 1e9, 'Estoque mínimo'], preco_unitario: [0, 1e9, 'Preço'], dose_ha_padrao: [0, 1e5, 'Dose padrão'] },
    textos: { nome: 120, fabricante: 120, ingrediente_ativo: 200, classe: 80 },
  },
  ciclos: {
    numeros: {
      producao: [0, 1e9, 'Produção'], meta_por_ha: [0, 1e6, 'Meta por ha'], populacao_plantas_ha: [0, 5e6, 'População'],
      ciclo_cultivar_dias: [0, 2000, 'Ciclo da cultivar'], corte_cana: [0, 30, 'Corte'], atr_kg_t: [0, 300, 'ATR'],
    },
    textos: { safra: 40, cultivar: 80, observacao: 2000 },
  },
  operacoes: {
    numeros: {
      area_ha: [0.01, 5000, 'Área (ha)'], horas: [0, 1000, 'Horas'], volume_calda_l_ha: [0, 1000, 'Volume de calda'],
      temperatura_c: [-10, 60, 'Temperatura'], umidade_pct: [0, 100, 'Umidade'], vento_kmh: [0, 150, 'Vento'],
      populacao_plantas_ha: [0, 5e6, 'População'], producao: [0, 1e9, 'Produção'], latitude: LAT, longitude: LNG,
    },
    textos: { alvo: 200, receituario: 200, observacao: 2000, cultivar: 80 },
    data: 'data_hora',
  },
  operacao_produtos: { numeros: { dose_ha: [0.0001, 1e5, 'Dose'] } },
  campo: {
    numeros: { nivel_encontrado: [0, 1e9, 'Contagem'], nivel_de_controle: [0, 1e9, 'Nível de controle'], latitude: LAT, longitude: LNG },
    textos: { alvo: 200, descricao: 2000, unidade_nivel: 40 },
    data: 'data_hora',
  },
  chuva: { numeros: { milimetros: [0, 400, 'Chuva (mm)'] }, textos: { observacao: 500 }, data: 'data' },
  estoque_mov: {
    numeros: { quantidade: [0.0001, 1e7, 'Quantidade'], valor_total: [0, 1e10, 'Valor'] },
    textos: { nota_fiscal: 60, fornecedor: 120, observacao: 2000 },
    data: 'data',
  },
  estadios: { textos: { estadio: 40 }, data: 'data_hora' },
}
const OBRIGATORIOS: Partial<Record<TabelaSync, Record<string, string>>> = {
  talhoes: { nome: 'Nome do talhão' }, insumos: { nome: 'Nome do insumo' }, estoque_mov: { quantidade: 'Quantidade' },
}

export class ErroValidacao extends Error {}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

/** Devolve o primeiro problema encontrado, em português, ou null se está tudo certo. */
export function problema(tabela: TabelaSync, linha: Record<string, unknown>, agora = Date.now()): string | null {
  for (const [k, nome] of Object.entries(OBRIGATORIOS[tabela] ?? {})) {
    const v = linha[k]
    if (k in linha && (v == null || (typeof v === 'string' && !v.trim()) || (typeof v === 'number' && !Number.isFinite(v))))
      return `Preencha: ${nome}.`
  }
  const r = REGRAS[tabela]
  if (!r) return null
  for (const [k, [min, max, nome]] of Object.entries(r.numeros ?? {})) {
    const v = linha[k]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${nome}: valor inválido.`
    if (v < min || v > max) return `${nome}: use um valor entre ${fmt(min)} e ${fmt(max)}.`
  }
  for (const [k, max] of Object.entries(r.textos ?? {})) {
    const v = linha[k]
    if (typeof v === 'string' && v.length > max) return `Texto muito longo (máximo de ${max} caracteres).`
  }
  if (r.data && linha[r.data] != null) {
    const s = String(linha[r.data])
    const t = new Date(s.length === 10 ? s + 'T12:00:00' : s).getTime()
    if (!Number.isFinite(t)) return 'Data inválida.'
    if (t < Date.UTC(2015, 0, 1)) return 'Data muito antiga. Confira o dia.'
    if (t > agora + 2 * 864e5) return 'Data no futuro. Confira o dia e a hora.'
  }
  return null
}

const ouvintes = new Set<(msg: string) => void>()
export const ouvirErroValidacao = (f: (msg: string) => void) => (ouvintes.add(f), () => void ouvintes.delete(f))

/** Para o salvamento se algo estiver fora do esperado e mostra o motivo na tela. */
export function checar(tabela: TabelaSync, linhas: Record<string, unknown>[]) {
  for (const l of linhas) {
    const p = problema(tabela, l)
    if (p) {
      ouvintes.forEach((f) => f(p))
      throw new ErroValidacao(p)
    }
  }
}
