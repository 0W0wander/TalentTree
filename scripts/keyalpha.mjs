// One-off asset processor: keys the pure-black background of the generated
// ornament art into real alpha transparency so the ornaments float cleanly
// over the UI regardless of CSS stacking contexts.
import sharp from "sharp";
import { rename } from "node:fs/promises";

const FILES = [
  "public/assets/dragon-crest.png",
  "public/assets/gryphon.png",
];

// luminance thresholds for the alpha ramp (0..255)
const T0 = 8; // fully transparent at/below
const T1 = 52; // fully opaque at/above

function smooth(x) {
  return x * x * (3 - 2 * x);
}

for (const file of FILES) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.max(data[i], data[i + 1], data[i + 2]);
    let a;
    if (lum <= T0) a = 0;
    else if (lum >= T1) a = 255;
    else a = Math.round(smooth((lum - T0) / (T1 - T0)) * 255);
    data[i + 3] = a;
  }

  const tmp = file.replace(".png", "-tmp.png");
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(tmp);
  await rename(tmp, file);
  console.log(`keyed ${file} (${width}x${height})`);
}
