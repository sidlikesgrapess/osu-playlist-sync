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
        borderRadius: '5px',
        background: isChecked || indeterminate ? '#ff66aa' : 'rgba(24, 20, 32, 0.85)',
        border: `1.5px solid ${
          disabled
            ? 'rgba(255, 255, 255, 0.1)'
            : isChecked || indeterminate
            ? '#ff66aa'
            : 'rgba(255, 255, 255, 0.25)'
        }`,
        boxShadow: disabled
          ? 'none'
          : isChecked || indeterminate
          ? '0 0 12px rgba(255, 102, 170, 0.75)'
          : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.22 : 1,
        transition: 'all 0.16s cubic-bezier(0.16, 1, 0.3, 1)',
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
