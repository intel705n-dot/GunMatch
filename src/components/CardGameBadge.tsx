import { getCardGame, getCardGameDisplayName } from '../lib/cardGames';

interface CardGameBadgeProps {
  cardGameId: string;
  cardGameOther?: string;
  size?: 'sm' | 'md';
}

export default function CardGameBadge({ cardGameId, cardGameOther, size = 'sm' }: CardGameBadgeProps) {
  const game = getCardGame(cardGameId);
  const displayName = getCardGameDisplayName(cardGameId, cardGameOther);
  const { text, border, bg, gradient } = game.colors;

  const isMajor = game.category === 'major' && gradient;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';

  return (
    <span
      className={`inline-flex items-center ${padding} rounded-full font-bold ${textSize} border`}
      style={{
        color: isMajor ? 'transparent' : text,
        borderColor: border,
        backgroundColor: bg,
        ...(isMajor
          ? {
              backgroundImage: gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }
          : {}),
      }}
    >
      {displayName}
    </span>
  );
}
