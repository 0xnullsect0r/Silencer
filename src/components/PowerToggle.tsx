import { isActive } from '../store/signals';

interface Props {
  onToggle: () => void;
  disabled?: boolean;
}

export function PowerToggle({ onToggle, disabled }: Props) {
  const active = isActive.value;

  return (
    <button
      class={`power-btn ${active ? 'power-btn--on' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? 'Turn off noise cancellation' : 'Turn on noise cancellation'}
    >
      {/* Power symbol — Unicode 23FB */}
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path
          d="M18 4v14"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
        />
        <path
          d="M10.3 8.3A13 13 0 1 0 25.7 8.3"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
}
