/** Uploaded icons are stored small so a full tree fits in the browser and on Vercel. */
export const ICON_PX = 256;

/**
 * Opened from the file explorer. Drawn down to a square ICON_PX image
 * and returned as a data URL the icon field can store directly.
 */
export function fileToIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = ICON_PX;
      canvas.height = ICON_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("Could not read that image."));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_PX, ICON_PX);
      URL.revokeObjectURL(blobUrl);
      const webp = canvas.toDataURL("image/webp", 0.82);
      resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Could not read that image."));
    };
    img.src = blobUrl;
  });
}
