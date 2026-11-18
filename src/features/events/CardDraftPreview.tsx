import { useEffect, useState, type DragEvent } from 'react';
import type { TriggerDraft } from './eventValidation';

interface CardDraftPreviewProps {
  gridSize: number;
  triggers: TriggerDraft[];
}

export default function CardDraftPreview({ gridSize, triggers }: CardDraftPreviewProps) {
  const [order, setOrder] = useState<number[]>([]);
  const visibleTriggers = triggers.filter((trigger) => trigger.label.trim());

  useEffect(() => {
    setOrder((current) => {
      const valid = current.filter((index) => index < visibleTriggers.length);
      return [...valid, ...Array.from({ length: visibleTriggers.length }, (_, index) => index).filter((index) => !valid.includes(index))];
    });
  }, [visibleTriggers.length]);

  function move(event: DragEvent<HTMLButtonElement>, targetPosition: number) {
    event.preventDefault();
    const sourcePosition = Number(event.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(sourcePosition) || sourcePosition === targetPosition || sourcePosition < 0 || targetPosition >= gridSize * gridSize) return;
    setOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(sourcePosition);
      const targetIndex = next.indexOf(targetPosition);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  }

  return (
    <aside className="card-draft-preview">
      <div className="panel-heading"><div><span className="eyebrow">ПРИМЕР КАРТОЧКИ</span><h2>{gridSize} × {gridSize}</h2></div><span className="count-badge">ПРЕВЬЮ</span></div>
      <div className="draft-preview-grid" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
        {Array.from({ length: gridSize * gridSize }, (_, position) => {
          const trigger = visibleTriggers[order[position] ?? position];
          return <button key={position} type="button" className={`draft-preview-cell ${trigger ? '' : 'draft-preview-empty'}`} draggable={Boolean(trigger)} onDragStart={(event) => { event.dataTransfer.setData('text/plain', String(position)); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event, position)} aria-label={trigger?.label || `Пустая ячейка ${position + 1}`}>
            {trigger ? <><span>{trigger.emoji}</span><strong>{trigger.label}</strong></> : <span>+</span>}
          </button>;
        })}
      </div>
      <p className="field-hint">Перетаскивай триггеры для примера. Игроки смогут собрать свою раскладку.</p>
    </aside>
  );
}
