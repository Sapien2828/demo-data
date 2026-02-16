// script.js - 座標取得・全画面表示対応版

// DOM要素
const topScreen = document.getElementById('top-screen');
const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const statusDiv = document.getElementById('status-message'); 
const debugCoords = document.getElementById('coord-display');

// 画像読み込み
const mapImg = new Image();
mapImg.src = "map.bmp"; // 必ずアップロードされたファイル名と一致させてください

// マップ読み込み完了時の処理
mapImg.onload = () => {
    // キャンバスの内部解像度を画像の「本来のサイズ」に合わせる
    canvas.width = mapImg.width;
    canvas.height = mapImg.height;

    // 描画
    drawMap();
    console.log(`マップ読み込み完了: 幅${mapImg.width}px, 高さ${mapImg.height}px`);
};

// --- 描画処理 ---
function drawMap() {
    // マップ画像をそのまま描画
    ctx.drawImage(mapImg, 0, 0);

    // 既存の座標設定があれば赤丸で表示（確認用）
    // roomData変数がもしあればここでループして描画
}

// --- 座標取得クリックイベント（最重要） ---
canvas.addEventListener('mousedown', (e) => {
    // キャンバスが画面上で今どのくらいの大きさで表示されているか取得
    const rect = canvas.getBoundingClientRect();
    
    // 縮尺比率を計算（元のサイズ / 表示されているサイズ）
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // クリック位置を計算
    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);
    
    // 画面表示更新
    debugCoords.innerHTML = `X: <span style="color:yellow;">${clickX}</span>, Y: <span style="color:yellow;">${clickY}</span>`;
    
    // クリップボードにコピー
    const coordText = `${clickX},${clickY}`;
    navigator.clipboard.writeText(coordText).then(() => {
        statusDiv.textContent = `コピー完了: ${coordText}`;
        statusDiv.style.color = "#4f4";
    }).catch(() => {
        statusDiv.textContent = `座標: ${coordText}`;
    });

    // クリックした場所に印をつける（視覚フィードバック）
    drawMap(); // 一旦クリア
    ctx.beginPath();
    ctx.arc(clickX, clickY, 15, 0, Math.PI * 2); // 半径15pxの円
    ctx.strokeStyle = "red";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
    ctx.fill();
    
    console.log(`取得座標: ${clickX}, ${clickY}`);
});

// ゲーム開始ボタン
function startGame() {
    topScreen.style.display = 'none';
}