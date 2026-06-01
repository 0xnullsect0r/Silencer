import { isActive, errorMessage, micPermission } from './store/signals';
import { audioEngine } from './audio/AudioEngine';
import { PowerToggle } from './components/PowerToggle';
import { GainSlider } from './components/GainSlider';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import { LevelMeter } from './components/LevelMeter';
import { StatusBar } from './components/StatusBar';
import { SettingsPanel } from './components/SettingsPanel';
import { inputGain, outputGain } from './store/signals';

async function handleToggle() {
  errorMessage.value = '';
  try {
    if (isActive.value) {
      await audioEngine.stop();
    } else {
      await audioEngine.start();
    }
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      micPermission.value = 'denied';
      errorMessage.value = 'Microphone access denied. Allow access in browser settings.';
    } else if (err.name === 'NotFoundError') {
      errorMessage.value = 'No microphone detected. Connect a microphone and try again.';
    } else {
      errorMessage.value = `Audio error: ${err.message ?? err}`;
    }
  }
}

export function App() {
  return (
    <div class="app">
      <header class="app-header">
        <h1 class="app-title">SILENCER</h1>
        <StatusBar />
      </header>

      <SpectrumAnalyzer />

      <div class="controls-section">
        <div class="main-row">
          <LevelMeter />

          <div class="power-area">
            <PowerToggle onToggle={handleToggle} />
            <span class="power-label">{isActive.value ? 'Active' : 'Off'}</span>
          </div>
        </div>

        <div class="sliders">
          <GainSlider
            label="Sensitivity"
            min={0.1}
            max={3.0}
            step={0.05}
            signal={inputGain}
          />
          <GainSlider
            label="Output"
            min={0.0}
            max={1.5}
            step={0.05}
            signal={outputGain}
          />
        </div>

        {errorMessage.value && (
          <div class="error-banner" role="alert">
            {errorMessage.value}
          </div>
        )}

        <SettingsPanel />
      </div>
    </div>
  );
}
