export async function playFSK(text) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  osc.connect(gain).connect(ctx.destination);
  osc.type = 'sine';

  const f0 = 1500, f1 = 1800;
  const bitMs = 60;
  const bits = toBits(text);
  const start = ctx.currentTime + 0.05;

  osc.start(start);
  let t = start;
  // preamble
  for (let i = 0; i < 32; i++) {
    osc.frequency.setValueAtTime(i % 2 ? f1 : f0, t);
    t += bitMs / 1000;
  }
  // data bits
  for (const b of bits) {
    osc.frequency.setValueAtTime(b ? f1 : f0, t);
    t += bitMs / 1000;
  }
  // tail
  osc.frequency.setValueAtTime(f0, t);
  osc.stop(t + 0.1);
  await sleep((t - ctx.currentTime + 0.12) * 1000);
  ctx.close();
}

export async function listenFSK(onText) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);

  const f0 = 1500, f1 = 1800;
  const binHz = ctx.sampleRate / analyser.fftSize;
  const idx0 = Math.round(f0 / binHz), idx1 = Math.round(f1 / binHz);
  const bitMs = 60;
  const buf = new Float32Array(analyser.frequencyBinCount);

  let collecting = false, bits = [], preambleHits = 0;
  let stopped = false;

  async function tick() {
    while (!stopped) {
      analyser.getFloatFrequencyData(buf);
      const a0 = buf[idx0], a1 = buf[idx1];
      const bit = a1 > a0 ? 1 : 0;

      if (!collecting) {
        preambleHits = (bit === (preambleHits % 2)) ? preambleHits + 1 : 0;
        if (preambleHits > 24) collecting = true;
      } else {
        bits.push(bit);
        if (bits.length > 8 && bits.length % 8 === 0) {
          const text = bitsToText(bits);
          if (text) {
            onText(text);
            break;
          }
        }
      }
      await sleep(bitMs);
    }
  }
  tick();

  return () => {
    stopped = true;
    try { stream.getTracks().forEach(t => t.stop()); } catch {}
    try { ctx.close(); } catch {}
  };
}

function toBits(text) {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const bits = [];
  const len = bytes.length;
  // length header 16 bits
  bits.push(...numToBits(len, 16));
  for (const b of bytes) bits.push(...numToBits(b, 8));
  return bits;
}

function bitsToText(bits) {
  if (bits.length < 16) return null;
  const len = bitsToNum(bits.slice(0,16));
  const bytes = [];
  for (let i=16; i<16+len*8 && i+8<=bits.length; i+=8) {
    bytes.push(bitsToNum(bits.slice(i,i+8)));
  }
  if (bytes.length*8 < len*8) return null;
  try {
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0,len)));
  } catch { return null; }
}

function numToBits(n, width) {
  const out = [];
  for (let i=width-1; i>=0; i--) out.push((n>>i)&1);
  return out;
}

function bitsToNum(bs) {
  return bs.reduce((a,b)=> (a<<1)|b, 0);
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }