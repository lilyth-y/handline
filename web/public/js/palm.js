// 손금 특징 추출 — browser port of interpret/features.py (YOLO11n-seg ONNX -> skeleton features).
// Pure functions on RGBA ImageData-like objects {width, height, data}. No network, no eval.
export const CLASSES = ['heart_line', 'head_line', 'life_line', 'fate_line'];
export const SHORT = { heart_line: 'heart', head_line: 'head', life_line: 'life', fate_line: 'fate' };
const IMGSZ = 640, NA = 8400, NC = 4, NM = 32, PH = 160;

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------ numpy-ish helpers
function percentile(arr, p) {
  const a = Float64Array.from(arr).sort();
  if (!a.length) return NaN;
  const pos = (a.length - 1) * p / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
const median = (arr) => percentile(arr, 50);

// ------------------------------------------------------------------ preprocessing (ultralytics LetterBox)
export function letterbox(img) {
  const { width: w, height: h } = img;
  const r = Math.min(IMGSZ / h, IMGSZ / w);
  const nw = Math.round(w * r), nh = Math.round(h * r);
  const dw = (IMGSZ - nw) / 2, dh = (IMGSZ - nh) / 2;
  const top = Math.round(dh - 0.1), left = Math.round(dw - 0.1);
  return { r, nw, nh, top, left };
}

// tensor from a 640x640 RGBA buffer already letterboxed (pad = 114)
export function toTensor(rgba640) {
  const t = new Float32Array(3 * IMGSZ * IMGSZ), n = IMGSZ * IMGSZ;
  for (let i = 0; i < n; i++) {
    t[i] = rgba640[i * 4] / 255; t[n + i] = rgba640[i * 4 + 1] / 255; t[2 * n + i] = rgba640[i * 4 + 2] / 255;
  }
  return t;
}

// letterboxed CHW float tensor straight from working-resolution RGBA, matching cv2.resize INTER_LINEAR
// (half-pixel centres, no antialias) + 114 padding exactly like ultralytics LetterBox.
export function letterboxTensor(img) {
  const { width: W, height: H, data } = img, lb = letterbox(img), n = IMGSZ * IMGSZ;
  const t = new Float32Array(3 * n).fill(114 / 255);
  const sx = W / lb.nw, sy = H / lb.nh;
  const xi0 = new Int32Array(lb.nw), xi1 = new Int32Array(lb.nw), xw = new Float32Array(lb.nw);
  for (let x = 0; x < lb.nw; x++) {
    let fx = (x + 0.5) * sx - 0.5; let i = Math.floor(fx), w = fx - i;
    if (i < 0) { i = 0; w = 0; } if (i >= W - 1) { i = W - 1; w = 0; }
    xi0[x] = i; xi1[x] = Math.min(i + 1, W - 1); xw[x] = w;
  }
  for (let y = 0; y < lb.nh; y++) {
    let fy = (y + 0.5) * sy - 0.5; let j = Math.floor(fy), v = fy - j;
    if (j < 0) { j = 0; v = 0; } if (j >= H - 1) { j = H - 1; v = 0; }
    const j1 = Math.min(j + 1, H - 1), r0 = j * W, r1 = j1 * W, o = (y + lb.top) * IMGSZ + lb.left;
    for (let x = 0; x < lb.nw; x++) {
      const a = (r0 + xi0[x]) * 4, b = (r0 + xi1[x]) * 4, c = (r1 + xi0[x]) * 4, d = (r1 + xi1[x]) * 4, w = xw[x];
      for (let ch = 0; ch < 3; ch++) {
        const top = data[a + ch] + (data[b + ch] - data[a + ch]) * w, bot = data[c + ch] + (data[d + ch] - data[c + ch]) * w;
        t[ch * n + o + x] = Math.round(top + (bot - top) * v) / 255;
      }
    }
  }
  return { lb, data: t };
}

// ------------------------------------------------------------------ postprocess (NMS + native masks)
function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

export function decodeDetections(out0, conf = 0.15, iouThr = 0.7, maxDet = 300) {
  const cands = [];
  for (let i = 0; i < NA; i++) {
    let best = -1, bc = 0;
    for (let c = 0; c < NC; c++) { const s = out0[(4 + c) * NA + i]; if (s > bc) { bc = s; best = c; } }
    if (bc <= conf) continue;
    const cx = out0[i], cy = out0[NA + i], bw = out0[2 * NA + i], bh = out0[3 * NA + i];
    const coef = new Float32Array(NM);
    for (let k = 0; k < NM; k++) coef[k] = out0[(4 + NC + k) * NA + i];
    cands.push({ cls: best, conf: bc, box: [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], coef });
  }
  cands.sort((a, b) => b.conf - a.conf);
  const keep = [];
  for (const d of cands) {
    if (keep.length >= maxDet) break;
    if (keep.some((k) => k.cls === d.cls && iou(k.box, d.box) > iouThr)) continue;
    keep.push(d);
  }
  return keep;
}

// mask of one detection at working-image resolution (ultralytics process_mask_native + crop_mask, >0 logits)
function detMask(det, protos, W, H, lb) {
  // proto crop removing the letterbox padding (scale_masks)
  const gain = Math.min(PH / H, PH / W);
  let padW = (PH - W * gain) / 2, padH = (PH - H * gain) / 2;
  const top = Math.round(padH - 0.1), left = Math.round(padW - 0.1);
  const bottom = PH - Math.round(padH + 0.1), right = PH - Math.round(padW + 0.1);
  const ch = bottom - top, cw = right - left;
  // box in working coords (scale_boxes)
  const [bx1, by1, bx2, by2] = det.box;
  const x1 = Math.max(0, (bx1 - lb.left) / lb.r), y1 = Math.max(0, (by1 - lb.top) / lb.r);
  const x2 = Math.min(W, (bx2 - lb.left) / lb.r), y2 = Math.min(H, (by2 - lb.top) / lb.r);
  const m = new Uint8Array(W * H);
  if (x2 <= x1 || y2 <= y1) return m;
  // logits on the needed proto window
  const sx = cw / W, sy = ch / H;
  const xs0 = Math.max(0, Math.floor(Math.ceil(x1) * sx - 1)), xs1 = Math.min(cw - 1, Math.ceil(x2 * sx + 1));
  const ys0 = Math.max(0, Math.floor(Math.ceil(y1) * sy - 1)), ys1 = Math.min(ch - 1, Math.ceil(y2 * sy + 1));
  const lw = xs1 - xs0 + 1, lh = ys1 - ys0 + 1;
  const logit = new Float32Array(lw * lh);
  const plane = PH * PH;
  for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) {
    const pi = (top + ys0 + yy) * PH + (left + xs0 + xx);
    let s = 0;
    for (let k = 0; k < NM; k++) s += det.coef[k] * protos[k * plane + pi];
    logit[yy * lw + xx] = s;
  }
  const at = (yy, xx) => logit[(yy - ys0) * lw + (xx - xs0)];
  for (let y = Math.ceil(y1 - 0.5) < 0 ? 0 : Math.ceil(y1); y < Math.ceil(y2); y++) {
    let fy = (y + 0.5) * sy - 0.5; if (fy < 0) fy = 0;
    let y0 = Math.floor(fy); const ly = fy - y0; let y1i = Math.min(y0 + 1, ch - 1); y0 = Math.min(y0, ch - 1);
    const Y0 = Math.min(Math.max(y0, ys0), ys1), Y1 = Math.min(Math.max(y1i, ys0), ys1);
    for (let x = Math.ceil(x1); x < Math.ceil(x2); x++) {
      let fx = (x + 0.5) * sx - 0.5; if (fx < 0) fx = 0;
      let x0 = Math.floor(fx); const lx = fx - x0; let x1i = Math.min(x0 + 1, cw - 1); x0 = Math.min(x0, cw - 1);
      const X0 = Math.min(Math.max(x0, xs0), xs1), X1 = Math.min(Math.max(x1i, xs0), xs1);
      const v = (1 - ly) * ((1 - lx) * at(Y0, X0) + lx * at(Y0, X1)) + ly * ((1 - lx) * at(Y1, X0) + lx * at(Y1, X1));
      if (v > 0) m[y * W + x] = 1;
    }
  }
  return m;
}

// ------------------------------------------------------------------ morphology / hand mask
const ELLIPSE7 = (() => {
  const rows = ['0001000', '0111110', '1111111', '1111111', '1111111', '0111110', '0001000'], o = [];
  rows.forEach((r, dy) => [...r].forEach((c, dx) => { if (c === '1') o.push([dy - 3, dx - 3]); }));
  return o;
})();

function morph(src, W, H, dilate) {
  const dst = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = dilate ? 0 : 1;
    for (const [dy, dx] of ELLIPSE7) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      const s = src[yy * W + xx];
      if (dilate) { if (s) { v = 1; break; } } else if (!s) { v = 0; break; }
    }
    dst[y * W + x] = v;
  }
  return dst;
}

function blur5(ch, W, H) {  // cv2.GaussianBlur ksize 5, sigma 0 -> [1,4,6,4,1]/16, BORDER_REFLECT_101
  const k = [0.0625, 0.25, 0.375, 0.25, 0.0625];
  const refl = (i, n) => (i < 0 ? -i : i >= n ? 2 * n - 2 - i : i);
  const tmp = new Float32Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let j = -2; j <= 2; j++) s += k[j + 2] * ch[y * W + refl(x + j, W)];
    tmp[y * W + x] = s;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let j = -2; j <= 2; j++) s += k[j + 2] * tmp[refl(y + j, H) * W + x];
    out[y * W + x] = Math.min(255, Math.round(s));
  }
  return out;
}

export function handMask(img) {
  const { width: W, height: H, data } = img, n = W * H;
  const R = new Uint8Array(n), G = new Uint8Array(n), B = new Uint8Array(n);
  for (let i = 0; i < n; i++) { R[i] = data[i * 4]; G[i] = data[i * 4 + 1]; B[i] = data[i * 4 + 2]; }
  const r = blur5(R, W, H), g = blur5(G, W, H), b = blur5(B, W, H);
  const f = new Uint8Array(n), hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    const mx = Math.max(r[i], g[i], b[i]), mn = Math.min(r[i], g[i], b[i]);
    const v = Math.max(0, Math.min(255, (mx - mn) + 0.5 * (255 - (r[i] + g[i] + b[i]) / 3)));
    f[i] = Math.floor(v); hist[f[i]]++;
  }
  // Otsu
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let wB = 0, sB = 0, best = -1, thr = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  let m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = f[i] > thr ? 1 : 0;
  m = morph(morph(m, W, H, false), W, H, true);                                  // open
  m = morph(morph(morph(morph(m, W, H, true), W, H, true), W, H, false), W, H, false); // close x2
  // largest 8-connected component
  const lab = new Int32Array(n); let nl = 0, bestL = 0, bestA = 0; const st = [];
  for (let i = 0; i < n; i++) {
    if (!m[i] || lab[i]) continue;
    nl++; let area = 0; lab[i] = nl; st.push(i);
    while (st.length) {
      const p = st.pop(); area++; const py = (p / W) | 0, px = p - py * W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = py + dy, xx = px + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
        const q = yy * W + xx; if (m[q] && !lab[q]) { lab[q] = nl; st.push(q); }
      }
    }
    if (area > bestA) { bestA = area; bestL = nl; }
  }
  const out = new Uint8Array(n);
  if (!bestL) return out;
  // fill holes: background 4-connected to the border stays background
  const outside = new Uint8Array(n);
  const push = (q) => { if (lab[q] !== bestL && !outside[q]) { outside[q] = 1; st.push(q); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (st.length) {
    const p = st.pop(), py = (p / W) | 0, px = p - py * W;
    if (px > 0) push(p - 1); if (px < W - 1) push(p + 1); if (py > 0) push(p - W); if (py < H - 1) push(p + W);
  }
  for (let i = 0; i < n; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

// ------------------------------------------------------------------ skeleton on a bbox
// Exact port of skimage.morphology.skeletonize (2D, Zhang-Suen via skimage's lookup table, v0.26).
const SK_LUT = Uint8Array.from([0, 0, 0, 1, 0, 0, 1, 3, 0, 0, 3, 1, 1, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 3, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 3, 0, 2, 0, 0, 0, 3, 1, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 1, 3, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 1, 0, 0, 0, 0, 2, 2, 0, 0, 2, 0, 0, 0]);
export function skeletonize(mask, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = new Uint8Array(W * H);
  if (x1 < 0) return out;
  const bw = x1 - x0 + 3, bh = y1 - y0 + 3, img = new Uint8Array(bw * bh);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img[(y - y0 + 1) * bw + (x - x0 + 1)] = mask[y * W + x] ? 1 : 0;
  let removed = true; const del = [];
  while (removed) {
    removed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
        const i = y * bw + x; if (!img[i]) continue;
        const v = SK_LUT[img[i - bw - 1] + 2 * img[i - bw] + 4 * img[i - bw + 1] + 8 * img[i + 1] +
          16 * img[i + bw + 1] + 32 * img[i + bw] + 64 * img[i + bw - 1] + 128 * img[i - 1]];
        if (v === 3 || (v === 1 && pass === 0) || (v === 2 && pass === 1)) del.push(i);
      }
      for (const i of del) img[i] = 0;
      if (del.length) removed = true;
    }
  }
  for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) if (img[y * bw + x]) out[(y - 1 + y0) * W + (x - 1 + x0)] = 1;
  return out;
}

// points (row-major order, like np.nonzero) as [[x,y],...]
function maskPoints(m, W, H) {
  const pts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) pts.push([x, y]);
  return pts;
}

// ------------------------------------------------------------------ skeleton graph
const SQ2 = Math.SQRT2;
function buildGraph(pts, W) {
  const idx = new Map(); pts.forEach(([x, y], i) => idx.set(y * W + x, i));
  const adj = pts.map(() => []);
  // neighbour order mimics networkx insertion order (row-major neighbours)
  pts.forEach(([x, y], i) => {
    for (const [dy, dx] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      const yy = y + dy, xx = x + dx; if (xx < 0 || xx >= W || yy < 0) continue;
      const j = idx.get(yy * W + xx); if (j !== undefined) adj[i].push([j, dx && dy ? SQ2 : 1.0]);
    }
  });
  return adj;
}

function components(nodes, adj, alive) {
  const seen = new Set(), comps = [];
  for (const s of nodes) {
    if (seen.has(s)) continue;
    const c = [s]; seen.add(s);
    for (let k = 0; k < c.length; k++) for (const [j] of adj[c[k]]) if (alive(j) && !seen.has(j)) { seen.add(j); c.push(j); }
    c.sort((a, b) => a - b); comps.push(c);
  }
  return comps;
}

function dijkstra(src, adj, alive) {   // returns finalisation order, dist map, pred map
  const dist = new Map(), seen = new Map([[src, 0]]), pred = new Map(), order = [];
  const heap = [[0, 0, src]]; let cnt = 1;
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pushH = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; } };
  const popH = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r;
      if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    return top;
  };
  while (heap.length) {
    const [d, , v] = popH();
    if (dist.has(v)) continue;
    dist.set(v, d); order.push(v);
    for (const [u, w] of adj[v]) {
      if (!alive(u)) continue;
      const nd = d + w;
      if (!seen.has(u) || nd < seen.get(u)) { seen.set(u, nd); pred.set(u, v); pushH([nd, cnt++, u]); }
    }
  }
  return { dist, order, pred };
}

function longestPath(comp, adj) {
  const inC = new Set(comp), alive = (j) => inC.has(j);
  const argmax = ({ dist, order }) => { let b = order[0]; for (const v of order) if (dist.get(v) > dist.get(b)) b = v; return b; };
  const a = argmax(dijkstra(comp[0], adj, alive));
  const r = dijkstra(a, adj, alive), b = argmax(r);
  const path = [b]; while (path[path.length - 1] !== a) path.push(r.pred.get(path[path.length - 1]));
  path.reverse();
  return { path, L: r.dist.get(b) };
}

// ------------------------------------------------------------------ palm frame
function runs(row) {
  const out = []; let s = -1;
  for (let i = 0; i <= row.length; i++) {
    const v = i < row.length && row[i];
    if (v && s < 0) s = i; else if (!v && s >= 0) { out.push([s, i]); s = -1; }
  }
  return out;
}
function runAt(hm, W, y, x) {
  const rs = runs(hm.subarray(y * W, y * W + W));
  if (!rs.length) return null;
  for (const [s, e] of rs) if (s <= x && x < e) return [s, e];
  let best = rs[0]; for (const r of rs) if (r[1] - r[0] > best[1] - best[0]) best = r;
  return best;
}

function thumbSideVote(linePx, xl, xr, leftMass, rightMass, Wp) {
  const votes = {}, tot = leftMass + rightMass;
  if (tot > 0.01 * Wp * Wp && Math.max(leftMass, rightMass) > 3 * Math.max(1, Math.min(leftMass, rightMass)))
    votes.silhouette = rightMass > leftMass ? 2.0 : -2.0;
  const heart = linePx.heart_line;
  if (heart.length > 20) {
    const xs = heart.map((p) => p[0]); const dl = Math.min(...xs) - xl, dr = xr - Math.max(...xs);
    if (Math.abs(dl - dr) > 0.05 * Wp) votes.heart_edge = dl < dr ? 1.5 : -1.5;
  }
  const life = linePx.life_line;
  if (life.length > 20) {
    const ys = life.map((p) => p[1]), p10 = percentile(ys, 10), p90 = percentile(ys, 90);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const top = mean(life.filter((p) => p[1] <= p10).map((p) => p[0])), bot = mean(life.filter((p) => p[1] >= p90).map((p) => p[0]));
    if (Math.abs(top - bot) > 0.03 * Wp) votes.life_top = top > bot ? 1.0 : -1.0;
    const head = linePx.head_line;
    if (head.length > 20) {
      const argBy = (a, f, cmp) => a.reduce((b, p) => (cmp(f(p), f(b)) ? p : b), a[0]);
      const ltop = argBy(life, (p) => p[1], (a, b) => a < b);
      const hl = argBy(head, (p) => p[0], (a, b) => a < b), hr = argBy(head, (p) => p[0], (a, b) => a > b);
      const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      votes.head_life = d(hr, ltop) < d(hl, ltop) ? 1.0 : -1.0;
    }
  }
  const s = Object.values(votes).reduce((a, b) => a + b, 0);
  if (s === 0) return [true, 'default', votes];
  return [s > 0, 'vote', votes];
}

function estimatePalm(img, linePx) {
  const { width: Wimg, height: H } = img;
  const all = CLASSES.flatMap((c) => linePx[c]);
  const hm = handMask(img);
  let frac = 0; for (let i = 0; i < hm.length; i++) frac += hm[i]; frac /= hm.length;
  let method = 'hand_mask', ok = frac > 0.05 && frac < 0.9 && all.length > 0;
  let xl, xr, Wp, yTop, yRef, leftMass = 0, rightMass = 0;
  if (ok) {
    const ref = linePx.heart_line.length ? linePx.heart_line : all;
    yRef = Math.trunc(median(ref.map((p) => p[1])));
    const xc = Math.trunc(median(all.map((p) => p[0])));
    const spans = [];
    for (let y = Math.max(0, yRef - 10); y < Math.min(H, yRef + 11); y += 2) { const r = runAt(hm, Wimg, y, xc); if (r) spans.push(r); }
    if (spans.length) {
      xl = median(spans.map((s) => s[0])); xr = median(spans.map((s) => s[1])); Wp = xr - xl;
      const xs = all.map((p) => p[0]), lx0 = percentile(xs, 1), lx1 = percentile(xs, 99);
      if (Wp < 0.5 * (lx1 - lx0) || Wp > 0.98 * Wimg) ok = false;
    } else ok = false;
  }
  if (ok) {
    const xm = Math.trunc((xl + xr) / 2);
    yTop = null;
    for (let y = yRef; y >= 0; y--) { const r = runAt(hm, Wimg, y, xm); if (!r || r[1] - r[0] < 0.75 * Wp) { yTop = y; break; } }
    if (yTop === null) yTop = Math.max(0, Math.trunc(yRef - 0.25 * Wp));
    const yEnd = Math.min(H, Math.trunc(yRef + 0.9 * Wp)), xa = Math.max(0, Math.trunc(xl - 2)), xb = Math.min(Wimg, Math.trunc(xr + 2));
    for (let y = yRef; y < yEnd; y++) { for (let x = 0; x < xa; x++) leftMass += hm[y * Wimg + x]; for (let x = xb; x < Wimg; x++) rightMass += hm[y * Wimg + x]; }
  } else {
    method = 'line_extent';
    if (!all.length) { xl = 0.15 * Wimg; xr = 0.85 * Wimg; yTop = 0.35 * H; }
    else {
      const xs = all.map((p) => p[0]), lx0 = percentile(xs, 1), lx1 = percentile(xs, 99), ly0 = percentile(all.map((p) => p[1]), 1);
      const pad = 0.08 * (lx1 - lx0); xl = lx0 - pad; xr = lx1 + pad; yTop = ly0 - 0.15 * (xr - xl);
    }
    Wp = xr - xl; leftMass = rightMass = 0;
  }
  if (linePx.heart_line.length) {
    const hy = median(linePx.heart_line.map((p) => p[1]));
    yTop = Math.min(Math.max(yTop, hy - 0.35 * Wp), hy - 0.1 * Wp);
  }
  const [thumbRight, src, votes] = thumbSideVote(linePx, xl, xr, leftMass, rightMass, Wp);
  return { W: Wp, xl, xr, y_top: yTop, thumb_right: thumbRight, method, thumb_side_source: src, hand_frac: frac, thumb_votes: votes, hm };
}

function toPalm(pts, palm) {
  return pts.map(([x, y]) => [palm.thumb_right ? (x - palm.xl) / palm.W : (palm.xr - x) / palm.W, (y - palm.y_top) / palm.W]);
}

const HEART_ZONES = [[0.70, 'index'], [0.58, 'index_middle'], [0.46, 'middle']];
function heartEndZone(u) { for (const [t, z] of HEART_ZONES) if (u >= t) return z; return 'ring'; }

function analyseLine(name, inst, palm, W, H) {
  const Wp = palm.W, feat = { present: false };
  if (!inst.length) return feat;
  const union = new Uint8Array(W * H); let area = 0;
  for (const { mask } of inst) for (let i = 0; i < mask.length; i++) if (mask[i]) { union[i] = 1; area++; }
  const skel = skeletonize(union, W, H), pts = maskPoints(skel, W, H);
  if (!pts.length) return feat;
  const adj = buildGraph(pts, W);
  let comps = [];
  for (const cc of components(pts.map((_, i) => i), adj, () => true)) {
    if (cc.length < 3) continue;
    const { path, L } = longestPath(cc, adj); comps.push({ L, cc, path });
  }
  comps = comps.filter((c) => c.L >= 0.03 * Wp);
  if (!comps.length) return feat;
  comps.sort((a, b) => b.L - a.L);
  const main = comps[0];
  let mainXY = main.path.map((i) => pts[i]);
  const segs = [main], sub = mainXY.filter((_, k) => k % 3 === 0);
  for (const c of comps.slice(1)) {
    let dmin = Infinity;
    for (const i of c.path) { const [x, y] = pts[i]; for (const [a, b] of sub) { const d = Math.hypot(x - a, y - b); if (d < dmin) dmin = d; } }
    if (dmin < 0.35 * Wp && c.L >= 0.04 * Wp) segs.push(c);
  }
  // branches
  const onPath = new Set(main.path), inMain = new Set(main.cc), alive = (j) => inMain.has(j) && !onPath.has(j);
  let branches = 0;
  for (const cc of components(main.cc.filter((i) => !onPath.has(i)), adj, alive)) {
    const set = new Set(cc); let Lb = 0;
    for (const i of cc) for (const [j, w] of adj[i]) if (set.has(j) && j > i) Lb += w;
    if (Lb + 1 >= 0.05 * Wp) branches++;
  }
  let P = toPalm(mainXY, palm);
  const flip = () => { P = P.slice().reverse(); mainXY = mainXY.slice().reverse(); };
  const f = P[0], l = P[P.length - 1];
  if (name === 'heart_line' && f[0] > l[0]) flip();
  if (name === 'head_line' && f[0] < l[0]) flip();
  if (name === 'life_line' && f[1] > l[1]) flip();
  if (name === 'fate_line' && f[1] < l[1]) flip();
  const P0 = P[0], PN = P[P.length - 1];
  const totalLen = segs.reduce((s, c) => s + c.L, 0) / Wp;
  const cv = [PN[0] - P0[0], PN[1] - P0[1]];
  const chord = Math.hypot(cv[0], cv[1]) + 1e-6;
  const nrm = [-cv[1] / chord, cv[0] / chord];
  let k = 0, devk = 0;
  P.forEach((p, i) => { const d = (p[0] - P0[0]) * nrm[0] + (p[1] - P0[1]) * nrm[1]; if (Math.abs(d) > Math.abs(devk)) { devk = d; k = i; } });
  const sag = devk / chord;
  const bulge = name === 'heart_line' || name === 'head_line' ? [0, -1] : [-1, 0];
  const sign = (nrm[0] * bulge[0] + nrm[1] * bulge[1]) * devk >= 0 ? 1 : -1;
  const bend = Math.abs(sag);
  const ang = Math.atan2(cv[1], Math.abs(cv[0]) + 1e-6) * 180 / Math.PI;
  const skelLen = segs.reduce((s, c) => s + c.L, 0);
  let instArea = 0; for (const { mask } of inst) for (let i = 0; i < mask.length; i++) instArea += mask[i];
  const thickness = instArea / Math.max(skelLen, 1) / Wp;
  const conf = Math.max(...inst.map((d) => d.conf));
  const us = P.map((p) => p[0]), vs = P.map((p) => p[1]);
  Object.assign(feat, {
    present: true, confidence: r3(conf), length: r3(main.L / Wp), total_length: r3(totalLen), chord: r3(chord),
    bend: r3(bend), bend_signed: r3(sign * bend), tortuosity: r3(main.L / Wp / chord - 1), angle_deg: r1(ang),
    start_u: r3(P0[0]), start_v: r3(P0[1]), end_u: r3(PN[0]), end_v: r3(PN[1]),
    min_u: r3(Math.min(...us)), max_u: r3(Math.max(...us)), min_v: r3(Math.min(...vs)), max_v: r3(Math.max(...vs)),
    thickness: r2(thickness * 100), clarity: r3(0.6 * conf + 0.4 * Math.min(1, thickness * 100 / 3)),
    breaks: segs.length - 1, branches, n_instances: inst.length,
  });
  if (name === 'heart_line') { feat.end_zone = heartEndZone(feat.end_u); feat.end_rise = r3(Math.max(...vs) - PN[1]); }
  if (name === 'head_line') { feat.reach_u = feat.end_u; feat.drop = r3(PN[1] - P0[1]); }
  if (name === 'life_line') { feat.arc_width = r3(1 - Math.min(...us)); feat.reach_v = feat.max_v; }
  if (name === 'fate_line') { feat.top_v = feat.min_v; feat.straightness = r3(1 / (1 + feat.tortuosity)); }
  const step = Math.max(1, Math.floor(mainXY.length / 24));
  feat.path_img = mainXY.filter((_, i) => i % step === 0).concat([mainXY[mainXY.length - 1]]);
  return feat;
}

function interp(x, xp, fp) {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
  for (let i = 0; i < xp.length - 1; i++) if (x >= xp[i] && x <= xp[i + 1]) {
    const s = xp[i + 1] - xp[i]; return s > 0 ? fp[i] + (fp[i + 1] - fp[i]) * (x - xp[i]) / s : fp[i];
  }
  return fp[fp.length - 1];
}

function relations(lines, skelPx, palm) {
  const Wp = palm.W;
  const rel = { head_life_joined: null, head_life_gap: null, heart_head_distance: null, fate_present: !!lines.fate.present,
    fate_length: lines.fate.length ?? 0, n_lines: Object.values(lines).filter((l) => l.present).length, simian_like: false };
  const hd = lines.head, lf = lines.life, ht = lines.heart;
  if (hd.present && lf.present) {
    const s = hd.path_img[0]; let g = Infinity;
    for (const p of skelPx.life_line) { const d = Math.hypot(p[0] - s[0], p[1] - s[1]); if (d < g) g = d; }
    g /= Wp; rel.head_life_gap = r3(g); rel.head_life_joined = g < 0.07;
  }
  if (ht.present && hd.present) {
    const a = toPalm(ht.path_img, palm), b = toPalm(hd.path_img, palm);
    const lo = Math.max(Math.min(...a.map((p) => p[0])), Math.min(...b.map((p) => p[0])));
    const hi = Math.min(Math.max(...a.map((p) => p[0])), Math.max(...b.map((p) => p[0])));
    let dist;
    if (hi - lo > 0.1) {
      const sa = a.slice().sort((p, q) => p[0] - q[0]), sb = b.slice().sort((p, q) => p[0] - q[0]);
      let acc = 0;
      for (let i = 0; i < 15; i++) {
        const u = lo + (hi - lo) * i / 14;
        acc += interp(u, sb.map((p) => p[0]), sb.map((p) => p[1])) - interp(u, sa.map((p) => p[0]), sa.map((p) => p[1]));
      }
      dist = acc / 15;
    } else {
      const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
      dist = mean(b.map((p) => p[1])) - mean(a.map((p) => p[1]));
    }
    rel.heart_head_distance = r3(dist); rel.simian_like = dist < 0.06;
  }
  return rel;
}

// ------------------------------------------------------------------ public API
// img: working-resolution ImageData; input: Float32Array tensor (from letterbox canvas); lb: letterbox params
export function extractFeatures(img, out0, protos, lb, conf = 0.15) {
  const { width: W, height: H } = img;
  const dets = decodeDetections(out0, conf);
  const preds = Object.fromEntries(CLASSES.map((c) => [c, []]));
  for (const d of dets) preds[CLASSES[d.cls]].push({ mask: detMask(d, protos, W, H, lb), conf: d.conf });
  const linePx = {};
  for (const c of CLASSES) {
    if (!preds[c].length) { linePx[c] = []; continue; }
    const u = new Uint8Array(W * H); for (const { mask } of preds[c]) for (let i = 0; i < u.length; i++) if (mask[i]) u[i] = 1;
    linePx[c] = maskPoints(skeletonize(u, W, H), W, H);
  }
  const palm = estimatePalm(img, linePx);
  const lines = {}; for (const c of CLASSES) lines[SHORT[c]] = analyseLine(c, preds[c], palm, W, H);
  const rel = relations(lines, linePx, palm);
  const { hm, ...palmOut } = palm;
  return { feature_version: 1, image_size: [W, H], palm: palmOut, lines, relations: rel, _preds: preds };
}
