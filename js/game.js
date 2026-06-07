/* ============================================================
   Tennis RTC — Game Engine
   Fake 3D perspective, pixel-art rendering, physics, networking
   ============================================================ */

// ============================================================
// CONSTANTS & PROJECTION
// ============================================================

var COURT_LEFT_BOTTOM = 100;
var COURT_RIGHT_BOTTOM = 700;
var COURT_LEFT_TOP = 250;
var COURT_RIGHT_TOP = 550;
var COURT_Y_BOTTOM = 520;
var COURT_Y_TOP = 80;
var NET_Z = 0.5;
var NET_HEIGHT_WORLD = 0.06;
var GRAVITY = 1.5;
var SERVE_VZ = 0.42;
var SERVE_VH = 1.1;
var HIT_BASE_SPEED = 0.35;
var HIT_VH_MIN = 0.38;
var HIT_VH_VAR = 0.12;
var PHYSICS_DT = 1 / 60;

function courtLeftAtZ(z) {
  return COURT_LEFT_BOTTOM + z * (COURT_LEFT_TOP - COURT_LEFT_BOTTOM);
}

function courtRightAtZ(z) {
  return COURT_RIGHT_BOTTOM + z * (COURT_RIGHT_TOP - COURT_RIGHT_BOTTOM);
}

function courtYAtZ(z) {
  return COURT_Y_BOTTOM + z * (COURT_Y_TOP - COURT_Y_BOTTOM);
}

function getScale(z) {
  return (courtRightAtZ(z) - courtLeftAtZ(z)) / (COURT_RIGHT_BOTTOM - COURT_LEFT_BOTTOM);
}

function worldToScreen(x, z) {
  return {
    x: courtLeftAtZ(z) + x * (courtRightAtZ(z) - courtLeftAtZ(z)),
    y: courtYAtZ(z),
    scale: getScale(z)
  };
}

// ============================================================
// INPUT HANDLER
// ============================================================

function Input() {
  this.keys = {};
  this.justPressed = {};

  var self = this;

  this._onKeyDown = function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Space'].indexOf(e.key) !== -1) {
      e.preventDefault();
    }
    var key = e.key === ' ' ? 'Space' : e.key;
    if (!self.keys[key]) {
      self.justPressed[key] = true;
    }
    self.keys[key] = true;
  };

  this._onKeyUp = function (e) {
    var key = e.key === ' ' ? 'Space' : e.key;
    self.keys[key] = false;
  };

  window.addEventListener('keydown', this._onKeyDown);
  window.addEventListener('keyup', this._onKeyUp);
}

Input.prototype.isDown = function (key) {
  return !!this.keys[key];
};

Input.prototype.consumePress = function (key) {
  if (this.justPressed[key]) {
    this.justPressed[key] = false;
    return true;
  }
  return false;
};

Input.prototype.clearFrame = function () {
  this.justPressed = {};
};

Input.prototype.destroy = function () {
  window.removeEventListener('keydown', this._onKeyDown);
  window.removeEventListener('keyup', this._onKeyUp);
};

// ============================================================
// TENNIS SCORING
// ============================================================

function TennisScore() {
  this.p1 = 0;
  this.p2 = 0;
  this.gameOver = false;
  this.winner = null;
}

var SCORE_LABELS = ['0', '15', '30', '40'];

TennisScore.prototype.getDisplay = function () {
  if (this.gameOver) {
    return this.winner === 1 ? { p1: 'WIN', p2: '-' } : { p1: '-', p2: 'WIN' };
  }

  if (this.p1 >= 3 && this.p2 >= 3) {
    if (this.p1 === this.p2) return { p1: '40', p2: '40' };
    if (this.p1 > this.p2) return { p1: 'AD', p2: '40' };
    return { p1: '40', p2: 'AD' };
  }

  return {
    p1: SCORE_LABELS[Math.min(this.p1, 3)],
    p2: SCORE_LABELS[Math.min(this.p2, 3)]
  };
};

TennisScore.prototype.addPoint = function (player) {
  if (this.gameOver) return;
  if (player === 1) this.p1++;
  else this.p2++;

  if (this.p1 >= 4 && this.p1 - this.p2 >= 2) {
    this.gameOver = true;
    this.winner = 1;
  } else if (this.p2 >= 4 && this.p2 - this.p1 >= 2) {
    this.gameOver = true;
    this.winner = 2;
  }
};

TennisScore.prototype.reset = function () {
  this.p1 = 0;
  this.p2 = 0;
  this.gameOver = false;
  this.winner = null;
};

// ============================================================
// COURT RENDERER
// ============================================================

function Court() {}

Court.prototype.render = function (ctx) {
  // Outer area (dark blue-green)
  ctx.fillStyle = '#1a3a2a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Court surface (lighter green trapezoid)
  ctx.fillStyle = '#2d8a45';
  ctx.beginPath();
  ctx.moveTo(courtLeftAtZ(0), courtYAtZ(0));
  ctx.lineTo(courtRightAtZ(0), courtYAtZ(0));
  ctx.lineTo(courtRightAtZ(1), courtYAtZ(1));
  ctx.lineTo(courtLeftAtZ(1), courtYAtZ(1));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;

  function line(x1, z1, x2, z2) {
    ctx.beginPath();
    ctx.moveTo(worldToScreen(x1, z1).x, courtYAtZ(z1));
    ctx.lineTo(worldToScreen(x2, z2).x, courtYAtZ(z2));
    ctx.stroke();
  }

  // Baselines
  line(0, 0, 1, 0);
  line(0, 1, 1, 1);

  // Sidelines
  line(0, 0, 0, 1);
  line(1, 0, 1, 1);

  // Service lines
  line(0, 0.25, 1, 0.25);
  line(0, 0.75, 1, 0.75);

  // Center lines (service boxes)
  line(0.5, 0, 0.5, 0.25);
  line(0.5, 0.75, 0.5, 1);

  // Net
  this.renderNet(ctx);
};

Court.prototype.renderNet = function (ctx) {
  var netZ = 0.5;
  var netY = courtYAtZ(netZ);
  var netLeft = courtLeftAtZ(netZ);
  var netRight = courtRightAtZ(netZ);
  var netW = netRight - netLeft;
  var netH = 10;

  // Net checkerboard
  var cell = 4;
  for (var cx = netLeft; cx < netRight; cx += cell) {
    for (var cy = netY - netH; cy < netY; cy += cell) {
      var col = Math.floor((cx - netLeft) / cell);
      var row = Math.floor((cy - (netY - netH)) / cell);
      ctx.fillStyle = (col + row) % 2 === 0 ? '#ffffff' : '#999999';
      ctx.fillRect(cx, cy, cell, cell);
    }
  }

  // Net top border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(netLeft - 3, netY - netH - 3, netW + 6, 4);

  // Net posts
  ctx.fillStyle = '#888888';
  ctx.fillRect(netLeft - 8, netY - netH - 12, 5, 20);
  ctx.fillRect(netRight + 3, netY - netH - 12, 5, 20);
};

// ============================================================
// PLAYER
// ============================================================

function Player(side) {
  this.side = side;
  this.x = 0.5;
  this.z = side === 0 ? 0.05 : 0.95;
  this.swingTimer = 0;
  this.baseSize = side === 0 ? 56 : 28;
  this.speed = 0.4;
  this.depthSpeed = 0.2;
  this.autoReturn = false;
  this.lastHit = 0;
}

Player.prototype.updateLocal = function (input, dt) {
  if (input.isDown('ArrowLeft')) this.x -= this.speed * dt;
  if (input.isDown('ArrowRight')) this.x += this.speed * dt;

  if (this.side === 0) {
    if (input.isDown('ArrowUp')) this.z = Math.min(0.2, this.z + this.depthSpeed * dt);
    if (input.isDown('ArrowDown')) this.z = Math.max(0.0, this.z - this.depthSpeed * dt);
  } else {
    if (input.isDown('ArrowUp')) this.z = Math.max(0.8, this.z - this.depthSpeed * dt);
    if (input.isDown('ArrowDown')) this.z = Math.min(1.0, this.z + this.depthSpeed * dt);
  }

  this.x = Math.max(0.04, Math.min(0.96, this.x));

  if (input.consumePress('Space')) {
    this.swingTimer = 0.22;
  }

  if (this.swingTimer > 0) {
    this.swingTimer -= dt;
    if (this.swingTimer < 0) this.swingTimer = 0;
  }
};

Player.prototype.applyRemote = function (data) {
  this.x = data.x;
  this.z = data.z;
  this.swingTimer = data.swinging ? 0.22 : 0;
};

Player.prototype.getHitboxZRange = function () {
  if (this.side === 0) {
    return { min: 0.0, max: 0.22 };
  }
  return { min: 0.78, max: 1.0 };
};

Player.prototype.canHit = function (ballX, ballZ, ballH) {
  if (ballH > 0.2) return false;
  if (this.swingTimer <= 0) return false;

  var zRange = this.getHitboxZRange();
  if (ballZ < zRange.min || ballZ > zRange.max) return false;

  var reach = 0.14;
  if (Math.abs(ballX - this.x) > reach) return false;

  return true;
};

Player.prototype.render = function (ctx) {
  var pos = worldToScreen(this.x, this.z);
  var scale = pos.scale;
  var size = Math.floor(this.baseSize * scale);
  if (size < 8) size = 8;

  var sx = Math.floor(pos.x - size / 2);
  var sy = Math.floor(pos.y - size);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (this.side === 0) {
    this.renderBack(ctx, sx, sy, size);
  } else {
    this.renderFront(ctx, sx, sy, size);
  }

  // Swing arc indicator
  if (this.swingTimer > 0) {
    var alpha = Math.sin(this.swingTimer / 0.22 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 100, ' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - size * 0.5, size * 0.6, -Math.PI * 0.6, Math.PI * 0.1, false);
    ctx.stroke();
  }
};

Player.prototype.renderBack = function (ctx, sx, sy, size) {
  var p = Math.floor;

  // Legs
  ctx.fillStyle = '#1a3a6a';
  ctx.fillRect(p(sx + size * 0.34), p(sy + size * 0.58), p(size * 0.11), p(size * 0.42));
  ctx.fillRect(p(sx + size * 0.55), p(sy + size * 0.58), p(size * 0.11), p(size * 0.42));

  // Shoes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p(sx + size * 0.32), p(sy + size * 0.9), p(size * 0.15), p(size * 0.1));
  ctx.fillRect(p(sx + size * 0.53), p(sy + size * 0.9), p(size * 0.15), p(size * 0.1));

  // Body (shirt)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(p(sx + size * 0.22), p(sy + size * 0.26), p(size * 0.56), p(size * 0.36));

  // Arms
  ctx.fillStyle = '#e0b888';
  ctx.fillRect(p(sx + size * 0.05), p(sy + size * 0.3), p(size * 0.2), p(size * 0.12));
  ctx.fillRect(p(sx + size * 0.75), p(sy + size * 0.28), p(size * 0.2), p(size * 0.14));

  // Racket (backhand side)
  ctx.fillStyle = '#6b3a1f';
  ctx.fillRect(p(sx + size * 0.8), p(sy + size * 0.15), p(size * 0.04), p(size * 0.35));
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(p(sx + size * 0.72), p(sy + size * 0.1), p(size * 0.2), p(size * 0.16));

  // Head
  ctx.fillStyle = '#e0b888';
  ctx.fillRect(p(sx + size * 0.3), p(sy + size * 0.02), p(size * 0.4), p(size * 0.24));

  // Hair
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(p(sx + size * 0.28), p(sy - size * 0.02), p(size * 0.44), p(size * 0.08));
};

Player.prototype.renderFront = function (ctx, sx, sy, size) {
  var p = Math.floor;

  // Legs
  ctx.fillStyle = '#1a3a6a';
  ctx.fillRect(p(sx + size * 0.3), p(sy + size * 0.58), p(size * 0.15), p(size * 0.42));
  ctx.fillRect(p(sx + size * 0.55), p(sy + size * 0.58), p(size * 0.15), p(size * 0.42));

  // Shoes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p(sx + size * 0.27), p(sy + size * 0.9), p(size * 0.18), p(size * 0.1));
  ctx.fillRect(p(sx + size * 0.55), p(sy + size * 0.9), p(size * 0.18), p(size * 0.1));

  // Body (red shirt)
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(p(sx + size * 0.2), p(sy + size * 0.28), p(size * 0.6), p(size * 0.34));

  // Arms
  ctx.fillStyle = '#e0b888';
  ctx.fillRect(p(sx + size * 0.02), p(sy + size * 0.3), p(size * 0.2), p(size * 0.12));
  ctx.fillRect(p(sx + size * 0.78), p(sy + size * 0.28), p(size * 0.2), p(size * 0.14));

  // Racket
  ctx.fillStyle = '#6b3a1f';
  ctx.fillRect(p(sx + size * 0.85), p(sy + size * 0.15), p(size * 0.04), p(size * 0.35));
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(p(sx + size * 0.77), p(sy + size * 0.1), p(size * 0.2), p(size * 0.16));

  // Head
  ctx.fillStyle = '#e0b888';
  ctx.fillRect(p(sx + size * 0.28), p(sy + size * 0.04), p(size * 0.44), p(size * 0.24));

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.fillRect(p(sx + size * 0.35), p(sy + size * 0.1), p(size * 0.08), p(size * 0.06));
  ctx.fillRect(p(sx + size * 0.57), p(sy + size * 0.1), p(size * 0.08), p(size * 0.06));

  // Mouth
  ctx.fillStyle = '#000000';
  ctx.fillRect(p(sx + size * 0.42), p(sy + size * 0.19), p(size * 0.16), p(size * 0.04));
};

// ============================================================
// BALL
// ============================================================

function Ball() {
  this.reset();
}

Ball.prototype.reset = function () {
  this.x = 0.5;
  this.z = 0.5;
  this.h = 0;
  this.vx = 0;
  this.vz = 0;
  this.vh = 0;
  this.active = false;
  this.lastHitBy = null;
};

Ball.prototype.serve = function (server, serverX) {
  this.active = true;
  this.lastHitBy = server;

  // Serve from the server's current X position
  this.x = serverX;

  // Target: center of opponent's service box with slight variation
  var targetX = 0.5 + (Math.random() - 0.5) * 0.25;

  var dz, startZ;
  if (server === 1) {
    startZ = 0.02;
    this.z = startZ;
    dz = 0.58;
    this.vz = SERVE_VZ;
  } else {
    startZ = 0.98;
    this.z = startZ;
    dz = 0.58;
    this.vz = -SERVE_VZ;
  }

  // Horizontal velocity toward target
  var dx = targetX - this.x;
  var travelTime = Math.abs(dz / this.vz);
  this.vx = dx / travelTime;

  this.vh = SERVE_VH;
  this.h = 0.01;
};

Ball.prototype.update = function (dt) {
  if (!this.active) return;

  this.vh -= GRAVITY * dt;

  this.x += this.vx * dt;
  this.z += this.vz * dt;
  this.h += this.vh * dt;

  // Ground bounce
  if (this.h <= 0) {
    this.h = 0;
    if (Math.abs(this.vh) > 0.03) {
      this.vh = Math.abs(this.vh) * 0.6;
      this.vx *= 0.92;
      this.vz *= 0.92;
    } else {
      this.vh = 0;
    }
  }

  // Net collision
  var crossedNet = false;
  if (this.prevZ !== undefined) {
    if ((this.prevZ < NET_Z && this.z >= NET_Z) || (this.prevZ > NET_Z && this.z <= NET_Z)) {
      crossedNet = true;
    }
  }

  if (crossedNet && this.h < NET_HEIGHT_WORLD) {
    this.z = NET_Z;
    this.vz = -this.vz * 0.35;
    this.vx *= 0.5;
    this.vh = Math.max(this.vh, 0.05);
  }

  this.prevZ = this.z;
};

Ball.prototype.hit = function (playerNum, playerX, playerZ) {
  if (!this.active) return;
  this.lastHitBy = playerNum;

  if (playerNum === 1) {
    this.vz = Math.abs(this.vz) + HIT_BASE_SPEED;
  } else {
    this.vz = -(Math.abs(this.vz) + HIT_BASE_SPEED);
  }

  // Angle based on hit position
  var offsetX = this.x - playerX;
  this.vx += offsetX * 1.8;

  // Clamp horizontal velocity
  var maxVx = 0.22;
  if (this.vx > maxVx) this.vx = maxVx;
  if (this.vx < -maxVx) this.vx = -maxVx;

  this.vh = HIT_VH_MIN + Math.random() * HIT_VH_VAR;
  this.h = 0.01;
};

Ball.prototype.checkOutOfBounds = function () {
  if (!this.active) return null;

  // Past baseline
  if (this.z < -0.05) {
    this.active = false;
    return { scoredBy: 2, reason: 'baseline' };
  }
  if (this.z > 1.05) {
    this.active = false;
    return { scoredBy: 1, reason: 'baseline' };
  }

  // Wide
  if (this.x < -0.08 || this.x > 1.08) {
    this.active = false;
    var loser = this.lastHitBy === 1 ? 2 : 1;
    return { scoredBy: loser, reason: 'wide' };
  }

  // Double bounce check (ball stopped moving on ground)
  if (this.h <= 0.001 && Math.abs(this.vx) < 0.005 && Math.abs(this.vz) < 0.005 && this.prevZ !== undefined) {
    if (this.z < NET_Z) {
      this.active = false;
      return { scoredBy: 2, reason: 'double_bounce' };
    } else {
      this.active = false;
      return { scoredBy: 1, reason: 'double_bounce' };
    }
  }

  return null;
};

Ball.prototype.render = function (ctx) {
  if (!this.active) return;

  var ground = worldToScreen(this.x, this.z);
  var scale = ground.scale;
  var ballSize = Math.floor(8 * scale);
  if (ballSize < 3) ballSize = 3;

  // Shadow on ground
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, ballSize * 0.8, ballSize * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball sprite (rises with height)
  var heightOffset = this.h * 280 * scale;
  var ballSx = Math.floor(ground.x - ballSize / 2);
  var ballSy = Math.floor(ground.y - ballSize - heightOffset);

  // Glow
  if (this.h > 0.05) {
    ctx.fillStyle = 'rgba(255, 255, 100, 0.3)';
    ctx.fillRect(ballSx - 2, ballSy - 2, ballSize + 4, ballSize + 4);
  }

  // Ball body
  ctx.fillStyle = '#ccff00';
  ctx.fillRect(ballSx, ballSy, ballSize, ballSize);

  // Highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ballSx + 1, ballSy, Math.floor(ballSize * 0.5), 1);
};

// ============================================================
// GAME
// ============================================================

function Game(canvas, isHost, peer, localPlayerNum) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.ctx.imageSmoothingEnabled = false;
  this.isHost = isHost;
  this.peer = peer;
  this.localPlayerNum = localPlayerNum;

  this.court = new Court();
  this.input = new Input();
  this.score = new TennisScore();

  this.p1 = new Player(0);
  this.p2 = new Player(1);
  this.ball = new Ball();

  this.state = 'READY';
  this.server = 1;
  this.stateTimer = 0;
  this.pointResult = null;
  this.faults = 0;

  this.lastNetworkSend = 0;
  this.NETWORK_RATE = 1000 / 33;
  this.forceSend = false;
  this.running = false;
  this.lastTime = 0;

  this.setupNetwork();
  this.setupRestartButton();
}

Game.prototype.setupNetwork = function () {
  var self = this;

  this.peer.onMessage(function (data) {
    var msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return;
    }

    if (msg.type === 'input' && self.isHost) {
      self.p2.applyRemote(msg);
    }

    if (msg.type === 'game_state' && !self.isHost) {
      self.applyGameState(msg);
    }

    if (msg.type === 'point_scored') {
      self.score.p1 = msg.score.p1;
      self.score.p2 = msg.score.p2;
      self.score.gameOver = msg.score.gameOver;
      self.score.winner = msg.score.winner;
      self.state = 'POINT_ENDED';
      self.stateTimer = 2.2;
      self.pointResult = { winner: msg.winner, reason: msg.reason };
      self.updateHUD();
    }

    if (msg.type === 'serve') {
      self.server = msg.server;
      self.state = 'RALLY';
      self.ball.x = msg.ball.x;
      self.ball.z = msg.ball.z;
      self.ball.h = msg.ball.h;
      self.ball.vx = msg.ball.vx;
      self.ball.vz = msg.ball.vz;
      self.ball.vh = msg.ball.vh;
      self.ball.active = msg.ball.active;
      self.ball.lastHitBy = msg.server;
    }

    if (msg.type === 'restart') {
      self.resetGame();
    }
  });
};

Game.prototype.setupRestartButton = function () {
  var self = this;
  var btn = document.getElementById('btn-restart');
  if (!btn) return;

  btn.addEventListener('click', function () {
    if (self.state === 'GAME_OVER') {
      self.safeSend(JSON.stringify({ type: 'restart' }));
      self.resetGame();
    }
  });
};

Game.prototype.resetGame = function () {
  this.score.reset();
  this.ball.reset();
  this.p1.x = 0.5;
  this.p1.z = 0.05;
  this.p2.x = 0.5;
  this.p2.z = 0.95;
  this.p1.swingTimer = 0;
  this.p2.swingTimer = 0;
  this.state = 'READY';
  this.server = 1;
  this.stateTimer = 0.6;
  this.pointResult = null;
  this.faults = 0;
  this.forceSend = true;

  var btn = document.getElementById('btn-restart');
  if (btn) btn.classList.add('hidden');

  this.updateHUD();
};

Game.prototype.applyGameState = function (msg) {
  // Ball state
  this.ball.x = msg.ball.x;
  this.ball.z = msg.ball.z;
  this.ball.h = msg.ball.h;
  this.ball.vx = msg.ball.vx;
  this.ball.vz = msg.ball.vz;
  this.ball.active = msg.ball.active;
  if (msg.ball.prevZ !== undefined) this.ball.prevZ = msg.ball.prevZ;
  this.ball.lastHitBy = msg.ball.lastHitBy;

  // P1 (remote for guest)
  this.p1.applyRemote(msg.p1);

  // Score
  this.score.p1 = msg.score.p1;
  this.score.p2 = msg.score.p2;
  this.score.gameOver = msg.score.gameOver;
  this.score.winner = msg.score.winner;

  // State
  this.state = msg.state;
  this.server = msg.server;
  this.stateTimer = msg.stateTimer || 0;
  this.pointResult = msg.pointResult || null;

  this.updateHUD();
};

Game.prototype.safeSend = function (data) {
  try {
    if (this.peer.isConnected()) {
      this.peer.send(data);
    }
  } catch (e) {
    // Channel not ready yet, drop message (will be resent on next interval)
  }
};

Game.prototype.sendGameState = function () {
  var msg = {
    type: 'game_state',
    ball: {
      x: this.ball.x, z: this.ball.z, h: this.ball.h,
      vx: this.ball.vx, vz: this.ball.vz,
      active: this.ball.active, prevZ: this.ball.prevZ,
      lastHitBy: this.ball.lastHitBy
    },
    p1: {
      x: this.p1.x, z: this.p1.z,
      swinging: this.p1.swingTimer > 0
    },
    score: {
      p1: this.score.p1, p2: this.score.p2,
      gameOver: this.score.gameOver, winner: this.score.winner
    },
    state: this.state,
    server: this.server,
    stateTimer: this.stateTimer,
    pointResult: this.pointResult
  };
  this.safeSend(JSON.stringify(msg));
};

Game.prototype.sendInput = function () {
  var local = this.localPlayerNum === 1 ? this.p1 : this.p2;
  this.safeSend(JSON.stringify({
    type: 'input',
    x: local.x,
    z: local.z,
    swinging: local.swingTimer > 0
  }));
};

Game.prototype.sendPointScored = function (scoredBy, reason) {
  this.safeSend(JSON.stringify({
    type: 'point_scored',
    winner: scoredBy,
    reason: reason,
    score: {
      p1: this.score.p1, p2: this.score.p2,
      gameOver: this.score.gameOver, winner: this.score.winner
    }
  }));
};

Game.prototype.sendServe = function (server) {
  this.safeSend(JSON.stringify({
    type: 'serve',
    server: server,
    ball: {
      x: this.ball.x, z: this.ball.z, h: this.ball.h,
      vx: this.ball.vx, vz: this.ball.vz, vh: this.ball.vh,
      active: this.ball.active
    }
  }));
};

Game.prototype.start = function () {
  this.running = true;
  this.lastTime = performance.now();
  this.updateHUD();
  this.loop(this.lastTime);
};

Game.prototype.loop = function (timestamp) {
  if (!this.running) return;

  var dt = (timestamp - this.lastTime) / 1000;
  if (dt > 0.1) dt = 0.1;
  this.lastTime = timestamp;

  this.update(dt);
  this.render();
  this.input.clearFrame();

  requestAnimationFrame(this.loop.bind(this));
};

Game.prototype.update = function (dt) {
  var self = this;

  // Update local player (both host and guest)
  var local = this.localPlayerNum === 1 ? this.p1 : this.p2;
  local.updateLocal(this.input, dt);

  // Decrement remote player's swing timer (was never decrementing before)
  var remote = this.localPlayerNum === 1 ? this.p2 : this.p1;
  if (remote.swingTimer > 0) {
    remote.swingTimer -= dt;
    if (remote.swingTimer < 0) remote.swingTimer = 0;
  }

  if (this.isHost) {
    // === HOST AUTHORITATIVE LOGIC ===

    if (this.state === 'READY') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = 'WAITING_SERVE';
        this.ball.reset(this.server);
        this.faults = 0;
        this.forceSend = true;
      }
    }

    if (this.state === 'WAITING_SERVE') {
      var serverPlayer = this.server === 1 ? this.p1 : this.p2;
      if (serverPlayer.swingTimer > 0 && serverPlayer.swingTimer > 0.15) {
        this.ball.serve(this.server, serverPlayer.x);
        this.state = 'RALLY';
        this.sendServe(this.server);
        this.forceSend = true;
      }
    }

    if (this.state === 'RALLY') {
      this.ball.update(dt);

      // Collision: P1
      if (this.p1.canHit(this.ball.x, this.ball.z, this.ball.h)) {
        this.ball.hit(1, this.p1.x, this.p1.z);
      }

      // Collision: P2
      if (this.p2.canHit(this.ball.x, this.ball.z, this.ball.h)) {
        this.ball.hit(2, this.p2.x, this.p2.z);
      }

      // Check out of bounds
      var result = this.ball.checkOutOfBounds();
      if (result) {
        this.score.addPoint(result.scoredBy);
        this.state = 'POINT_ENDED';
        this.stateTimer = 2.2;
        this.pointResult = { winner: result.scoredBy, reason: result.reason };
        this.sendPointScored(result.scoredBy, result.reason);
        this.forceSend = true;
        this.updateHUD();
      }

      // Check for stuck ball
      if (this.ball.active && this.ball.h <= 0.001 && Math.abs(this.ball.vx) < 0.001 && Math.abs(this.ball.vz) < 0.001) {
        if (this.ball.stuckTimer === undefined) this.ball.stuckTimer = 0;
        this.ball.stuckTimer += dt;
        if (this.ball.stuckTimer > 1.5) {
          var scoredBy = this.ball.lastHitBy === 1 ? 2 : 1;
          this.score.addPoint(scoredBy);
          this.state = 'POINT_ENDED';
          this.stateTimer = 2.2;
          this.pointResult = { winner: scoredBy, reason: 'no_return' };
          this.sendPointScored(scoredBy, 'no_return');
          this.ball.active = false;
          this.ball.stuckTimer = 0;
          this.forceSend = true;
          this.updateHUD();
        }
      } else {
        this.ball.stuckTimer = 0;
      }
    }

    if (this.state === 'POINT_ENDED') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.score.gameOver) {
          this.state = 'GAME_OVER';
        } else {
          this.server = this.pointResult && this.pointResult.winner === 1 ? 1 : 2;
          this.state = 'READY';
          this.stateTimer = 0.6;
        }
        this.forceSend = true;
      }
    }

    // Send game state (after all logic)
    var now = performance.now();
    if (this.forceSend || now - this.lastNetworkSend > this.NETWORK_RATE) {
      this.sendGameState();
      this.lastNetworkSend = now;
      this.forceSend = false;
    }
  } else {
    // === GUEST ===
    // Run local ball physics for smooth 60fps rendering.
    // Host game_state corrections keep it in sync.
    if (this.ball.active) {
      this.ball.update(dt);
    }

    var now = performance.now();
    if (now - this.lastNetworkSend > this.NETWORK_RATE) {
      this.sendInput();
      this.lastNetworkSend = now;
    }
  }
};

Game.prototype.render = function () {
  var ctx = this.ctx;
  ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  // Guest sees the court mirrored: their player at bottom, opponent at top
  var flipDisplay = this.localPlayerNum > 1;

  this.court.render(ctx);

  // Determine who is the "bottom" and "top" player in display space
  var bottomPlayer, topPlayer;
  if (flipDisplay) {
    bottomPlayer = this.p2; // guest sees themselves (P2) at bottom
    topPlayer = this.p1;    // guest sees host (P1) at top
  } else {
    bottomPlayer = this.p1; // host sees themselves (P1) at bottom
    topPlayer = this.p2;    // host sees guest (P2) at top
  }

  // Render top (far) player first (behind ball) — this is always the opponent
  this.renderPlayerAt(ctx, topPlayer, flipDisplay, true);
  // Render ball
  this.renderBallAt(ctx, flipDisplay);
  // Render bottom (near) player last (in front of ball) — this is always the local player
  this.renderPlayerAt(ctx, bottomPlayer, flipDisplay, false);

  this.renderMessages(ctx);
  this.updateHUD();
};

Game.prototype.renderPlayerAt = function (ctx, player, flipZ, flipX) {
  var displayZ = flipZ ? (1 - player.z) : player.z;
  var displayX = flipX ? (1 - player.x) : player.x;
  var isBottomPlayer = (displayZ < 0.5);

  var pos = worldToScreen(displayX, displayZ);
  var scale = pos.scale;
  var baseSize = isBottomPlayer ? 56 : 28;
  var size = Math.floor(baseSize * scale);
  if (size < 8) size = 8;

  var sx = Math.floor(pos.x - size / 2);
  var sy = Math.floor(pos.y - size);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw appropriate face based on display position, not world side
  if (isBottomPlayer) {
    player.renderBack(ctx, sx, sy, size);
  } else {
    player.renderFront(ctx, sx, sy, size);
  }

  // Swing arc
  if (player.swingTimer > 0) {
    var alpha = Math.sin(player.swingTimer / 0.22 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 100, ' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - size * 0.5, size * 0.6, -Math.PI * 0.6, Math.PI * 0.1, false);
    ctx.stroke();
  }
};

Game.prototype.renderBallAt = function (ctx, flipZ) {
  if (!this.ball.active) return;

  var displayZ = flipZ ? (1 - this.ball.z) : this.ball.z;
  var displayX = this.ball.x;

  var ground = worldToScreen(displayX, displayZ);
  var scale = ground.scale;
  var ballSize = Math.floor(8 * scale);
  if (ballSize < 3) ballSize = 3;

  // Shadow on ground
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, ballSize * 0.8, ballSize * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball sprite (rises with height)
  var heightOffset = this.ball.h * 280 * scale;
  var ballSx = Math.floor(ground.x - ballSize / 2);
  var ballSy = Math.floor(ground.y - ballSize - heightOffset);

  // Glow
  if (this.ball.h > 0.05) {
    ctx.fillStyle = 'rgba(255, 255, 100, 0.3)';
    ctx.fillRect(ballSx - 2, ballSy - 2, ballSize + 4, ballSize + 4);
  }

  // Ball body
  ctx.fillStyle = '#ccff00';
  ctx.fillRect(ballSx, ballSy, ballSize, ballSize);

  // Highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ballSx + 1, ballSy, Math.floor(ballSize * 0.5), 1);
};

Game.prototype.renderMessages = function (ctx) {
  var cx = this.canvas.width / 2;
  var cy = this.canvas.height / 2;
  ctx.font = '12px "Press Start 2P", monospace';

  if (this.state === 'WAITING_SERVE') {
    var whoServes = this.server === this.localPlayerNum ? 'Voce' : ('Player ' + this.server);
    var text = whoServes + ' — Pressione Espaco para Sacar';
    ctx.fillStyle = '#000000';
    ctx.fillText(text, cx - ctx.measureText(text).width / 2 + 2, this.canvas.height - 20 + 2);
    ctx.fillStyle = '#ccff00';
    ctx.fillText(text, cx - ctx.measureText(text).width / 2, this.canvas.height - 20);
  }

  if (this.state === 'POINT_ENDED' && this.pointResult) {
    var playerName = this.pointResult.winner === this.localPlayerNum ? 'Voce' : ('Player ' + this.pointResult.winner);
    var text = playerName + ' marcou!';
    ctx.fillStyle = '#000000';
    ctx.fillText(text, cx - ctx.measureText(text).width / 2 + 2, cy + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx - ctx.measureText(text).width / 2, cy);
  }

  if (this.state === 'GAME_OVER') {
    var winner = this.score.winner === this.localPlayerNum ? 'Voce Venceu!' : ('Player ' + this.score.winner + ' Venceu!');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, cy - 40, this.canvas.width, 80);
    ctx.fillStyle = '#ccff00';
    ctx.fillText(winner, cx - ctx.measureText(winner).width / 2, cy + 6);

    // Show restart button
    var btn = document.getElementById('btn-restart');
    if (btn) btn.classList.remove('hidden');
  } else {
    var btn = document.getElementById('btn-restart');
    if (btn && !btn.classList.contains('hidden')) btn.classList.add('hidden');
  }
};

Game.prototype.updateHUD = function () {
  var display = this.score.getDisplay();
  var p1El = document.getElementById('score-p1');
  var p2El = document.getElementById('score-p2');

  // For guest (player 2): show own score (P2) on left, opponent (P1) on right
  var leftLabel, leftScore, rightLabel, rightScore;
  var leftServer, rightServer;

  if (this.localPlayerNum === 1) {
    leftLabel = 'P1';
    leftScore = display.p1;
    rightLabel = 'P2';
    rightScore = display.p2;
    leftServer = 1;
    rightServer = 2;
  } else {
    leftLabel = 'P2';
    leftScore = display.p2;
    rightLabel = 'P1';
    rightScore = display.p1;
    leftServer = 2;
    rightServer = 1;
  }

  if (p1El) {
    var leftText = leftLabel + ': ' + leftScore;
    if (this.server === leftServer && this.state !== 'POINT_ENDED' && this.state !== 'GAME_OVER') {
      leftText += ' *';
    }
    p1El.textContent = leftText;
  }

  if (p2El) {
    var rightText = rightLabel + ': ' + rightScore;
    if (this.server === rightServer && this.state !== 'POINT_ENDED' && this.state !== 'GAME_OVER') {
      rightText += ' *';
    }
    p2El.textContent = rightText;
  }
};

Game.prototype.stop = function () {
  this.running = false;
  this.input.destroy();
};
