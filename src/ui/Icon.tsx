export function Icon({ name, size = 20 }: { name: 'leaf' | 'crown' | 'bolt' | 'arrow' | 'sound' | 'mute' | 'dice'; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'leaf' && <><path d="M20 3 C3 1 1 14 8 18 C17 23 23 12 20 3Z"/><path d="M3 22 L16 8 M8 16 L8 11 M12 12 L17 12"/></>}
    {name === 'crown' && <><path d="M3 6 L7 10 L12 3 L17 10 L21 6 L18 20 H6Z"/><path d="M7 16 H17"/></>}
    {name === 'bolt' && <path d="M14 2 L4 14 H11 L10 22 L20 9 H13Z"/>}
    {name === 'arrow' && <path d="M4 12 H20 M14 6 L20 12 L14 18"/>}
    {(name === 'sound' || name === 'mute') && <><path d="M11 4 L5 9 H2 V15 H5 L11 20Z"/>{name === 'sound' ? <path d="M15 8 Q20 12 15 16 M18 4 Q26 12 18 20"/> : <path d="M16 9 L22 15 M22 9 L16 15"/>}</>}
    {name === 'dice' && <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="12" cy="12" r="1"/></>}
  </svg>;
}
