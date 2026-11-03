'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

/**
 * The shared modal shell (DESIGN.md section 6): backdrop, panel, header with a close X, a
 * scrolling body and an optional footer band. Its values are SetupGuideModal's, which the
 * older modals still repeat inline. Escape closes it. It is portalled to <body> so it sits on
 * the modal tier wherever it is rendered, even inside the search bar dock's stacking context.
 */
export default function Modal({ isOpen, onClose, title, subtitle, icon, maxWidth = '560px', footer, children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '12px',
      boxSizing: 'border-box',
    }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="osu-glass" style={{
        maxWidth,
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '10px',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#171520',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {icon}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                {title}
              </h2>
              {subtitle && (
                <p style={{ fontSize: '0.72rem', color: '#887c93', margin: '1px 0 0', fontWeight: 600 }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{ background: 'none', color: '#887c93', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: '#171520',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
