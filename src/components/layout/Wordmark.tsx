// The Verba lockup: a speech-bubble mark, "Verba" in Source Sans ExtraBold,
// and a small accent square. `tone="light"` is for brand-color surfaces
// (white mark and text); the square stays accent-colored on both.
export function Wordmark({
  tone = 'ink',
  size = 'md',
  className = '',
}: {
  tone?: 'ink' | 'light';
  size?: 'md' | 'lg';
  className?: string;
}) {
  const text = tone === 'light' ? 'text-white' : 'text-ink';
  const markSize = size === 'lg' ? 'w-8 h-8' : 'w-7 h-7';
  const wordSize = size === 'lg' ? 'text-[26px]' : 'text-[22px]';

  return (
    <span className={`inline-flex items-center gap-2.5 ${text} ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className={`${markSize} shrink-0`}
        fill="currentColor"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M7 4h18a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5H15l-7 5v-5H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5ZM10 11.5v6h2.5v-6ZM14.75 8.5v12h2.5v-12ZM19.5 11.5v6H22v-6Z"
        />
      </svg>
      <span className={`flex items-center gap-1.5 ${wordSize} font-extrabold tracking-[-0.035em] leading-none`}>
        Verba
        <span
          aria-hidden
          className="w-[7px] h-[7px] bg-accent border border-[#c48a12] translate-y-[3px]"
        />
      </span>
    </span>
  );
}
