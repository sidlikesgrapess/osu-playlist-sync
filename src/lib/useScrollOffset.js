'use client';

import { useState, useEffect } from 'react';

/**
 * Tracks window.scrollY, clamped to `max`, for the header/hero scroll transition.
 *
 * Updates are rAF-throttled and stop entirely once the page is scrolled past the
 * transition zone, so long lists don't pay for a setState on every scroll event.
 */
export function useScrollOffset(max) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let lastScroll = -1;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        if (currentY <= max || lastScroll <= max) {
          setScrollY(Math.min(max, currentY));
          lastScroll = currentY;
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [max]);

  return scrollY;
}
