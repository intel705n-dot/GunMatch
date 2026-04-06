import type { Player, Match } from '../lib/types';

interface RankingProps {
  players: Player[];
  matches: Match[];
  tournamentName: string;
  currentPlayerId: string | null;
}

function calcOmw(playerId: string, players: Player[], matches: Match[]): number {
  // Find all finished matches this player participated in
  const playerMatches = matches.filter(
    (m) => m.status === 'finished' && (m.player1Id === playerId || m.player2Id === playerId),
  );
  if (playerMatches.length === 0) return 0;

  // Collect opponent IDs
  const opponentIds = playerMatches.map((m) =>
    m.player1Id === playerId ? m.player2Id : m.player1Id,
  );

  // Calculate each opponent's win rate (minimum 0.25 per Pokemon TCG convention)
  const opponentRates = opponentIds.map((oppId) => {
    const opp = players.find((p) => p.id === oppId);
    if (!opp || opp.wins + opp.losses === 0) return 0.25;
    return Math.max(0.25, opp.wins / (opp.wins + opp.losses));
  });

  // Average of opponent win rates
  return opponentRates.reduce((sum, r) => sum + r, 0) / opponentRates.length;
}

export default function Ranking({ players, matches, tournamentName, currentPlayerId }: RankingProps) {
  const activePlayers = players.filter((p) => !p.dropped);

  // Pre-calculate OMW% for all players
  const omwMap = new Map<string, number>();
  for (const p of activePlayers) {
    omwMap.set(p.id, calcOmw(p.id, activePlayers, matches));
  }

  const ranked = [...activePlayers].sort((a, b) => {
    // 1. Win count
    if (b.wins !== a.wins) return b.wins - a.wins;
    // 2. Win rate (when total matches differ)
    const totalA = a.wins + a.losses;
    const totalB = b.wins + b.losses;
    const rateA = totalA > 0 ? a.wins / totalA : 0;
    const rateB = totalB > 0 ? b.wins / totalB : 0;
    if (rateB !== rateA) return rateB - rateA;
    // 3. OMW%
    return (omwMap.get(b.id) ?? 0) - (omwMap.get(a.id) ?? 0);
  });

  const myRank = currentPlayerId
    ? ranked.findIndex((p) => p.id === currentPlayerId) + 1
    : null;

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* SNS shareable header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-center">
        <p className="text-xs text-indigo-200">{today}</p>
        <h2 className="text-xl font-bold mt-1">{tournamentName}</h2>
        {myRank && (
          <p className="text-3xl font-bold mt-2">
            {myRank === 1 ? '1st' : myRank === 2 ? '2nd' : myRank === 3 ? '3rd' : `${myRank}th`} Place
          </p>
        )}
      </div>

      {/* Ranking table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="py-2 px-2 text-left">#</th>
              <th className="py-2 px-2 text-left">プレイヤー</th>
              <th className="py-2 px-2 text-right">W</th>
              <th className="py-2 px-2 text-right">L</th>
              <th className="py-2 px-2 text-right">勝率</th>
              <th className="py-2 px-2 text-right">OMW%</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => {
              const total = p.wins + p.losses;
              const rate = total > 0 ? Math.round((p.wins / total) * 100) : 0;
              const omw = Math.round((omwMap.get(p.id) ?? 0) * 100);
              const isCurrent = p.id === currentPlayerId;
              return (
                <tr
                  key={p.id}
                  className={`border-b border-slate-700/50 ${
                    isCurrent ? 'bg-indigo-900/30' : ''
                  } ${i < 3 ? 'font-bold' : ''}`}
                >
                  <td className="py-2 px-2">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="py-2 px-2">
                    {p.displayName}
                    {isCurrent && <span className="ml-1 text-xs text-indigo-400">← You</span>}
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400">{p.wins}</td>
                  <td className="py-2 px-2 text-right text-red-400">{p.losses}</td>
                  <td className="py-2 px-2 text-right text-slate-300">{rate}%</td>
                  <td className="py-2 px-2 text-right text-amber-400">{omw}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scoring explanation */}
      <div className="p-3 text-center">
        <p className="text-xs text-slate-500">
          順位: 勝利数 → 勝率 → OMW%（対戦相手の平均勝率、下限25%）
        </p>
      </div>
    </div>
  );
}
