import { useEffect, useRef, useState } from 'react';
import ModalCloseButton from './ModalCloseButton';

type Point = { x: number; y: number; t: number };
type Stroke = Point[];

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

export function parseFlexibleTimeInput(raw: unknown): string | null {
  let s = String(raw ?? '').normalize('NFKC').trim().toLowerCase();
  if (!s) return null;

  s = s
    .replace(/午後/g, 'pm')
    .replace(/午前/g, '')
    .replace(/半/g, ':30')
    .replace(/[時点.．]/g, ':')
    .replace(/[分]/g, '')
    .replace(/\s+/g, ':')
    .replace(/:+/g, ':')
    .replace(/^:/, '')
    .replace(/:$/, '');

  const isPm = s.includes('pm');
  s = s.replace(/am|pm/g, '');

  let hour: number;
  let minute: number;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else {
    const digits = s.replace(/\D/g, '');
    if (!digits || digits.length > 4) return null;
    if (digits.length <= 2) {
      hour = Number(digits);
      minute = 0;
    } else if (digits.length === 3) {
      hour = Number(digits.slice(0, 1));
      minute = Number(digits.slice(1));
    } else {
      hour = Number(digits.slice(0, 2));
      minute = Number(digits.slice(2));
    }
  }

  if (isPm && hour >= 1 && hour <= 11) hour += 12;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isTabletLike(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth >= 640;
}

function supportsHandwritingRecognition(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof (navigator as any).createHandwritingRecognizer === 'function';
}

/** PC・スマホ・タブレットでフォーカス／タップ時に全文選択（上書き入力しやすく） */
function selectAllInputText(el: HTMLInputElement) {
  const len = el.value.length;
  const run = () => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    el.select();
    try {
      el.setSelectionRange(0, len);
    } catch {
      // type=number 等では未対応
    }
  };
  run();
  requestAnimationFrame(run);
}

export default function FlexibleTimeInput({ value, onChange, className = '', ariaLabel }: Props) {
  const [draft, setDraft] = useState(value);
  const [showHandwriting, setShowHandwriting] = useState(false);
  const [showHandwritingButton, setShowHandwritingButton] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    setShowHandwritingButton(isTabletLike() && supportsHandwritingRecognition());
  }, []);

  useEffect(() => {
    if (!showHandwriting) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    strokes.forEach((stroke) => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      stroke.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }, [showHandwriting, strokes]);

  const commit = () => {
    const parsed = parseFlexibleTimeInput(draft);
    if (!parsed) {
      alert('時刻は 1030 / 10:30 / 10 30 / 9 などで入力してください');
      setDraft(value);
      return;
    }
    setDraft(parsed);
    onChange(parsed);
  };

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
      t: Date.now(),
    };
  };

  const recognizeHandwriting = async () => {
    if (strokes.length === 0) return;
    setRecognizing(true);
    try {
      const nav = navigator as any;
      const win = window as any;
      if (typeof nav.createHandwritingRecognizer !== 'function' || !win.HandwritingDrawing || !win.HandwritingStroke) {
        alert('この端末のブラウザは手書き文字認識に未対応です。数字入力（例: 1030）を使ってください。');
        return;
      }
      if (typeof nav.queryHandwritingRecognizer === 'function') {
        const available = await nav.queryHandwritingRecognizer({ languages: ['en'] });
        if (!available) {
          alert('この端末では手書き文字認識を利用できません。');
          return;
        }
      }

      const recognizer = await nav.createHandwritingRecognizer({ languages: ['en'] });
      const drawing = new win.HandwritingDrawing();
      strokes.forEach((points) => {
        const stroke = new win.HandwritingStroke();
        points.forEach((p) => stroke.addPoint({ x: p.x, y: p.y, t: p.t }));
        drawing.addStroke(stroke);
      });
      const predictions = await recognizer.getPrediction(drawing);
      const texts = (predictions || []).map((p: any) => String(p?.text || p || ''));
      const hit = texts.map(parseFlexibleTimeInput).find(Boolean);
      if (!hit) {
        alert('時刻として認識できませんでした。大きく 1030 のように書いてください。');
        return;
      }
      setDraft(hit);
      onChange(hit);
      setShowHandwriting(false);
      setStrokes([]);
    } catch (error) {
      alert('手書き認識に失敗しました。数字入力（例: 1030）を使ってください。');
    } finally {
      setRecognizing(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <input
          type="text"
          inputMode="numeric"
          data-ime="off"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => selectAllInputText(e.currentTarget)}
          onClick={(e) => selectAllInputText(e.currentTarget)}
          onTouchEnd={(e) => selectAllInputText(e.currentTarget)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="例: 1030"
          aria-label={ariaLabel}
          className={className}
        />
        {showHandwritingButton && (
          <button
            type="button"
            onClick={() => setShowHandwriting(true)}
            className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 text-xs font-bold text-indigo-700"
          >
            手書き
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-400">1030→10:30 / 9→09:00</p>

      {showHandwriting && (
        <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">時刻を手書き入力</h3>
                <p className="text-xs text-gray-500">例: 1030 / 9:30 のように大きく書いてください</p>
              </div>
              <ModalCloseButton onClick={() => setShowHandwriting(false)} />
            </div>
            <canvas
              ref={canvasRef}
              width={520}
              height={220}
              className="h-56 w-full touch-none rounded-xl border-2 border-slate-300 bg-slate-50"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pointFromEvent(e);
                activeStrokeRef.current = [p];
                setStrokes((prev) => [...prev, [p]]);
              }}
              onPointerMove={(e) => {
                if (!activeStrokeRef.current) return;
                const p = pointFromEvent(e);
                activeStrokeRef.current.push(p);
                setStrokes((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = [...activeStrokeRef.current!];
                  return next;
                });
              }}
              onPointerUp={() => {
                activeStrokeRef.current = null;
              }}
              onPointerCancel={() => {
                activeStrokeRef.current = null;
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStrokes([])}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"
              >
                消す
              </button>
              <button
                type="button"
                disabled={recognizing}
                onClick={() => void recognizeHandwriting()}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {recognizing ? '認識中...' : '認識して反映'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
