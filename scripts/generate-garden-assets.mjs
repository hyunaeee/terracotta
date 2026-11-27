import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const size = 64;
const outputDir = resolve("public/assets/garden");
const colors = {
  ink: "#45392e", bark: "#704837", wood: "#a6673f", oak: "#c48b55", honey: "#e5b873",
  soil: "#83553d", furrow: "#624333", earth: "#a4764c", clay: "#b75f40", apricot: "#df8a57",
  pine: "#355a40", leaf: "#54804b", grass: "#79a455", lime: "#a9c86a", sprout: "#d5dc92",
  slate: "#556b70", stone: "#80918c", sage: "#a6b2a0", ivory: "#d6d7b8",
  deep: "#426b7d", teal: "#6296a1", water: "#83bac2", ice: "#d2e8d5",
  wine: "#954d47", coral: "#d97971", petal: "#f0aa94", gold: "#daa046", sun: "#f1c95f",
  cream: "#f7e6b3", violet: "#766b95", lilac: "#b6a6cf", blue: "#849dc1",
  shade: "#423b3136",
};

function points(list) {
  return list.split(" ").map((pair) => pair.split(",").map(Number));
}

function rgba(hex) {
  const digits = hex.slice(1);
  const bytes = digits.match(/../g).map((pair) => Number.parseInt(pair, 16));
  if (bytes.length === 3) bytes.push(255);
  return bytes;
}

const palette = Object.fromEntries(Object.entries(colors).map(([key, hex]) => [key, rgba(hex)]));

// Coordinates are native art pixels; outlines and highlights stay on the same grid.
class Sprite {
  pixels = Buffer.alloc(size * size * 4);

  dot(x, y, color) {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      this.pixels.set(palette[color], 4 * (y * size + x));
    }
  }

  rect(x, y, width, height, color) {
    for (let v = y; v < y + height; v++) {
      for (let u = x; u < x + width; u++) this.dot(u, v, color);
    }
  }

  line(x0, y0, x1, y1, color) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    if (!steps) {
      this.dot(x0, y0, color);
      return;
    }
    for (let i = 0; i <= steps; i++) {
      this.dot(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), color);
    }
  }

  stroke(list, color) {
    const vertices = points(list);
    for (let i = 1; i < vertices.length; i++) this.line(...vertices[i - 1], ...vertices[i], color);
  }

  polygon(list, fill, edge) {
    const vertices = points(list);
    const ys = vertices.map(([, y]) => y);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
      const crossings = [];
      for (let i = 0; i < vertices.length; i++) {
        const [ax, ay] = vertices[i];
        const [bx, by] = vertices[(i + 1) % vertices.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) crossings.push(ax + (bx - ax) * (y - ay) / (by - ay));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 1; i < crossings.length; i += 2) {
        this.line(Math.ceil(crossings[i - 1]), y, Math.floor(crossings[i]), y, fill);
      }
    }
    this.stroke(list + " " + list.split(" ")[0], edge ?? fill);
  }

  oval(cx, cy, rx, ry, color) {
    for (let y = -ry; y <= ry; y++) {
      const extent = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      this.rect(cx - extent, cy + y, 2 * extent + 1, 1, color);
    }
  }
}

function leaf(s, x, y, dx, dy, width = 3) {
  const length = Math.hypot(dx, dy);
  const midX = x + dx * 0.55, midY = y + dy * 0.55;
  const wingX = -dy * width / length, wingY = dx * width / length;
  const verts = [[x, y], [midX + wingX, midY + wingY], [x + dx, y + dy], [midX - wingX, midY - wingY]];
  s.polygon(verts.map(([u, v]) => Math.round(u) + "," + Math.round(v)).join(" "), "grass", "pine");
  s.line(x, y, Math.round(x + dx * 0.73), Math.round(y + dy * 0.73), "lime");
}

function floret(s, x, y, dark, light, center = "cream") {
  s.rect(x - 1, y - 3, 3, 7, dark);
  s.rect(x - 3, y - 1, 7, 3, dark);
  s.rect(x - 2, y - 1, 2, 2, light);
  s.rect(x, y - 2, 2, 2, light);
  s.dot(x, y, center);
}

function bed(s) {
  s.oval(33, 49, 25, 4, "shade");
  s.polygon("6,28 48,22 57,30 57,45 13,52 6,45", "bark", "ink");
  s.polygon("7,29 48,23 55,29 13,36", "oak", "bark");
  s.polygon("10,29 47,24 52,29 14,34", "soil", "furrow");
  s.polygon("8,32 13,37 13,49 8,44", "wood", "bark");
  s.polygon("14,37 55,31 55,44 14,50", "wood", "bark");
  s.stroke("14,38 54,32", "honey");
  s.stroke("17,43 34,40 40,40 50,38", "oak");
  s.stroke("35,46 50,43", "bark");
  for (const [x, y] of [[16, 40], [16, 47], [52, 35], [52, 42]]) s.dot(x, y, "ink");
}

function seedling(s, x, y, width) {
  s.line(x, y, x, y - 10, "pine");
  leaf(s, x, y - 2, -width, -6, 3);
  leaf(s, x, y - 5, width - 1, -7, 3);
  s.rect(x, y - 11, 2, 3, "lime");
}

function plankPost(s, x, y, w, h) {
  s.rect(x, y, w, h, "bark");
  s.rect(x + 1, y, w - 2, h - 1, "wood");
  s.rect(x + 1, y + 1, 1, h - 3, "oak");
}

const sprites = {
  "vegetable-bed"(s) {
    bed(s);
    for (const [x, y] of [[16, 31], [31, 29], [45, 27]]) {
      s.oval(x, y, 4, 2, "furrow");
      s.polygon(`${x - 3},${y - 4} ${x + 3},${y - 5} ${x + 4},${y - 2} ${x},${y + 3} ${x - 3},${y + 1}`, "apricot", "clay");
      seedling(s, x, y - 4, 7);
    }
  },
  "tomato-bed"(s) {
    bed(s);
    for (const [x, y] of [[17, 30], [32, 28], [45, 26]]) {
      s.rect(x, y - 17, 2, 18, "oak");
      s.stroke(`${x - 3},${y} ${x + 1},${y - 7} ${x - 2},${y - 14}`, "pine");
      leaf(s, x, y - 8, -6, -4, 2);
      leaf(s, x, y - 12, 5, -4, 2);
      for (const [u, v] of [[x - 3, y - 5], [x + 3, y - 8]]) {
        s.oval(u, v, 3, 3, "wine");
        s.oval(u, v - 1, 2, 2, "clay");
        s.dot(u - 1, v - 2, "petal");
        s.rect(u, v - 3, 2, 1, "pine");
      }
    }
  },
  "herb-bed"(s) {
    bed(s);
    for (const [x, y, lean] of [[14, 31, -2], [22, 30, 1], [30, 28, -2], [39, 27, 2], [47, 26, 0]]) {
      s.line(x, y, x + lean, y - 14, "pine");
      for (const [height, side] of [[4, -1], [7, 1], [10, -1]]) leaf(s, x, y - height, 5 * side, -4, 2);
      s.rect(x + lean - 1, y - 16, 3, 3, "violet");
      s.dot(x + lean, y - 16, "lilac");
    }
  },
  greenhouse(s) {
    s.oval(34, 51, 26, 4, "shade");
    s.polygon("10,25 30,8 53,18 55,26 55,47 33,52 10,47", "teal", "ink");
    s.polygon("12,25 30,10 36,27 13,31", "water", "slate");
    s.polygon("30,10 51,18 54,25 37,28", "sage", "slate");
    s.polygon("12,31 35,29 35,48 12,45", "water", "slate");
    s.polygon("37,29 53,26 53,45 37,49", "teal", "slate");
    s.stroke("16,26 23,19 25,19", "ice");
    s.stroke("39,21 41,19 44,20", "ice");
    s.stroke("16,34 20,30", "ice");
    s.stroke("44,33 49,27", "ice");
    for (const [x, y] of [[16, 43], [24, 44], [43, 44], [49, 42]]) {
      s.rect(x - 2, y - 3, 5, 5, "clay");
      s.rect(x - 3, y - 4, 6, 2, "oak");
      leaf(s, x, y - 4, -3, -4, 1);
      leaf(s, x, y - 5, 3, -4, 1);
    }
    s.polygon("25,31 33,30 33,48 25,47", "teal", "bark");
    s.dot(31, 40, "cream");
    s.stroke("11,29 35,27 54,24", "honey");
    s.stroke("13,45 34,49 54,45", "wood");
    s.stroke("29,11 34,26 34,48", "ivory");
    s.stroke("42,16 46,26 46,44", "sage");
    s.stroke("11,26 29,10 51,19", "oak");
    s.stroke("11,31 11,45", "ivory");
  },
  "watering-can"(s) {
    s.oval(32, 48, 20, 3, "shade");
    s.polygon("18,28 17,22 21,17 30,16 37,18 40,25 37,27 34,21 29,19 23,20 21,23 22,28", "teal", "slate");
    s.stroke("19,22 22,18 29,17", "ice");
    s.polygon("39,33 50,29 53,24 58,27 54,32 40,42", "teal", "ink");
    s.stroke("41,34 51,30 54,26", "ice");
    s.polygon("16,28 22,25 37,25 43,29 41,44 36,48 20,47 16,43", "deep", "ink");
    s.polygon("18,30 23,28 36,28 40,30 38,43 33,45 21,44 18,42", "teal");
    s.oval(29, 28, 12, 3, "slate");
    s.oval(29, 27, 10, 2, "water");
    s.oval(29, 27, 7, 1, "deep");
    s.stroke("20,31 20,38 22,40", "water");
    s.line(23, 43, 34, 44, "water");
    s.oval(55, 25, 4, 3, "slate");
    s.oval(54, 24, 3, 2, "sage");
    s.dot(53, 24, "deep");
    s.dot(55, 23, "deep");
    s.dot(55, 25, "deep");
    s.polygon("27,34 30,32 33,34 30,37", "water");
  },
  scarecrow(s) {
    s.oval(33, 54, 17, 3, "shade");
    plankPost(s, 30, 26, 5, 31);
    s.stroke("26,42 22,49 18,54", "bark");
    s.stroke("38,43 43,48 48,53", "bark");
    s.polygon("16,27 26,25 38,25 47,27 52,28 50,32 39,31 43,45 37,43 33,46 28,43 22,45 25,32 15,33", "clay", "ink");
    s.stroke("16,28 24,27 27,28", "apricot");
    s.stroke("36,27 40,29 49,30", "wine");
    s.rect(33, 32, 6, 6, "blue");
    s.stroke("34,33 37,33 37,36", "ice");
    for (const [x, y] of [[25, 39], [29, 40], [37, 41], [13, 30], [51, 30]]) s.stroke(`${x},${y} ${x + 2},${y + 4}`, "honey");
    s.oval(32, 19, 9, 9, "bark");
    s.oval(32, 19, 8, 8, "honey");
    s.oval(30, 17, 6, 6, "cream");
    s.rect(28, 17, 2, 3, "ink");
    s.rect(35, 17, 2, 3, "ink");
    s.dot(32, 21, "clay");
    s.stroke("29,23 31,24 34,24 36,22", "bark");
    s.dot(35, 24, "bark");
    s.polygon("19,12 24,10 25,5 28,4 38,4 40,9 45,12 43,14 21,15", "oak", "ink");
    s.rect(26, 8, 13, 3, "clay");
    s.stroke("21,12 26,11 38,11 43,12", "honey");
    s.polygon("28,26 35,26 38,27 33,31", "teal", "deep");
  },
  birdhouse(s) {
    s.oval(34, 54, 11, 2, "shade");
    plankPost(s, 31, 36, 6, 18);
    s.polygon("17,21 31,10 46,19 46,38 31,43 18,38", "wood", "ink");
    s.polygon("18,22 32,12 37,21 37,39 18,36", "clay", "bark");
    s.polygon("38,21 45,19 45,36 38,39", "oak", "bark");
    s.stroke("19,28 36,30", "wine");
    s.stroke("20,33 34,35", "wine");
    s.polygon("14,22 30,8 33,8 49,18 46,22 33,14 18,25", "wood", "ink");
    s.stroke("15,21 31,9 47,18", "honey");
    s.stroke("34,11 44,18", "oak");
    s.oval(28, 25, 5, 5, "apricot");
    s.oval(28, 25, 4, 4, "ink");
    s.rect(25, 34, 9, 2, "bark");
    s.rect(24, 33, 8, 2, "honey");
    s.dot(20, 26, "cream");
    s.dot(43, 31, "bark");
  },
  stump(s) {
    s.oval(34, 49, 21, 3, "shade");
    s.polygon("16,23 45,20 45,40 51,47 43,49 37,45 27,49 18,51 13,47 19,40", "wood", "ink");
    s.polygon("36,25 45,21 44,40 48,46 44,47 40,41 37,45", "bark");
    s.stroke("20,29 22,35 21,42 17,47", "oak");
    s.stroke("26,30 27,36 26,42", "bark");
    s.stroke("31,31 33,36 32,44", "oak");
    s.oval(31, 23, 16, 10, "ink");
    s.oval(31, 22, 15, 9, "oak");
    s.oval(31, 22, 12, 7, "honey");
    s.oval(31, 22, 9, 5, "wood");
    s.oval(31, 22, 7, 4, "honey");
    s.oval(31, 22, 4, 2, "oak");
    s.rect(30, 21, 3, 1, "wood");
    s.stroke("16,20 20,17 26,15", "cream");
    s.stroke("44,25 39,25 36,23", "bark");
    leaf(s, 41, 44, 5, -4, 2);
    s.rect(19, 45, 3, 1, "grass");
  },
  rocks(s) {
    s.oval(33, 49, 24, 3, "shade");
    function boulder(x, y, r) {
      const pts = [[-r, 0], [-r + 2, -r + 3], [-2, -r], [r - 4, -r + 1], [r, -4], [r, 2], [r - 4, 5], [-r + 4, 6]];
      const vertices = pts.map(([u, v]) => (x + u) + "," + (y + v)).join(" ");
      s.polygon(vertices, "stone", "ink");
      s.stroke(`${x - r + 2},${y - 3} ${x - r + 4},${y - r + 4} ${x - 2},${y - r + 2} ${x + 2},${y - r + 2}`, "ivory");
      s.polygon(`${x + r - 4},${y - r + 3} ${x + r - 1},${y - 3} ${x + r - 1},${y + 2} ${x + r - 4},${y + 4} ${x - 2},${y + 5} ${x + 3},${y + 1}`, "slate");
      s.line(x - 3, y - 1, x - 1, y - 3, "sage");
    }
    boulder(37, 35, 13);
    boulder(20, 41, 10);
    boulder(48, 45, 7);
    s.stroke("27,45 30,43 33,43", "leaf");
    s.dot(30, 42, "lime");
  },
  hydrangea(s) {
    s.oval(33, 53, 12, 2, "shade");
    s.rect(31, 27, 3, 27, "pine");
    leaf(s, 32, 46, -16, -10, 5);
    leaf(s, 33, 43, 15, -12, 5);
    leaf(s, 32, 50, 10, -5, 3);
    s.oval(33, 25, 14, 11, "violet");
    s.oval(23, 23, 9, 9, "violet");
    s.oval(39, 20, 8, 8, "violet");
    for (const [x, y] of [[20, 20], [28, 16], [35, 15], [41, 18], [24, 25], [32, 22], [39, 26], [29, 30], [18, 25], [34, 31]]) {
      floret(s, x, y, "blue", "lilac", "ivory");
    }
  },
  sunflower(s) {
    s.oval(33, 54, 10, 2, "shade");
    s.stroke("32,54 34,43 32,26", "pine");
    s.stroke("34,53 36,42 34,27", "leaf");
    leaf(s, 34, 44, -14, -10, 4);
    leaf(s, 34, 39, 13, -9, 4);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const x = 32 + Math.round(Math.cos(angle) * 11), y = 19 + Math.round(Math.sin(angle) * 11);
      s.oval(x, y, Math.abs(Math.cos(angle)) > 0.7 ? 5 : 3, Math.abs(Math.sin(angle)) > 0.7 ? 5 : 3, "gold");
      s.oval(x - 1, y - 1, 3, 3, "sun");
      s.dot(x - 2, y - 2, "cream");
    }
    s.oval(32, 19, 8, 8, "bark");
    s.oval(31, 18, 6, 6, "wood");
    for (const [x, y] of [[28, 16], [31, 14], [35, 17], [29, 19], [33, 21], [31, 23], [35, 20]]) s.rect(x, y, 2, 1, "honey");
  },
  wheelbarrow(s) {
    s.oval(32, 52, 23, 3, "shade");
    s.oval(19, 46, 10, 10, "ink");
    s.oval(19, 46, 8, 8, "slate");
    s.oval(19, 46, 5, 5, "sage");
    s.stroke("15,42 23,50", "slate");
    s.stroke("15,50 23,42", "slate");
    s.rect(18, 45, 3, 3, "honey");
    s.polygon("19,42 46,39 55,35 57,37 47,43 22,46", "oak", "bark");
    s.stroke("40,42 46,51 50,50", "bark");
    s.stroke("41,42 47,49", "oak");
    s.polygon("12,25 47,22 50,27 42,39 22,43 17,39", "clay", "ink");
    s.polygon("36,26 48,25 40,38 35,39", "wine");
    s.stroke("19,34 22,39 33,37", "apricot");
    s.dot(22, 36, "cream");
    for (const [x, y] of [[20, 25], [28, 24], [36, 22], [43, 22]]) {
      leaf(s, x, y, -5, -6, 2);
      leaf(s, x, y, 3, -7, 3);
      floret(s, x - 1, y - 7, "coral", "petal");
    }
    s.stroke("12,25 22,29 48,24", "bark");
    s.stroke("14,25 22,27 47,23", "honey");
  },
  fountain(s) {
    s.oval(33, 52, 22, 3, "shade");
    s.oval(32, 47, 23, 7, "ink");
    s.oval(32, 46, 22, 6, "stone");
    s.oval(32, 45, 20, 4, "ivory");
    s.oval(32, 45, 17, 3, "teal");
    s.oval(32, 44, 14, 2, "water");
    s.oval(32, 44, 7, 2, "slate");
    s.polygon("29,24 36,24 35,38 39,41 39,43 26,43 26,41 30,38", "stone", "slate");
    s.line(31, 27, 31, 39, "ivory");
    s.stroke("28,42 32,40 36,42", "sage");
    s.oval(32, 23, 13, 5, "slate");
    s.oval(32, 21, 14, 4, "ivory");
    s.oval(32, 21, 11, 2, "teal");
    s.stroke("26,22 23,23 20,26 18,30 18,37", "teal");
    s.stroke("38,22 41,25 44,29 45,36", "teal");
    s.stroke("25,22 22,24 19,29 19,32", "ice");
    s.stroke("39,23 42,27 44,33", "water");
    s.stroke("31,21 31,12 33,6 35,5", "water");
    s.stroke("32,20 33,12 34,9", "ice");
    s.rect(17, 39, 2, 3, "water");
    s.rect(45, 38, 2, 3, "ice");
    s.rect(14, 44, 5, 1, "ice");
    s.rect(41, 45, 4, 1, "ice");
  },
  cat(s) {
    s.oval(34, 51, 17, 3, "shade");
    s.stroke("43,43 48,40 50,33 53,28 56,28 58,30 58,34", "ink");
    s.stroke("43,45 49,42 52,36 53,30 56,29 57,31", "bark");
    s.stroke("45,43 49,39 51,33 53,29", "oak");
    s.polygon("19,29 24,25 36,25 42,30 45,39 43,48 38,50 23,50 17,46 15,39", "oak", "ink");
    s.oval(31, 38, 7, 9, "honey");
    s.stroke("18,34 22,36 19,37", "wood");
    s.stroke("43,35 39,37 42,38", "wood");
    s.polygon("20,17 20,6 23,6 29,11 35,11 41,6 44,6 44,18 43,26 38,30 27,31 21,28 18,23", "oak", "ink");
    s.polygon("22,9 27,13 22,15", "petal");
    s.polygon("37,13 42,9 42,15", "petal");
    s.stroke("29,13 30,17 31,14", "wood");
    s.stroke("34,13 33,17", "wood");
    s.oval(28, 23, 5, 4, "honey");
    s.oval(36, 23, 5, 4, "honey");
    s.rect(26, 19, 3, 3, "ink");
    s.rect(36, 19, 3, 3, "ink");
    s.dot(26, 19, "cream");
    s.dot(36, 19, "cream");
    s.rect(31, 23, 3, 2, "wine");
    s.dot(32, 25, "bark");
    s.stroke("30,26 31,26 32,25 33,26 34,26", "bark");
    s.line(22, 22, 16, 21, "bark");
    s.line(23, 24, 15, 25, "bark");
    s.line(40, 23, 47, 21, "bark");
    s.line(40, 25, 47, 26, "bark");
    for (const x of [22, 34]) {
      s.oval(x + 3, 49, 5, 3, "bark");
      s.oval(x + 3, 48, 4, 2, "honey");
      s.dot(x + 4, 49, "oak");
    }
  },
  beehive(s) {
    s.oval(34, 51, 17, 3, "shade");
    plankPost(s, 30, 42, 7, 12);
    s.polygon("17,23 22,16 26,13 38,13 44,17 48,23 51,35 50,43 44,47 22,47 16,42 14,34", "gold", "bark");
    for (const [x, y, w] of [[23, 16, 18], [20, 21, 25], [17, 27, 32], [16, 33, 34], [17, 39, 32]]) {
      s.rect(x, y, w, 2, "honey");
      s.rect(x + 1, y, w - 4, 1, "cream");
      s.rect(x + 2, y + 3, w - 2, 1, "wood");
      for (let u = x + 4; u < x + w - 2; u += 7) s.dot(u, y + 2, "sun");
    }
    s.oval(34, 38, 5, 4, "bark");
    s.rect(30, 39, 9, 4, "ink");
    s.rect(27, 42, 15, 2, "oak");
    s.rect(26, 42, 14, 1, "honey");
    for (const [x, y] of [[10, 24], [51, 17]]) {
      s.oval(x - 1, y - 3, 2, 2, "ice");
      s.oval(x + 2, y - 3, 2, 2, "water");
      s.oval(x, y, 4, 2, "bark");
      s.rect(x - 2, y - 1, 2, 3, "sun");
      s.dot(x + 3, y - 1, "ink");
    }
  },
};

await mkdir(outputDir, { recursive: true });
for (const [name, draw] of Object.entries(sprites)) {
  const sprite = new Sprite();
  draw(sprite);
  await sharp(sprite.pixels, { raw: { width: size, height: size, channels: 4 } })
    .resize(192, 192, { kernel: sharp.kernel.nearest }).png()
    .toFile(resolve(outputDir, `${name}.png`));
}

await import("./generate-garden-terrain.mjs");
await import("./generate-garden-trees.mjs");
