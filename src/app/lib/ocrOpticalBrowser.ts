import {
  jpegOrientation,
  orientationTransform,
  type OpticalImage,
} from "./ocrOptical";
async function load(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image decode failed"));
      i.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function opticalImage(
  file: Blob,
  label: string,
  source: string,
  exifOrientation: number | null,
  rotation: number,
  transformation: string,
): Promise<OpticalImage> {
  const image = await load(file);
  exifOrientation =
    exifOrientation ??
    jpegOrientation(new Uint8Array(await file.arrayBuffer())).orientation;
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return {
    label,
    source,
    exifOrientation,
    rotation,
    transformation,
    width: image.naturalWidth,
    height: image.naturalHeight,
    mime: file.type,
    base64: data.split(",")[1],
  };
}
export async function normalizePhysicalStill(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()),
    info = jpegOrientation(bytes),
    o = info.orientation ?? 1;
  // Neutralize the tag BEFORE decoding, then explicitly apply its matrix once.
  if (info.offset !== null)
    new DataView(bytes.buffer).setUint16(info.offset, 1, info.littleEndian);
  const raw = await load(new Blob([bytes], { type: file.type }));
  const w = raw.naturalWidth,
    h = raw.naturalHeight,
    swap = o >= 5;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Canvas unavailable");
  c.setTransform(...orientationTransform(o, w, h));
  c.drawImage(raw, 0, 0);
  const output = document.createElement("canvas");
  const scale = Math.min(1, 3200 / Math.max(canvas.width, canvas.height));
  output.width = Math.round(canvas.width * scale);
  output.height = Math.round(canvas.height * scale);
  output.getContext("2d")!.drawImage(canvas, 0, 0, output.width, output.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (b) => (b ? resolve(b) : reject(Error("JPEG encoding failed"))),
      "image/jpeg",
      0.88,
    ),
  );
  return {
    file: new File([blob], "trimax-exif-normalized.jpg", {
      type: "image/jpeg",
    }),
    metadata: {
      exifOrientation: info.orientation,
      rawWidth: w,
      rawHeight: h,
      width: output.width,
      height: output.height,
      transformation: `EXIF ${info.orientation ?? "absent"}: neutralized before browser decode; matrix ${orientationTransform(o, w, h).join(",")}; resize ${scale}; EXIF stripped by canvas encoding`,
    },
  };
}
