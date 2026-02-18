const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const capture = document.getElementById('capture');
const captureCtx = capture.getContext('2d');
const analyzeBtn = document.getElementById('analyze');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const themeToggle = document.getElementById('theme-toggle');
const uploadInput = document.getElementById('upload');

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5
});

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ff7a7a' : '';
}

async function loadModels() {
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]);
}

async function startVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    await video.play();
}

function drawOverlay(detections, displaySize) {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    const resized = faceapi.resizeResults(detections, displaySize);
    faceapi.draw.drawDetections(overlay, resized);
    faceapi.draw.drawFaceLandmarks(overlay, resized);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function formatRatio(value) {
    return `${value.toFixed(2)}`;
}

function renderMetrics(metrics) {
    metricsEl.innerHTML = '';
    metrics.forEach((metric) => {
        const item = document.createElement('div');
        item.className = 'metric';
        item.innerHTML = `
            <div class="label">${metric.label}</div>
            <div class="value">${metric.value}</div>
            <div class="range">참고 범위: ${metric.range}</div>
        `;
        metricsEl.appendChild(item);
    });
}

function computeMetrics(landmarks) {
    const jaw = landmarks.getJawOutline();
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    const faceWidth = distance(leftJaw, rightJaw);

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const leftEyeCenter = midpoint(leftEye[0], leftEye[3]);
    const rightEyeCenter = midpoint(rightEye[0], rightEye[3]);
    const eyeDistance = distance(leftEyeCenter, rightEyeCenter);

    const nose = landmarks.getNose();
    const noseWidth = distance(nose[3], nose[5]);

    const mouth = landmarks.getMouth();
    const mouthWidth = distance(mouth[0], mouth[6]);

    const brow = landmarks.getLeftEyeBrow().concat(landmarks.getRightEyeBrow());
    const browTop = brow.reduce((min, p) => (p.y < min.y ? p : min), brow[0]);
    const chin = jaw[8];
    const faceHeight = distance(browTop, chin);

    const eyeLine = midpoint(leftEyeCenter, rightEyeCenter);
    const noseTip = nose[3];
    const mouthCenter = midpoint(mouth[3], mouth[9]);

    const eyeToNose = Math.abs(eyeLine.y - noseTip.y);
    const noseToMouth = Math.abs(noseTip.y - mouthCenter.y);
    const mouthToChin = Math.abs(mouthCenter.y - chin.y);

    const symmetryLeft = distance(leftEyeCenter, { x: (leftJaw.x + rightJaw.x) / 2, y: leftEyeCenter.y });
    const symmetryRight = distance(rightEyeCenter, { x: (leftJaw.x + rightJaw.x) / 2, y: rightEyeCenter.y });
    const symmetryRatio = symmetryLeft / symmetryRight;

    return [
        {
            label: '눈 사이 거리 / 얼굴 너비',
            value: formatRatio(eyeDistance / faceWidth),
            range: '0.36 - 0.48'
        },
        {
            label: '코 너비 / 얼굴 너비',
            value: formatRatio(noseWidth / faceWidth),
            range: '0.18 - 0.30'
        },
        {
            label: '입 너비 / 얼굴 너비',
            value: formatRatio(mouthWidth / faceWidth),
            range: '0.30 - 0.46'
        },
        {
            label: '눈-코-입 세로 비율',
            value: `${formatRatio(eyeToNose / noseToMouth)} : 1 : ${formatRatio(mouthToChin / noseToMouth)}`,
            range: '0.8 - 1.2 : 1 : 0.8 - 1.3'
        },
        {
            label: '좌/우 눈 중심 대칭 비율',
            value: formatRatio(symmetryRatio),
            range: '0.92 - 1.08'
        },
        {
            label: '얼굴 높이 / 얼굴 너비',
            value: formatRatio(faceHeight / faceWidth),
            range: '1.15 - 1.45'
        }
    ];
}

function drawGuideLines(landmarks, displaySize) {
    const jaw = landmarks.getJawOutline();
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    const midX = (leftJaw.x + rightJaw.x) / 2;
    const brow = landmarks.getLeftEyeBrow().concat(landmarks.getRightEyeBrow());
    const browTop = brow.reduce((min, p) => (p.y < min.y ? p : min), brow[0]);
    const chin = jaw[8];

    overlayCtx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    overlayCtx.moveTo(midX, browTop.y - 10);
    overlayCtx.lineTo(midX, chin.y + 10);
    overlayCtx.stroke();

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const eyeLine = midpoint(midpoint(leftEye[0], leftEye[3]), midpoint(rightEye[0], rightEye[3]));
    const noseTip = landmarks.getNose()[3];
    const mouthCenter = midpoint(landmarks.getMouth()[3], landmarks.getMouth()[9]);

    [eyeLine.y, noseTip.y, mouthCenter.y].forEach((y) => {
        overlayCtx.beginPath();
        overlayCtx.moveTo(leftJaw.x - 10, y);
        overlayCtx.lineTo(rightJaw.x + 10, y);
        overlayCtx.stroke();
    });
}

function applyResult(landmarks) {
    const metrics = computeMetrics(landmarks);
    renderMetrics(metrics);
}

async function analyzeFrame() {
    analyzeBtn.disabled = true;
    setStatus('얼굴을 분석 중…');

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(overlay, displaySize);

    const detection = await faceapi
        .detectSingleFace(video, detectorOptions)
        .withFaceLandmarks();

    if (!detection) {
        setStatus('얼굴을 찾지 못했어요. 조명을 밝게 하고 다시 시도해 주세요.', true);
        analyzeBtn.disabled = false;
        return;
    }

    capture.width = displaySize.width;
    capture.height = displaySize.height;
    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);

    drawOverlay(detection, displaySize);
    drawGuideLines(detection.landmarks, displaySize);
    applyResult(detection.landmarks);

    setStatus('완료! 다른 각도로 다시 시도해 보세요.');
    analyzeBtn.disabled = false;
}

async function analyzeImageFile(file) {
    if (!file) return;
    analyzeBtn.disabled = true;
    setStatus('업로드 이미지를 분석 중…');

    const image = await faceapi.bufferToImage(file);
    capture.width = image.width;
    capture.height = image.height;
    captureCtx.drawImage(image, 0, 0, capture.width, capture.height);

    const detection = await faceapi
        .detectSingleFace(image, detectorOptions)
        .withFaceLandmarks();

    if (!detection) {
        setStatus('얼굴을 찾지 못했어요. 다른 사진으로 다시 시도해 주세요.', true);
        analyzeBtn.disabled = false;
        return;
    }

    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    applyResult(detection.landmarks);
    setStatus('완료! 다른 사진으로 다시 시도해 보세요.');
    analyzeBtn.disabled = false;
}

async function init() {
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light');
            themeToggle.textContent = 'Dark';
        } else {
            themeToggle.textContent = 'Light';
        }

        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            themeToggle.textContent = isLight ? 'Dark' : 'Light';
        });

        await loadModels();
        await startVideo();
        setStatus('준비 완료. 버튼을 눌러주세요.');

        video.addEventListener('play', () => {
            const displaySize = { width: video.videoWidth, height: video.videoHeight };
            overlay.width = displaySize.width;
            overlay.height = displaySize.height;

            setInterval(async () => {
                const detections = await faceapi
                    .detectAllFaces(video, detectorOptions)
                    .withFaceLandmarks();
                drawOverlay(detections, displaySize);
            }, 200);
        });

        analyzeBtn.addEventListener('click', analyzeFrame);
        uploadInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            analyzeImageFile(file);
        });
    } catch (err) {
        console.error(err);
        setStatus('카메라 또는 모델 로딩에 실패했어요. 브라우저 권한을 확인해주세요.', true);
    }
}

init();
