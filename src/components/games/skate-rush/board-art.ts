import type { BoardDef } from "./content";

/**
 * Deck graphics painted on a 2D canvas: the 3D board uses them as its deck texture and the shop draws
 * the same picture on its cards. The canvas is the deck seen from above, nose at the top.
 */

export const DECK_W = 128;
export const DECK_H = 384;

/** A small seeded random so a deck looks the same every time it is painted. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function heart(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  g.fill();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.3 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** Paints the board's deck art into `canvas` (resized to DECK_W × DECK_H). */
export function paintDeck(canvas: HTMLCanvasElement, board: BoardDef) {
  canvas.width = DECK_W;
  canvas.height = DECK_H;
  const g = canvas.getContext("2d")!;
  const W = DECK_W;
  const H = DECK_H;
  const [a = "#e88c5e", b = "#7a3b22", c = "#ffffff", d = "#222222"] = board.colors;
  const rand = rng(board.id.split("").reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7));
  g.clearRect(0, 0, W, H);

  switch (board.art) {
    case "classic": {
      g.fillStyle = "#ea9166";
      g.fillRect(0, 0, W, H);
      break;
    }
    case "solid": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      g.fillStyle = b;
      g.fillRect(W * 0.42, 0, W * 0.16, H);
      g.fillStyle = "#ffffff";
      g.fillRect(W * 0.47, 0, W * 0.06, H);
      break;
    }
    case "waves": {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = c;
      g.lineWidth = 5;
      for (let y = 30; y < H; y += 46) {
        g.beginPath();
        for (let x = 0; x <= W; x += 4) g.lineTo(x, y + Math.sin((x / W) * Math.PI * 3) * 9);
        g.stroke();
      }
      break;
    }
    case "checker": {
      const s = W / 4;
      for (let y = 0; y < H / s; y++) {
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? a : b;
          g.fillRect(x * s, y * s, s, s);
        }
      }
      break;
    }
    case "camo": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      for (const color of [b, c, d]) {
        g.fillStyle = color;
        for (let i = 0; i < 16; i++) {
          const x = rand() * W;
          const y = rand() * H;
          g.beginPath();
          for (let k = 0; k < 7; k++) {
            const ang = (k / 7) * Math.PI * 2;
            const r = 10 + rand() * 18;
            g.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r * 1.4);
          }
          g.closePath();
          g.fill();
        }
      }
      break;
    }
    case "tiger": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      g.fillStyle = c;
      g.fillRect(W * 0.38, 0, W * 0.24, H);
      g.fillStyle = b;
      for (let y = 12; y < H; y += 26 + rand() * 10) {
        for (const side of [0, 1]) {
          const x0 = side ? W : 0;
          const dir = side ? -1 : 1;
          const len = W * (0.25 + rand() * 0.3);
          g.beginPath();
          g.moveTo(x0, y - 7);
          g.quadraticCurveTo(x0 + dir * len * 0.6, y - 2, x0 + dir * len, y + 6);
          g.quadraticCurveTo(x0 + dir * len * 0.5, y + 6, x0, y + 7);
          g.fill();
        }
      }
      break;
    }
    case "hearts": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = i % 3 ? b : c;
        heart(g, rand() * W, rand() * H, 6 + rand() * 9);
      }
      break;
    }
    case "flames": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      // Flames licking up from the tail towards the nose.
      for (const [color, scale] of [
        [d, 1],
        [b, 0.78],
        [c, 0.5],
      ] as const) {
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(0, H);
        const tongues = 5;
        for (let i = 0; i <= tongues; i++) {
          const x = (i / tongues) * W;
          const peak = H - H * (0.45 + 0.35 * Math.abs(Math.sin(i * 1.7))) * scale;
          g.quadraticCurveTo(x - W / tongues / 2, H - (H - peak) * 0.35, x, peak);
          g.quadraticCurveTo(x + W / tongues / 3, H - (H - peak) * 0.45, x + W / tongues / 2, H - (H - peak) * 0.2);
        }
        g.lineTo(W, H);
        g.closePath();
        g.fill();
      }
      break;
    }
    case "galaxy": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 7; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 30 + rand() * 50;
        const neb = g.createRadialGradient(x, y, 0, x, y, r);
        neb.addColorStop(0, i % 2 ? b : c);
        neb.addColorStop(1, "transparent");
        g.globalAlpha = 0.55;
        g.fillStyle = neb;
        g.fillRect(0, 0, W, H);
      }
      g.globalAlpha = 1;
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 70; i++) g.fillRect(rand() * W, rand() * H, 1.5, 1.5);
      for (let i = 0; i < 6; i++) star(g, rand() * W, rand() * H, 4 + rand() * 4);
      break;
    }
    case "neon": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      g.lineWidth = 6;
      g.shadowBlur = 10;
      for (const [color, x] of [
        [b, W * 0.18],
        [c, W * 0.5],
        [b, W * 0.82],
      ] as const) {
        g.strokeStyle = color;
        g.shadowColor = color;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      g.strokeStyle = c;
      g.shadowColor = c;
      for (let y = 40; y < H; y += 60) {
        g.beginPath();
        g.moveTo(W * 0.18, y);
        g.lineTo(W * 0.5, y + 24);
        g.lineTo(W * 0.82, y);
        g.stroke();
      }
      g.shadowBlur = 0;
      break;
    }
    case "gold": {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, c);
      grad.addColorStop(0.35, a);
      grad.addColorStop(0.65, b);
      grad.addColorStop(1, a);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2;
      for (let i = -H; i < H; i += 24) {
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(W, i + W);
        g.moveTo(W, i);
        g.lineTo(0, i + W);
        g.stroke();
      }
      break;
    }
    case "rainbow": {
      const colors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
      const band = H / colors.length;
      colors.forEach((color, i) => {
        g.fillStyle = color;
        g.fillRect(0, i * band, W, band + 1);
      });
      break;
    }
    case "hover": {
      g.fillStyle = a;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = b;
      g.shadowColor = b;
      g.shadowBlur = 12;
      g.lineWidth = 5;
      g.strokeRect(10, 14, W - 20, H - 28);
      g.lineWidth = 3;
      for (let y = 60; y < H - 40; y += 44) {
        g.beginPath();
        g.moveTo(26, y);
        g.lineTo(W / 2, y - 16);
        g.lineTo(W - 26, y);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.fillStyle = c;
      g.fillRect(W / 2 - 3, 20, 6, H - 40);
      break;
    }
  }
}
