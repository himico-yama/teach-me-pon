/* Teach Me Pon (Web) - mobile tilt version */

const $ = (id) => document.getElementById(id);

// UI
const home = $("home");
const game = $("game");
const result = $("result");

const statusText = $("statusText");
const sensorBtn = $("sensorBtn");
const startBtn = $("startBtn");
const endBtn = $("endBtn");
const againBtn = $("againBtn");
const backBtn = $("backBtn");

const timeInput = $("timeInput");
const categorySelect = $("categorySelect");

const timeLeftEl = $("timeLeft");
const correctCountEl = $("correctCount");
const passCountEl = $("passCount");
const promptEl = $("prompt");
const tiltHintEl = $("tiltHint");
const barEl = $("bar");

const correctBtn = $("correctBtn");
const passBtn = $("passBtn");

// Result UI
const rCorrect = $("rCorrect");
const rPass = $("rPass");
const correctList = $("correctList");
const passList = $("passList");

// Data (自作の例。好きに増やしてOK)
const CATEGORIES = {
  "動物": [
    "キリン","ペンギン","カンガルー","イルカ","パンダ","ライオン","ハリネズミ","コアラ","フクロウ","カメ",
    "タコ","サメ","クマ","サル","ワニ","シマウマ","ラッコ","ウサギ","ネコ","イヌ",
  ],
  "食べ物": [
    "たこ焼き","カレー","ラーメン","寿司","ハンバーガー","オムライス","餃子","パンケーキ","アイス","チョコ",
    "りんご","みかん","ぶどう","バナナ","おにぎり","唐揚げ","焼きそば","ピザ","うどん","天ぷら",
  ],
  "映画・アニメ": [
    "主人公","悪役","名台詞","最終回","主題歌","変身","ラスボス","伏線","泣ける","続編",
    "友情","冒険","学園","魔法","ロボット","怪盗","探偵","宇宙","タイムスリップ","怪獣",
  ],
};

function fillCategories(){
  categorySelect.innerHTML = "";
  Object.keys(CATEGORIES).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    categorySelect.appendChild(opt);
  });
}
fillCategories();

// Game state
let words = [];
let idx = 0;

let correct = [];
let passed = [];

let timer = null;
let totalSec = 60;
let leftSec = 60;

let running = false;

// Tilt detection
let sensorReady = false;
let lastActionAt = 0;

const TILT_FORWARD = 25;  // beta >= +25 => correct
const TILT_BACK = -25;    // beta <= -25 => pass
const COOLDOWN_MS = 900;

// Some devices jitter: we soften with a small "armed" state
let armed = true; // only allow action when re-armed near neutral
const NEUTRAL_RANGE = 12; // |beta| <= 12 => re-arm

function setStatus(msg){ statusText.textContent = msg; }

function shuffle(arr){
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function show(section){
  home.classList.add("hidden");
  game.classList.add("hidden");
  result.classList.add("hidden");
  section.classList.remove("hidden");
}

function updateHUD(){
  timeLeftEl.textContent = String(leftSec);
  correctCountEl.textContent = String(correct.length);
  passCountEl.textContent = String(passed.length);
  const pct = Math.max(0, Math.min(100, ((totalSec - leftSec) / totalSec) * 100));
  barEl.style.width = `${pct}%`;
}

function currentWord(){
  return words[idx] ?? "";
}

function renderWord(){
  promptEl.textContent = currentWord() || "お題がない…";
}

function vibrate(ms){
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}

function nextWord(){
  idx += 1;
  if (idx >= words.length){
    // なくなったらシャッフルして補充（同カテゴリなら無限に遊べる）
    idx = 0;
    words = shuffle([...words]);
  }
  renderWord();
}

function actionCorrect(source="tilt"){
  if (!running) return;
  const now = Date.now();
  if (now - lastActionAt < COOLDOWN_MS) return;
  if (!armed && source === "tilt") return;

  lastActionAt = now;
  armed = false;

  const w = currentWord();
  correct.push(w);
  tiltHintEl.textContent = "✅ 正解！";
  vibrate(40);
  nextWord();
  updateHUD();
}

function actionPass(source="tilt"){
  if (!running) return;
  const now = Date.now();
  if (now - lastActionAt < COOLDOWN_MS) return;
  if (!armed && source === "tilt") return;

  lastActionAt = now;
  armed = false;

  const w = currentWord();
  passed.push(w);
  tiltHintEl.textContent = "⏭ パス！";
  vibrate(20);
  nextWord();
  updateHUD();
}

function endGame(){
  running = false;
  if (timer) clearInterval(timer);
  timer = null;

  // results
  rCorrect.textContent = String(correct.length);
  rPass.textContent = String(passed.length);

  correctList.innerHTML = "";
  passList.innerHTML = "";

  correct.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    correctList.appendChild(li);
  });
  passed.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = w;
    passList.appendChild(li);
  });

  setStatus("結果");
  show(result);
}

function startGame(){
  totalSec = clampInt(timeInput.value, 10, 300, 60);
  leftSec = totalSec;

  const cat = categorySelect.value;
  const base = CATEGORIES[cat] ?? [];
  words = shuffle([...base]);
  idx = 0;

  correct = [];
  passed = [];
  lastActionAt = 0;
  armed = true;

  renderWord();
  updateHUD();

  setStatus("プレイ中");
  tiltHintEl.textContent = sensorReady ? "傾きで判定できます" : "傾き未許可（手動ボタンでもOK）";

  running = true;
  show(game);

  // Countdown
  timer = setInterval(() => {
    if (!running) return;
    leftSec -= 1;
    updateHUD();
    if (leftSec <= 0){
      endGame();
    }
  }, 1000);

  // Try full screen (may fail on iOS; ignore)
  requestFullscreenSafe();

  // Lock orientation to portrait if available
  lockPortraitSafe();
}

function clampInt(v, min, max, fallback){
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function requestSensorPermission(){
  // iOS 13+ requires permission request
  try {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function"){
      const res = await D.requestPermission();
      sensorReady = (res === "granted");
    } else {
      // Android/most browsers do not require explicit permission
      sensorReady = true;
    }
  } catch (e){
    sensorReady = false;
  }

  tiltHintEl.textContent = sensorReady ? "✅ センサーOK" : "⚠️ センサー許可できませんでした";
  setStatus(sensorReady ? "センサーOK" : "センサーNG");
  return sensorReady;
}

function onOrientation(e){
  if (!running) return;

  // beta: front-back tilt in degrees (-180, 180)
  const beta = e.beta;
  if (typeof beta !== "number") return;

  // re-arm when near neutral
  if (Math.abs(beta) <= NEUTRAL_RANGE){
    armed = true;
    tiltHintEl.textContent = sensorReady ? "待機中（ニュートラル）" : "手動ボタン推奨";
    return;
  }

  // Only act when armed (prevents repeated triggers while held tilted)
  if (!armed) return;

  if (beta >= TILT_FORWARD){
    actionCorrect("tilt");
  } else if (beta <= TILT_BACK){
    actionPass("tilt");
  } else {
    // in-between zone
    tiltHintEl.textContent = "傾きをもう少し";
  }
}

function requestFullscreenSafe(){
  const el = document.documentElement;
  try {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) fn.call(el);
  } catch (_) {}
}

async function lockPortraitSafe(){
  try {
    if (screen.orientation && screen.orientation.lock){
      await screen.orientation.lock("portrait");
    }
  } catch (_) {}
}

// Event listeners
sensorBtn.addEventListener("click", async () => {
  await requestSensorPermission();
});

startBtn.addEventListener("click", () => {
  // start even if sensor not ready; manual buttons still work
  startGame();
});

endBtn.addEventListener("click", endGame);
againBtn.addEventListener("click", () => {
  show(home);
  setStatus("準備中");
});
backBtn.addEventListener("click", () => {
  show(home);
  setStatus("準備中");
});

// Manual controls
correctBtn.addEventListener("click", () => actionCorrect("manual"));
passBtn.addEventListener("click", () => actionPass("manual"));

// Listen for device orientation
window.addEventListener("deviceorientation", onOrientation, true);

// Initial
setStatus("準備中");
