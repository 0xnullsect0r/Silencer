import type { WorkletCommand, WorkletMonitor } from './types';
import {
  isActive,
  inputGain,
  outputGain,
  latencyMs,
  micPermission,
  filterTaps,
  stepSize,
  ancReductionDb,
  convergenceState,
} from '../store/signals';

// Reduction below this threshold (in dB) is considered "converged"
const CONVERGE_THRESHOLD_DB = -6;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private outputGainNode: GainNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private _inputAnalyser: AnalyserNode | null = null;
  private _outputAnalyser: AnalyserNode | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  async start(): Promise<void> {
    // Request raw mic audio — disable ALL browser pre-processing
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // @ts-ignore — non-standard hint, helps on some platforms
        latency: 0,
      },
    });

    micPermission.value = 'granted';

    const AC = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });

    // Resume must happen inside the user-gesture call stack
    await this.ctx.resume();

    // Load worklet processor (served as static asset)
    await this.ctx.audioWorklet.addModule('/anc-processor.js');

    // Build node graph
    const ctx = this.ctx;
    const source = ctx.createMediaStreamSource(this.stream);
    const inputGainNode = ctx.createGain();
    const outputGainNode = ctx.createGain();
    const inputAnalyser = ctx.createAnalyser();
    const outputAnalyser = ctx.createAnalyser();

    inputAnalyser.fftSize = 2048;
    inputAnalyser.smoothingTimeConstant = 0.85;
    outputAnalyser.fftSize = 2048;
    outputAnalyser.smoothingTimeConstant = 0.85;

    const worklet = new AudioWorkletNode(ctx, 'anc-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        filterOrder: filterTaps.value,
        mu: stepSize.value,
      },
    });

    // Monitor convergence from worklet
    worklet.port.onmessage = (e: MessageEvent<WorkletMonitor>) => {
      if (e.data.type !== 'monitor') return;
      const { inputPower, errorPower } = e.data;
      if (inputPower > 0) {
        const reductionDb = 10 * Math.log10((errorPower + 1e-12) / (inputPower + 1e-12));
        ancReductionDb.value = reductionDb;
        convergenceState.value = reductionDb < CONVERGE_THRESHOLD_DB ? 'converged' : 'adapting';
      }
    };

    // Wire audio graph:
    //   source → inputGain → [inputAnalyser, worklet → outputGain → [outputAnalyser, destination]]
    source.connect(inputGainNode);
    inputGainNode.connect(inputAnalyser);
    inputGainNode.connect(worklet);
    worklet.connect(outputGainNode);
    outputGainNode.connect(outputAnalyser);
    outputGainNode.connect(ctx.destination);

    inputGainNode.gain.value = inputGain.value;
    outputGainNode.gain.value = outputGain.value;

    this.sourceNode = source;
    this.inputGainNode = inputGainNode;
    this.outputGainNode = outputGainNode;
    this.workletNode = worklet;
    this._inputAnalyser = inputAnalyser;
    this._outputAnalyser = outputAnalyser;

    // Compute and expose round-trip latency
    const base = ctx.baseLatency ?? 0;
    const output = (ctx as any).outputLatency ?? 0;
    latencyMs.value = Math.round((base + output) * 1000);

    // Enable ANC processing
    this.send({ type: 'setEnabled', value: true });

    // Keep screen awake on mobile
    if ('wakeLock' in navigator) {
      try { this.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    }

    convergenceState.value = 'adapting';
    isActive.value = true;
  }

  async stop(): Promise<void> {
    this.send({ type: 'setEnabled', value: false });

    this.workletNode?.disconnect();
    this.outputGainNode?.disconnect();
    this._outputAnalyser?.disconnect();
    this.inputGainNode?.disconnect();
    this._inputAnalyser?.disconnect();
    this.sourceNode?.disconnect();

    this.stream?.getTracks().forEach(t => t.stop());
    await this.ctx?.close();

    this.ctx = null;
    this.stream = null;
    this.sourceNode = null;
    this.inputGainNode = null;
    this.outputGainNode = null;
    this.workletNode = null;
    this._inputAnalyser = null;
    this._outputAnalyser = null;

    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;

    isActive.value = false;
    latencyMs.value = 0;
    ancReductionDb.value = 0;
    convergenceState.value = 'idle';
  }

  setInputGain(value: number): void {
    if (this.inputGainNode && this.ctx) {
      this.inputGainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  setOutputGain(value: number): void {
    if (this.outputGainNode && this.ctx) {
      this.outputGainNode.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  setStepSize(mu: number): void {
    this.send({ type: 'setMu', value: mu });
  }

  setFilterOrder(n: number): void {
    this.send({ type: 'setFilterOrder', value: n });
  }

  resetWeights(): void {
    this.send({ type: 'resetWeights' });
    convergenceState.value = 'adapting';
  }

  getInputAnalyser(): AnalyserNode | null  { return this._inputAnalyser; }
  getOutputAnalyser(): AnalyserNode | null { return this._outputAnalyser; }

  private send(msg: WorkletCommand): void {
    this.workletNode?.port.postMessage(msg);
  }
}

// Singleton — one engine per page
export const audioEngine = new AudioEngine();

// Wire signal → engine so sliders work while active
inputGain.subscribe(v => audioEngine.setInputGain(v));
outputGain.subscribe(v => audioEngine.setOutputGain(v));
stepSize.subscribe(v => audioEngine.setStepSize(v));
filterTaps.subscribe(v => audioEngine.setFilterOrder(v));
