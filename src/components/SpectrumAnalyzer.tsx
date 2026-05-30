import { useEffect, useRef } from 'preact/hooks';
import { audioEngine } from '../audio/AudioEngine';
import { isActive } from '../store/signals';

const MIN_DB = -100;
const MAX_DB = 0;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_RANGE = Math.log10(MAX_FREQ) - LOG_MIN;

function freqToX(binIdx: number, fftSize: number, sr: number, w: number): number {
  const freq = (binIdx * sr) / fftSize;
  if (freq < MIN_FREQ) return 0;
  return ((Math.log10(freq) - LOG_MIN) / LOG_RANGE) * w;
}

function dbToY(db: number, h: number): number {
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return ((MAX_DB - clamped) / (MAX_DB - MIN_DB)) * h;
}

export function SpectrumAnalyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const inputBuf = useRef<Float32Array<ArrayBuffer> | null>(null);
  const outputBuf = useRef<Float32Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const GRID_DBS = [-80, -60, -40, -20];

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cssW = W / dpr;
      const cssH = H / dpr;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, cssW, cssH);

      // Grid lines
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1;

      GRID_DBS.forEach(db => {
        const y = dbToY(db, cssH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
        ctx.stroke();
        ctx.fillStyle = '#444';
        ctx.font = `10px monospace`;
        ctx.fillText(`${db}`, 4, y - 3);
      });

      GRID_FREQS.forEach(freq => {
        const x = ((Math.log10(freq) - LOG_MIN) / LOG_RANGE) * cssW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        ctx.fillStyle = '#444';
        ctx.font = `10px monospace`;
        ctx.fillText(label, x + 2, cssH - 4);
      });

      const inputAnalyser = audioEngine.getInputAnalyser();
      const outputAnalyser = audioEngine.getOutputAnalyser();

      if (!inputAnalyser || !outputAnalyser) {
        // Idle state: subtle noise floor
        ctx.strokeStyle = 'rgba(0,229,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, cssH * 0.85);
        for (let x = 0; x <= cssW; x += 4) {
          const y = cssH * 0.85 + (Math.random() - 0.5) * 4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const fftSize = inputAnalyser.fftSize;
      const bins = fftSize / 2;
      const sr = inputAnalyser.context.sampleRate;

      if (!inputBuf.current || inputBuf.current.length !== bins) {
        inputBuf.current = new Float32Array(bins) as Float32Array<ArrayBuffer>;
        outputBuf.current = new Float32Array(bins) as Float32Array<ArrayBuffer>;
      }

      inputAnalyser.getFloatFrequencyData(inputBuf.current);
      outputAnalyser.getFloatFrequencyData(outputBuf.current!);

      const drawSpectrum = (data: Float32Array, color: string, fillAlpha: string) => {
        ctx.beginPath();
        let started = false;
        for (let i = 1; i < bins; i++) {
          const x = freqToX(i, fftSize, sr, cssW);
          const y = dbToY(data[i], cssH);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Filled area
        ctx.lineTo(cssW, cssH);
        ctx.lineTo(0, cssH);
        ctx.closePath();
        ctx.fillStyle = fillAlpha;
        ctx.fill();
      };

      // Input (pre-ANC) — dim red
      drawSpectrum(inputBuf.current, 'rgba(255,80,80,0.7)', 'rgba(255,80,80,0.08)');
      // Output (post-ANC) — bright cyan (should be lower = ANC working)
      drawSpectrum(outputBuf.current!, '#00e5ff', 'rgba(0,229,255,0.12)');

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div class="spectrum-wrapper" aria-label="Real-time frequency spectrum" role="img">
      <canvas ref={canvasRef} class="spectrum-canvas" />
      <div class="spectrum-legend">
        <span class="legend-item legend-item--input">Input</span>
        <span class="legend-item legend-item--output">Output</span>
      </div>
    </div>
  );
}
