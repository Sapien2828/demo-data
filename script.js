// script.js - 折りたたみログ＆トラッキング対応版

const GAS_URL = "https://script.google.com/macros/s/AKfycbwFkwNX-YeMomdhC31w3Y5I1jtYtNwZ2slsuI1SHaczBdsg2Z0hcO7zqYbNrfaj00bRPQ/exec";

// --- 画像・データファイルパス ---
const MAP_SRC = "./map -demo.bmp";
const COLLISION_SRC = "./mapdemo - collision.bmp";
const CSV_SRC = "./data.csv";

const MAX_TIME_LIMIT = 10; 
const MOVE_FRAMES_PER_MINUTE = 120; 

const gameArea = document.getElementById('game-area');
const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status-message');
const debugCoords = document.getElementById('coord-display');
const playerIdInput = document.getElementById('player-id-input');
const eventPopup = document.getElementById('event-popup');
const logSection = document.getElementById('log-section');
const resultScreen = document.getElementById('result-screen');
const resultLogBody = document.getElementById('result-log-body');
const endScreen = document.getElementById('end-screen');
const timerBarFill = document.getElementById('timer-bar-fill');
const timerText = document.getElementById('timer-text');
const dpadControls = document.getElementById('dpad-controls');

// ★追加：ログの折りたたみボタン
const logToggleBtn = document.getElementById('log-toggle-btn');

const consentCheckbox = document.getElementById('consent-checkbox');
const btnStart = document.getElementById('btn-start');
const tutorialScreen = document.getElementById('tutorial-screen');
const btnRealStart = document.getElementById('btn-real-start');

// 音声プレイヤー用のDOM
const audioGuide = document.getElementById('audio-guide');
const btnPlayGuide = document.getElementById('btn-play-guide');
const audioSlider = document.getElementById('audio-slider');
const audioTime = document.getElementById('audio-time');
const audioSpeed = document.getElementById('audio-speed');

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');

let mapImage = new Image();
let collisionImage = new Image();
let scaleFactor = 1;
let gameOffsetX = 0;
let gameOffsetY = 0;

let player = { x: 414, y: 364, radius: 10, speed: 4, id: "" };
let keys = {};
let roomData = [];
let logs = [];
let movementHistory = [];
let isGameRunning = false;

let accumulatedTime = 0;
let moveFrameCount = 0;
let sessionUUID = "";
let sessionStartTime = "";
let eventOpenTime = 0; 
let hasPlayerMoved = false;

let imagesLoaded = 0;
mapImage.onerror = () => { alert(`【エラー】\nマップ画像 '${MAP_SRC}' の読み込みに失敗しました。`); };
collisionImage.onerror = () => { alert(`【エラー】\n衝突マップ '${COLLISION_SRC}' の読み込みに失敗しました。`); };

function onImageLoad() {
    imagesLoaded++;
    if (imagesLoaded === 2) {
        initGameSize();
        fetch(CSV_SRC).then(r => r.text()).then(parseCSV).catch(e => { alert("data.csvの読み込みに失敗しました。"); });
        requestAnimationFrame(gameLoop);
    }
}
mapImage.src = MAP_SRC; collisionImage.src = COLLISION_SRC;
mapImage.onload = onImageLoad; collisionImage.onload = onImageLoad;

function initGameSize() {
    const w = gameArea.clientWidth; const h = gameArea.clientHeight;
    canvas.width = w; canvas.height = h;
    collisionCanvas.width = mapImage.width; collisionCanvas.height = mapImage.height;
    collisionCtx.drawImage(collisionImage, 0, 0);
    scaleFactor = Math.min(w / mapImage.width, h / mapImage.height);
    gameOffsetX = (w - (mapImage.width * scaleFactor)) / 2;
    gameOffsetY = (h - (mapImage.height * scaleFactor)) / 2;
}
window.addEventListener('resize', initGameSize);

window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        if(document.activeElement !== playerIdInput) e.preventDefault();
    }
});
window.addEventListener('keyup', e => keys[e.key] = false);

function bindDpad(btnId, keyName) {
    const btn = document.getElementById(btnId); if (!btn) return;
    const press = (e) => { e.preventDefault(); keys[keyName] = true; };
    const release = (e) => { e.preventDefault(); keys[keyName] = false; };
    btn.addEventListener('mousedown', press); btn.addEventListener('mouseup', release); btn.addEventListener('mouseleave', release); 
    btn.addEventListener('touchstart', press, { passive: false }); btn.addEventListener('touchend', release); btn.addEventListener('touchcancel', release);
}

// --- 操作のトラッキング（GASへの送信）関数 ---
function recordActionLog(actionName) {
    if (!player.id) return;
    const logEntry = { 
        type: 'event',
        playerId: player.id, 
        sessionUUID: sessionUUID, 
        startTime: sessionStartTime, 
        timestamp: new Date().toLocaleString(), 
        elapsedTime: accumulatedTime + "分", 
        decisionTime: 0, 
        roomNo: "-", 
        roomManageId: "-", 
        location: "【システム操作】", 
        event: actionName, 
        choice: "-", 
        result: "クリック記録" 
    };
    logs.push(logEntry); 
    sendToGAS(logEntry); 
}

// --- 音声プレイヤーのロジック ---
function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
    bindDpad('btn-up', 'ArrowUp'); bindDpad('btn-down', 'ArrowDown'); bindDpad('btn-left', 'ArrowLeft'); bindDpad('btn-right', 'ArrowRight');
    
    // ★ログの折りたたみボタンの動作
    if (logToggleBtn && logSection) {
        logToggleBtn.onclick = () => {
            if (logSection.style.display === 'none') {
                logSection.style.display = 'block';
                logToggleBtn.textContent = '📝 ログを隠す';
            } else {
                logSection.style.display = 'none';
                logToggleBtn.textContent = '📝 ログを表示';
            }
        };
    }

    if (audioGuide && btnPlayGuide) {
        audioGuide.addEventListener('loadedmetadata', () => {
            audioSlider.max = Math.floor(audioGuide.duration);
            audioTime.textContent = `0:00 / ${formatTime(audioGuide.duration)}`;
        });

        btnPlayGuide.onclick = () => {
            if (audioGuide.paused) {
                audioGuide.play();
                btnPlayGuide.textContent = "⏸ 一時停止";
                btnPlayGuide.style.backgroundColor = "#dc3545"; 
                recordActionLog("音声ガイド：再生");
            } else {
                audioGuide.pause();
                btnPlayGuide.textContent = "▶ 再生";
                btnPlayGuide.style.backgroundColor = "#17a2b8"; 
                recordActionLog("音声ガイド：一時停止");
            }
        };

        audioGuide.addEventListener('timeupdate', () => {
            audioSlider.value = Math.floor(audioGuide.currentTime);
            if (!isNaN(audioGuide.duration)) {
                audioTime.textContent = `${formatTime(audioGuide.currentTime)} / ${formatTime(audioGuide.duration)}`;
            }
        });

        audioSlider.addEventListener('input', () => {
            audioGuide.currentTime = audioSlider.value;
        });

        if(audioSpeed) {
            audioSpeed.addEventListener('change', (e) => {
                audioGuide.playbackRate = parseFloat(e.target.value);
                recordActionLog(`音声ガイド：倍速変更 (${e.target.value}x)`);
            });
        }

        audioGuide.onended = () => {
            btnPlayGuide.textContent = "▶ もう一度聞く";
            btnPlayGuide.style.backgroundColor = "#17a2b8";
            audioGuide.currentTime = 0;
        };
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const originalX = Math.round((e.clientX - rect.left - gameOffsetX) / scaleFactor);
    const originalY = Math.round((e.clientY - rect.top - gameOffsetY) / scaleFactor);
    debugCoords.textContent = (originalX >= 0 && originalX <= mapImage.width && originalY >= 0 && originalY <= mapImage.height) ? `X:${originalX} Y:${originalY}` : "Outside";
});

function gameLoop() { update(); draw(); requestAnimationFrame(gameLoop); }

function update() {
    if (!isGameRunning || eventPopup.style.display === 'flex' || resultScreen.style.display === 'flex') return;
    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['w']) dy = -player.speed;
    if (keys['ArrowDown'] || keys['s']) dy = player.speed;
    if (keys['ArrowLeft'] || keys['a']) dx = -player.speed;
    if (keys['ArrowRight'] || keys['d']) dx = player.speed;

    if (dx !== 0 && dy !== 0) { dx *= 0.71; dy *= 0.71; }
    if (dx !== 0 || dy !== 0) {
        hasPlayerMoved = true; moveFrameCount++;
        if (moveFrameCount % 10 === 0) recordTrajectoryPoint();
        if (moveFrameCount >= MOVE_FRAMES_PER_MINUTE) {
            addTime(1); moveFrameCount = 0; statusDiv.textContent = "移動により時間が経過しました";
            setTimeout(() => { if(isGameRunning) statusDiv.textContent = ""; }, 2000);
            if(checkTimeLimit()) return; 
        }
    }
    const nextX = player.x + dx, nextY = player.y + dy;
    if (!checkCollision(nextX, player.y)) player.x = nextX;
    if (!checkCollision(player.x, nextY)) player.y = nextY;
    checkEvents();
}

function recordTrajectoryPoint() {
    const now = new Date();
    let currentRoom = roomData.find(room => Math.hypot(player.x - room.x, player.y - room.y) < room.radius);
    movementHistory.push({ 
        x: Math.floor(player.x), y: Math.floor(player.y), time: accumulatedTime, 
        realTime: now.toLocaleString(), timeOnly: now.toLocaleTimeString('ja-JP', { hour12: false }),
        no: currentRoom ? currentRoom.csvNo : "", manageId: currentRoom ? currentRoom.csvManageId : "", roomName: currentRoom ? currentRoom.name : "" 
    });
}

function checkCollision(x, y) {
    if (x < 0 || x > mapImage.width || y < 0 || y > mapImage.height) return true;
    const r = 2; 
    const pts = [{px: x, py: y}, {px: x-r, py: y}, {px: x+r, py: y}, {px: x, py: y-r}, {px: x, py: y+r}];
    for (let pt of pts) {
        if (pt.px < 0 || pt.px > mapImage.width || pt.py < 0 || pt.py > mapImage.height) return true;
        const p = collisionCtx.getImageData(Math.floor(pt.px), Math.floor(pt.py), 1, 1).data;
        if (p[0] < 50 && p[1] < 50 && p[2] < 50) return true;
    }
    return false;
}

function draw() {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!mapImage.complete) return;
    ctx.drawImage(mapImage, gameOffsetX, gameOffsetY, mapImage.width * scaleFactor, mapImage.height * scaleFactor);

    if (movementHistory.length > 1) {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)'; ctx.lineWidth = 3;
        ctx.moveTo(gameOffsetX + (movementHistory[0].x * scaleFactor), gameOffsetY + (movementHistory[0].y * scaleFactor));
        for (let i = 1; i < movementHistory.length; i++) ctx.lineTo(gameOffsetX + (movementHistory[i].x * scaleFactor), gameOffsetY + (movementHistory[i].y * scaleFactor));
        ctx.lineTo(gameOffsetX + (player.x * scaleFactor), gameOffsetY + (player.y * scaleFactor)); ctx.stroke();
    }
    
    const sx = gameOffsetX + (player.x * scaleFactor), sy = gameOffsetY + (player.y * scaleFactor), sr = player.radius * scaleFactor;
    ctx.fillStyle = '#00f0ff'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy - sr * 0.4, sr * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - sr, sy + sr); ctx.quadraticCurveTo(sx, sy - sr * 0.5, sx + sr, sy + sr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = `${12 * scaleFactor}px Meiryo`; ctx.textAlign = "center"; ctx.fillText(player.id, sx, sy + sr + 15);
    
    roomData.forEach(r => {
        if (r.isDiscovered) {
            const size = 15 * scaleFactor, px = gameOffsetX + (r.x * scaleFactor), py = gameOffsetY + (r.y * scaleFactor);
            ctx.fillStyle = r.tasks.every(t => t.status === 'completed') ? '#00ccff' : '#ff3333'; ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - (size/2), py - size); ctx.lineTo(px + (size/2), py - size); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(px, py - size, size/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        }
    });
}

function addTime(mins) { accumulatedTime += mins; updateTimeGauge(); }
function updateTimeGauge() {
    let percent = Math.min((accumulatedTime / MAX_TIME_LIMIT) * 100, 100);
    timerBarFill.style.width = percent + "%"; timerText.textContent = `${accumulatedTime} / ${MAX_TIME_LIMIT} 分`;
    timerBarFill.style.backgroundColor = percent < 50 ? "#00ff00" : percent < 80 ? "#ffcc00" : "#ff3333";
}
function checkTimeLimit() { if (accumulatedTime >= MAX_TIME_LIMIT) { finishGame(); return true; } return false; }

function finishGame() {
    isGameRunning = false; eventPopup.style.display = 'none'; if(dpadControls) dpadControls.style.display = 'none'; 
    draw(); 
    const dataURL = canvas.toDataURL("image/jpeg", 0.8);
    const imgContainer = document.getElementById('result-map-image-container'); imgContainer.innerHTML = "";
    const img = document.createElement('img'); img.src = dataURL; img.style.maxWidth = "100%"; img.style.border = "1px solid white"; imgContainer.appendChild(img);
    
    const saveImgBtn = document.getElementById('btn-save-image');
    if(saveImgBtn) saveImgBtn.onclick = () => { 
        recordActionLog("マップ画像保存：クリック");
        const link = document.createElement('a'); link.href = dataURL; link.download = `trajectory_${player.id}_${Date.now()}.jpg`; link.click(); 
    };

    sendImageToGAS(); sendTrajectoryToGAS();
    resultLogBody.innerHTML = "";
    logs.forEach(l => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${l.elapsedTime}</td><td>${l.location}</td><td>${l.event}</td><td>${l.choice}</td><td>${l.result}</td>`; resultLogBody.appendChild(tr); });

    const btnArea = resultScreen.querySelector('.button-area'); let oldBtn = document.getElementById('btn-manual-send'); if(oldBtn) oldBtn.remove();
    const manualSendBtn = document.createElement('button'); manualSendBtn.id = 'btn-manual-send'; manualSendBtn.className = 'dl-btn'; manualSendBtn.style.backgroundColor = '#ff9900'; manualSendBtn.textContent = '結果をサーバーに再送信';
    manualSendBtn.onclick = () => { 
        recordActionLog("結果サーバー再送信：クリック");
        alert("送信を開始します..."); sendTrajectoryToGAS(); setTimeout(()=>sendImageToGAS(), 1000); 
    };
    btnArea.insertBefore(manualSendBtn, btnArea.firstChild);
    resultScreen.style.display = 'flex';
}

window.showEndScreen = () => { 
    if (audioGuide) {
        audioGuide.pause();
        audioGuide.currentTime = 0; 
    }
    recordActionLog("終了するボタン：クリック");
    resultScreen.style.display = 'none'; 
    endScreen.style.display = 'flex'; 
};

function parseCSV(text) {
    const lines = text.trim().split('\n'); roomData = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]); if(row.length < 5) continue;
        const csvNo = row[0], csvManageId = "", roomName = row[1], x = parseInt(row[2]), y = parseInt(row[3]), r = parseInt(row[4]), order = parseInt(row[5]); 
        let room = roomData.find(d => d.name === roomName && Math.abs(d.x - x) < 5 && Math.abs(d.y - y) < 5);
        if(!room) { room = { name: roomName, x: x, y: y, radius: r, tasks: [], isDiscovered: false, ignoreUntilExit: false, currentTaskIndex: 0, csvNo: csvNo, csvManageId: csvManageId }; roomData.push(room); }
        const task = { id: row[0], name: row[6], description: row[7], order: order, choices: [], status: 'pending' };
        if(row[8]) task.choices.push({ text: row[8], result: row[9], time: parseInt(row[10]||0) });
        if(row[11]) task.choices.push({ text: row[11], result: row[12], time: parseInt(row[13]||0) });
        if(row[14]) task.choices.push({ text: row[14], result: row[15], time: parseInt(row[16]||0) });
        if(row[17]) task.choices.push({ text: row[17], result: row[18], time: parseInt(row[19]||0) });
        room.tasks.push(task);
    }
    roomData.forEach(room => { room.tasks.sort((a, b) => a.order - b.order); });
}
function parseCSVLine(line) {
    const res = []; let start = 0, inQ = false;
    for(let i=0; i<line.length; i++){ if(line[i]==='"') inQ = !inQ; if(line[i]===',' && !inQ){ res.push(line.substring(start, i).replace(/^"|"$/g,'')); start=i+1; } }
    res.push(line.substring(start).replace(/^"|"$/g,'')); return res;
}

function checkEvents() {
    if (!hasPlayerMoved || eventPopup.style.display === 'flex') return;
    for (let room of roomData) {
        if (Math.hypot(player.x - room.x, player.y - room.y) < room.radius) {
            room.isDiscovered = true;
            if (room.ignoreUntilExit || room.tasks.filter(t => t.status === 'pending').length === 0) continue;
            if(room.currentTaskIndex >= room.tasks.length) room.currentTaskIndex = 0;
            let foundTask = null, count = 0;
            while(count < room.tasks.length) {
                let idx = (room.currentTaskIndex + count) % room.tasks.length;
                if(room.tasks[idx].status === 'pending') { room.currentTaskIndex = idx; foundTask = room.tasks[idx]; break; }
                count++;
            }
            if (foundTask) { triggerEvent(room, foundTask); break; }
        } else { room.ignoreUntilExit = false; }
    }
}

function triggerEvent(room, task) {
    keys = {}; document.getElementById('event-title').textContent = `場所: ${room.name}`; document.getElementById('event-desc').innerHTML = `<strong>${task.name}</strong><br>${task.description}`;
    eventOpenTime = Date.now();
    const choicesDiv = document.getElementById('event-choices'); choicesDiv.innerHTML = "";
    task.choices.forEach((c, index) => { 
        const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.innerHTML = c.text; 
        if (index < 3) { btn.style.backgroundColor = '#007bff'; btn.onmouseover = () => btn.style.backgroundColor = '#0056b3'; btn.onmouseout = () => btn.style.backgroundColor = '#007bff'; } 
        else if (index === 3) { btn.style.backgroundColor = '#ffcc00'; btn.style.color = '#000'; btn.onmouseover = () => btn.style.backgroundColor = '#e6b800'; btn.onmouseout = () => btn.style.backgroundColor = '#ffcc00'; }
        btn.onclick = () => resolveEvent(room, task, c, index); choicesDiv.appendChild(btn); 
    });
    const holdBtn = document.createElement('button'); holdBtn.className = 'choice-btn'; holdBtn.style.backgroundColor = '#777'; holdBtn.textContent = 'この場所以外を探索する（保留）';
    holdBtn.onclick = () => { room.ignoreUntilExit = true; eventPopup.style.display = 'none'; recordLog(room, task, "保留", "この場所以外を探索する"); };
    choicesDiv.appendChild(holdBtn); 
    document.getElementById('close-btn').style.display = 'none'; eventPopup.style.display = 'flex';
}

function resolveEvent(room, task, choice, choiceIndex) {
    task.status = (choiceIndex === 3) ? 'pending' : 'completed';
    addTime(choice.time || 0); recordLog(room, task, choice.text, choice.result);
    document.getElementById('event-desc').innerHTML = `<div style="color:#5bc0de; font-weight:bold; margin-bottom:10px;">選択結果</div>${choice.result}`;
    document.getElementById('event-choices').innerHTML = "";
    const closeBtn = document.getElementById('close-btn'); closeBtn.style.display = 'block'; closeBtn.textContent = "確認";
    closeBtn.onclick = () => { eventPopup.style.display = 'none'; if(checkTimeLimit()) return; room.currentTaskIndex++; statusDiv.textContent = task.status === 'completed' ? `✅ ${task.name} 完了` : `⏭️ ${task.name} 次へ`; };
}

function recordLog(room, task, choiceText, resultText) {
    const duration = eventOpenTime > 0 ? Math.floor((Date.now() - eventOpenTime) / 1000) : 0;
    const logEntry = { type: 'event', playerId: player.id, sessionUUID: sessionUUID, startTime: sessionStartTime, timestamp: new Date().toLocaleString(), elapsedTime: accumulatedTime + "分", decisionTime: duration, roomNo: room.csvNo, roomManageId: room.csvManageId, location: room.name, event: task.name, choice: choiceText, result: resultText };
    logs.push(logEntry); sendToGAS(logEntry); addLogToScreen(room.name, task.name, choiceText, duration); eventOpenTime = 0;
}
function addLogToScreen(location, event, choice, duration) {
    const div = document.createElement('div'); div.className = 'log-item';
    div.innerHTML = `<span class=\"log-time\">[${accumulatedTime}分]</span> <span class=\"log-event\">${location}</span><br>選択: ${choice}${duration !== undefined ? ` (決断:${duration}秒)` : ""}`; logSection.prepend(div);
}

function sendToGAS(data) { fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true }).catch(e=>console.error(e)); }
function sendImageToGAS() { try { fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'image', playerId: player.id, sessionUUID: sessionUUID, startTime: sessionStartTime, image: canvas.toDataURL("image/jpeg", 0.7).split("base64,")[1] }), keepalive: true }); } catch (e) {} }
function sendTrajectoryToGAS() {
    if (movementHistory.length === 0) return;
    let hist = movementHistory.length > 3000 ? movementHistory.filter((_, i) => i % Math.ceil(movementHistory.length / 3000) === 0) : movementHistory;
    const payload = { type: 'trajectory', playerId: player.id, sessionUUID: sessionUUID, startTime: sessionStartTime, history: hist };
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
    if(navigator.sendBeacon) { navigator.sendBeacon(GAS_URL, blob); } else { fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload), keepalive: true }); }
}

if (consentCheckbox) {
    consentCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            btnStart.disabled = false;
        } else {
            btnStart.disabled = true;
        }
    });
}

btnStart.onclick = () => {
    const id = playerIdInput.value; 
    if(!id) { alert("IDを入力してください"); return; }
    document.getElementById('top-screen').style.display = 'none';
    tutorialScreen.style.display = 'flex';
};

if (btnRealStart) {
    btnRealStart.onclick = () => {
        player.id = playerIdInput.value; 
        sessionUUID = Date.now().toString(36) + Math.random().toString(36).substr(2); 
        sessionStartTime = new Date().toLocaleString();
        
        tutorialScreen.style.display = 'none';
        isGameRunning = true;
        
        player.x = 414; player.y = 364; 
        recordTrajectoryPoint(); hasPlayerMoved = false;

        if (dpadControls) dpadControls.style.display = 'grid';
    };
}

window.openAdminLogin = () => document.getElementById('admin-login-overlay').style.display = 'flex';
window.closeAdminLogin = () => document.getElementById('admin-login-overlay').style.display = 'none';
window.checkAdminPass = () => { if(document.getElementById('admin-pass-input').value === "admin1234") { closeAdminLogin(); renderAdminLogs(); document.getElementById('admin-screen').style.display = 'flex'; } else alert("パスワード不一致"); };
window.closeAdminScreen = () => document.getElementById('admin-screen').style.display = 'none';
function renderAdminLogs() {
    const tbody = document.getElementById('admin-log-body'); tbody.innerHTML = "";
    document.querySelector('#admin-table thead tr').innerHTML = `<th>ID</th><th>日時</th><th>経過</th><th>決断(秒)</th><th>場所</th><th>イベント</th><th>選択</th><th>結果</th>`;
    logs.forEach(l => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${l.playerId}</td><td>${l.timestamp}</td><td>${l.elapsedTime}</td><td>${l.decisionTime}</td><td>${l.location}</td><td>${l.event}</td><td>${l.choice}</td><td>${l.result}</td>`; tbody.appendChild(tr); });
}
window.clearAllLogs = () => { if(confirm("ログ削除？")) { logs=[]; renderAdminLogs(); }};
window.downloadAllLogs = () => {
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), "ID,日時,経過,決断時間(秒),場所,イベント,選択,結果\n" + logs.map(l => `${l.playerId},${l.timestamp},${l.elapsedTime},${l.decisionTime},${l.location},${l.event},${l.choice},${l.result}`).join("\n")], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "event_logs.csv"; document.body.appendChild(link); link.click();
};
window.downloadPathLogs = () => {
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), "PointRealTime,TimeOnly,SimTime,X,Y,No,管理No,部屋名\n" + movementHistory.map(m => `${m.realTime},${m.timeOnly},${m.time},${m.x},${m.y},${m.no},${m.manageId},${m.roomName}`).join("\n")], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "path_logs.csv"; document.body.appendChild(link); link.click();
};