// script.js - 完全版（CSV列ズレ修正・10分制限・色分け・当たり緩和）

const GAS_URL = "https://script.google.com/macros/s/AKfycbwFkwNX-YeMomdhC31w3Y5I1jtYtNwZ2slsuI1SHaczBdsg2Z0hcO7zqYbNrfaj00bRPQ/exec";

// --- 画像・データファイルパス ---
const MAP_SRC = "./map -demo.bmp";
const COLLISION_SRC = "./mapdemo - collision.bmp";
const CSV_SRC = "./data.csv";

// --- 設定値 ---
const MAX_TIME_LIMIT = 10; // ★10分制限
const MOVE_FRAMES_PER_MINUTE = 120; 

// --- DOM要素 ---
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
const dpadControls = document.getElementById('dpad-controls'); // 十字キー

const collisionCanvas = document.createElement('canvas');
const collisionCtx = collisionCanvas.getContext('2d');

// --- ゲーム状態 ---
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

// --- 初期化とエラー検知 ---
let imagesLoaded = 0;

mapImage.onerror = () => { alert(`【システムエラー】\nマップ画像 '${MAP_SRC}' の読み込みに失敗しました。\nファイル名が完全に一致しているか確認してください。`); };
collisionImage.onerror = () => { alert(`【システムエラー】\n衝突判定マップ '${COLLISION_SRC}' の読み込みに失敗しました。\nファイル名が完全に一致しているか確認してください。`); };

function onImageLoad() {
    imagesLoaded++;
    if (imagesLoaded === 2) {
        initGameSize();
        fetch(CSV_SRC)
            .then(r => r.text())
            .then(parseCSV)
            .catch(e => {
                console.error("CSV Load Error:", e);
                alert("データの読み込みに失敗しました。data.csvを確認してください。");
            });
        requestAnimationFrame(gameLoop);
    }
}

mapImage.src = MAP_SRC;
collisionImage.src = COLLISION_SRC;
mapImage.onload = onImageLoad;
collisionImage.onload = onImageLoad;

// --- 画面リサイズ ---
function initGameSize() {
    const w = gameArea.clientWidth;
    const h = gameArea.clientHeight;
    canvas.width = w; canvas.height = h;
    collisionCanvas.width = mapImage.width; collisionCanvas.height = mapImage.height;
    collisionCtx.drawImage(collisionImage, 0, 0);
    const scaleW = w / mapImage.width;
    const scaleH = h / mapImage.height;
    scaleFactor = Math.min(scaleW, scaleH);
    gameOffsetX = (w - (mapImage.width * scaleFactor)) / 2;
    gameOffsetY = (h - (mapImage.height * scaleFactor)) / 2;
}
window.addEventListener('resize', initGameSize);

// --- 入力（キーボード） ---
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        if(document.activeElement !== playerIdInput) {
            e.preventDefault();
        }
    }
});
window.addEventListener('keyup', e => keys[e.key] = false);

// --- 入力（十字キー・スマホ対応） ---
function bindDpad(btnId, keyName) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const press = (e) => { e.preventDefault(); keys[keyName] = true; };
    const release = (e) => { e.preventDefault(); keys[keyName] = false; };
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release); 
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);
}

document.addEventListener('DOMContentLoaded', () => {
    bindDpad('btn-up', 'ArrowUp');
    bindDpad('btn-down', 'ArrowDown');
    bindDpad('btn-left', 'ArrowLeft');
    bindDpad('btn-right', 'ArrowRight');
});

// ★マウスでの座標確認機能（左下に表示されます）
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const originalX = Math.round((mouseX - gameOffsetX) / scaleFactor);
    const originalY = Math.round((mouseY - gameOffsetY) / scaleFactor);
    if(originalX >= 0 && originalX <= mapImage.width && originalY >= 0 && originalY <= mapImage.height) {
        debugCoords.textContent = `X:${originalX} Y:${originalY}`;
    } else {
        debugCoords.textContent = "Outside";
    }
});

// --- ゲームループ ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function update() {
    if (!isGameRunning) return;
    if (eventPopup.style.display === 'flex') return;
    if (resultScreen.style.display === 'flex') return; 

    let dx = 0; let dy = 0;
    if (keys['ArrowUp'] || keys['w']) dy = -player.speed;
    if (keys['ArrowDown'] || keys['s']) dy = player.speed;
    if (keys['ArrowLeft'] || keys['a']) dx = -player.speed;
    if (keys['ArrowRight'] || keys['d']) dx = player.speed;

    if (dx !== 0 && dy !== 0) { dx *= 0.71; dy *= 0.71; }

    if (dx !== 0 || dy !== 0) {
        hasPlayerMoved = true;
        moveFrameCount++;
        
        if (moveFrameCount % 10 === 0) recordTrajectoryPoint();
        if (moveFrameCount >= MOVE_FRAMES_PER_MINUTE) {
            addTime(1); 
            moveFrameCount = 0;
            statusDiv.textContent = "移動により時間が経過しました";
            setTimeout(() => { if(isGameRunning) statusDiv.textContent = ""; }, 2000);
            if(checkTimeLimit()) return; 
        }
    }

    const nextX = player.x + dx;
    const nextY = player.y + dy;

    if (!checkCollision(nextX, player.y)) player.x = nextX;
    if (!checkCollision(player.x, nextY)) player.y = nextY;

    checkEvents();
}

function recordTrajectoryPoint() {
    const now = new Date();
    const timeOnly = now.toLocaleTimeString('ja-JP', { hour12: false });
    
    let currentRoom = null;
    for (let i = 0; i < roomData.length; i++) {
        const room = roomData[i];
        const dist = Math.hypot(player.x - room.x, player.y - room.y);
        if (dist < room.radius) { currentRoom = room; break; }
    }

    movementHistory.push({ 
        x: Math.floor(player.x), y: Math.floor(player.y), 
        time: accumulatedTime, realTime: now.toLocaleString(), timeOnly: timeOnly,
        no: currentRoom ? currentRoom.csvNo : "", 
        manageId: currentRoom ? currentRoom.csvManageId : "", 
        roomName: currentRoom ? currentRoom.name : "" 
    });
}

function checkCollision(x, y) {
    if (x < 0 || x > mapImage.width || y < 0 || y > mapImage.height) return true;
    const r = 2; // 当たり判定の緩和
    const checkPoints = [
        { px: x, py: y }, { px: x - r, py: y }, { px: x + r, py: y },
        { px: x, py: y - r }, { px: x, py: y + r }
    ];
    for (let i = 0; i < checkPoints.length; i++) {
        let pt = checkPoints[i];
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
        for (let i = 1; i < movementHistory.length; i++) {
            ctx.lineTo(gameOffsetX + (movementHistory[i].x * scaleFactor), gameOffsetY + (movementHistory[i].y * scaleFactor));
        }
        ctx.lineTo(gameOffsetX + (player.x * scaleFactor), gameOffsetY + (player.y * scaleFactor));
        ctx.stroke();
    }
    
    const sx = gameOffsetX + (player.x * scaleFactor);
    const sy = gameOffsetY + (player.y * scaleFactor);
    const sr = player.radius * scaleFactor;
    ctx.fillStyle = '#00f0ff'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy - sr * 0.4, sr * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - sr, sy + sr); ctx.quadraticCurveTo(sx, sy - sr * 0.5, sx + sr, sy + sr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "white"; ctx.font = `${12 * scaleFactor}px Meiryo`; ctx.textAlign = "center";
    ctx.fillText(player.id, sx, sy + sr + 15);
    
    roomData.forEach(room => {
        if (room.isDiscovered) {
            const allCompleted = room.tasks.every(t => t.status === 'completed');
            drawPin(gameOffsetX + (room.x * scaleFactor), gameOffsetY + (room.y * scaleFactor), allCompleted ? '#00ccff' : '#ff3333', scaleFactor);
        }
    });
}

function drawPin(x, y, color, scale) {
    const size = 15 * scale;
    ctx.fillStyle = color; ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (size/2), y - size); ctx.lineTo(x + (size/2), y - size); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - size, size/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
}

function addTime(minutes) { accumulatedTime += minutes; updateTimeGauge(); }
function updateTimeGauge() {
    let percent = Math.min((accumulatedTime / MAX_TIME_LIMIT) * 100, 100);
    timerBarFill.style.width = percent + "%";
    timerText.textContent = `${accumulatedTime} / ${MAX_TIME_LIMIT} 分`;
    timerBarFill.style.backgroundColor = percent < 50 ? "#00ff00" : percent < 80 ? "#ffcc00" : "#ff3333";
}
function checkTimeLimit() { if (accumulatedTime >= MAX_TIME_LIMIT) { finishGame(); return true; } return false; }

// --- ゲーム終了処理 ---
function finishGame() {
    isGameRunning = false;
    eventPopup.style.display = 'none';
    if(dpadControls) dpadControls.style.display = 'none'; 
    
    draw(); 
    const dataURL = canvas.toDataURL("image/jpeg", 0.8);
    const imgContainer = document.getElementById('result-map-image-container');
    imgContainer.innerHTML = "";
    const img = document.createElement('img'); img.src = dataURL; img.style.maxWidth = "100%"; img.style.border = "1px solid white";
    imgContainer.appendChild(img);

    const saveImgBtn = document.getElementById('btn-save-image');
    if(saveImgBtn) saveImgBtn.onclick = () => { const link = document.createElement('a'); link.href = dataURL; link.download = `trajectory_${player.id}_${Date.now()}.jpg`; link.click(); };

    sendImageToGAS(); sendTrajectoryToGAS();

    resultLogBody.innerHTML = "";
    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${log.elapsedTime}</td><td>${log.location}</td><td>${log.event}</td><td>${log.choice}</td><td>${log.result}</td>`;
        resultLogBody.appendChild(tr);
    });

    const btnArea = resultScreen.querySelector('.button-area');
    let oldBtn = document.getElementById('btn-manual-send'); if(oldBtn) oldBtn.remove();
    const manualSendBtn = document.createElement('button'); manualSendBtn.id = 'btn-manual-send'; manualSendBtn.className = 'dl-btn'; manualSendBtn.style.backgroundColor = '#ff9900'; manualSendBtn.textContent = '結果をサーバーに再送信';
    manualSendBtn.onclick = () => { alert("送信を開始します..."); sendTrajectoryToGAS(); setTimeout(()=>sendImageToGAS(), 1000); };
    btnArea.insertBefore(manualSendBtn, btnArea.firstChild);

    resultScreen.style.display = 'flex';
}

window.showEndScreen = () => { resultScreen.style.display = 'none'; endScreen.style.display = 'flex'; };

// --- CSVパース（★新しいCSVの列順に合わせて修正） ---
function parseCSV(text) {
    const lines = text.trim().split('\n'); roomData = [];
    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]); if(row.length < 5) continue;
        
        // CSVの列のインデックスを新しいフォーマットに修正
        const csvNo = row[0];
        const csvManageId = ""; // 管理No列がなくなったため空白で処理
        const roomName = row[1];
        const x = parseInt(row[2]); // C列
        const y = parseInt(row[3]); // D列
        const r = parseInt(row[4]); // E列
        const order = parseInt(row[5]); // F列
        
        let room = roomData.find(d => d.name === roomName && Math.abs(d.x - x) < 5 && Math.abs(d.y - y) < 5);
        if(!room) { room = { name: roomName, x: x, y: y, radius: r, tasks: [], isDiscovered: false, ignoreUntilExit: false, currentTaskIndex: 0, csvNo: csvNo, csvManageId: csvManageId }; roomData.push(room); }
        
        // 選択肢の列も1つずつ左にズレたため修正
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

// --- イベント制御 ---
function checkEvents() {
    if (!hasPlayerMoved) return; if(eventPopup.style.display === 'flex') return;
    for (let i = 0; i < roomData.length; i++) {
        const room = roomData[i];
        if (Math.hypot(player.x - room.x, player.y - room.y) < room.radius) {
            room.isDiscovered = true;
            if (room.ignoreUntilExit) continue; 
            if(room.tasks.filter(t => t.status === 'pending').length === 0) continue;
            if(room.currentTaskIndex >= room.tasks.length) room.currentTaskIndex = 0;
            let foundTask = null, startIndex = room.currentTaskIndex, count = 0;
            while(count < room.tasks.length) {
                let idx = (startIndex + count) % room.tasks.length;
                if(room.tasks[idx].status === 'pending') { room.currentTaskIndex = idx; foundTask = room.tasks[idx]; break; }
                count++;
            }
            if (foundTask) { triggerEvent(room, foundTask); break; }
        } else { room.ignoreUntilExit = false; }
    }
}

function triggerEvent(room, task) {
    keys = {};
    document.getElementById('event-title').textContent = `場所: ${room.name}`; 
    document.getElementById('event-desc').innerHTML = `<strong>${task.name}</strong><br>${task.description}`;
    eventOpenTime = Date.now();
    
    const choicesDiv = document.getElementById('event-choices'); 
    choicesDiv.innerHTML = "";
    
    task.choices.forEach((c, index) => { 
        const btn = document.createElement('button'); 
        btn.className = 'choice-btn'; 
        btn.innerHTML = c.text; 

        if (index < 3) {
            btn.style.backgroundColor = '#007bff';
            btn.onmouseover = () => btn.style.backgroundColor = '#0056b3';
            btn.onmouseout = () => btn.style.backgroundColor = '#007bff';
        } else if (index === 3) {
            btn.style.backgroundColor = '#ffcc00';
            btn.style.color = '#000';
            btn.onmouseover = () => btn.style.backgroundColor = '#e6b800';
            btn.onmouseout = () => btn.style.backgroundColor = '#ffcc00';
        }

        btn.onclick = () => resolveEvent(room, task, c, index); 
        choicesDiv.appendChild(btn); 
    });
    
    const holdBtn = document.createElement('button'); 
    holdBtn.className = 'choice-btn'; 
    holdBtn.style.backgroundColor = '#777';
    holdBtn.textContent = 'この場所以外を探索する（保留）';
    holdBtn.onclick = () => { room.ignoreUntilExit = true; eventPopup.style.display = 'none'; recordLog(room, task, "保留", "この場所以外を探索する"); };
    choicesDiv.appendChild(holdBtn); 
    
    document.getElementById('close-btn').style.display = 'none'; 
    eventPopup.style.display = 'flex';
}

function resolveEvent(room, task, choice, choiceIndex) {
    if(choiceIndex === 3) task.status = 'pending'; else task.status = 'completed';
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
    div.innerHTML = `<span class=\"log-time\">[${accumulatedTime}分]</span> <span class=\"log-event\">${location}</span><br>選択: ${choice}${duration !== undefined ? ` (決断:${duration}秒)` : ""}`;
    logSection.prepend(div);
}

function sendToGAS(data) { fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true }).catch(e=>console.error(e)); }
function sendImageToGAS() { try { fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'image', playerId: player.id, sessionUUID: sessionUUID, startTime: sessionStartTime, image: canvas.toDataURL("image/jpeg", 0.7).split("base64,")[1] }), keepalive: true }); } catch (e) {} }
function sendTrajectoryToGAS() {
    if (movementHistory.length === 0) return;
    let hist = movementHistory.length > 3000 ? movementHistory.filter((_, i) => i % Math.ceil(movementHistory.length / 3000) === 0) : movementHistory;
    const payload = { type: 'trajectory', playerId: player.id, sessionUUID: sessionUUID, startTime: sessionStartTime, history: hist };
    const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain' });
    if(navigator.sendBeacon) {
        navigator.sendBeacon(GAS_URL, blob);
    } else {
        fetch(GAS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload), keepalive: true });
    }
}

// --- スタートボタン ---
document.getElementById('btn-start').onclick = () => {
    const id = playerIdInput.value; if(!id) { alert("IDを入力してください"); return; }
    player.id = id; sessionUUID = Date.now().toString(36) + Math.random().toString(36).substr(2); sessionStartTime = new Date().toLocaleString();
    
    document.getElementById('top-screen').style.display = 'none';
    isGameRunning = true;
    
    // ★スタート位置。もし別の座標から始めたければ、マウスで調べてここの数字を変えてください！
    player.x = 414; player.y = 364; 
    
    recordTrajectoryPoint(); hasPlayerMoved = false;

    if (dpadControls) {
        dpadControls.style.display = 'grid';
    }
};

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