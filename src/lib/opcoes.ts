export const CULTURAS = ['Soja', 'Milho', 'Sorgo', 'Cana-de-açúcar', 'Pousio'] as const
export const TIPOS_OPERACAO = ['Plantio', 'Pulverização', 'Adubação', 'Colheita', 'Corte de cana', 'Preparo de solo', 'Calagem e gessagem', 'Manutenção', 'Outra'] as const
export const TIPOS_CAMPO = ['Praga', 'Doença', 'Planta daninha', 'Falha de estande', 'Máquina', 'Infraestrutura', 'Outro'] as const
export const TIPOS_MIP = ['Praga', 'Doença', 'Planta daninha']
export const URGENCIAS = ['Baixa', 'Média', 'Alta'] as const
export const STATUS_CAMPO = ['Aberta', 'Monitorando', 'Aplicação indicada', 'Resolvida'] as const
export const MOVIMENTOS = ['Entrada', 'Saída avulsa', 'Ajuste de inventário'] as const
export const TIPOS_INSUMO = ['Semente', 'Fertilizante', 'Corretivo', 'Defensivo', 'Combustível', 'Peça', 'Outro'] as const
export const UNIDADES = ['L', 'kg', 't', 'sc', 'mL', 'g', 'un', 'ha', 'h'] as const
export const STATUS_CICLO = ['Planejado', 'Em andamento', 'Colhido'] as const
export const ESTADIOS_GRAOS = ['Pré-plantio', 'Emergência (VE)', 'Vegetativo (V)', 'Pré-florescimento', 'Florescimento (R1-R2)', 'Formação de grãos (R3-R5)', 'Maturação (R6-R8)', 'Pronto para colheita']
export const ESTADIOS_CANA = ['Cana: Brotação', 'Cana: Perfilhamento', 'Cana: Crescimento', 'Cana: Maturação']
export const COR_CULTURA: Record<string, string> = {
  Soja: 'var(--soja)', Milho: 'var(--milho)', Sorgo: 'var(--sorgo)', 'Cana-de-açúcar': 'var(--cana)', Pousio: 'var(--pousio)',
}
// Cores sólidas para o mapa (o SVG do Leaflet não lê variáveis CSS).
export const HEX_CULTURA: Record<string, string> = {
  Soja: '#3f8f3a', Milho: '#d9a520', Sorgo: '#b0532c', 'Cana-de-açúcar': '#2f7f8f', Pousio: '#8a8270',
}
