/**
 * ANC AudioWorklet Processor
 *
 * Implements feedforward Active Noise Cancellation using a Normalised LMS
 * (NLMS) adaptive FIR filter. The filter converges toward the acoustic
 * transfer function so that the speaker output destructively interferes with
 * the ambient noise captured at the microphone.
 *
 * All Float32Array buffers are allocated in the constructor — zero heap
 * allocation occurs inside process() to avoid GC-induced audio glitches.
 */

const EPSILON = 1e-8;
const ALPHA = 0.0001; // leaky LMS forgetting factor prevents weight drift

class ANCProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const opts = (options && options.processorOptions) || {};
    this._N = Math.max(32, Math.min(512, opts.filterOrder || 128));
    this._mu = opts.mu != null ? opts.mu : 0.01;
    this._enabled = false;
    this._gain = 1.0;

    // LMS state — pre-allocated, never resized at runtime
    this._weights = new Float32Array(this._N);       // filter coefficients w[k]
    this._delayBuf = new Float32Array(this._N);      // circular reference buffer x[n-k]
    this._delayIdx = 0;
    this._powerSum = EPSILON;                        // running ||x||^2 for NLMS

    // Initialise weights to identity (pure phase inversion at lag 0)
    this._weights[0] = 1.0;

    // Biquad notch filter state for feedback suppression (notch at 250 Hz by default)
    this._bqX1 = 0; this._bqX2 = 0;
    this._bqY1 = 0; this._bqY2 = 0;
    this._updateNotch(250);

    // Power monitoring (sent to main thread ~10×/sec)
    this._inputPowerEst = 0;
    this._errorPowerEst = 0;
    this._monitorTick = 0;
    this._monitorInterval = Math.round(sampleRate / 128 / 10); // ~every 10 quanta

    this.port.onmessage = (e) => {
      const { type, value } = e.data;
      switch (type) {
        case 'setEnabled':    this._enabled = !!value; break;
        case 'setGain':       this._gain = +value; break;
        case 'setMu':         this._mu = +value; break;
        case 'resetWeights':
          this._weights.fill(0);
          this._weights[0] = 1.0;
          this._delayBuf.fill(0);
          this._powerSum = EPSILON;
          break;
        case 'setFilterOrder': {
          const n = Math.max(32, Math.min(512, +value));
          this._N = n;
          this._weights = new Float32Array(n);
          this._weights[0] = 1.0;
          this._delayBuf = new Float32Array(n);
          this._delayIdx = 0;
          this._powerSum = EPSILON;
          break;
        }
        case 'setNotchFreq':  this._updateNotch(+value); break;
      }
    };
  }

  _updateNotch(freq) {
    // 2nd-order IIR notch: H(z) = (1 − 2cos(ω)z⁻¹ + z⁻²) / (1 − 2r·cos(ω)z⁻¹ + r²z⁻²)
    const w0 = (2 * Math.PI * freq) / sampleRate;
    const r = 0.95;
    this._b0 = 1;
    this._b1 = -2 * Math.cos(w0);
    this._b2 = 1;
    this._a1 = -2 * r * Math.cos(w0);
    this._a2 = r * r;
  }

  _applyNotch(x) {
    const y = this._b0 * x + this._b1 * this._bqX1 + this._b2 * this._bqX2
              - this._a1 * this._bqY1 - this._a2 * this._bqY2;
    this._bqX2 = this._bqX1; this._bqX1 = x;
    this._bqY2 = this._bqY1; this._bqY1 = y;
    return y;
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!input || !output) return true;

    if (!this._enabled) {
      // Mute output when disabled — do NOT pass audio through to speakers
      output.fill(0);
      return true;
    }

    // Divergence guard: reset if weights go NaN/Inf
    if (!isFinite(this._weights[0])) {
      this._weights.fill(0);
      this._weights[0] = 1.0;
      this._delayBuf.fill(0);
      this._powerSum = EPSILON;
    }

    const N = this._N;
    const mu = this._mu;
    const gain = this._gain;
    let inputPowerSum = 0;
    let errorPowerSum = 0;

    for (let i = 0; i < input.length; i++) {
      const xn = input[i];

      // --- Update circular delay buffer and running power ---
      const xOld = this._delayBuf[this._delayIdx];
      this._delayBuf[this._delayIdx] = xn;
      this._powerSum += xn * xn - xOld * xOld;
      if (this._powerSum < EPSILON) this._powerSum = EPSILON;

      // --- FIR filter output: y[n] = Σ w[k]·x[n-k] ---
      let yn = 0;
      for (let k = 0; k < N; k++) {
        yn += this._weights[k] * this._delayBuf[(this._delayIdx - k + N) & (N - 1 + (N & 1 ? 1 : 0))];
      }
      // Use correct modular arithmetic for non-power-of-2 N
      yn = 0;
      for (let k = 0; k < N; k++) {
        const idx = (this._delayIdx - k + N) % N;
        yn += this._weights[k] * this._delayBuf[idx];
      }

      // --- Anti-noise output: phase-inverted, gain-scaled, notch-filtered ---
      const antiNoise = -yn * gain;
      output[i] = this._applyNotch(antiNoise);

      // --- Error estimate: what mic hears = original noise + leaked anti-noise ---
      // e[n] = x[n] + output[i]  →  approaches 0 when cancellation is perfect
      const en = xn + output[i];

      // --- Leaky NLMS weight update: w += 2μe·x / ||x||² ;  w ×= (1−α) ---
      const updateFactor = (2 * mu * en) / this._powerSum;
      for (let k = 0; k < N; k++) {
        const idx = (this._delayIdx - k + N) % N;
        this._weights[k] = (1 - ALPHA) * this._weights[k]
                          + updateFactor * this._delayBuf[idx];
      }

      this._delayIdx = (this._delayIdx + 1) % N;

      inputPowerSum += xn * xn;
      errorPowerSum += en * en;
    }

    // --- Throttled monitoring (avoid flooding the main thread) ---
    this._monitorTick++;
    if (this._monitorTick >= this._monitorInterval) {
      this._monitorTick = 0;
      const len = input.length;
      this._inputPowerEst = 0.9 * this._inputPowerEst + 0.1 * (inputPowerSum / len);
      this._errorPowerEst = 0.9 * this._errorPowerEst + 0.1 * (errorPowerSum / len);
      this.port.postMessage({
        type: 'monitor',
        inputPower: this._inputPowerEst,
        errorPower: this._errorPowerEst,
      });
    }

    return true; // keep processor alive
  }
}

registerProcessor('anc-processor', ANCProcessor);
