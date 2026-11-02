import { useState, type DragEvent } from 'react';
import type { EventTriggerRow } from '../../lib/database.types';

type DragSource = { kind: 'trigger'; id: string } | { kind: 'cell'; position: number };

interface CardBuilderProps {
  gridSize: number;
  triggers: EventTriggerRow[];
  cells: Array<string | null>;
  locked: boolean;
  saving: boolean;
  onChange: (cells: Array<string | null>) => void;
  onSave: () => void;
}

export default function CardBuilder({ gridSize, triggers, cells, locked, saving, onChange, onSave }: CardBuilderProps) {
  const total = gridSize * gridSize;
  const selectedCount = cells.filter(Boolean).length;
  const selected = new Set(cells.filter((id): id is string => Boolean(id)));
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [draggingSource, setDraggingSource] = useState<DragSource | null>(null);

  function addTrigger(triggerId: string) {
    if (locked || selected.has(triggerId)) return;
    const firstEmpty = cells.findIndex((id) => id === null);
    if (firstEmpty < 0) return;
    const next = [...cells];
    next[firstEmpty] = triggerId;
    onChange(next);
  }

  function removeCell(position: number) {
    if (locked || !cells[position]) return;
    const next = [...cells];
    next[position] = null;
    onChange(next);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, position: number) {
    event.preventDefault();
    setDropTarget(null);
    setDraggingSource(null);

    const [kind, value] = event.dataTransfer.getData('text/plain').split(':');
    if (kind === 'trigger' && value && !selected.has(value)) {
      const next = [...cells];
      next[position] = value;
      onChange(next);
      return;
    }

    if (kind === 'cell') {
      const sourcePosition = Number(value);
      if (!Number.isInteger(sourcePosition) || sourcePosition < 0 || sourcePosition >= total || sourcePosition === position || !cells[sourcePosition]) return;
      const next = [...cells];
      [next[sourcePosition], next[position]] = [next[position], next[sourcePosition]];
      onChange(next);
    }
  }

  const triggerById = new Map(triggers.map((trigger) => [trigger.id, trigger]));

  return (
    <div className="card-builder">
      <div className="builder-board-wrap">
        <div className="builder-board" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}>
          {Array.from({ length: total }, (_, position) => {
            const trigger = cells[position] ? triggerById.get(cells[position]!) : undefined;
            const occurred = trigger?.occurred ?? false;
            return <button type="button" className={`builder-cell ${trigger ? 'cell-filled' : 'cell-empty'} ${occurred ? 'cell-occurred' : ''} ${dropTarget === position ? 'cell-drop-target' : ''} ${draggingSource?.kind === 'cell' && draggingSource.position === position ? 'cell-dragging' : ''}`} key={position} data-drop-position={position} onClick={() => removeCell(position)} onDragStart={(event) => {
              if (!trigger || locked) { event.preventDefault(); return; }
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', `cell:${position}`);
              setDraggingSource({ kind: 'cell', position });
            }} onDragEnd={() => { setDraggingSource(null); setDropTarget(null); }} onDragOver={(event) => {
              if (locked || !event.dataTransfer.types.includes('text/plain')) return;
              event.preventDefault();
              setDropTarget(position);
            }} onDrop={(event) => handleDrop(event, position)} draggable={!locked && Boolean(trigger)} disabled={locked} aria-label={trigger ? `${trigger.label}${locked ? '' : ', перетащить или убрать'}` : `Пустая ячейка ${position + 1}`}>
              {trigger ? <><span className="builder-cell-index">{String(position + 1).padStart(2, '0')}</span><span className="builder-cell-emoji" aria-hidden="true">{trigger.emoji}</span><span className="builder-cell-label">{trigger.label}</span>{occurred && <b className="cell-check">✓</b>}</> : <span className="empty-cell-mark">+</span>}
            </button>;
          })}
        </div>
        <div className="builder-progress"><span>{selectedCount} / {total} ЯЧЕЕК</span><span className={selectedCount === total ? 'progress-complete' : ''}>{selectedCount === total ? 'КАРТОЧКА ГОТОВА ✓' : `ЕЩЁ ${total - selectedCount}`}</span></div>
      </div>
      {!locked && <div className="builder-triggers">
        <div className="panel-heading"><div><span className="eyebrow">НА ВЫБОР</span><h2>Триггеры</h2></div><span className="count-badge">{triggers.length.toString().padStart(2, '0')}</span></div>
        <p className="builder-hint">Перетащи триггер в нужную клетку или нажми, чтобы заполнить первую свободную. Клетки можно переставлять; каждый триггер используется один раз.</p>
        <div className="trigger-choice-list">{triggers.map((trigger, index) => {
          const isSelected = selected.has(trigger.id);
          return <button type="button" className={`trigger-choice ${isSelected ? 'trigger-choice-selected' : ''} ${trigger.occurred ? 'trigger-choice-occurred' : ''} ${draggingSource?.kind === 'trigger' && draggingSource.id === trigger.id ? 'trigger-dragging' : ''}`} key={trigger.id} onClick={() => addTrigger(trigger.id)} onDragStart={(event) => {
            if (locked || isSelected) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/plain', `trigger:${trigger.id}`);
            setDraggingSource({ kind: 'trigger', id: trigger.id });
          }} onDragEnd={() => { setDraggingSource(null); setDropTarget(null); }} draggable={!locked && !isSelected} disabled={locked || isSelected}>
            <span>{String(index + 1).padStart(2, '0')}</span><b className="trigger-choice-emoji" aria-hidden="true">{trigger.emoji}</b><strong>{trigger.label}</strong><i>{isSelected ? 'В КАРТОЧКЕ' : trigger.occurred ? 'СБЫЛОСЬ' : '+'}</i>
          </button>;
        })}</div>
        {!locked && <button className="button button-primary builder-save" onClick={onSave} disabled={saving}>{saving ? 'Сохраняем…' : selectedCount === total ? 'Сохранить карточку' : 'Сохранить прогресс'} <span aria-hidden="true">↗</span></button>}
      </div>}
    </div>
  );
}
