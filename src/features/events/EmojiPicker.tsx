import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EVENT_EMOJI_OPTIONS } from './emojiOptions';
import { tr } from '../../lib/i18n';

interface EmojiPickerProps {
  value: string;
  label: string;
  variant?: 'event' | 'trigger';
  onChange: (emoji: string) => void;
}

interface PickerPosition {
  left: number;
  top: number;
  width: number;
}

export default function EmojiPicker({ value, label, variant = 'trigger', onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition>({ left: 8, top: 8, width: 280 });
  const openerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  function togglePicker() {
    if (open) {
      setOpen(false);
      return;
    }
    const bounds = openerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(300, Math.max(0, window.innerWidth - 16));
    const height = Math.min(420, Math.max(0, window.innerHeight - 16));
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
    const top = bounds.bottom + height + 8 <= window.innerHeight
      ? bounds.bottom + 8
      : Math.max(8, bounds.top - height - 8);
    setPosition({ left, top, width });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => firstOptionRef.current?.focus());
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (popupRef.current?.contains(target) || openerRef.current?.contains(target))) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        openerRef.current?.focus();
      }
    };
    const closeOnLayoutChange = (event: Event) => {
      if (event.type === 'scroll' && event.target instanceof Node && popupRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnLayoutChange);
    window.addEventListener('scroll', closeOnLayoutChange, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnLayoutChange);
      window.removeEventListener('scroll', closeOnLayoutChange, true);
    };
  }, [open]);

  function selectEmoji(emoji: string) {
    onChange(emoji);
    setOpen(false);
    openerRef.current?.focus();
  }

  return (
    <div className={`emoji-picker emoji-picker-${variant}`}>
      <button
        ref={openerRef}
        type="button"
        className="emoji-picker-trigger"
        onClick={togglePicker}
        aria-label={`${label}: ${value}, ${tr('изменить', 'change')}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">{value}</span><small aria-hidden="true">▦</small>
      </button>
      {open && createPortal(
        <div ref={popupRef} className="emoji-picker-popup" role="dialog" aria-label={label} style={{ left: position.left, top: position.top, width: position.width }}>
          <div className="emoji-picker-heading"><strong>{tr('Выбери эмодзи', 'Choose an emoji')}</strong><button type="button" onClick={() => setOpen(false)} aria-label={tr('Закрыть палитру', 'Close picker')}>×</button></div>
          <div className="emoji-picker-grid">
            {EVENT_EMOJI_OPTIONS.map((emoji, index) => <button
              ref={emoji === value || index === 0 ? firstOptionRef : undefined}
              type="button"
              className={`emoji-picker-option ${value === emoji ? 'emoji-picker-option-selected' : ''}`}
              key={emoji}
              onClick={() => selectEmoji(emoji)}
              aria-label={emoji}
              aria-pressed={value === emoji}
              title={emoji}
            >{emoji}</button>)}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
