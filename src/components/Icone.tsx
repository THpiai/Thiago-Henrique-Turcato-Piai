// Ícones de linha, desenhados à mão para ficarem leves e iguais em qualquer celular.
const CAMINHOS: Record<string, string> = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  mapa: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20',
  registrar: 'M12 5v14M5 12h14',
  estoque: 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9',
  mais: 'M4 7h16M4 12h16M4 17h16',
  trator: 'M4 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0zM15.5 18.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM7 14V7h6l2 5h4l1 3.5M13 7v5',
  lupa: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16',
  chuva: 'M7 15a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8a4 4 0 0 1 0 8M8 18l-1 2.5M12 17l-1 3M16 18l-1 2.5',
  folha: 'M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19l7-7',
  frasco: 'M9 3h6M10 3v6L5 18.5A1.5 1.5 0 0 0 6.3 21h11.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3M7.5 15h9',
  pessoas: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  sinal: 'M5 18h2M10 18v-4M14 18v-8M18 18V6',
  desfazer: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  refazer: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  lixo: 'M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3',
  andar: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l2-6 3 3v3M8 12l2-5 4 1 2 4M12 15l-1-4',
  alvo: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v3M12 19v3M2 12h3M19 12h3M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  check: 'M5 12.5 10 17.5 19.5 7',
  x: 'M6 6l12 12M18 6 6 18',
  lapis: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 6l-6 6 6 6',
  enquadrar: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
}

export function Icone({ n, t = 22, className }: { n: keyof typeof CAMINHOS | string; t?: number; className?: string }) {
  return (
    <svg className={className} width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[n] ?? ''} />
    </svg>
  )
}
