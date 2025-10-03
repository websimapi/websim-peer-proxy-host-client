/* ...existing code... */
import "jsqr";

const clientOfferEl = document.getElementById('clientOffer');
const clientAnswerEl = document.getElementById('clientAnswer');
const btnAnswer = document.getElementById('btnClientAnswer');
const btnCopyAns = document.getElementById('btnClientCopy');
const clientStatus = document.getElementById('clientStatus');

const btnScan = document.getElementById('btnScan');
const btnStopScan = document.getElementById('btnStopScan');
const video = document.getElementById('video');
const scanCanvas = document.getElementById('scanCanvas');

const urlEl = document.getElementById('reqUrl');
const methodEl = document.getElementById('reqMethod');
const headersEl = document.getElementById('reqHeaders');
const bodyEl = document.getElementById('reqBody');
const btnSend = document.getElementById('btnSend');
const respBox = document.getElementById('respBox');

let pc, dc, scanStream, scanTimer;

function mkPC() {
  const cfg = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const p = new RTCPeerConnection(cfg);
  p.oniceconnectionstatechange = () => clientStatus.textContent = p.iceConnectionState;
  p.ondatachannel = (ev) => {
    dc = ev.channel;
    wireDC();
  };
  return p;
}

function wireDC() {
  dc.onopen = () => clientStatus.textContent = 'Channel open';
  dc.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'httpResponse') handleResponse(msg);
    } catch {}
  };
}

function handleResponse(msg) {
  const display = msg.error ? { error: msg.error } : {
    status: msg.status,
    headers: msg.headers,
    body: msg.body
  };
  respBox.textContent = JSON.stringify(display, null, 2);
}

btnAnswer.onclick = async () => {
  try {
    const offer = JSON.parse(clientOfferEl.value);
    pc?.close();
    pc = mkPC();
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    clientAnswerEl.value = JSON.stringify(pc.localDescription);
    clientStatus.textContent = 'Answer ready';
  } catch (e) {
    clientStatus.textContent = 'Invalid offer';
  }
};

btnCopyAns.onclick = async () => {
  await navigator.clipboard.writeText(clientAnswerEl.value || '');
  btnCopyAns.textContent = 'Copied';
  setTimeout(()=> btnCopyAns.textContent='Copy answer', 1200);
};

btnSend.onclick = () => {
  if (!dc || dc.readyState !== 'open') {
    respBox.textContent = 'Not connected.';
    return;
  }
  let headers = {};
  try { headers = headersEl.value ? JSON.parse(headersEl.value) : {}; } catch { headers = {}; }
  const msg = {
    type: 'httpRequest',
    id: Date.now(),
    method: methodEl.value,
    url: urlEl.value.trim(),
    headers,
    body: bodyEl.value || null
  };
  respBox.textContent = 'Waiting...';
  dc.send(JSON.stringify(msg));
};

// QR scanning
btnScan.onclick = async () => {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = scanStream;
    await video.play();
    scan();
  } catch (e) {
    clientStatus.textContent = 'Camera blocked';
  }
};

btnStopScan.onclick = () => stopScan();

function stopScan() {
  clearTimeout(scanTimer);
  if (scanStream) scanStream.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

function scan() {
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  scanCanvas.width = w; scanCanvas.height = h;
  const ctx = scanCanvas.getContext('2d');
  const tick = () => {
    if (!video.srcObject) return;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0,0,w,h);
    const code = window.jsQR(img.data, w, h);
    if (code && code.data) {
      clientOfferEl.value = code.data;
      clientStatus.textContent = 'Offer scanned';
      stopScan();
      return;
    }
    scanTimer = setTimeout(tick, 200);
  };
  tick();
}
/* ...existing code... */

