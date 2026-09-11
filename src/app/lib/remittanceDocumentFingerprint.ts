import sharp from "sharp";

export type RemittanceDocumentFingerprint = {
  version: "trimax-ahash-32-v1";
  hash: string;
  width: number;
  height: number;
};

const FINGERPRINT_SIZE = 32;
const FINGERPRINT_BITS = FINGERPRINT_SIZE * FINGERPRINT_SIZE;

export async function createRemittanceDocumentFingerprint(
  image: Buffer
): Promise<RemittanceDocumentFingerprint> {
  const normalized = await sharp(image, { limitInputPixels: 48_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(FINGERPRINT_SIZE, FINGERPRINT_SIZE, {
      fit: "fill",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Array.from(normalized.data);
  const average =
    pixels.reduce((total, value) => total + value, 0) / Math.max(pixels.length, 1);
  let bits = "";

  pixels.forEach((value) => {
    bits += value >= average ? "1" : "0";
  });

  return {
    version: "trimax-ahash-32-v1",
    hash: binaryToHex(bits),
    width: normalized.info.width,
    height: normalized.info.height,
  };
}

function binaryToHex(bits: string) {
  let hex = "";

  for (let index = 0; index < bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4).padEnd(4, "0"), 2).toString(16);
  }

  return hex;
}

function hexToBinary(hash: string) {
  return hash
    .replace(/[^a-f0-9]/gi, "")
    .toLowerCase()
    .split("")
    .map((char) => Number.parseInt(char, 16).toString(2).padStart(4, "0"))
    .join("")
    .slice(0, FINGERPRINT_BITS);
}

export function remittanceFingerprintDistance(left: unknown, right: unknown) {
  const first = hexToBinary(String(left ?? ""));
  const second = hexToBinary(String(right ?? ""));

  if (first.length !== FINGERPRINT_BITS || second.length !== FINGERPRINT_BITS) {
    return null;
  }

  let distance = 0;

  for (let index = 0; index < FINGERPRINT_BITS; index += 1) {
    if (first[index] !== second[index]) {
      distance += 1;
    }
  }

  return distance;
}

export function remittanceFingerprintSimilarity(left: unknown, right: unknown) {
  const distance = remittanceFingerprintDistance(left, right);

  return distance === null ? 0 : 1 - distance / FINGERPRINT_BITS;
}
