import { latencyMs, micPermission, convergenceState, ancReductionDb } from '../store/signals';

export function StatusBar() {
  const latency = latencyMs.value;
  const perm = micPermission.value;
  const state = convergenceState.value;
  const reduction = ancReductionDb.value;

  const stateLabel = () => {
    switch (state) {
      case 'adapting':  return <span class="status-badge status-badge--yellow">Adapting</span>;
      case 'converged': return <span class="status-badge status-badge--green">Converged</span>;
      default:          return null;
    }
  };

  const micLabel = () => {
    switch (perm) {
      case 'granted': return <span class="status-dot status-dot--on" title="Microphone active">●</span>;
      case 'denied':  return <span class="status-dot status-dot--err" title="Microphone denied">●</span>;
      default:        return <span class="status-dot status-dot--off" title="Microphone inactive">○</span>;
    }
  };

  return (
    <div class="status-bar">
      {stateLabel()}
      {state !== 'idle' && reduction < -1 && (
        <span class="status-reduction mono">{reduction.toFixed(1)} dB</span>
      )}
      {latency > 0 && (
        <span class="status-latency mono" title="Round-trip audio latency">{latency}ms</span>
      )}
      {micLabel()}
    </div>
  );
}
