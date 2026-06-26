interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 32, className = '' }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="logo-accent" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-bg)" />
      {/* Arrow/flow motif — represents procurement flow */}
      <path
        d="M18 38 L28 28 L38 38"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M28 28 L28 48"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M34 22 L44 32 L34 42"
        stroke="url(#logo-accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Dot — represents data point */}
      <circle cx="44" cy="18" r="4" fill="#34d399" />
    </svg>
  );
}

interface LogoFullProps {
  collapsed?: boolean;
  subtitle?: string;
  variant?: 'light' | 'dark';
}

export function LogoFull({ collapsed = false, subtitle, variant = 'dark' }: LogoFullProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-foreground';
  const subColor = variant === 'light' ? 'text-white/60' : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-3">
      <LogoIcon size={32} className="shrink-0" />
      {!collapsed && (
        <div className="overflow-hidden">
          <p className={`font-bold text-sm tracking-tight ${textColor} truncate`}>
            Smart<span className="font-extrabold">Procurement</span>
          </p>
          {subtitle && (
            <p className={`text-[10px] ${subColor} truncate`}>{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
