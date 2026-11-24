import type { EventResult } from './eventApi';
import { tr } from '../../lib/i18n';

interface LeaderboardProps {
  results: EventResult[];
  currentParticipantId?: string;
}

function lineWord(count: number): string {
  if (count === 1) return tr('линия', 'line');
  if (count > 1 && count < 5) return tr('линии', 'lines');
  return tr('линий', 'lines');
}

export default function Leaderboard({ results, currentParticipantId }: LeaderboardProps) {
  if (results.length === 0) {
    return <div className="leaderboard-empty"><span className="empty-glyph">✳</span><strong>{tr('Таблица пока пуста.', 'No scores yet.')}</strong><p>{tr('Для итогов нужны полностью собранные карточки.', 'Only complete cards are included in the final results.')}</p></div>;
  }

  let previousScore: number | null = null;
  let previousRank = 0;
  const ranked = results.map((result, index) => {
    const rank = result.score === previousScore ? previousRank : index + 1;
    previousScore = result.score;
    previousRank = rank;
    return { ...result, rank };
  });

  return (
    <div className="leaderboard">
      {ranked.map(({ participantId, displayName, score, rank }) => <div className={`leaderboard-row ${participantId === currentParticipantId ? 'leaderboard-self' : ''} ${rank === 1 ? 'leaderboard-first' : ''}`} key={participantId}>
        <span className="leaderboard-rank">{String(rank).padStart(2, '0')}</span>
        <span className="leaderboard-avatar">{displayName.trim().slice(0, 1).toLocaleUpperCase('ru-RU')}</span>
        <strong>{displayName}</strong>
        <span className="leaderboard-score"><b>{score.toString().padStart(2, '0')}</b><small>{lineWord(score)}</small></span>
      </div>)}
    </div>
  );
}
