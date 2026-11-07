import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const url = process.env.VILLA_URL || 'http://127.0.0.1:4173/?snapshot=1&view=courtyard&light=dusk';

await fs.mkdir(artifacts, { recursive: true });

const profile = path.join(artifacts, '.chrome-profile');
await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
await fs.mkdir(profile, { recursive: true });

const args = [
  '--headless=new',
  '--no-sandbox',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--disable-crash-reporter',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--no-first-run',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1600,1000',
  'about:blank'
];

const child = spawn(chrome, args, { stdio: 'ignore', windowsHide: true });
child.unref?.();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJSON(pathname, options) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${pathname}`);
  return response.json();
}

let target = null;
for (let attempt = 0; attempt < 80; attempt++) {
  try {
    const list = await fetchJSON('/json/list');
    target = list.find((item) => item.type === 'page');
    if (target) break;
  } catch {}
  await sleep(250);
}
if (!target) {
  console.error('FAILED: Chrome DevTools endpoint did not start.');
  process.exitCode = 1;
  child.kill();
  await sleep(300);
  process.exit();
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleEntries = [];
const exceptions = [];
const requests = [];
const failedResponses = [];

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
    else entry.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
    consoleEntries.push({ type: message.params.type, text });
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    exceptions.push({
      text: details.text,
      description: details.exception?.description || '',
      url: details.url,
      line: details.lineNumber,
      column: details.columnNumber
    });
  }
  if (message.method === 'Log.entryAdded') {
    consoleEntries.push({ type: message.params.entry.level, text: message.params.entry.text });
  }
  if (message.method === 'Network.requestWillBeSent') {
    requests.push(message.params.request.url);
  }
  if (message.method === 'Network.responseReceived') {
    const { response } = message.params;
    if (response.status >= 400) failedResponses.push({ status: response.status, url: response.url });
  }
  if (message.method === 'Network.loadingFailed') {
    failedResponses.push({ status: 'LOAD_FAILED', url: message.params.errorText, type: message.params.type });
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = true) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(artifacts, name);
  await fs.writeFile(file, Buffer.from(result.data, 'base64'));
  console.log(`SCREENSHOT ${file}`);
}

async function waitReady() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await evaluate('Boolean(window.__VILLA__ && window.__VILLA__.ready)', false).catch(() => false);
    if (ready) return true;
    await sleep(200);
  }
  return false;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.navigate', { url });
await sleep(1200);

const ready = await waitReady();
await sleep(900);
const orbitDefault = await evaluate("document.getElementById('orbitToggle').getAttribute('aria-pressed')", false);
console.log('orbit default:', orbitDefault);
if (orbitDefault !== 'true') process.exitCode = 1;
let info = null;
try {
  info = await evaluate('window.__VILLA__ ? window.__VILLA__.info() : null', false);
} catch (error) {
  exceptions.push({ text: 'info() failed', description: String(error) });
}

console.log('\n=== VILLA VERIFY ===');
console.log('ready:', ready);
console.log('info:', JSON.stringify(info));
console.log('exceptions:', JSON.stringify(exceptions, null, 2));
console.log('console:', JSON.stringify(consoleEntries.slice(-25), null, 2));
console.log('failedResponses:', JSON.stringify(failedResponses.slice(-25), null, 2));
console.log('external requests:', requests.filter((item) => !item.startsWith('http://127.0.0.1') && !item.startsWith('data:') && !item.startsWith('blob:')).slice(0, 20));

await screenshot('desktop.png');

if (process.env.DEBUG_HIDE === '1') {
  for (const name of ['villa-roof', 'villa-facade', 'villa-shell', 'cherry', 'courtyard']) {
    await evaluate(`window.__VILLA__.hide('${name}', false)`);
    await sleep(350);
    await screenshot(`debug-no-${name}.png`);
  }
}

if (process.env.DEBUG_GABLE === '1') {
  await evaluate("window.__VILLA__.hide('gable-left', false)");
  await sleep(500);
  await screenshot('debug-no-left-gable.png');
}

if (process.env.DEBUG_DUMP === '1') {
  const dump = await evaluate(`(() => {
    const f = window.__VILLA__.scene.getObjectByName('villa-facade');
    const out = [];
    f.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      const size = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
      if (size.x > 2 || size.y > 2 || size.z > 2) {
        out.push({ geo: o.geometry.type, size, pos: o.position.toArray(), mat: o.material.type, color: o.material.color ? o.material.color.getHexString() : '' });
      }
    });
    return out;
  })()`, false);
  console.log('facade large meshes:', JSON.stringify(dump, null, 2));
}

if (ready) {
  await evaluate("window.__VILLA__.setView('parking', true)");
  await sleep(1500);
  await screenshot('parking.png');

  await evaluate("window.__VILLA__.setView('living', true)");
  await sleep(1500);
  await screenshot('living.png');

  await evaluate("window.__VILLA__.setView('bedroom', true)");
  await sleep(1500);
  console.log('bedroom view state:', await evaluate("({ view: document.body.dataset.view, copy: getComputedStyle(document.querySelector('.hero-copy')).display })", false));
  await screenshot('bedroom.png');

  await evaluate("window.__VILLA__.setView('courtyard', true); window.__VILLA__.setLight('night', true);");
  await sleep(1800);
  await screenshot('night.png');

  // Exercise the room panel and the visible controls through real DOM events.
  await evaluate("window.__VILLA__.setLight('dusk', true); window.__VILLA__.setView('courtyard', true); document.querySelector('[data-room=\\\"parking\\\"]').click();");
  await sleep(700);
  const panelState = await evaluate(`(() => {
    const el = document.getElementById('roomPanel');
    const s = getComputedStyle(el);
    return {
      open: el.classList.contains('is-open'),
      title: document.getElementById('panelTitle').textContent,
      specs: document.getElementById('panelSpecs').textContent.trim(),
      plate: window.__VILLA__.plateText,
      css: { opacity: s.opacity, visibility: s.visibility, transform: s.transform, display: s.display, zIndex: s.zIndex },
      matches: el.matches('.room-panel.is-open'),
      rules: [...document.styleSheets].flatMap((sheet) => { try { return [...sheet.cssRules]; } catch { return []; } }).filter((rule) => rule.selectorText && rule.selectorText.includes('room-panel')).map((rule) => rule.cssText)
    };
  })()`, false);
  console.log('panel state:', JSON.stringify(panelState));
  if (!panelState.open || panelState.plate !== '苏EG59122' || !panelState.specs.includes('苏EG59122')) {
    process.exitCode = 1;
  }
  await screenshot('room-panel.png');
  const controlsState = await evaluate(`(() => {
    const petal = document.getElementById('petalToggle');
    petal.click();
    const afterPetal = { pressed: petal.getAttribute('aria-pressed'), state: window.__VILLA__.info() };
    const wind = document.getElementById('windSlider');
    wind.value = '82';
    wind.dispatchEvent(new Event('input', { bubbles: true }));
    const afterWind = window.__VILLA__.info();
    document.getElementById('panelClose').click();
    document.getElementById('cutawayToggle').click();
    const afterCutaway = { pressed: document.getElementById('cutawayToggle').getAttribute('aria-pressed'), state: window.__VILLA__.info() };
    return { afterPetal, afterWind, afterCutaway, panelClosed: !document.getElementById('roomPanel').classList.contains('is-open') };
  })()`, false);
  console.log('controls state:', JSON.stringify(controlsState));
  await evaluate("window.__VILLA__.setPetals(true); window.__VILLA__.setCutaway(false); window.__VILLA__.setWind(0.55); window.__VILLA__.setView('courtyard', true);");

  const carStart = await evaluate("window.__VILLA__.carState()", false);
  await evaluate("document.getElementById('carAction').click()");
  await sleep(500);
  let carOutside = await evaluate("window.__VILLA__.carState()", false);
  for (let attempt = 0; attempt < 35 && carOutside.driving; attempt++) {
    await sleep(200);
    carOutside = await evaluate("window.__VILLA__.carState()", false);
  }
  const carLabelOutside = await evaluate("document.getElementById('carActionLabel').textContent", false);
  console.log('car start:', JSON.stringify(carStart), 'outside:', JSON.stringify(carOutside), 'label:', carLabelOutside);

  await evaluate("document.getElementById('carAction').click()");
  await sleep(500);
  let carParked = await evaluate("window.__VILLA__.carState()", false);
  for (let attempt = 0; attempt < 35 && carParked.driving; attempt++) {
    await sleep(200);
    carParked = await evaluate("window.__VILLA__.carState()", false);
  }
  const carLabelParked = await evaluate("document.getElementById('carActionLabel').textContent", false);
  console.log('car parked:', JSON.stringify(carParked), 'label:', carLabelParked);
  if (!carOutside.outside || !carParked.parked || !carLabelParked.includes('驶出')) process.exitCode = 1;

  await evaluate("window.__VILLA__.setCarProgress(1)");
  await sleep(350);
  await evaluate("document.getElementById('toast').classList.remove('is-visible')");
  await screenshot('car-outside.png');
  await evaluate("window.__VILLA__.setCarProgress(0)");
  await sleep(350);
  await evaluate("document.getElementById('toast').classList.remove('is-visible')");
  await screenshot('car-parked.png');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(500);
  await evaluate("window.__VILLA__.setView('courtyard', true)");
  await sleep(900);
  await screenshot('mobile.png');
}

ws.close();
child.kill();
await sleep(500);
if (!ready || exceptions.length || failedResponses.length) process.exitCode = 1;

