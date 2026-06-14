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
    return false;
  }

  // 画像が未ロード/破損の場合は drawImage が例外になるため描画しない。
  const image = face.image;
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return false;
  }

  const padding = Math.max(face.box.width, face.box.height) * paddingRatio;
  const x = Math.max(0, face.box.originX - padding);
  const y = Math.max(0, face.box.originY - padding);
  const right = Math.min(image.naturalWidth, face.box.originX + face.box.width + padding);
  const bottom = Math.min(image.naturalHeight, face.box.originY + face.box.height + padding);

  // 不正な box（幅/高さが非正）なら何もしない。
  if (right - x <= 0 || bottom - y <= 0) {
    return false;
  }

  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);
  context.drawImage(image, x, y, right - x, bottom - y, 0, 0, size, size);
  return true;
}
