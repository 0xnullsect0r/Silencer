import type { Signal } from '@preact/signals';

interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  signal: Signal<number>;
  displayFn?: (v: number) => string;
}

const toDb = (gain: number): string => {
  if (gain <= 0) return '-∞';
  const db = 20 * Math.log10(gain);
  if (db < -60) return '< -60 dB';
  return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB';
};

export function GainSlider({ label, min, max, step, signal, displayFn }: Props) {
  const val = signal.value;
  const display = displayFn ? displayFn(val) : toDb(val);

  return (
    <div class="slider-row">
      <span class="slider-label">{label}</span>
      <input
        type="range"
        class="slider"
        min={min}
        max={max}
        step={step}
        value={val}
        aria-label={label}
        onInput={(e) => { signal.value = parseFloat((e.target as HTMLInputElement).value); }}
      />
      <span class="slider-value mono">{display}</span>
    </div>
  );
}
