/* ...existing code... */
import "qrjs";

const btnCreate = document.getElementById('btnHostCreate');
const btnCopy = document.getElementById('btnHostCopy');
const offerEl = document.getElementById('hostOffer');
const answerEl = document.getElementById('hostAnswer');
const btnSetAnswer = document.getElementById('btnHostSetAnswer');
const hostStatus = document.getElementById('hostStatus');
const hostQr = document.getElementById('hostQr');
const requestsEl = document.getElementById('requests');
const autoApproveEl = document.getElementById('toggleAutoApprove');
const btCapsEl = document.getElementById('btCaps');
const btnBtCheck = document.getElementById('btnBtCheck');

let pc, dc, pending = new Map(), reqSeq = 0;

function mkPC() {
  const cfg = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  const p = new RTCPeerConnection(cfg);
  p.oniceconnectionstatechange = () => hostStatus.textContent = p.iceConnectionState;
  p.ondatachannel = (ev) => {
    dc = ev.channel;
    wireDC();
  };
  return p;
}

function wireDC() {
  dc.onopen = () => hostStatus.textContent = 'Channel open';
  dc.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'httpRequest') handleHttpRequest(msg);
    } catch {}
  };
}

async function handleHttpRequest(msg) {
  const id = msg.id ?? (++reqSeq);
  const item = renderReqItem({ id, url: msg.url, method: msg.method, headers: msg.headers, body: msg.body });
  requestsEl.prepend(item.wrap);

  const proceed = autoApproveEl.checked ? 'allow' : await waitDecision(item);
  if (proceed !== 'allow') {
    dc?.send(JSON.stringify({ type:'httpResponse', id, error:'denied' }));
    item.setStatus('Denied');
    return;
  }

  try {
    const res = await fetch(msg.url, {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      body: needsBody(msg.method) ? msg.body ?? null : undefined,
      redirect: 'follow',
      cache: 'no-store',
      mode: 'cors'
    });
    const text = await res.text();
    const headers = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    dc?.send(JSON.stringify({ type:'httpResponse', id, status: res.status, headers, body: text }));
    item.setStatus(`${res.status}`);
  } catch (e) {
    dc?.send(JSON.stringify({ type:'httpResponse', id, error: String(e) }));
    item.setStatus('Error');
  }
}

function renderReqItem(req) {
  const wrap = document.createElement('div');
  wrap.className = 'req-item';
  wrap.innerHTML = `
    <div class="req-head">
      <div><strong>${req.method || 'GET'}</strong> ${req.url}</div>
      <div class="req-actions">
        <button class="ghost allow">Allow</button>
        <button class="ghost deny">Deny</button>
      </div>
    </div>
    <pre class="mono">${JSON.stringify({ headers:req.headers, body:req.body }, null, 2)}</pre>
    <div class="status"></div>
  `;
  const status = wrap.querySelector('.status');
  const allowBtn = wrap.querySelector('.allow');
  const denyBtn = wrap.querySelector('.deny');
  let resolver;
  const decision = new Promise(r => resolver = r);
  allowBtn.onclick = () => { disable(); resolver('allow'); };
  denyBtn.onclick = () => { disable(); resolver('deny'); };
  function disable(){ allowBtn.disabled = true; denyBtn.disabled = true; }
  return {
    wrap,
    decision,
    setStatus: (t)=> status.textContent = t
  };
}

function waitDecision(item) {
  return item.decision;
}

function needsBody(m) {
  return ['POST','PUT','PATCH','DELETE'].includes((m||'').toUpperCase());
}

btnCreate.onclick = async () => {
  requestsEl.innerHTML = '';
  pc?.close();
  pc = mkPC();
  dc = pc.createDataChannel('proxy');
  wireDC();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  offerEl.value = JSON.stringify(pc.localDescription);
  hostStatus.textContent = 'Offer created';
  // QR
  hostQr.getContext('2d').clearRect(0,0,hostQr.width,hostQr.height);
  // Using qrcode library
  window.QRCode.toCanvas(hostQr, offerEl.value, { width: hostQr.width }, (e)=>{});
};

btnCopy.onclick = async () => {
  await navigator.clipboard.writeText(offerEl.value || '');
  btnCopy.textContent = 'Copied';
  setTimeout(()=> btnCopy.textContent='Copy offer', 1200);
};

btnSetAnswer.onclick = async () => {
  try {
    const ans = JSON.parse(answerEl.value);
    await pc.setRemoteDescription(ans);
    hostStatus.textContent = 'Answer set';
  } catch (e) {
    hostStatus.textContent = 'Invalid answer';
  }
};

btnBtCheck?.addEventListener('click', async () => {
  try {
    const avail = await (navigator.bluetooth?.getAvailability?.() ?? false);
    btCapsEl.textContent = avail
      ? 'Web Bluetooth available (client-only). Advertising/PAN tethering not supported in browsers.'
      : 'Web Bluetooth not available on this device/browser.';
  } catch {
    btCapsEl.textContent = 'Web Bluetooth not supported in this browser.';
  }
});