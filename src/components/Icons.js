'use client';

export function YouTubeIcon({ size = 24, color = '#ff0000', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      color={color}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function SpotifyIcon({ size = 24, color = '#1db954', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      color={color}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.498 17.316c-.215.352-.676.465-1.028.25-2.816-1.722-6.36-2.112-10.536-1.16-.402.09-.802-.16-.893-.562-.09-.403.16-.803.563-.893 4.57-1.043 8.49-.603 11.644 1.336.352.215.465.676.25 1.029zm1.468-3.262c-.27.44-.847.58-1.287.31-3.224-1.982-8.14-2.556-11.954-1.398-.496.15-1.026-.134-1.176-.63-.15-.496.134-1.026.63-1.176 4.364-1.324 9.775-.684 13.477 1.597.44.27.58.847.31 1.297zm.126-3.41c-3.864-2.295-10.245-2.507-13.935-1.387-.59.18-1.218-.155-1.397-.746-.18-.59.155-1.218.746-1.397 4.24-1.287 11.288-1.038 15.74 1.606.53.315.703 1.002.388 1.533-.314.53-1.002.702-1.542.391z" />
    </svg>
  );
}

export function AppleMusicIcon({ size = 24, color = '#fc3c44', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      color={color}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.994 6.129a5.952 5.952 0 0 0-.424-2.19 6.07 6.07 0 0 0-1.424-2.091A6.07 6.07 0 0 0 20.055.424 5.952 5.952 0 0 0 17.865 0H6.135a5.952 5.952 0 0 0-2.19.424 6.07 6.07 0 0 0-2.091 1.424A6.07 6.07 0 0 0 .424 3.939 5.952 5.952 0 0 0 0 6.129v11.742a5.952 5.952 0 0 0 .424 2.19 6.07 6.07 0 0 0 1.424 2.091 6.07 6.07 0 0 0 2.091 1.424 5.952 5.952 0 0 0 2.19.424h11.73a5.952 5.952 0 0 0 2.19-.424 6.07 6.07 0 0 0 2.091-1.424 6.07 6.07 0 0 0 1.424-2.091 5.952 5.952 0 0 0 .424-2.19V6.129zm-7.618 6.452l-5.698 3.51a.63.63 0 0 1-.962-.533V8.442a.63.63 0 0 1 .962-.533l5.698 3.51a.63.63 0 0 1 0 1.162z" />
    </svg>
  );
}

export function MusicNoteIcon({ size = 24, color = '#ff66aa', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color}
      style={style}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export function OsuLogoIcon({ size = 24, color = '#ffffff', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      color={color}
      style={style}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
      <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    </svg>
  );
}
