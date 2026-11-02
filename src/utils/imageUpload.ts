/**
 * Client-side image processing. Images are resized and compressed in the browser and
 * stored as data URLs in Firestore documents, so every byte counts: a Firestore document
 * is limited to 1 MiB.
 */

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

let webpSupported: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpSupported === null) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpSupported = false;
    }
  }
  return webpSupported;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read. Try a JPG or PNG.'));
    };
    img.src = url;
  });
}

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/**
 * Resizes an image to fit within maxWidth × maxHeight and returns a compressed data URL
 * (WebP where the browser supports encoding it, JPEG otherwise).
 */
export async function resizeAndConvertImage(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.78,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is too large (max 25 MB).');

  const img = await loadImage(file);
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  // JPEG has no transparency: paint a white background so transparent logos stay clean.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  return canEncodeWebp() ? canvas.toDataURL('image/webp', quality) : canvas.toDataURL('image/jpeg', quality);
}

/** Preset sizes for each kind of image, tuned to stay small on mobile data. */
export const IMAGE_PRESETS = {
  logo: { maxWidth: 320, maxHeight: 320, quality: 0.85 },
  banner: { maxWidth: 1400, maxHeight: 800, quality: 0.72 },
  marquee: { maxWidth: 480, maxHeight: 180, quality: 0.8 },
  gallery: { maxWidth: 1000, maxHeight: 750, quality: 0.72 },
  item: { maxWidth: 720, maxHeight: 720, quality: 0.75 },
  category: { maxWidth: 480, maxHeight: 480, quality: 0.75 },
  proof: { maxWidth: 900, maxHeight: 900, quality: 0.7 },
} satisfies Record<string, Required<ResizeOptions>>;

export function resizeWithPreset(file: File, preset: keyof typeof IMAGE_PRESETS) {
  const p = IMAGE_PRESETS[preset];
  return resizeAndConvertImage(file, p.maxWidth, p.maxHeight, p.quality);
}

/** Approximate size in bytes of a document once stored (UTF-8 JSON). */
export function estimateDocBytes(value: unknown): number {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

/** Firestore's hard limit is 1,048,576 bytes; keep headroom for field names / metadata. */
export const DOC_BUDGET_BYTES = 950 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
