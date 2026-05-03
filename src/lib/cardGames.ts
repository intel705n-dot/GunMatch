export interface CardGameDef {
  id: string;
  name: string;
  category: 'major' | 'semi-major' | 'trending' | 'niche' | 'other';
  /** Inline style colors for the badge */
  colors: {
    text: string;
    border: string;
    bg: string;
    gradient?: string; // CSS linear-gradient for major titles
  };
}

// ── Major (each with unique gradient) ──────────────────────
const MAJOR_GAMES: CardGameDef[] = [
  {
    id: 'pokemon',
    name: 'ポケモンカードゲーム',
    category: 'major',
    colors: {
      text: '#FBBF24',
      border: '#F59E0B',
      bg: 'rgba(245,158,11,0.15)',
      gradient: 'linear-gradient(135deg, #FBBF24, #D97706)',
    },
  },
  {
    id: 'yugioh',
    name: '遊戯王オフィシャルカードゲーム',
    category: 'major',
    colors: {
      text: '#A78BFA',
      border: '#8B5CF6',
      bg: 'rgba(139,92,246,0.15)',
      gradient: 'linear-gradient(135deg, #A78BFA, #6366F1)',
    },
  },
  {
    id: 'duelmasters',
    name: 'デュエル・マスターズ',
    category: 'major',
    colors: {
      text: '#F87171',
      border: '#EF4444',
      bg: 'rgba(239,68,68,0.15)',
      gradient: 'linear-gradient(135deg, #F87171, #DC2626)',
    },
  },
  {
    id: 'mtg',
    name: 'マジック：ザ・ギャザリング',
    category: 'major',
    colors: {
      text: '#D97706',
      border: '#B45309',
      bg: 'rgba(180,83,9,0.15)',
      gradient: 'linear-gradient(135deg, #D97706, #92400E)',
    },
  },
  {
    id: 'onepiece',
    name: 'ワンピースカードゲーム',
    category: 'major',
    colors: {
      text: '#FB7185',
      border: '#F43F5E',
      bg: 'rgba(244,63,94,0.15)',
      gradient: 'linear-gradient(135deg, #FB7185, #E11D48)',
    },
  },
  {
    id: 'dbfw',
    name: 'ドラゴンボールスーパーカードゲーム フュージョンワールド',
    category: 'major',
    colors: {
      text: '#FB923C',
      border: '#F97316',
      bg: 'rgba(249,115,22,0.15)',
      gradient: 'linear-gradient(135deg, #FB923C, #EA580C)',
    },
  },
];

// ── Semi-major (shared teal) ──────────────────────
const SEMI_MAJOR_COLORS = {
  text: '#2DD4BF',
  border: '#14B8A6',
  bg: 'rgba(20,184,166,0.15)',
};

const SEMI_MAJOR_GAMES: CardGameDef[] = [
  { id: 'weiss', name: 'ヴァイスシュヴァルツ', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'vanguard', name: 'カードファイト!! ヴァンガード', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'battlespirits', name: 'バトルスピリッツ', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'digimon', name: 'デジモンカードゲーム', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'unionarena', name: 'ユニオンアリーナ', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'shadowverse', name: 'シャドウバースエボルヴ', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
  { id: 'lycee', name: 'リセ オーバーチュア', category: 'semi-major', colors: SEMI_MAJOR_COLORS },
];

// ── Trending (shared bright fuchsia) ──────────────────────
const TRENDING_COLORS = {
  text: '#E879F9',
  border: '#D946EF',
  bg: 'rgba(217,70,239,0.15)',
};

const TRENDING_GAMES: CardGameDef[] = [
  { id: 'hololive', name: 'ホロライブカードゲーム', category: 'trending', colors: TRENDING_COLORS },
  { id: 'harrypotter', name: 'ハリー・ポッター TCG', category: 'trending', colors: TRENDING_COLORS },
  { id: 'xrosstarget', name: 'クロスタ', category: 'trending', colors: TRENDING_COLORS },
  { id: 'baboca', name: 'バボカ', category: 'trending', colors: TRENDING_COLORS },
  { id: 'gundam', name: 'ガンダムカードゲーム', category: 'trending', colors: TRENDING_COLORS },
];

// ── Niche (shared muted slate) ──────────────────────
const NICHE_COLORS = {
  text: '#94A3B8',
  border: '#64748B',
  bg: 'rgba(100,116,139,0.15)',
};

const NICHE_GAMES: CardGameDef[] = [
  { id: 'zx', name: 'Z/X（ゼクス）', category: 'niche', colors: NICHE_COLORS },
  { id: 'wixoss', name: 'WIXOSS（ウィクロス）', category: 'niche', colors: NICHE_COLORS },
  { id: 'precious', name: 'プレシャスメモリーズ', category: 'niche', colors: NICHE_COLORS },
  { id: 'fow', name: 'Force of Will', category: 'niche', colors: NICHE_COLORS },
  { id: 'buildivide', name: 'ビルディバイド', category: 'niche', colors: NICHE_COLORS },
  { id: 'animal', name: 'アニマルカードゲーム', category: 'niche', colors: NICHE_COLORS },
];

// ── Other ──────────────────────
const OTHER_COLORS = {
  text: '#9CA3AF',
  border: '#6B7280',
  bg: 'rgba(107,114,128,0.15)',
};

export const OTHER_GAME: CardGameDef = {
  id: 'other',
  name: 'その他',
  category: 'other',
  colors: OTHER_COLORS,
};

// ── All games (ordered) ──────────────────────
export const CARD_GAMES: CardGameDef[] = [
  ...MAJOR_GAMES,
  ...SEMI_MAJOR_GAMES,
  ...TRENDING_GAMES,
  ...NICHE_GAMES,
  OTHER_GAME,
];

// ── Grouped games for dropdown (category order, no labels shown) ──
export const CARD_GAME_GROUPS: CardGameDef[][] = [
  MAJOR_GAMES,
  SEMI_MAJOR_GAMES,
  TRENDING_GAMES,
  NICHE_GAMES,
  [OTHER_GAME],
];

// ── Lookup helpers ──────────────────────
export function getCardGame(id: string): CardGameDef {
  return CARD_GAMES.find((g) => g.id === id) ?? OTHER_GAME;
}

export function getCardGameColors(id: string, customName?: string): CardGameDef['colors'] {
  if (id === 'other' && customName) return OTHER_COLORS;
  return getCardGame(id).colors;
}

export function getCardGameDisplayName(id: string, customName?: string): string {
  if (id === 'other' && customName) return customName;
  return getCardGame(id).name;
}
