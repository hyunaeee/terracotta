import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const size = 32;
const scale = 6;
const outputDir = path.resolve("public/assets/garden");

function canvas() {
  return Buffer.alloc(size * size * 4);
}

function color(hex, alpha = 255) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function pixel(buffer, x, y, fill) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  buffer[offset] = fill[0];
  buffer[offset + 1] = fill[1];
  buffer[offset + 2] = fill[2];
  buffer[offset + 3] = fill[3];
}

function rect(buffer, x, y, width, height, fill) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) pixel(buffer, px, py, fill);
  }
}

function circle(buffer, cx, cy, radius, fill) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 0.5) pixel(buffer, x, y, fill);
    }
  }
}

function line(buffer, x0, y0, x1, y1, fill, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    rect(buffer, x0, y0, thickness, thickness, fill);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

const palette = {
  outline: color("#4b3528"),
  shadow: color("#000000", 42),
  soil: color("#7f4b32"),
  soilLight: color("#ad6842"),
  wood: color("#9a5d35"),
  woodLight: color("#d18a48"),
  leaf: color("#4e8d4f"),
  leafLight: color("#79b85c"),
  leafDark: color("#326b43"),
  stone: color("#8f9691"),
  stoneLight: color("#c4c8bf"),
  water: color("#5ca7c3"),
  waterLight: color("#a6d9d8"),
  pink: color("#e98da2"),
  yellow: color("#efc34f"),
  cream: color("#f6e5b7"),
  blue: color("#557fac"),
  red: color("#c85a42"),
  white: color("#eff2df"),
};

const sprites = {
  "vegetable-bed": (b) => {
    rect(b, 4, 23, 24, 3, palette.shadow);
    rect(b, 4, 11, 24, 14, palette.outline);
    rect(b, 6, 13, 20, 10, palette.soil);
    rect(b, 6, 13, 20, 2, palette.soilLight);
    for (const x of [9, 15, 21]) {
      rect(b, x, 15, 1, 6, palette.leafDark);
      rect(b, x - 2, 15, 2, 2, palette.leaf);
      rect(b, x + 1, 16, 2, 2, palette.leafLight);
      rect(b, x, 20, 2, 2, palette.yellow);
    }
  },
  "tomato-bed": (b) => {
    rect(b, 4, 23, 24, 3, palette.shadow);
    rect(b, 4, 10, 24, 15, palette.outline);
    rect(b, 6, 12, 20, 11, palette.soil);
    for (const x of [10, 16, 22]) {
      line(b, x, 12, x, 21, palette.leafDark);
      circle(b, x - 2, 14, 2, palette.leaf);
      circle(b, x + 2, 16, 2, palette.leafLight);
      circle(b, x - 1, 19, 1, palette.red);
    }
  },
  "herb-bed": (b) => {
    rect(b, 5, 22, 22, 4, palette.shadow);
    rect(b, 5, 13, 22, 11, palette.outline);
    rect(b, 7, 15, 18, 7, palette.soil);
    for (const x of [9, 12, 16, 20, 23]) {
      line(b, x, 16, x, 21, palette.leafDark);
      circle(b, x - 1, 16, 1, palette.leafLight);
      circle(b, x + 1, 18, 1, palette.leaf);
    }
  },
  greenhouse: (b) => {
    rect(b, 5, 25, 23, 2, palette.shadow);
    line(b, 6, 24, 6, 13, palette.outline, 2);
    line(b, 26, 24, 26, 13, palette.outline, 2);
    line(b, 6, 13, 15, 5, palette.outline, 2);
    line(b, 15, 5, 26, 13, palette.outline, 2);
    rect(b, 8, 14, 16, 9, color("#b8e1d0", 120));
    line(b, 16, 7, 16, 24, palette.white);
    line(b, 7, 15, 25, 15, palette.white);
    circle(b, 12, 21, 3, palette.leaf);
    circle(b, 21, 20, 3, palette.leafLight);
  },
  "watering-can": (b) => {
    rect(b, 8, 13, 14, 11, palette.outline);
    rect(b, 10, 15, 10, 7, palette.blue);
    rect(b, 20, 15, 7, 3, palette.outline);
    rect(b, 22, 14, 6, 2, palette.blue);
    rect(b, 26, 12, 3, 5, palette.outline);
    line(b, 10, 13, 12, 8, palette.outline, 2);
    line(b, 12, 8, 20, 10, palette.outline, 2);
    line(b, 20, 10, 21, 14, palette.outline, 2);
    rect(b, 11, 16, 2, 2, color("#82add0"));
  },
  scarecrow: (b) => {
    rect(b, 15, 11, 3, 16, palette.wood);
    rect(b, 7, 13, 19, 3, palette.outline);
    rect(b, 8, 14, 17, 2, palette.woodLight);
    circle(b, 16, 9, 5, palette.outline);
    circle(b, 16, 9, 4, palette.cream);
    pixel(b, 14, 8, palette.outline); pixel(b, 18, 8, palette.outline);
    rect(b, 11, 4, 11, 2, palette.outline); rect(b, 13, 2, 7, 3, palette.wood);
    rect(b, 11, 16, 11, 7, palette.red);
    line(b, 12, 23, 9, 28, palette.outline, 2); line(b, 21, 23, 24, 28, palette.outline, 2);
  },
  birdhouse: (b) => {
    rect(b, 15, 16, 3, 12, palette.wood);
    rect(b, 9, 9, 15, 12, palette.outline);
    rect(b, 11, 11, 11, 8, palette.red);
    line(b, 8, 10, 16, 4, palette.outline, 2); line(b, 16, 4, 25, 10, palette.outline, 2);
    circle(b, 16, 14, 2, palette.outline);
    rect(b, 14, 19, 5, 2, palette.woodLight);
  },
  stump: (b) => {
    rect(b, 7, 13, 18, 13, palette.shadow);
    rect(b, 8, 10, 16, 15, palette.outline);
    rect(b, 10, 12, 12, 11, palette.wood);
    circle(b, 16, 11, 8, palette.outline);
    circle(b, 16, 11, 6, palette.woodLight);
    circle(b, 16, 11, 3, palette.wood);
    rect(b, 9, 20, 4, 5, palette.outline); rect(b, 20, 19, 4, 6, palette.outline);
  },
  rocks: (b) => {
    rect(b, 5, 24, 23, 3, palette.shadow);
    circle(b, 10, 20, 6, palette.outline); circle(b, 10, 19, 5, palette.stone);
    circle(b, 20, 18, 8, palette.outline); circle(b, 20, 17, 7, palette.stone);
    circle(b, 25, 22, 4, palette.outline); circle(b, 25, 21, 3, palette.stoneLight);
    rect(b, 17, 12, 4, 2, palette.stoneLight);
  },
  hydrangea: (b) => {
    rect(b, 15, 17, 3, 11, palette.leafDark);
    circle(b, 11, 21, 5, palette.leaf); circle(b, 22, 21, 5, palette.leafLight);
    for (const [x, y] of [[10,10],[15,8],[20,10],[12,14],[18,14],[16,12]]) {
      circle(b, x, y, 4, palette.outline); circle(b, x, y, 3, color("#7898c5")); pixel(b, x, y, palette.white);
    }
  },
  sunflower: (b) => {
    rect(b, 15, 11, 3, 17, palette.leafDark);
    circle(b, 12, 19, 4, palette.leaf); circle(b, 21, 22, 4, palette.leafLight);
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      circle(b, 16 + Math.round(Math.cos(angle) * 5), 9 + Math.round(Math.sin(angle) * 5), 2, palette.yellow);
    }
    circle(b, 16, 9, 3, palette.outline); circle(b, 16, 9, 2, palette.wood);
  },
  wheelbarrow: (b) => {
    circle(b, 10, 24, 5, palette.outline); circle(b, 10, 24, 3, palette.stone);
    line(b, 12, 21, 27, 25, palette.outline, 2); line(b, 23, 22, 29, 19, palette.wood, 2);
    rect(b, 8, 12, 16, 9, palette.outline); rect(b, 10, 13, 12, 6, palette.red);
    line(b, 8, 12, 5, 9, palette.outline, 2);
    circle(b, 13, 11, 4, palette.leaf); circle(b, 19, 10, 5, palette.leafLight);
  },
  fountain: (b) => {
    rect(b, 6, 24, 21, 3, palette.shadow);
    rect(b, 7, 21, 19, 5, palette.outline); rect(b, 9, 22, 15, 2, palette.water);
    rect(b, 14, 10, 5, 12, palette.stone); rect(b, 13, 9, 7, 3, palette.outline);
    rect(b, 10, 7, 13, 3, palette.stoneLight); rect(b, 11, 6, 11, 2, palette.outline);
    line(b, 16, 7, 16, 2, palette.waterLight, 2);
    line(b, 13, 9, 9, 14, palette.water, 1); line(b, 20, 9, 24, 14, palette.water, 1);
  },
  cat: (b) => {
    circle(b, 16, 17, 8, palette.outline); circle(b, 16, 17, 7, color("#d09a61"));
    circle(b, 16, 9, 6, palette.outline); circle(b, 16, 9, 5, color("#d09a61"));
    rect(b, 11, 3, 4, 5, palette.outline); rect(b, 19, 3, 4, 5, palette.outline);
    pixel(b, 14, 9, palette.outline); pixel(b, 19, 9, palette.outline); pixel(b, 17, 12, palette.pink);
    line(b, 22, 18, 27, 12, palette.outline, 2); line(b, 27, 12, 29, 17, palette.outline, 2);
    rect(b, 11, 23, 4, 4, palette.outline); rect(b, 19, 23, 4, 4, palette.outline);
  },
  beehive: (b) => {
    rect(b, 15, 7, 3, 20, palette.wood);
    rect(b, 8, 6, 17, 3, palette.outline); rect(b, 10, 8, 13, 3, palette.woodLight);
    for (const [width, y] of [[15,11],[17,14],[19,17],[17,20],[13,23]]) {
      rect(b, 16 - Math.floor(width / 2), y, width, 4, palette.outline);
      rect(b, 17 - Math.floor(width / 2), y + 1, width - 2, 2, palette.yellow);
    }
    rect(b, 14, 19, 5, 3, palette.outline);
    circle(b, 5, 12, 2, palette.yellow); rect(b, 4, 10, 1, 2, palette.white); rect(b, 6, 10, 1, 2, palette.white);
  },
};

function grassSprite(base, light, dark, connected) {
  const b = canvas();
  rect(b, 0, 0, size, size, color(base));
  const noise = [[2,5],[7,3],[13,6],[22,4],[28,8],[5,16],[11,13],[18,17],[25,14],[3,26],[14,25],[23,28],[29,23]];
  for (const [x, y] of noise) {
    rect(b, x, y, 2, 1, color(light));
    pixel(b, x + 1, y + 2, color(dark));
  }
  if (!connected) {
    rect(b, 0, 0, size, 2, color(light, 115));
    rect(b, 0, 0, 2, size, color(light, 115));
    rect(b, 0, size - 2, size, 2, color(dark, 100));
    rect(b, size - 2, 0, 2, size, color(dark, 100));
  }
  return b;
}

async function writePixelAsset(name, buffer) {
  await sharp(buffer, { raw: { width: size, height: size, channels: 4 } })
    .resize(size * scale, size * scale, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(path.join(outputDir, `${name}.png`));
}

function flowerOverlay(points, colors) {
  const b = canvas();
  points.forEach(([x, y], index) => {
    circle(b, x, y, 2, color(colors[index % colors.length]));
    pixel(b, x, y, palette.cream);
  });
  return sharp(b, { raw: { width: size, height: size, channels: 4 } })
    .resize(size * scale, size * scale, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

async function makeTreeVariants() {
  const points = [
    [],
    [[16, 10], [13, 13]],
    [[11, 10], [16, 7], [21, 11], [14, 15]],
    [[7, 10], [12, 7], [17, 9], [22, 6], [25, 12], [10, 16], [18, 15], [23, 17]],
  ];
  const variants = [
    { id: "cherry", colors: ["#e98da2", "#ffd0da", "#f6a9b9"] },
    { id: "sunny", colors: ["#efc34f", "#f7e499", "#f0a956"] },
    { id: "lavender", colors: ["#9d79bd", "#d2b4e5", "#b18ed1"] },
  ];
  for (const variant of variants) {
    for (let stage = 0; stage < 4; stage += 1) {
      const source = path.resolve(`public/assets/terracotta-stage-${stage}.png`);
      const target = path.resolve(`public/assets/terracotta-${variant.id}-${stage}.png`);
      if (stage === 0) {
        await sharp(source).png().toFile(target);
      } else {
        const overlay = await flowerOverlay(points[stage], variant.colors);
        await sharp(source).composite([{ input: overlay }]).png().toFile(target);
      }
    }
  }
}

await mkdir(outputDir, { recursive: true });
for (const [name, draw] of Object.entries(sprites)) {
  const buffer = canvas();
  draw(buffer);
  await writePixelAsset(name, buffer);
}

const grasses = [
  ["grass-sage", "#90b65a", "#b0d172", "#628c42"],
  ["grass-clover", "#68a75c", "#8fc878", "#387844"],
  ["grass-mint", "#8ebd83", "#b6d6a1", "#5f9465"],
];
for (const [name, base, light, dark] of grasses) {
  await writePixelAsset(name, grassSprite(base, light, dark, false));
  await writePixelAsset(`${name}-connected`, grassSprite(base, light, dark, true));
}

await makeTreeVariants();
