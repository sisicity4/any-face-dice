import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FaceDetector, FilesetResolver, type Detection } from "@mediapipe/tasks-vision";
import "./styles.css";

type FaceBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type FaceCandidate = {
  id: string;
  imageId: string;
  image: HTMLImageElement;
  box: FaceBox;
  score: number;
};

type PhotoEntry = {
  id: string;
  url: string;
  image: HTMLImageElement;
  faces: FaceCandidate[];
  isDemo?: boolean;
};

type DetectorState = "idle" | "loading" | "detecting" | "ready" | "error";
type GameState = "waiting" | "ready" | "rolling" | "result";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const DEMO_IMAGE_URL = `${import.meta.env.BASE_URL}demo-party.svg`;
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

function getScore(detection: Detection) {
  return detection.categories?.[0]?.score ?? 0;
}

function getDiceLabel(count: number) {
  if (count <= 1) {
    return "D1";
  }

  if (count <= 6) {
    return "D6";
  }

  return `D${count}`;
}

function cropFaceToCanvas(
  canvas: HTMLCanvasElement,
  face: FaceCandidate,
  size: number,
  paddingRatio = 0.42,
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const padding = Math.max(face.box.width, face.box.height) * paddingRatio;
  const x = Math.max(0, face.box.originX - padding);
  const y = Math.max(0, face.box.originY - padding);
  const right = Math.min(face.image.naturalWidth, face.box.originX + face.box.width + padding);
  const bottom = Math.min(face.image.naturalHeight, face.box.originY + face.box.height + padding);

  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);
  context.drawImage(face.image, x, y, right - x, bottom - y, 0, 0, size, size);
}

function FaceChip({
  face,
  index,
  active,
  winner,
}: {
  face: FaceCandidate;
  index: number;
  active: boolean;
  winner: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      cropFaceToCanvas(canvasRef.current, face, 96);
    }
  }, [face]);

  return (
    <div className={`face-chip ${active ? "is-active" : ""} ${winner ? "is-winner" : ""}`}>
      <canvas ref={canvasRef} />
      <span>{index + 1}</span>
    </div>
  );
}

function ResultFace({ face }: { face: FaceCandidate }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      cropFaceToCanvas(canvasRef.current, face, 260, 0.5);
    }
  }, [face]);

  return <canvas ref={canvasRef} className="winner-face" aria-label="選ばれた顔" />;
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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザではカメラを使えません。写真を選んでください。");
      return;
    }

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
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      stopCamera();
      setError("カメラを起動できませんでした。許可設定を確認してください。");
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
        }
      },
      "image/jpeg",
      0.92,
    );
  }, [onCapture]);

  useEffect(() => stopCamera, [stopCamera]);

  return (
    <div className="camera-box">
      {!open ? (
        <button className="big-button blue" type="button" disabled={disabled} onClick={startCamera}>
          カメラで撮る
        </button>
      ) : (
        <>
          <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
          <div className="camera-actions">
            <button className="big-button yellow" type="button" disabled={disabled} onClick={capture}>
              この顔を追加
            </button>
            <button className="big-button ghost" type="button" onClick={stopCamera}>
              とじる
            </button>
          </div>
        </>
      )}
      {error ? <p className="inline-error">{error}</p> : null}
    </div>
  );
}

function App() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const detectorPromiseRef = useRef<Promise<FaceDetector> | null>(null);
  const spinTimerRef = useRef<number | null>(null);
  const photoIdRef = useRef(0);
  const photosRef = useRef<PhotoEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [detectorState, setDetectorState] = useState<DetectorState>("idle");
  const [gameState, setGameState] = useState<GameState>("waiting");
  const [message, setMessage] = useState("まずは顔を撮るか、写真を選んでね。");

  const faces = useMemo(() => photos.flatMap((photo) => photo.faces), [photos]);
  const winner = winnerIndex === null ? null : faces[winnerIndex] ?? null;
  const diceLabel = getDiceLabel(faces.length);
  const busy = detectorState === "loading" || detectorState === "detecting";

  const loadDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    if (!detectorPromiseRef.current) {
      detectorPromiseRef.current = (async () => {
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
        detectorRef.current = detector;
        return detector;
      })();
    }

    return detectorPromiseRef.current;
  }, []);

  const addPhoto = useCallback(
    async (blob: Blob) => {
      setMessage("顔を探しています...");
      setDetectorState("detecting");
      setGameState("waiting");
      setWinnerIndex(null);
      setActiveIndex(null);

      try {
        const detector = await loadDetector();
        const loaded = await loadImageFromBlob(blob);
        const imageId = `photo-${photoIdRef.current}`;
        photoIdRef.current += 1;
        const result = detector.detect(loaded.image);
        const detected = result.detections
          .map((detection, index): FaceCandidate | null => {
            if (!detection.boundingBox) {
              return null;
            }

            return {
              id: `${imageId}-face-${index}`,
              imageId,
              image: loaded.image,
              box: {
                originX: detection.boundingBox.originX,
                originY: detection.boundingBox.originY,
                width: detection.boundingBox.width,
                height: detection.boundingBox.height,
              },
              score: getScore(detection),
            };
          })
          .filter((face): face is FaceCandidate => Boolean(face));

        setPhotos((current) => [
          ...current,
          {
            id: imageId,
            url: loaded.url,
            image: loaded.image,
            faces: detected,
          },
        ]);

        setDetectorState("ready");
        setGameState(detected.length > 0 || faces.length > 0 ? "ready" : "waiting");
        setMessage(
          detected.length > 0
            ? `${detected.length}人見つけた！準備OK。`
            : "顔が見つからなかった。もう1枚いこう。",
        );
      } catch {
        setDetectorState("error");
        setMessage("顔検出の読み込みに失敗しました。通信状態を確認してもう一度。");
      }
    },
    [faces.length, loadDetector],
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
    if (faces.length === 0 || gameState === "rolling") {
      return;
    }

    setWinnerIndex(null);
    setGameState("rolling");
    setMessage("まわってます。止めて！");
    spinTimerRef.current = window.setInterval(() => {
      setActiveIndex((current) => {
        const next = current === null ? 0 : current + 1;
        return next % faces.length;
      });
    }, 90);
  }, [faces.length, gameState]);

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
    setMessage("この人！乾杯！");
  }, [faces.length]);

  const resetGame = useCallback(() => {
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setActiveIndex(null);
    setWinnerIndex(null);
    setGameState("waiting");
    setMessage("まずは顔を撮るか、写真を選んでね。");
  }, [photos]);

  const startDemoMode = useCallback(async () => {
    if (spinTimerRef.current !== null) {
      window.clearInterval(spinTimerRef.current);
      spinTimerRef.current = null;
    }

    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setMessage("デモモードを準備中...");
    setDetectorState("ready");
    setGameState("waiting");
    setActiveIndex(null);
    setWinnerIndex(null);

    try {
      const image = await loadImageFromUrl(DEMO_IMAGE_URL);
      const imageId = "demo-party";
      const demoFaces = DEMO_FACE_BOXES.map((box, index): FaceCandidate => ({
        id: `${imageId}-face-${index}`,
        imageId,
        image,
        box,
        score: 1,
      }));

      setPhotos([
        {
          id: imageId,
          url: DEMO_IMAGE_URL,
          image,
          faces: demoFaces,
          isDemo: true,
        },
      ]);
      setGameState("ready");
      setMessage("デモ5人で遊べます。STARTを押してね！");
    } catch {
      setDetectorState("error");
      setGameState("waiting");
      setMessage("デモ画像を読み込めませんでした。");
    }
  }, [photos]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(
    () => () => {
      if (spinTimerRef.current !== null) {
        window.clearInterval(spinTimerRef.current);
      }
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    [],
  );

  return (
    <main className={`app state-${gameState}`}>
      <section className="game-shell">
        <header className="hero">
          <p className="eyebrow">😃🎲 Face Dice Party</p>
          <h1>AnyFaceDice</h1>
          <p className="lead">顔を撮って、ボタンを押して、選ばれた人で盛り上がるだけ。</p>
          <p className="privacy">画像は端末内だけで処理。サーバーには送りません。</p>
        </header>

        <section className="status-board" aria-label="現在の状態">
          <div>
            <span>人数</span>
            <strong>{faces.length}</strong>
          </div>
          <div>
            <span>サイコロ</span>
            <strong>{diceLabel}</strong>
          </div>
          <div>
            <span>状態</span>
            <strong>{gameState === "rolling" ? "GO" : gameState === "result" ? "HIT" : "OK"}</strong>
          </div>
        </section>

        <p className="party-message" role="status">
          {message}
        </p>

        <section className="input-zone" aria-label="顔を追加">
          <CameraPanel disabled={busy || gameState === "rolling"} onCapture={addPhoto} />
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => onFileSelect(event.target.files)}
          />
          <button
            className="big-button pink"
            type="button"
            disabled={busy || gameState === "rolling"}
            onClick={() => inputRef.current?.click()}
          >
            写真を選ぶ
          </button>
          <button
            className="big-button demo"
            type="button"
            disabled={busy || gameState === "rolling"}
            onClick={startDemoMode}
          >
            デモで遊ぶ
          </button>
        </section>

        <section className="dice-zone" aria-label="サイコロ">
          <div className={`dice-face ${gameState === "rolling" ? "rolling" : ""}`}>
            <span>{diceLabel}</span>
            <small>{faces.length > 0 ? `${faces.length}人で抽選` : "顔待ち"}</small>
          </div>
          <div className="play-buttons">
            <button
              className="mega-button start"
              type="button"
              disabled={faces.length === 0 || busy || gameState === "rolling"}
              onClick={startRoll}
            >
              START
            </button>
            <button
              className="mega-button stop"
              type="button"
              disabled={faces.length === 0 || gameState !== "rolling"}
              onClick={stopRoll}
            >
              STOP
            </button>
          </div>
        </section>

        {faces.length > 0 ? (
          <section className="faces-zone" aria-label="参加者">
            <div className="zone-title">
              <span>参加者</span>
              <button type="button" onClick={resetGame}>
                全部消す
              </button>
            </div>
            <div className="face-grid">
              {faces.map((face, index) => (
                <FaceChip
                  key={face.id}
                  face={face}
                  index={index}
                  active={index === activeIndex}
                  winner={index === winnerIndex}
                />
              ))}
            </div>
          </section>
        ) : null}

        {winner ? (
          <section className="winner-card" aria-label="結果">
            <div>
              <p className="eyebrow">RESULT</p>
              <h2>この人！</h2>
              <p>もう一回遊ぶならSTARTを押してね。</p>
            </div>
            <ResultFace face={winner} />
          </section>
        ) : null}

        <footer className="footer">
          <span>local only / browser native / no server</span>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
