export type DicePhase = "idle" | "rolling" | "result";

const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;

// 6面の数値ブロック。Design.md に合わせたマシン加工風モノクロの立方体で、
// 静止時は 3/4 ビュー（CSS の固定トランスフォーム）で表示する。
export function Dice3D({ value, phase }: { value: string; phase: DicePhase }) {
  return (
    <div className={`dice3d phase-${phase}`} aria-hidden="true">
      <div className="dice-cube">
        {FACES.map((face) => (
          <span key={face} className={`dice-face f-${face}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
