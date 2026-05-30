import { filterTaps, stepSize } from '../store/signals';
import { audioEngine } from '../audio/AudioEngine';
import { GainSlider } from './GainSlider';

const TAP_OPTIONS = [32, 64, 128, 256, 512];

export function SettingsPanel() {
  const taps = filterTaps.value;
  const mu = stepSize.value;

  return (
    <details class="settings-panel">
      <summary class="settings-summary">
        <span>Advanced</span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 5l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </summary>

      <div class="settings-body">
        <div class="setting-row">
          <span class="slider-label">Filter Taps</span>
          <div class="tap-group" role="radiogroup" aria-label="Filter tap count">
            {TAP_OPTIONS.map(n => (
              <button
                key={n}
                class={`tap-btn ${n === taps ? 'tap-btn--active' : ''}`}
                onClick={() => { filterTaps.value = n; }}
                role="radio"
                aria-checked={n === taps}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <GainSlider
          label="Adaptation"
          min={0.001}
          max={0.05}
          step={0.001}
          signal={stepSize}
          displayFn={v => v.toFixed(3)}
        />

        <button
          class="reset-btn"
          onClick={() => audioEngine.resetWeights()}
        >
          Reset Filter
        </button>
      </div>
    </details>
  );
}
