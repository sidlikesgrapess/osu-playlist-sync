'use client';

/**
 * The inside of a section header: a coloured icon, the title and a count chip. Used by the
 * player's sections (Best, Most Played, Favourites) and by the song table's "From <file>"
 * rows, so the two read as the same kind of heading. The caller lays them out in a flex row
 * (gap 10px) on the header band (`#232030`).
 */
export default function SectionTitle({ icon: Icon, color, label, count }) {
  return (
    <>
      <Icon size={16} color={color} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: '0.92rem',
        fontWeight: 900,
        color: '#ffffff',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '0.7rem',
        fontWeight: 800,
        color: '#887c93',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        padding: '2px 7px',
        borderRadius: '4px',
        flexShrink: 0,
      }}>
        {count}
      </span>
    </>
  );
}
