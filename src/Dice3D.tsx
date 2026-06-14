import { useEffect, useRef } from "react";

export type DicePhase = "idle" | "rolling" | "result";

const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;

// 静止時の 3/4 ビュー。
const REST_X = -24;
const REST_Y = 22;
// タンブルの 1 フレームあたりの回転量（deg）。速く・物理的に。
const SPIN_X = 7;
const SPIN_Y = 11;
// ロック時の減速時間（ms）。
const LOCK_MS = 760;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Design.md に合わせたマシン加工風モノクロの立方体。
// RUN 中は requestAnimationFrame で多軸タンブル、STOP で静止姿勢へ減速してロックする。
export function Dice3D({ value, phase }: { value: string; phase: DicePhase }) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const rot = useRef({ x: REST_X, y: REST_Y });

  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube) {
      return;
    }

    const apply = () => {
      cube.style.transform = `rotateX(${rot.current.x}deg) rotateY(${rot.current.y}deg)`;
    };
    const cancel = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    cancel();

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (phase === "rolling" && !reduce) {
      const tick = () => {
        rot.current.x += SPIN_X;
        rot.current.y += SPIN_Y;
        apply();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else if (phase === "result" && !reduce) {
      // 現在の回転位置から、前面が正面に来る静止姿勢へ減速。最後にもう一回転足して着地感を出す。
      const start = { x: rot.current.x, y: rot.current.y };
      const target = {
        x: Math.round((start.x - REST_X) / 360) * 360 + REST_X + 360,
        y: Math.round((start.y - REST_Y) / 360) * 360 + REST_Y + 360,
      };
      let startTs: number | null = null;
      const tick = (ts: number) => {
        if (startTs === null) {
          startTs = ts;
        }
        const t = Math.min(1, (ts - startTs) / LOCK_MS);
        const e = easeOutCubic(t);
        rot.current.x = start.x + (target.x - start.x) * e;
        rot.current.y = start.y + (target.y - start.y) * e;
        apply();
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // idle / reduced-motion: 静止姿勢へスナップ。
      rot.current.x = REST_X;
      rot.current.y = REST_Y;
      apply();
    }

    return cancel;
  }, [phase]);

  return (
    <div className={`dice3d phase-${phase}`} aria-hidden="true">
      <div className="dice-cube" ref={cubeRef}>
        {FACES.map((face) => (
          <span key={face} className={`dice-face f-${face}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
