import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FaceDetector, FilesetResolver, type Detection } from "@mediapipe/tasks-vision";
import { Dice3D, type DicePhase } from "./Dice3D";
import { cropFaceToCanvas, type FaceBox, type FaceCandidate } from "./face";
import "./styles.css";

type PhotoEntry = {
  id: string;
  url: string;
  image: HTMLImageElement;
  faces: FaceCandidate[];
  isDemo?: boolean;
};

type DetectorState = "idle" | "loading" | "detecting" | "ready" | "error";
type GameState = "waiting" | "ready" | "rolling" | "result";
type SignalKind = "scan" | "err" | "run" | "lock" | "ready" | "idle";

// シグナルの種別と表示ラベルは単一の真実から導出する（種別→ラベルの対応を一箇所に集約）。
const SIGNAL_LABEL: Record<SignalKind, string> = {
  scan: "SCAN",
  err: "ERR",
  run: "RUN",
  lock: "LOCK",
  ready: "READY",
  idle: "IDLE",
};

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const DEMO_IMAGE_URL = `${import.meta.env.BASE_URL}demo-party.svg`;
const MIN_FACE_SCORE = 0.5;
const MIN_FACE_SIZE = 28;
const DEMO_FACE_BOXES: FaceBox[] = [
  { originX: 88, originY: 96, width: 354, height: 372 },
  { originX: 438, originY: 388, width: 294, height: 302 },
  { originX: 752, originY: 98, width: 298, height: 330 },
  { originX: 1034, originY: 392, width: 318, height: 326 },
  { originX: 1362, originY: 120, width: 284, height: 310 },
];

function loadImageFromBlob(blob: Blob): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした。もう一度試してください。"));
    };
    image.src = url;
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("デモ画像を読み込めませんでした。"));
    image.src = url;
  });
}

function releasePhotoUrl(photo: PhotoEntry) {
  if (!photo.isDemo) {
    URL.revokeObjectURL(photo.url);
  }
}

// getUserMedia の失敗理由を、利用者が次に取るべき行動が分かる文言へ変換する。
function describeCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "カメラの使用が許可されませんでした。ブラウザの権限設定を確認してください。";
      case "NotFoundError":
      case "OverconstrainedError":
        return "使用できるカメラが見つかりませんでした。写真を選んでください。";
      case "NotReadableError":
        return "カメラを他のアプリが使用中の可能性があります。閉じてからお試しください。";
    }
  }
  return "カメラを起動できませんでした。許可設定を確認してください。";
}

function getScore(detection: Detection) {
  return detection.categories?.[0]?.score ?? 0;
}

function getDiceLabel(count: number) {
  if (count <= 0) {
    return "—";
  }

  if (count === 1) {
    return "D1";
  }

  if (count <= 6) {
    return "D6";
  }

  return `D${count}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function FaceTile({
  face,
  index,
  active,
  winner,
  onRemove,
}: {
  face: FaceCandidate;
  index: number;
  active: boolean;
  winner: boolean;
  onRemove?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      cropFaceToCanvas(canvasRef.current, face, 120);
    }
  }, [face]);

  return (
    <div className={`tile ${active ? "is-active" : ""} ${winner ? "is-winner" : ""}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`参加者 ${index + 1}${winner ? " · 当選" : active ? " · 選択中" : ""}`}
      />
      <span className="tile-no">{pad2(index + 1)}</span>
      {onRemove ? (
        <button
          className="tile-del"
          type="button"
          onClick={onRemove}
          aria-label={`参加者 ${index + 1} を削除`}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function ResultFace({ face }: { face: FaceCandidate }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      cropFaceToCanvas(canvasRef.current, face, 220, 0.5);
    }
  }, [face]);

  return <canvas ref={canvasRef} className="locked-face" role="img" aria-label="選ばれた顔" />;
}

function CameraPanel({
  disabled,
  onCapture,
}: {
  disabled: boolean;
  onCapture: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    cancelledRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザではカメラを使えません。写真を選んでください。");
      return;
    }

    cancelledRef.current = false;
    setOpen(true);
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });
      // 許可待ちの間に閉じた / アンマウントされた場合は、解決したストリームを破棄する。
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      stopCamera();
      setError(describeCameraError(error));
    }
  }, [stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setError("映像を取得できませんでした。もう一度試してください。");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("撮影に失敗しました。");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
        } else {
          setError("撮影に失敗しました。もう一度試してください。");
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  useEffect(() => stopCamera, [stopCamera]);

  if (!open) {
    return (
      <button className="ctl" type="button" disabled={disabled} onClick={startCamera}>
        <span className="ctl-key">CAM</span>
        <span className="ctl-label">カメラで撮る</span>
      </button>
    );
  }

  return (
    <div className="camera-box">
      <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
      <div className="camera-actions">
        <button className="ctl" type="button" disabled={disabled} onClick={capture}>
          <span className="ctl-key">ADD</span>
          <span className="ctl-label">取り込む</span>
        </button>
        <button className="ctl ghost" type="button" onClick={stopCamera}>
          <span className="ctl-key">ESC</span>
          <span className="ctl-label">閉じる</span>
        </button>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const detectorPromiseRef = useRef<Promise<FaceDetector> | null>(null);
  const mountedRef = useRef(true);
  const spinTimerRef = useRef<number | null>(null);
  const photoIdRef = useRef(0);
  const opGenRef = useRef(0);
  const photosRef = useRef<PhotoEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [detectorState, setDetectorState] = useState<DetectorState>("idle");
  const [gameState, setGameState] = useState<GameState>("waiting");
  const [message, setMessage] = useState("待機中 — 顔を取り込んでください");

  const faces = useMemo(() => photos.flatMap((photo) => photo.faces), [photos]);
  const winner = winnerIndex === null ? null : faces[winnerIndex] ?? null;
  const diceLabel = getDiceLabel(faces.length);
  const busy = detectorState === "loading" || detectorState === "detecting";

  const signalKind: SignalKind = busy
    ? "scan"
    : detectorState === "error"
      ? "err"
      : gameState === "rolling"
        ? "run"
        : gameState === "result"
          ? "lock"
          : faces.length > 0
            ? "ready"
            : "idle";
  const statusLabel = SIGNAL_LABEL[signalKind];

  const readoutValue =
    gameState === "rolling" && activeIndex !== null
      ? pad2(activeIndex + 1)
      : gameState === "result" && winnerIndex !== null
        ? pad2(winnerIndex + 1)
        : "00";
  const dicePhase: DicePhase =
    gameState === "rolling" ? "rolling" : gameState === "result" ? "result" : "idle";
  const diceFace =
    activeIndex !== null && (gameState === "rolling" || gameState === "result")
      ? (faces[activeIndex] ?? null)
      : null;

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    const detectorPromise =
      detectorPromiseRef.current ??
      (async () => {
        setDetectorState("loading");
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU",
          },
          minDetectionConfidence: 0.35,
          runningMode: "IMAGE",
        });
        // 初期化がアンマウント後に完了した場合、cleanup は既に走り終えているため
        // ここで閉じないとリソースが残る。キャッシュもしない。
        if (!mountedRef.current) {
          detector.close();
          throw new Error("コンポーネントがアンマウントされました");
        }
        detectorRef.current = detector;
        return detector;
      })();

    detectorPromiseRef.current = detectorPromise;

    try {
      return await detectorPromise;
    } catch (error) {
      if (detectorPromiseRef.current === detectorPromise) {
        detectorPromiseRef.current = null;
      }
      throw error;
    }
  }, []);

  const addPhoto = useCallback(
    async (blob: Blob) => {
      let loaded: Awaited<ReturnType<typeof loadImageFromBlob>> | null = null;
      const gen = (opGenRef.current += 1);
      const isStale = () => opGenRef.current !== gen;

      setMessage("検出中…");
      setDetectorState("detecting");
      setGameState("waiting");
      setWinnerIndex(null);
      setActiveIndex(null);

      try {
        const detector = await loadDetector();

        let loadedPhoto: Awaited<ReturnType<typeof loadImageFromBlob>>;
        try {
          loadedPhoto = await loadImageFromBlob(blob);
        } catch (error) {
          // 画像のデコード失敗は利用者向けの具体メッセージをそのまま見せる
          // （検出モジュールの不調と混同させない）。
          if (isStale()) {
            return;
          }
          setDetectorState("error");
          setMessage(
            error instanceof Error ? error.message : "画像を読み込めませんでした。",
          );
          return;
        }
        loaded = loadedPhoto;

        // 検出中に CLEAR / デモ開始など別操作が走ったら、この結果は破棄する。
        if (isStale()) {
          URL.revokeObjectURL(loadedPhoto.url);
          return;
        }
        const imageId = `photo-${photoIdRef.current}`;
        photoIdRef.current += 1;
        const result = detector.detect(loadedPhoto.image);
        const detected = result.detections
          .map((detection, index): FaceCandidate | null => {
            const box = detection.boundingBox;
            if (!box) {
              return null;
            }

            // 誤検出・極小ボックスを抽選対象から除外する。
            if (getScore(detection) < MIN_FACE_SCORE) {
              return null;
            }
            if (box.width < MIN_FACE_SIZE || box.height < MIN_FACE_SIZE) {
              return null;
            }

            return {
              id: `${imageId}-face-${index}`,
              imageId,
              image: loadedPhoto.image,
              box: {
                originX: box.originX,
                originY: box.originY,
                width: box.width,
                height: box.height,
              },
              score: getScore(detection),
            };
          })
          .filter((face): face is FaceCandidate => Boolean(face));

        if (isStale()) {
          URL.revokeObjectURL(loadedPhoto.url);
          return;
        }

        const nextPhotos = [
          ...photosRef.current,
          {
            id: imageId,
            url: loadedPhoto.url,
            image: loadedPhoto.image,
            faces: detected,
          },
        ];
        photosRef.current = nextPhotos;
        setPhotos(nextPhotos);

        setDetectorState("ready");
        setGameState(nextPhotos.some((photo) => photo.faces.length > 0) ? "ready" : "waiting");
        setMessage(
          detected.length > 0
            ? `${detected.length} 件検出 — RUN で実行`
            : "検出なし — 別の画像を試してください",
        );
      } catch {
        if (loaded) {
          URL.revokeObjectURL(loaded.url);
        }
        setDetectorState("error");
        setMessage("検出モジュールの読み込みに失敗しました");
      }
    },
    [loadDetector],
  );

  const onFileSelect = useCallback(
    async (files: FileList | null) => {
      const fileArray = Array.from(files ?? []);
      for (const file of fileArray) {
        await addPhoto(file);
      }
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [addPhoto],
  );

  const startRoll = useCallback(() => {
    // 進行中タイマーの有無を真の排他条件にする（再描画ガードに依存しない）。
    if (faces.length === 0 || spinTimerRef.current !== null) {
      return;
    }

    setWinnerIndex(null);
    setGameState("rolling");
    setMessage("実行中 — STOP で確定");
    spinTimerRef.current = window.setInterval(() => {
      setActiveIndex((current) => {
        const next = current === null ? 0 : current + 1;
        return next % faces.length;
      });
    }, 70);
  }, [faces.length]);

  const stopRoll = useCallback(() => {
    if (faces.length === 0) {
      return;
    }

    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    const nextWinner = Math.floor(Math.random() * faces.length);
    setActiveIndex(nextWinner);
    setWinnerIndex(nextWinner);
    setGameState("result");
    setMessage(`確定 — No.${pad2(nextWinner + 1)}`);
  }, [faces.length]);

  const resetGame = useCallback(() => {
    opGenRef.current += 1;
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    photos.forEach(releasePhotoUrl);
    photosRef.current = [];
    setPhotos([]);
    setActiveIndex(null);
    setWinnerIndex(null);
    setGameState("waiting");
    setMessage("待機中 — 顔を取り込んでください");
  }, [photos]);

  const removeFace = useCallback((faceId: string) => {
    const exists = photosRef.current.some((photo) =>
      photo.faces.some((face) => face.id === faceId),
    );
    if (!exists) {
      return;
    }

    // 抽選中は番号がずれるので止める。
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }
    opGenRef.current += 1;

    const nextPhotos: PhotoEntry[] = [];
    for (const photo of photosRef.current) {
      // 外側の faces（全顔フラット配列）を隠さないよう別名にする。
      const remaining = photo.faces.filter((face) => face.id !== faceId);
      if (remaining.length === 0) {
        // 顔が無くなった写真は破棄（メモリ解放）。
        releasePhotoUrl(photo);
        continue;
      }
      nextPhotos.push(
        remaining.length === photo.faces.length ? photo : { ...photo, faces: remaining },
      );
    }

    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    setActiveIndex(null);
    setWinnerIndex(null);

    const total = nextPhotos.reduce((sum, photo) => sum + photo.faces.length, 0);
    setGameState(total > 0 ? "ready" : "waiting");
    setMessage(
      total > 0 ? `${total} 件 — RUN で実行` : "待機中 — 顔を取り込んでください",
    );
  }, []);

  const startDemoMode = useCallback(async () => {
    const gen = (opGenRef.current += 1);
    const isStale = () => opGenRef.current !== gen;
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    photos.forEach(releasePhotoUrl);
    photosRef.current = [];
    setMessage("デモを準備中…");
    setDetectorState("ready");
    setGameState("waiting");
    setActiveIndex(null);
    setWinnerIndex(null);

    try {
      const image = await loadImageFromUrl(DEMO_IMAGE_URL);
      // 読み込み中に CLEAR / 写真追加など別操作が走っていたら、この結果は破棄する。
      if (isStale()) {
        return;
      }
      const imageId = "demo-party";
      const demoFaces = DEMO_FACE_BOXES.map((box, index): FaceCandidate => ({
        id: `${imageId}-face-${index}`,
        imageId,
        image,
        box,
        score: 1,
      }));

      const demoPhotos = [
        {
          id: imageId,
          url: DEMO_IMAGE_URL,
          image,
          faces: demoFaces,
          isDemo: true,
        },
      ];
      photosRef.current = demoPhotos;
      setPhotos(demoPhotos);
      setGameState("ready");
      setMessage("デモ 5 件 — RUN で実行");
    } catch {
      if (isStale()) {
        return;
      }
      setDetectorState("error");
      setGameState("waiting");
      setMessage("デモ画像を読み込めませんでした");
    }
  }, [photos]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    // StrictMode はマウント/アンマウントを二重実行する。再マウント時に true へ戻す。
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (spinTimerRef.current !== null) {
        window.clearInterval(spinTimerRef.current);
      }
      photosRef.current.forEach(releasePhotoUrl);
      detectorRef.current?.close();
      detectorRef.current = null;
      detectorPromiseRef.current = null;
    };
  }, []);

  return (
    <main className={`app state-${gameState}`}>
      <div className="console">
        <header className="bar">
          <div className="brand">
            <h1 className="mark">AnyFaceDice</h1>
            <span className="sub">FACE SELECTOR / RANDOM</span>
          </div>
          <div className={`signal kind-${signalKind}`}>
            <span className="led" aria-hidden="true" />
            <span className="signal-text">{statusLabel}</span>
          </div>
        </header>

        <div className="deck">
          <section className="panel input-panel" aria-label="入力">
            <div className="panel-head">
              <span>INPUT</span>
            </div>
            <div className="panel-body">
              <CameraPanel disabled={busy || gameState === "rolling"} onCapture={addPhoto} />
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                // 視覚的に隠した実体。操作は「写真を選ぶ」ボタン経由なので、
                // フォーカス順とスクリーンリーダーからは除外する。
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => onFileSelect(event.target.files)}
              />
              <button
                className="ctl"
                type="button"
                disabled={busy || gameState === "rolling"}
                onClick={() => inputRef.current?.click()}
              >
                <span className="ctl-key">IMG</span>
                <span className="ctl-label">写真を選ぶ</span>
              </button>
              <button
                className="ctl"
                type="button"
                disabled={busy || gameState === "rolling"}
                onClick={startDemoMode}
              >
                <span className="ctl-key">DEMO</span>
                <span className="ctl-label">デモで試す</span>
              </button>
            </div>
          </section>

          <section className="panel select-panel" aria-label="抽選">
            <div className="panel-head">
              <span>SELECTION</span>
              <span className="panel-tag">{statusLabel}</span>
            </div>
            <div className="panel-body">
              <div
                className={`readout kind-${signalKind}`}
                // ライブ通知は statusline に集約する。ここを role="status" にすると
                // 抽選中 70ms ごとの数値更新が読み上げを埋め尽くすため、静的ラベルに留める。
                role="img"
                aria-label={`選択 ${readoutValue} / ${pad2(faces.length)}`}
              >
                <Dice3D value={readoutValue} phase={dicePhase} face={diceFace} />
                <span className="readout-unit">/ {pad2(faces.length)}</span>
              </div>

              <div className="meters">
                <div className="meter">
                  <span>COUNT</span>
                  <b>{pad2(faces.length)}</b>
                </div>
                <div className="meter">
                  <span>DIE</span>
                  <b>{diceLabel}</b>
                </div>
              </div>

              <div className="run-row">
                <button
                  className="run"
                  type="button"
                  disabled={faces.length === 0 || busy || gameState === "rolling"}
                  onClick={startRoll}
                >
                  RUN
                </button>
                <button
                  className="halt"
                  type="button"
                  disabled={faces.length === 0 || gameState !== "rolling"}
                  onClick={stopRoll}
                >
                  STOP
                </button>
              </div>

              {winner ? (
                <div className="locked">
                  <ResultFace face={winner} />
                  <div className="locked-meta">
                    <span>LOCKED</span>
                    <b>No.{pad2((winnerIndex ?? 0) + 1)}</b>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="statusline" role="status">
          <span className="statusline-key">STATUS</span>
          <span className="statusline-text">{message}</span>
        </div>

        {faces.length > 0 ? (
          <section className="panel participants" aria-label="参加者">
            <div className="panel-head">
              <span>PARTICIPANTS</span>
              <span className="panel-tag">{pad2(faces.length)}</span>
              <button className="clear" type="button" onClick={resetGame}>
                CLEAR
              </button>
            </div>
            <div className="grid">
              {faces.map((face, index) => (
                <FaceTile
                  key={face.id}
                  face={face}
                  index={index}
                  active={index === activeIndex}
                  winner={index === winnerIndex}
                  onRemove={
                    gameState === "rolling" || busy ? undefined : () => removeFace(face.id)
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="foot">
          <span className="dot" aria-hidden="true" />
          on-device · no upload · browser-native
        </footer>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
