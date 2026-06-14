export type FaceBox = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type FaceCandidate = {
  id: string;
  imageId: string;
  image: HTMLImageElement;
  box: FaceBox;
  score: number;
};

// 顔のバウンディングボックスを中心に正方形へクロップして canvas に描画する。
export function cropFaceToCanvas(
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
