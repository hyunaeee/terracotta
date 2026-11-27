import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const side = 64;
const exportSize = 192;
const destination = new URL("../public/assets/garden/", import.meta.url);
const shape = (rows) => rows.trim().split("\n").map((row) => row.trim());

// Broad, low-contrast patches leave room for the pot and garden furnishings.
const bedding = shape(`
  .......mmm...........
  ....mmmmmmmmm........
  ..mmmmmmmmmmmmmm.....
  mmmmmmmmmmmmmmmmmmm..
  ..mmmmmmmmmmmmmmmmmmm
  .....mmmmmmmmmmm.....
  .......mmmmmm........
`);
const dryPatch = shape(`
  .....tttttt.........
  ..ttttttttttttt.....
  ttttttttttttttttt...
  ...ttttttttttttttttt
  ......ttttttttt.....
`);
const littleClod = shape(`
  ..llll..
  .lggggl.
  .gggggd.
  ..ddddss
`);
const packedEarth = shape(`
  ....lllll.....
  ..lgggggggl...
  .lgggggggggd..
  ggggggggggddds
  ..gdddddddsss.
`);
const fissure = shape(`
  dd..........
  ..ddd.......
  ....tddd....
  .......tdd..
  .........tdd
`);
const soilScratch = shape(`
  ....ttt..
  .ttt...mm
  ....mmm..
`);

const blades = shape(`
  .....l....
  .....lg..l
  ..l..lg.ll
  ..lg.gd.lg
  ...lgdg.g.
  .l..gdgg..
  ..lgdgd...
  ...ssds...
`);
const bentBlade = shape(`
  .l......
  .lg....l
  ..gg..lg
  ...gdgg.
  ..ssds..
`);
const smallGrass = shape(`
  l...l
  .g.l.
  .sds.
`);
const clover = shape(`
  .....ll.ll.....
  ....lhlglgl....
  ....lglgggg....
  .....ggdgg.....
  .ll....dd...ll.
  lhlgg..dd..lhgl
  lgglg.dgg.lgggg
  .ggdggddgggggd.
  .lggdd.d.ddggl.
  ..ggg..d..ggg..
  ......vd.......
  .....vd........
`);
const heartLeaf = shape(`
  .ll.ll..
  lhglgll.
  lglgggg.
  .ggdgg..
  ..gdg...
  ....v...
`);
const mint = shape(`
  ..........l....
  ........llll...
  .......lhlgg...
  ......llgllgg..
  .....llggllgd..
  ..l...lgglgd...
  .lll..gglddd...
  .lhll..ldd.....
  lglggg.v.......
  .gglggvv.......
  .lgglvd........
  ...ggvd........
  .....v.........
`);
const mintTip = shape(`
  .....ll.
  ....lhgl
  ...llgg.
  ..llgdd.
  .lgldd..
  ..vd....
  .v......
`);

// Background values m/t stay close to b. Deeper values describe individual
// leaf undersides or the contact shadow at the foot of a clod.
const palettes = {
  soil:   { b: "b88362", m: "b27d5e", t: "bd8967", s: "a87556", d: "a06e50", g: "b57e59", l: "ca9872", h: "d6b28b" },
  sage:   { b: "9dbd78", m: "96b573", t: "a4c37e", s: "8daf6c", d: "6a925b", v: "769c61", g: "88ae64", l: "bbd88b", h: "cce49a" },
  clover: { b: "88b47c", m: "81ad77", t: "8fbb81", s: "79a472", d: "5f885f", v: "699262", g: "78a568", l: "aaca86", h: "c1db99" },
  mint:   { b: "a4c7a0", m: "9cc099", t: "a9cda5", s: "91b693", d: "6b967d", v: "709881", g: "81ab87", l: "b9d8a6", h: "cde6b8" },
};

function paintTile(palette) {
  const colors = Object.fromEntries(Object.entries(palette).map(([key, hex]) => [key, Buffer.from(hex, "hex")]));
  const pixels = Buffer.alloc(side * side * 3, colors.b);
  // Drawing past any edge continues on the opposite edge of the same tile.
  function dot(x, y, key) {
    const offset = (((y + side) % side) * side + (x + side) % side) * 3;
    colors[key].copy(pixels, offset);
  }
  function stamp(pattern, x, y, mirror = false) {
    const width = pattern[0].length;
    pattern.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        if (row[dx] !== ".") dot(x + (mirror ? width - 1 - dx : dx), y + dy, row[dx]);
      }
    });
  }
  return { pixels, dot, stamp };
}

function bed(tile) {
  for (const [x, y] of [[-9, -3], [21, 5], [50, 18], [7, 29], [29, 44], [-7, 50]]) tile.stamp(bedding, x, y);
  for (const [x, y] of [[10, 14], [38, -3], [-9, 35], [18, 54], [35, 31]]) tile.stamp(dryPatch, x, y);
}

function earth(tile) {
  bed(tile);
  tile.stamp(packedEarth, 2, 8);
  tile.stamp(packedEarth, 33, 44, true);
  for (const [x, y] of [[24, 28], [47, 17], [61, 53], [12, 42]]) tile.stamp(littleClod, x, y);
  tile.stamp(fissure, 25, 7);
  tile.stamp(fissure, 54, 31, true);
  for (const [x, y] of [[17, 56], [13, 24], [43, 5], [28, 37], [3, 32], [54, 49]]) tile.stamp(soilScratch, x, y);
  const grit = shape(`
    .hl.
    lgds
  `);
  for (const [x, y] of [[5, 45], [39, 24], [53, 58]]) tile.stamp(grit, x, y);
  for (const [x, y] of [[8, 2], [29, 18], [19, 38], [44, 60], [51, 9], [57, 42]]) {
    tile.dot(x, y, "l");
    tile.dot(x + 1, y + 1, "s");
  }
}

function meadow(tile, species) {
  bed(tile);
  const detail = {
    sage: [blades, bentBlade],
    clover: [clover, heartLeaf],
    mint: [mint, mintTip],
  };
  const [plant, shoot] = detail[species];
  tile.stamp(plant, 3, 4);
  tile.stamp(plant, 40, 24, true);
  tile.stamp(plant, 16, 50);
  tile.stamp(shoot, 31, 10, true);
  tile.stamp(shoot, 10, 31);
  tile.stamp(shoot, 54, 48, true);
  for (const [x, y] of [[50, 2], [23, 24], [60, 16], [35, 44], [-2, 52]]) tile.stamp(smallGrass, x, y);
}

// An unjoined sod tile has a thin cut lip. The connected form is the exact
// same meadow with this last pass omitted, so planting feels continuous.
function cutEdge(tile) {
  for (let i = 0; i < side; i++) {
    tile.dot(i, 0, "t");
    tile.dot(0, i, "t");
    tile.dot(i, side - 1, "v");
    tile.dot(side - 1, i, "s");
  }
  for (const x of [2, 3, 13, 14, 26, 38, 39, 56]) tile.dot(x, 1, "l");
  for (const x of [5, 6, 19, 30, 31, 44, 53, 54, 61]) tile.dot(x, side - 2, "s");
}

async function write(name, tile) {
  await sharp(tile.pixels, { raw: { width: side, height: side, channels: 3 } })
    .resize(exportSize, exportSize, { kernel: sharp.kernel.nearest })
    .png({ palette: true, dither: 0 })
    .toFile(fileURLToPath(new URL(name + ".png", destination)));
}

await mkdir(destination, { recursive: true });
const soil = paintTile(palettes.soil);
earth(soil);
await write("soil", soil);
for (const species of ["sage", "clover", "mint"]) {
  const lawn = paintTile(palettes[species]);
  meadow(lawn, species);
  await write(`grass-${species}-connected`, lawn);
  cutEdge(lawn);
  await write(`grass-${species}`, lawn);
  if (species === "sage") await write("grass", lawn);
}
