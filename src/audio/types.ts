export type WorkletCommand =
  | { type: 'setEnabled'; value: boolean }
  | { type: 'setGain'; value: number }
  | { type: 'setMu'; value: number }
  | { type: 'resetWeights' }
  | { type: 'setFilterOrder'; value: number }
  | { type: 'setNotchFreq'; value: number };

export interface WorkletMonitor {
  type: 'monitor';
  inputPower: number;
  errorPower: number;
}
