'use client';

import { Check, Minus } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function OsuCheckbox({
  checked = false,
  indeterminate = false,
  disabled = false,
  onChange,
  title = '',
  size = 18,
  id,
}) {
  const handleClick = (e) => {
    e.stopPropagation();
    if (disabled) return;
    osuAudio.playClick();
    if (onChange) onChange(!checked);
  };

  const isChecked = checked && !indeterminate;

  return (
    <div
      id={id}
      onClick={handleClick}
      title={disabled ? (title || 'No beatmap match available to select') : title}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '4px',
        background: isChecked || indeterminate ? '#ff66aa' : '#1a1822',
        border: `1.5px solid ${
          disabled
            ? 'rgba(255, 255, 255, 0.1)'
            : isChecked || indeterminate
            ? '#ff66aa'
            : 'rgba(255, 255, 255, 0.2)'
        }`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        transition: 'background-color 0.12s ease, border-color 0.12s ease',
        userSelect: 'none',
        flexShrink: 0,
      }}
      className={disabled ? '' : 'osu-btn-interactive'}
    >
      {isChecked && (
        <Check size={size - 5} color="#ffffff" strokeWidth={3.5} />
      )}
      {indeterminate && (
        <Minus size={size - 5} color="#ffffff" strokeWidth={3.5} />
      )}
    </div>
  );
}
