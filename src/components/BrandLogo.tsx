export function NebullaMark({ className = 'w-16 h-16', showWord = false }: { className?: string; showWord?: boolean }) {
  return (
    <div className={`relative inline-flex items-center gap-3 ${showWord ? '' : className}`}>
      <div className={`${showWord ? className : 'absolute inset-0'} relative rounded-[30%] overflow-hidden shadow-lg`} style={{ background: 'radial-gradient(circle at 32% 24%, #2948ff 0, #10146c 42%, #040626 100%)' }}>
        <div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at 72% 72%, #a855f7 0, transparent 34%), radial-gradient(circle at 24% 72%, #22d3ee 0, transparent 32%)' }} />
        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full">
          <path d="M78 27c18 10 29 30 24 51-4 18-19 32-38 35-19 2-37-8-46-24 15 8 35 6 51-5 20-14 24-39 9-57Z" fill="url(#tail)" opacity=".9" />
          <rect x="31" y="25" width="58" height="62" rx="15" fill="url(#paper)" />
          <rect x="38" y="39" width="44" height="35" rx="9" fill="#070b3e" opacity=".94" />
          <rect x="42" y="18" width="10" height="21" rx="5" fill="url(#ring)" />
          <rect x="68" y="18" width="10" height="21" rx="5" fill="url(#ring)" />
          <circle cx="48" cy="49" r="8" fill="url(#dot)" />
          <circle cx="48" cy="63" r="8" fill="url(#dot)" />
          <circle cx="48" cy="77" r="7" fill="none" stroke="#91b8ff" strokeWidth="3" />
          <path d="M43 49l4 4 8-9" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M43 63l4 4 8-9" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="59" y="48" width="20" height="4" rx="2" fill="url(#line)" />
          <rect x="59" y="62" width="20" height="4" rx="2" fill="url(#line)" />
          <rect x="59" y="76" width="20" height="4" rx="2" fill="url(#line)" />
          <circle cx="31" cy="87" r="15" fill="url(#cloudA)" />
          <circle cx="49" cy="91" r="18" fill="url(#cloudB)" />
          <circle cx="66" cy="90" r="14" fill="url(#cloudC)" />
          <path d="M91 48l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5 2.5-6Z" fill="#fff" />
          <defs>
            <linearGradient id="tail" x1="18" y1="92" x2="102" y2="30"><stop stopColor="#14c8ff" /><stop offset=".55" stopColor="#5b5cf6" /><stop offset="1" stopColor="#c069ff" /></linearGradient>
            <linearGradient id="paper" x1="35" y1="25" x2="84" y2="88"><stop stopColor="#fff" /><stop offset=".58" stopColor="#eef4ff" /><stop offset="1" stopColor="#9fb2ff" /></linearGradient>
            <linearGradient id="ring" x1="42" y1="18" x2="52" y2="39"><stop stopColor="#fff" /><stop offset=".42" stopColor="#a78bfa" /><stop offset="1" stopColor="#3536d9" /></linearGradient>
            <linearGradient id="dot" x1="41" y1="42" x2="56" y2="57"><stop stopColor="#f5f3ff" /><stop offset=".5" stopColor="#a78bfa" /><stop offset="1" stopColor="#5458f7" /></linearGradient>
            <linearGradient id="line" x1="59" y1="48" x2="79" y2="52"><stop stopColor="#c4b5fd" /><stop offset="1" stopColor="#5b7cff" /></linearGradient>
            <linearGradient id="cloudA" x1="18" y1="77" x2="42" y2="99"><stop stopColor="#bff7ff" /><stop offset="1" stopColor="#1b8dff" /></linearGradient>
            <linearGradient id="cloudB" x1="35" y1="77" x2="63" y2="108"><stop stopColor="#dbeafe" /><stop offset="1" stopColor="#3447ff" /></linearGradient>
            <linearGradient id="cloudC" x1="55" y1="78" x2="79" y2="102"><stop stopColor="#e9d5ff" /><stop offset="1" stopColor="#7936ff" /></linearGradient>
          </defs>
        </svg>
      </div>
      {showWord && (
        <span className="text-[18px] font-extrabold tracking-wide text-[var(--text)]">
          Nebulla
        </span>
      )}
    </div>
  );
}

export function NebullaWordmark({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <NebullaMark className="w-9 h-9" />
      <span className="text-[20px] font-extrabold tracking-wide bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#dbeafe,#8b5cf6)' }}>
        Nebulla
      </span>
    </div>
  );
}
