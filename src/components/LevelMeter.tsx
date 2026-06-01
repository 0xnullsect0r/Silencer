import { useEffect, useRef } from 'preact/hooks';
import { audioEngine } from '../audio/AudioEngine';
import { isActive } from '../store/signals';

const MIN_DB = -60;
const MAX_DB = 0;

function rmsToDb(rms: number): number {
  if (rms < 1e-9) return MIN_DB;
  return Math.max(MIN_DB, 20 * Math.log10(rms));
}

function dbToFraction(db: number): number {
  return (db - MIN_DB) / (MAX_DB - MIN_DB);
}

function barColor(db: number): string {
  if (db > -6) return '#ff4444';
  if (db > -18) return '#ffcc00';
  return '#00e5ff';
}

export function LevelMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const timeDomainBuf = useRef<Float32Array<ArrayBuffer> | null>(null);

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

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const cssW = W / dpr;
      const cssH = H / dpr;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(dpr, dpr);

      const inputA = audioEngine.getInputAnalyser();
      const outputA = audioEngine.getOutputAnalyser();

      let inputDb = MIN_DB;
      let outputDb = MIN_DB;

      if (inputA && outputA) {
        const fftSize = inputA.fftSize;
        if (!timeDomainBuf.current || timeDomainBuf.current.length !== fftSize) {
          timeDomainBuf.current = new Float32Array(fftSize) as Float32Array<ArrayBuffer>;
        }

        inputA.getFloatTimeDomainData(timeDomainBuf.current);
        let sumSq = 0;
        for (let i = 0; i < fftSize; i++) sumSq += timeDomainBuf.current[i] ** 2;
        inputDb = rmsToDb(Math.sqrt(sumSq / fftSize));

        outputA.getFloatTimeDomainData(timeDomainBuf.current);
        sumSq = 0;
        for (let i = 0; i < fftSize; i++) sumSq += timeDomainBuf.current[i] ** 2;
        outputDb = rmsToDb(Math.sqrt(sumSq / fftSize));
      }

      const barW = cssW * 0.38;
      const gap = cssW * 0.24;
      const barH = cssH - 24;
      const labelY = cssH - 4;

      const drawBar = (db: number, x: number, label: string) => {
        // Background track
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(x, 0, barW, barH);

        // Filled bar
        const frac = dbToFraction(db);
        const fillH = barH * frac;
        ctx.fillStyle = barColor(db);
        ctx.fillRect(x, barH - fillH, barW, fillH);

        // Label
        ctx.fillStyle = '#888';
        ctx.font = `11px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(label, x + barW / 2, labelY);

        // dB value
        ctx.fillStyle = '#ccc';
        ctx.font = `10px monospace`;
        ctx.fillText(db.toFixed(1), x + barW / 2, barH - fillH - 4);
      };

      const xIn = 0;
      const xOut = barW + gap;
      drawBar(inputDb, xIn, 'IN');
      drawBar(outputDb, xOut, 'OUT');

      // Reduction label
      const reductionDb = outputDb - inputDb;
      if (reductionDb < -1) {
        ctx.fillStyle = '#00ff88';
        ctx.font = `bold 11px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`↓${Math.abs(reductionDb).toFixed(1)} dB`, cssW / 2, cssH / 2);
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  return (
    <div class="level-meter-wrapper">
      <canvas ref={canvasRef} class="level-meter-canvas" aria-label="Input and output level meters" role="img" />
    </div>
  );
}
