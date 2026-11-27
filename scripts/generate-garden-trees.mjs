import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// Trace the original four poses from the unmodified character sheet. The target
// frames share a ground line and also match the crop used in the home screen.
const assets = new URL("../public/assets/", import.meta.url);
const sheet = await sharp(fileURLToPath(new URL("terracotta-growth.png", assets)))
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const size = 128;
const frames = [
  { source: [170, 539, 117, 121], target: [50, 93, 28, 29], face: [59, 68, 108] },
  { source: [473, 377, 168, 283], target: [43, 54, 42, 68], face: [54, 72, 104] },
  { source: [794, 310, 270, 350], target: [31, 37, 66, 85], face: [56, 72, 103] },
  { source: [1188, 188, 460, 477], target: [8, 6, 112, 116], face: [53, 73, 98] },
];

const colors = {
  ink: "#573c32", dark: "#382b29", cheek: "#e08770", blush: "#f4af90",
  clayDeep: "#9f5340", clayShade: "#b7664b", clay: "#cd7b54",
  claySun: "#df956b", glaze: "#f2b890", gleam: "#fff3c9",
  leafEdge: "#325c43", pine: "#416e4c", fern: "#558253", green: "#67975a",
  sage: "#80ab62", pear: "#9bc36e", lime: "#b4d97b", young: "#cee394",
  berry: "#a25643", berrySun: "#dc885d", bark: "#b86c4b",
};
const palette = Object.fromEntries(Object.entries(colors).map(([name, hex]) => [
  name, Buffer.from(hex.slice(1), "hex"),
]));

function trace(stage) {
  const [sx, sy, sw, sh] = frames[stage].source;
  const [left, top, width, height] = frames[stage].target;
  const material = new Uint8Array(size * size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sampleX = sx + Math.floor((x + .5) * sw / width);
      const sampleY = sy + Math.floor((y + .5) * sh / height);
      const at = (sampleY * sheet.info.width + sampleX) * 3;
      const [r, g, b] = sheet.data.subarray(at, at + 3);
      const target = (top + y) * size + left + x;
      if (r > 185 && g > 185 && b > 158) continue;
      // 0 = background, 1 = outline, 2 = clay, 3/4/5 = foliage shade/sun/mid.
      if (g > r + 4 && g > 55) material[target] = g > 181 ? 4 : g < 124 ? 3 : 5;
      else material[target] = r > 116 && r > g + 23 ? 2 : 1;
    }
  }
  return material;
}

function put(buffer, x, y, color) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  buffer.set(color, i);
  buffer[i + 3] = 255;
}

// Small hand-pixelled motifs sit on the same grid as the source tracing.
function stamp(buffer, x, y, rows, inks, flip = false, clip) {
  for (const [dy, row] of rows.entries()) {
    for (const [dx, key] of [...row].entries()) {
      if (key === ".") continue;
      const px = x + (flip ? row.length - 1 - dx : dx), py = y + dy;
      if (!clip || clip(px, py)) put(buffer, px, py, inks[key]);
    }
  }
}

// Overlapping lobes have a lit ridge and a terraced underside. Coordinates are
// normalized to fit both the young and mature canopy without scaling pixels.
const lobes = [
  [49, 22, 29, 27], [23, 34, 20, 22], [72, 33, 25, 25],
  [11, 57, 21, 20], [40, 49, 24, 25], [62, 55, 22, 20],
  [86, 58, 19, 21], [25, 75, 22, 22], [48, 75, 22, 19],
  [72, 77, 20, 21], [90, 78, 16, 20],
];
const foliage = ["leafEdge", "pine", "fern", "green", "sage", "pear"].map(k => palette[k]);

function crownShade(x, y, frame, stage, shaded = false) {
  const [left, top, w] = frame.target;
  const u = (x - left) * 100 / w, v = (y - top) * 100 / (stage === 2 ? 63 : 86);
  let tone = 2;
  for (const [cx, cy, rx, ry] of lobes) {
    const dx = (u - cx) / rx, dy = (v - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    // A stepped scallop, deliberately wider than one pixel on large trees.
    const scallop = Math.floor((u + cy) / 7) % 3 * .07;
    const light = .52 - .28 * dx - .66 * dy + scallop;
    tone = light < .14 ? 1 : light < .35 ? 2 : light < .75 ? 3 : light < 1.04 ? 4 : 5;
  }
  return foliage[shaded ? Math.min(tone, 2) : tone];
}

function paintBase(material, stage) {
  const frame = frames[stage], [left, top, width] = frame.target;
  const [leftEye, rightEye, eyeY] = frame.face;
  const pixels = Buffer.alloc(size * size * 4);
  const green = (x, y) => material[y * size + x] >= 3;
  for (let y = top; y < 122; y++) {
    for (let x = left; x < left + width; x++) {
      const m = material[y * size + x];
      const sproutCrack = stage === 1 && y >= 87 && y < 98 && x >= 56 && x <= 64;
      if (!m && !sproutCrack) continue;
      let col = palette.ink;
      // Repaint the area around the original eyes before drawing the new face.
      const inFace = x >= leftEye - 3 && x <= rightEye + 3 && y >= eyeY - 3 && y <= eyeY + 8;
      const oldFruit = stage === 3 && y < 62 && m === 2;
      if (oldFruit) col = crownShade(x, y, frame, stage);
      else if (m === 2 || inFace || sproutCrack && !m) {
        const bodyHalf = [14, 21, 18, 25][stage];
        const side = (x - 64) / bodyHalf;
        const lower = Math.max(0, y - eyeY - 1) / 22;
        const value = side + .55 * lower;
        col = value > .91 ? palette.clayDeep : value > .64 ? palette.clayShade :
          value < -.46 && lower < .32 ? palette.claySun : palette.clay;
        if (m === 2 && !material[(y + 2) * size + x]) col = palette.clayShade;
        if (stage < 2) {
          const dx = (x - 64 + bodyHalf * .24) / bodyHalf;
          const dy = (y - eyeY + 6) / (stage === 0 ? 16 : 23);
          const ring = dx * dx + dy * dy;
          const glowX = (side + .49) / .62, glowY = (y - eyeY + 8) / (bodyHalf * .52);
          col = glowX * glowX + glowY * glowY < 1 ? palette.claySun : palette.clay;
          if (ring > .86 && (side > .12 || y > eyeY + 4)) col = ring > 1.18 ? palette.clayDeep : palette.clayShade;
        }
      } else if (m >= 3) {
        const edge = !material[y * size + x - 1] || !material[(y + 1) * size + x] ||
          !material[y * size + x + 1] || !material[(y - 1) * size + x];
        if (edge) col = palette.leafEdge;
        else if (stage < 2) col = m === 4 ? palette.lime : palette.green;
        else col = m === 4 ? palette.pear : crownShade(x, y, frame, stage, m === 3);
      }
      put(pixels, x, y, col);
    }
  }
  if (stage === 1) {
    const vein = { a: palette.young, b: palette.sage, c: palette.fern };
    const leaf = ["aa.............", "..aaa..........", "...baaa........", "..b...aaa......", "....b....aaa...", ".......b....aac", "..........b..cc"];
    stamp(pixels, 48, 57, leaf, vein, false, green);
    stamp(pixels, 65, 56, leaf, vein, true, green);
    stamp(pixels, 63, 69, [".a", ".a", "..", ".a", ".a"], vein, false, green);
    stamp(pixels, 66, 74, ["....cc", "..cabb", ".cabb.", "cbbc..", "cc...."], vein);
  }
  return pixels;
}

const leafMark = ["..aab", ".aabb", "aabcc", "bbcc.", "cc..."];
const leaves = [
  [], [],
  [[48, 50], [69, 46], [79, 55], [38, 66], [53, 61], [65, 70], [84, 69], [48, 77], [78, 80]],
  [[28, 31], [45, 23], [59, 15], [73, 24], [87, 29], [53, 38], [21, 52],
    [39, 51], [65, 49], [80, 43], [98, 43], [106, 58], [86, 65],
    [31, 69], [44, 61], [59, 61], [97, 75]],
];
const barkMarks = [
  [[53, 101]], [[50, 94], [73, 100]], [[55, 84], [69, 92], [50, 112]],
  [[48, 80], [57, 84], [73, 87], [47, 106], [70, 112], [80, 110]],
];

function surface(pixels, material, stage) {
  const green = (x, y) => material[y * size + x] >= 3;
  const clay = (x, y) => material[y * size + x] === 2;
  leaves[stage].forEach(([x,y], i) => {
    const inks = { a: i % 3 === 0 ? palette.lime : palette.pear, b: palette.sage, c: palette.fern };
    stamp(pixels, x, y, leafMark, inks, i % 3 === 0, green);
    if (i % 2 === 0) stamp(pixels, x + 5, y + 2, [".bb", "bba", "cc."], inks, false, green);
  });
  for (const [x,y] of barkMarks[stage]) {
    stamp(pixels, x, y, [".h...", "h..s.", "h...s", "...s.", "....."], {
      h: palette.claySun, s: palette.bark,
    }, false, clay);
  }
  const [lx, rx, y] = frames[stage].face;
  const small = stage === 0;
  const eye = small ? [".dd", "wdd", "ddd", ".bb"] : [".ddd.", "dwwdd", "dwddd", "ddddd", "dddbd", ".bbb."];
  const eyeColors = { d: palette.dark, b: palette.ink, w: palette.gleam };
  for (const x of [lx, rx]) stamp(pixels, x - (small ? 1 : 2), y, eye, eyeColors);
  const cheek = small ? ["hh", "ss"] : [".hhh.", "hsshs", ".sss."];
  const cheekColors = { h: palette.blush, s: palette.cheek };
  stamp(pixels, lx - (small ? 4 : 7), y + 4, cheek, cheekColors, false, clay);
  stamp(pixels, rx + 3, y + 4, cheek, cheekColors, true, clay);
  const mouth = small ? ["d.d", ".d."] : ["d...d", ".ddd."];
  stamp(pixels, Math.floor((lx + rx - mouth[0].length + 1) / 2), y + (small ? 4 : 6), mouth, { d: palette.ink });
  const glints = [[55, 99], [51, 94], [54, 88], [48, 89]];
  stamp(pixels, ...glints[stage], [".aaa", "aa..", "a..."], { a: palette.glaze }, false, clay);
}

// Each species grows a different flower shape: rounded cherry petals, pointed
// golden rays and alternating lavender florets, rather than recolored dots.
const species = {
  cherry: {
    motif: ["..bb.bb..", ".bhhbhhb.", ".bphhhhhb", "bbpphppb.", "bhhscpbhb", ".bhccphb.", ".bhppphb.", "..bb.bb.."],
    inks: ["#ad6874", "#f5b0b4", "#de8f9d", "#fff0d7", "#e4b66e"],
  },
  sunny: {
    motif: ["...bhb...", ".hbphpbh.", ".hpccppb.", "bhcssscph", "bhcssscpb", ".bpcccpb.", ".bhppphb.", "...bhb..."],
    inks: ["#bd873f", "#f7d975", "#e9ba4d", "#854f35", "#bd864b"],
  },
  lavender: {
    motif: ["....b..", "...bhp.", "...phb.", ".bpbb..", ".hhpbhb", "..bpphb", ".bhbb..", ".ppbbp.", "..bppb.", "...s...", "..sc..."],
    inks: ["#745d97", "#d3bce8", "#a98acb", "#426b4c", "#79965d"],
  },
};
const blooms = [
  [], [[66, 52], [74, 68]],
  [[47, 49], [66, 40], [78, 54], [41, 67], [66, 66], [80, 76]],
  [[30, 29], [52, 20], [72, 14], [86, 31], [23, 48], [43, 44],
    [61, 38], [78, 52], [101, 48], [36, 64], [58, 57], [89, 70], [109, 60]],
];

function blossom(pixels, variant, stage) {
  const { motif, inks } = species[variant];
  const colors = Object.fromEntries(["b", "h", "p", "s", "c"].map((k, i) => [k, Buffer.from(inks[i].slice(1), "hex")]));
  if (stage === 0) {
    stamp(pixels, 67, 97, [".bb", "bhp", ".bb"], colors);
    return;
  }
  blooms[stage].forEach(([x,y], i) => {
    const bud = variant === "lavender" ? [".b", "hp", "pb", ".s"] : [".bb.", "bhpb", ".bs."];
    if (stage === 1 && i === 1) {
      stamp(pixels, x - 5, y - 3, ["ss...", ".ss..", "..sss", "....s"], { s: palette.pine });
    }
    const shape = i % 4 === 1 ? bud : motif;
    stamp(pixels, x, y, shape, colors, i % 2 === 1);
  });
}

const fruit = [".ll...", "..lss.", ".shpps", "shhppb", "spppbb", ".sbbb."];
for (let stage = 0; stage < frames.length; stage++) {
  const material = trace(stage);
  const base = paintBase(material, stage);
  surface(base, material, stage);
  for (const variant of ["stage", ...Object.keys(species)]) {
    const pixels = Buffer.from(base);
    if (stage === 3 && variant === "stage") {
      const inks = { l: palette.pine, s: palette.berry, p: palette.berrySun, h: palette.glaze, b: palette.clayDeep };
      for (const [x,y] of [[32, 41], [61, 26], [92, 53]]) stamp(pixels, x, y, fruit, inks);
    }
    if (variant !== "stage") blossom(pixels, variant, stage);
    await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
      .resize(256, 256, { kernel: sharp.kernel.nearest }).png({ palette: true, dither: 0 })
      .toFile(fileURLToPath(new URL(`terracotta-${variant}-${stage}.png`, assets)));
  }
}
const favicon = await sharp(fileURLToPath(new URL("terracotta-stage-1.png", assets)))
  .extract({ left: 57, top: 101, width: 144, height: 144 }).png().toBuffer();
await writeFile(new URL("../favicon.svg", assets),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144"><image width="144" height="144" style="image-rendering:pixelated" href="data:image/png;base64,${favicon.toString("base64")}"/></svg>\n`);
