/**
 * Getting‑Over‑It prototype — v3
 * • Easy platform helpers
 * • Smooth upward camera scroll
 */

const LANE_RATIO = 5 / 8; // 62.5 % of the window

let PLAY_W, GUTTER_X; // ← declare globally

function calcLayout() {
  PLAY_W = floor(windowWidth * LANE_RATIO);
  GUTTER_X = (windowWidth - PLAY_W) / 2; // equal left & right gutters
}

const GRAVITY = 0.4;
const FRICTION = 0.98;
const MIN_LEN = 6;
const MAX_LEN = 120;

let level = []; // will be filled by helper calls
let player, camY;

/* ======================  SETUP  ====================== */

function setup() {
  createCanvas(windowWidth, windowHeight);
  calcLayout(); // sets PLAY_W & GUTTER_X

  /* ----------  BUILD LEVEL  ---------- */
  addPlatform(0, height - 100, PLAY_W, 100); // the ground
  addPlatform(220, 460, 80, 12);
  addPlatform(360, 380, 80, 12);
  addPlatform(480, 280, 80, 12);

  /* EXAMPLE: add a few rows automatically */
  addRow(160, [100, 200, 300, 400, 500]); // thin stones
  addRow(40, [150, 350, 550]); // near the top
  addRow(-10, [50, 500]);

  player = new Player(PLAY_W * 0.15, level[0].y - 24);
  camY = 0; // camera offset
}

/* ======================  DRAW  ====================== */

function draw() {
  background(220);

  /* -------- CAMERA FOLLOW -------- */
  const screenMid = camY + height * 0.5;
  const targetCam =
    player.pos.y < screenMid ? player.pos.y - height * 0.5 : camY;
  camY += (targetCam - camY) * 0.1; // smoothing factor 0.1

  push();
  translate(0, -camY); // everything below scrolls

  /* -------- WORLD UPDATE --------- */
  push();
  translate(GUTTER_X, -camY); // X = centre lane,  Y = camera
  player.update();
  player.show();
  drawLevel(level);
  pop(); // back to screen space

  /* ---------- UI / STORY ---------- */
  drawGutters(); // optional text in side margins

  /* FAIL‑SAFE RESET */
  if (player.pos.y - player.r > camY + height + 300) resetGame();
}

/* ======================  PLATFORM HELPERS  ====================== */

function addPlatform(x, y, w, h = 12) {
  level.push({ x, y, w, h });
}

/**
 * addRow(y, positions)
 *  – y: vertical position of that ledge row
 *  – positions: either array of x‑coords or single number of evenly spaced ledges
 *    addRow(300, [100, 200, 400])         // explicit x positions
 *    addRow(200, 5)                       // 5 identical ledges evenly spaced
 */
// function addRow(y, positions, w = 80, h = 12) {
//   if (Array.isArray(positions)) {
//     positions.forEach(x => addPlatform(x, y, w, h));
//   } else {
//     const count = positions;
//     const gap   = (width - w) / (count - 1);
//     for (let i = 0; i < count; i++) addPlatform(i * gap, y, w, h);
//   }
// }

function addRow(y, positions, w = 80, h = 12) {
  if (Array.isArray(positions)) {
    positions.forEach((x) => addPlatform(x, y, w, h));
  } else {
    const count = positions;
    const gap = (PLAY_W - w) / (count - 1); // ← PLAY_W here
    for (let i = 0; i < count; i++) addPlatform(i * gap, y, w, h);
  }
}

/* ======================  LEVEL RENDER  ====================== */

function drawLevel(rects) {
  fill(120);
  noStroke();
  rectMode(CORNER);
  rects.forEach((r) => rect(r.x, r.y, r.w, r.h));
}

/* ======================  PLAYER  ====================== */

class Player {
  constructor(x, y) {
    this.r = 24;
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.armAngle = 0;
    this.anchor = null;
    this.latched = false;
    this.ropeLen = MAX_LEN;
    this.justLatched = false;
  }

  /* --- helpers --- */
  getMouseWorld() {
    return createVector(mouseX - GUTTER_X, mouseY + camY); // camY is the global camera offset
  }
  armDir() {
    return p5.Vector.fromAngle(this.armAngle);
  }
  armBase() {
    return p5.Vector.add(this.pos, this.armDir().mult(this.r));
  }
  armTip() {
    if (this.latched) return this.anchor.copy();
    const dir = this.armDir();
    const mw = this.getMouseWorld();
    const reach = constrain(
      dist(mw.x, mw.y, this.pos.x, this.pos.y),
      0,
      MAX_LEN
    );
    return p5.Vector.add(this.pos, dir.copy().mult(reach));
  }

  update() {
    /* 1. aim */
    const mw = this.getMouseWorld();
    this.armAngle = atan2(mw.y - this.pos.y, mw.x - this.pos.x);

    /* 2. resize rope by mouse drag, eased */
    if (this.latched && mouseIsPressed) {
      const raw = dist(mw.x, mw.y, this.anchor.x, this.anchor.y) - this.r;
      const targetLen = constrain(raw, MIN_LEN, MAX_LEN);
      this.ropeLen += (targetLen - this.ropeLen) * 0.25;
    }

    /* 3. rope constraint */
    if (this.latched) this.applyAnchorConstraint();

    /* 4. physics */
    this.vel.y += GRAVITY;
    this.vel.mult(FRICTION);
    this.pos.add(this.vel);

    /* 5. collisions */
    level.forEach((r) => this.collideRect(r));
  }

  applyAnchorConstraint() {
    if (this.justLatched) {
      this.justLatched = false;
      return;
    }

    this.ropeLen = constrain(this.ropeLen, MIN_LEN, MAX_LEN);
    const dir = this.armDir();
    const targetBase = p5.Vector.sub(
      this.anchor,
      dir.copy().setMag(this.ropeLen)
    );
    const targetPos = p5.Vector.sub(targetBase, dir.copy().setMag(this.r));
    const correction = p5.Vector.sub(targetPos, this.pos);

    this.pos.add(correction);
    this.vel.add(correction);
  }

  /* --- simple circle–AABB push‑out --- */
  collideRect(rect) {
    let cx = constrain(this.pos.x, rect.x, rect.x + rect.w);
    let cy = constrain(this.pos.y, rect.y, rect.y + rect.h);
    let delta = createVector(this.pos.x - cx, this.pos.y - cy);
    let d = delta.mag();
    if (d < this.r) {
      let overlap = this.r - d;
      if (d !== 0) delta.setMag(overlap);
      else delta.set(0, -overlap); // corner case
      this.pos.add(delta);
      if (!this.latched && delta.y < 0) this.vel.y = 0;
      else this.vel.add(delta);
    }
  }

  show() {
    stroke(40);
    strokeWeight(6);
    line(this.armBase().x, this.armBase().y, this.armTip().x, this.armTip().y);
    noStroke();
    fill(100, 150, 255);
    circle(this.pos.x, this.pos.y, this.r * 2);
  }

  tryLatch() {
    const tip = this.armTip();
    for (let r of level) {
      if (pointInsideRect(tip, r)) {
        this.latched = true;
        this.anchor = tip.copy();
        const full = dist(tip.x, tip.y, this.pos.x, this.pos.y);
        this.ropeLen = constrain(full - this.r, MIN_LEN, MAX_LEN);
        this.justLatched = true;
        return;
      }
    }
  }

  release() {
    this.latched = false;
    this.anchor = null;
  }
  reset() {
    this.pos.set(width * 0.15, level[0].y - this.r);
    this.vel.set(0, 0);
    this.release();
    camY = 0;
  }
}

/* ======================  GLOBAL HELPERS  ====================== */

function resetGame() {
  camY = 0; // snap view back to the ground
  player.reset(); // your existing reset logic
}

function drawGutters() {
  push();
  fill(40);
  noStroke();
  textAlign(LEFT, TOP);
  const yWorld = -2000; // world‑space y where this message starts
  const yScreen = yWorld - camY; // convert to screen
  text('You feel small but determined…', 20, yScreen, GUTTER_X - 40, 400);
  pop();
}

/* ======================  UTILITIES  ====================== */

function pointInsideRect(p, r) {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}

function windowResized() {
  // keep layout on window resize
  resizeCanvas(windowWidth, windowHeight);
  calcLayout();
}

function calcLayout() {
  PLAY_W = floor(windowWidth * LANE_RATIO); // lane width
  GUTTER_X = (windowWidth - PLAY_W) / 2; // gutter each side
}

/* ======================  INPUT  ====================== */

function mousePressed() {
  player.tryLatch();
}
function mouseReleased() {
  player.release();
}
function keyPressed() {
  if (keyCode === ESCAPE) resetGame();
}
