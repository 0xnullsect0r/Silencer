import { signal } from '@preact/signals';

export const isActive = signal(false);
export const inputGain = signal(1.0);
export const outputGain = signal(0.85);
export const filterTaps = signal(128);
export const stepSize = signal(0.01);
export const latencyMs = signal(0);
export const micPermission = signal<'prompt' | 'granted' | 'denied'>('prompt');
export const ancReductionDb = signal(0);   // negative dB; 0 = no reduction
export const errorMessage = signal('');
export const convergenceState = signal<'idle' | 'adapting' | 'converged'>('idle');
