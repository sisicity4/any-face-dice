import { useEffect, useLayoutEffect, useRef } from "react";
import { cropFaceToCanvas, type FaceCandidate } from "./face";

export type DicePhase = "idle" | "rolling" | "result";

const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;
const FACE_TEX = 128;

// 静止時の 3/4 ビュー。
const REST_X = -24;
const REST_Y = 22;
// タンブル速度（deg/秒）。フレームレートに依存しないよう時間ベースで回す。
const SPIN_X_DPS = 420;
const SPIN_Y_DPS = 660;
// ロック時の減速時間（ms）。
const LOCK_MS = 760;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const wrap360 = (v: number) => ((v % 360) + 360) % 360;
// from から、base と 360 度合同になる最初の前方姿勢へ（さらに 1 回転足して着地感を出す）。
const forwardRest = (from: number, base: number) => from + wrap360(base - from) + 360;

// Design.md に合わせたマシン加工風モノクロの立方体。
// RUN 中は requestAnimationFrame で多軸タンブル、STOP で静止姿勢へ減速してロックする。
// 各面には抽選中/当選者の顔写真を貼る（モノクロ→ロックでフルカラー）。
export function Dice3D({
  value,
  phase,
  face,
}: {
  value: string;
  phase: DicePhase;
  face: FaceCandidate | null;
}) {
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const rot = useRef({ x: REST_X, y: REST_Y });
  const faceCanvases = useRef<Array<HTMLCanvasElement | null>>([]);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // 顔は 1 回だけクロップし、その結果を 6 面へ安価にコピーする（毎 tick の再ダウンサンプルを避ける）。
  // useLayoutEffect で描画前に確定させ、数値→写真のちらつきを防ぐ。
  useLayoutEffect(() => {
    if (!face) {
      return;
    }
    const off = offscreenRef.current ?? (offscreenRef.current = document.createElement("canvas"));
    if (!cropFaceToCanvas(off, face, FACE_TEX)) {
      return;
    }
    for (const canvas of faceCanvases.current) {
      if (!canvas) {
        continue;
      }
      canvas.width = FACE_TEX;
      canvas.height = FACE_TEX;
      canvas.getContext("2d")?.drawImage(off, 0, 0);
    }
  }, [face]);

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

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const snapToRest = () => {
      cancel();
      rot.current.x = REST_X;
      rot.current.y = REST_Y;
      apply();
    };

    if (phase === "rolling" && !motion.matches) {
      let prev: number | null = null;
      const tick = (ts: number) => {
        const dt = prev === null ? 0 : (ts - prev) / 1000;
        prev = ts;
        rot.current.x = wrap360(rot.current.x + SPIN_X_DPS * dt);
        rot.current.y = wrap360(rot.current.y + SPIN_Y_DPS * dt);
        apply();
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      // ロール中に reduced-motion へ切り替わったら即停止する。
      motion.addEventListener("change", snapToRest);
      return () => {
        cancel();
        motion.removeEventListener("change", snapToRest);
      };
    }

    if (phase === "result" && !motion.matches) {
      // 現在の回転位置から、前面が正面に来る静止姿勢へ減速。
      const start = { x: rot.current.x, y: rot.current.y };
      const target = { x: forwardRest(start.x, REST_X), y: forwardRest(start.y, REST_Y) };
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
        } else {
          rot.current.x = wrap360(rot.current.x);
          rot.current.y = wrap360(rot.current.y);
          apply();
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
      return cancel;
    }

    // idle / reduced-motion: 静止姿勢へスナップ。
    snapToRest();
    return cancel;
  }, [phase]);

  return (
    <div className={`dice3d phase-${phase}`} aria-hidden="true">
      <div className="dice-cube" ref={cubeRef}>
        {FACES.map((side, i) => (
          <span key={side} className={`dice-face f-${side}`}>
            {face ? (
              <canvas
                className="dice-photo"
                ref={(el) => {
                  faceCanvases.current[i] = el;
                }}
              />
            ) : (
              <span className="dice-num">{value}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
