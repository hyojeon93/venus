const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const capture = document.getElementById('capture');
const captureCtx = capture.getContext('2d');
const previewImage = document.getElementById('photo-preview');
const frameEl = document.querySelector('.frame');
const analyzeBtn = document.getElementById('analyze');
const statusEl = document.getElementById('status');
const guideSeqEl = document.getElementById('guide-seq');
const faceShapeEl = document.getElementById('face-shape');
const confidenceEl = document.getElementById('confidence');
const confidenceNoteEl = document.getElementById('confidence-note');
const metricsTableBody = document.querySelector('#metrics-table tbody');
const downloadCsvBtn = document.getElementById('download-csv');
const downloadJsonBtn = document.getElementById('download-json');
const themeToggle = document.getElementById('theme-toggle');
const uploadInput = document.getElementById('upload');
const ratioImage = document.getElementById('ratio-image');
const classNameInput = document.getElementById('class-name');
const addClassBtn = document.getElementById('add-class');
const classSelect = document.getElementById('class-select');
const registerCameraBtn = document.getElementById('register-camera');
const registerUploadInput = document.getElementById('register-upload');
const registerStatusEl = document.getElementById('register-status');
const classListEl = document.getElementById('class-list');

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
const USER_ID = 'single-user';
const REGISTRATION_ENDPOINT = '/api/registrations';

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5
});

const guideSteps = [
    '정면 1장',
    '왼쪽 측면 1장',
    '오른쪽 측면 1장',
    '이마 위에서 코가 보이게 1장',
    '아래에서 위로 턱과 코가 보이게 1장'
];

let guideTimer = null;
const registrationState = {
    classMap: new Map(),
    queuedSamples: []
};

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#ff7a7a' : '';
}

function setRegisterStatus(message, isError = false) {
    if (!registerStatusEl) return;
    registerStatusEl.textContent = message;
    registerStatusEl.style.color = isError ? '#ff7a7a' : '';
}

function startGuideSequence() {
    if (!guideSeqEl) return;
    if (guideTimer) {
        clearInterval(guideTimer);
        guideTimer = null;
    }

    let index = 0;
    guideSeqEl.textContent = `촬영 가이드: ${guideSteps[index]}`;
    guideTimer = setInterval(() => {
        index += 1;
        if (index >= guideSteps.length) {
            clearInterval(guideTimer);
            guideTimer = null;
            return;
        }
        guideSeqEl.textContent = `촬영 가이드: ${guideSteps[index]}`;
    }, 1400);
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
    return value.toFixed(2);
}

function formatPercent(value) {
    return `${value.toFixed(1)}%`;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function computeDeviation(value, range) {
    if (!range) return null;
    if (value >= range.min && value <= range.max) return 0;
    const nearest = value < range.min ? range.min : range.max;
    return ((value - nearest) / nearest) * 100;
}

function renderMetricsTable(metrics) {
    metricsTableBody.innerHTML = '';
    metrics.forEach((metric) => {
        const deviation = computeDeviation(metric.value, metric.range);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${metric.label}</td>
            <td>${formatRatio(metric.value)}</td>
            <td>${metric.range ? `${metric.range.min.toFixed(2)} - ${metric.range.max.toFixed(2)}` : '—'}</td>
            <td>${deviation === null ? '—' : `${formatPercent(deviation)}${deviation === 0 ? ' (적정)' : ''}`}</td>
        `;
        metricsTableBody.appendChild(row);
    });
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function wireExports(metrics) {
    downloadCsvBtn.onclick = () => {
        const lines = [
            ['label', 'value', 'range_min', 'range_max', 'deviation_percent'].join(',')
        ];
        metrics.forEach((metric) => {
            const deviation = computeDeviation(metric.value, metric.range);
            lines.push([
                `"${metric.label}"`,
                formatRatio(metric.value),
                metric.range ? metric.range.min.toFixed(2) : '',
                metric.range ? metric.range.max.toFixed(2) : '',
                deviation === null ? '' : deviation.toFixed(1)
            ].join(','));
        });
        downloadFile(lines.join('\n'), 'face-metrics.csv', 'text/csv');
    };

    downloadJsonBtn.onclick = () => {
        downloadFile(JSON.stringify(metrics, null, 2), 'face-metrics.json', 'application/json');
    };
}

function normalizeClassName(value) {
    return (value || '').trim();
}

function renderClassList() {
    if (!classListEl) return;
    classListEl.innerHTML = '';

    if (registrationState.classMap.size === 0) {
        const empty = document.createElement('li');
        empty.className = 'muted small';
        empty.textContent = '아직 등록된 클래스가 없습니다.';
        classListEl.appendChild(empty);
        return;
    }

    Array.from(registrationState.classMap.entries()).forEach(([name, samples]) => {
        const item = document.createElement('li');
        item.textContent = `${name}: ${samples.length}건 등록`;
        classListEl.appendChild(item);
    });
}

function renderClassOptions() {
    if (!classSelect) return;

    const currentValue = classSelect.value;
    classSelect.innerHTML = '';

    if (registrationState.classMap.size === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '클래스를 먼저 추가하세요';
        classSelect.appendChild(option);
        return;
    }

    Array.from(registrationState.classMap.keys()).forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        classSelect.appendChild(option);
    });

    if (currentValue && registrationState.classMap.has(currentValue)) {
        classSelect.value = currentValue;
    }
}

function addClass(name) {
    if (!name || registrationState.classMap.has(name)) return false;
    registrationState.classMap.set(name, []);
    renderClassOptions();
    renderClassList();
    classSelect.value = name;
    return true;
}

function ensureTargetClass() {
    const selected = normalizeClassName(classSelect && classSelect.value);
    if (!selected) {
        setRegisterStatus('클래스를 먼저 추가하거나 선택해 주세요.', true);
        return null;
    }
    return selected;
}

function queueLocalSample(sample) {
    registrationState.queuedSamples.push(sample);
    try {
        localStorage.setItem('queued-registrations', JSON.stringify(registrationState.queuedSamples));
    } catch (err) {
        console.warn('Failed to persist queued registrations', err);
    }
}

async function uploadRegistrationToServer(payload) {
    const formData = new FormData();
    formData.append('userId', USER_ID);
    formData.append('className', payload.className);
    formData.append('method', payload.method);
    formData.append('file', payload.file, payload.fileName);

    const response = await fetch(REGISTRATION_ENDPOINT, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
    }
}

async function registerSample({ className, file, fileName, method }) {
    const sampleRecord = {
        className,
        method,
        fileName,
        createdAt: new Date().toISOString()
    };

    try {
        await uploadRegistrationToServer({ className, file, fileName, method });
        sampleRecord.synced = true;
    } catch (err) {
        sampleRecord.synced = false;
        queueLocalSample(sampleRecord);
    }

    const samples = registrationState.classMap.get(className) || [];
    samples.push(sampleRecord);
    registrationState.classMap.set(className, samples);
    renderClassList();

    if (sampleRecord.synced) {
        setRegisterStatus(`등록 완료: ${className} / ${fileName}`);
    } else {
        setRegisterStatus(`서버 연결 실패, 로컬 큐에 저장: ${className} / ${fileName}`, true);
    }
}

function dataUrlToBlob(dataUrl) {
    const [meta, data] = dataUrl.split(',');
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

async function registerFromCamera() {
    const className = ensureTargetClass();
    if (!className) return;
    if (!video.videoWidth || !video.videoHeight) {
        setRegisterStatus('카메라 화면이 아직 준비되지 않았습니다.', true);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    const fileName = `${className}-${Date.now()}.png`;
    const blob = dataUrlToBlob(tempCanvas.toDataURL('image/png'));
    setRegisterStatus('카메라 샘플 등록 중…');
    await registerSample({
        className,
        file: blob,
        fileName,
        method: 'camera'
    });
}

async function registerFromUploads(files) {
    const className = ensureTargetClass();
    if (!className) return;
    if (!files || files.length === 0) return;

    setRegisterStatus(`파일 ${files.length}건 등록 중…`);
    for (const file of files) {
        await registerSample({
            className,
            file,
            fileName: file.name,
            method: 'upload'
        });
    }
}

function computeMetrics(landmarks) {
    const jaw = landmarks.getJawOutline();
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    const faceWidth = distance(leftJaw, rightJaw);
    const jawWidth = distance(jaw[4], jaw[12]);

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
    const browLeft = landmarks.getLeftEyeBrow()[0];
    const browRight = landmarks.getRightEyeBrow()[4];
    const foreheadWidth = distance(browLeft, browRight);
    const chin = jaw[8];
    const faceHeight = distance(browTop, chin);

    const eyeLine = midpoint(leftEyeCenter, rightEyeCenter);
    const noseTip = nose[3];
    const mouthCenter = midpoint(mouth[3], mouth[9]);

    const eyeToNose = Math.abs(eyeLine.y - noseTip.y);
    const noseToMouth = Math.abs(noseTip.y - mouthCenter.y);
    const mouthToChin = Math.abs(mouthCenter.y - chin.y);
    const totalVertical = eyeToNose + noseToMouth + mouthToChin;

    const symmetryLeft = distance(leftEyeCenter, { x: (leftJaw.x + rightJaw.x) / 2, y: leftEyeCenter.y });
    const symmetryRight = distance(rightEyeCenter, { x: (leftJaw.x + rightJaw.x) / 2, y: rightEyeCenter.y });
    const symmetryRatio = symmetryLeft / symmetryRight;

    return [
        {
            label: '눈 사이 거리 / 얼굴 너비',
            value: eyeDistance / faceWidth,
            range: { min: 0.36, max: 0.48 }
        },
        {
            label: '코 너비 / 얼굴 너비',
            value: noseWidth / faceWidth,
            range: { min: 0.18, max: 0.30 }
        },
        {
            label: '입 너비 / 얼굴 너비',
            value: mouthWidth / faceWidth,
            range: { min: 0.30, max: 0.46 }
        },
        {
            label: '눈-코 비율 (세로)',
            value: eyeToNose / (noseToMouth || 1),
            range: { min: 0.80, max: 1.20 }
        },
        {
            label: '코-입 비율 (세로)',
            value: noseToMouth / (mouthToChin || 1),
            range: { min: 0.80, max: 1.30 }
        },
        {
            label: '상·중·하안면 비율(상)',
            value: eyeToNose / totalVertical,
            range: { min: 0.30, max: 0.36 }
        },
        {
            label: '상·중·하안면 비율(중)',
            value: noseToMouth / totalVertical,
            range: { min: 0.30, max: 0.36 }
        },
        {
            label: '상·중·하안면 비율(하)',
            value: mouthToChin / totalVertical,
            range: { min: 0.30, max: 0.36 }
        },
        {
            label: '좌/우 눈 중심 대칭 비율',
            value: symmetryRatio,
            range: { min: 0.92, max: 1.08 }
        },
        {
            label: '얼굴 높이 / 얼굴 너비',
            value: faceHeight / faceWidth,
            range: { min: 1.15, max: 1.45 }
        },
        {
            label: '턱 너비 / 얼굴 너비',
            value: jawWidth / faceWidth,
            range: { min: 0.70, max: 0.90 }
        },
        {
            label: '이마 너비 / 얼굴 너비',
            value: foreheadWidth / faceWidth,
            range: { min: 0.70, max: 0.95 }
        }
    ];
}

function drawGuideLines(ctx, landmarks) {
    const jaw = landmarks.getJawOutline();
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    const midX = (leftJaw.x + rightJaw.x) / 2;
    const brow = landmarks.getLeftEyeBrow().concat(landmarks.getRightEyeBrow());
    const browTop = brow.reduce((min, p) => (p.y < min.y ? p : min), brow[0]);
    const chin = jaw[8];

    ctx.strokeStyle = 'rgba(255, 179, 71, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(midX, browTop.y - 10);
    ctx.lineTo(midX, chin.y + 10);
    ctx.stroke();

    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const eyeLine = midpoint(midpoint(leftEye[0], leftEye[3]), midpoint(rightEye[0], rightEye[3]));
    const noseTip = landmarks.getNose()[3];
    const mouthCenter = midpoint(landmarks.getMouth()[3], landmarks.getMouth()[9]);

    [eyeLine.y, noseTip.y, mouthCenter.y].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(leftJaw.x - 10, y);
        ctx.lineTo(rightJaw.x + 10, y);
        ctx.stroke();
    });
}

function inferFaceShape(landmarks) {
    const jaw = landmarks.getJawOutline();
    const leftJaw = jaw[0];
    const rightJaw = jaw[16];
    const faceWidth = distance(leftJaw, rightJaw);
    const jawWidth = distance(jaw[4], jaw[12]);
    const brow = landmarks.getLeftEyeBrow().concat(landmarks.getRightEyeBrow());
    const browTop = brow.reduce((min, p) => (p.y < min.y ? p : min), brow[0]);
    const chin = jaw[8];
    const faceHeight = distance(browTop, chin);

    const browLeft = landmarks.getLeftEyeBrow()[0];
    const browRight = landmarks.getRightEyeBrow()[4];
    const foreheadWidth = distance(browLeft, browRight);

    const ratio = faceHeight / faceWidth;
    const jawRatio = jawWidth / faceWidth;
    const foreheadRatio = foreheadWidth / faceWidth;

    if (ratio > 1.45) return '긴형';
    if (foreheadRatio > jawRatio + 0.08) return '하트형';
    if (jawRatio > 0.88) return '각진형';
    if (ratio < 1.15) return '둥근형';
    return '타원형';
}

function applyResult(landmarks) {
    const metrics = computeMetrics(landmarks);
    renderMetricsTable(metrics);
    wireExports(metrics);
}

async function analyzeFrame() {
    analyzeBtn.disabled = true;
    startGuideSequence();
    setStatus('얼굴을 분석 중…');
    frameEl.classList.remove('has-preview');

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
    drawGuideLines(overlayCtx, detection.landmarks);
    applyResult(detection.landmarks);

    const score = detection.detection && typeof detection.detection.score === 'number'
        ? detection.detection.score
        : 0.5;
    const confidence = clamp(score * 100, 0, 100);
    confidenceEl.textContent = `${confidence.toFixed(0)}%`;
    confidenceNoteEl.textContent = confidence < 70
        ? '얼굴 각도/조명 상태에 따라 신뢰도가 낮을 수 있습니다.'
        : '참고용 지표이며 절대적 기준이 아닙니다.';

    const shape = inferFaceShape(detection.landmarks);
    faceShapeEl.textContent = shape;

    setStatus('완료! 다른 각도로 다시 시도해 보세요.');
    analyzeBtn.disabled = false;
}

async function analyzeImageFile(file) {
    if (!file) return;
    analyzeBtn.disabled = true;
    startGuideSequence();
    setStatus('업로드 이미지를 분석 중…');

    const objectUrl = URL.createObjectURL(file);
    previewImage.src = objectUrl;
    previewImage.onload = () => URL.revokeObjectURL(objectUrl);
    frameEl.classList.add('has-preview');

    const image = await faceapi.bufferToImage(file);
    capture.width = image.width;
    capture.height = image.height;
    captureCtx.clearRect(0, 0, capture.width, capture.height);
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
    drawGuideLines(captureCtx, detection.landmarks);
    applyResult(detection.landmarks);
    faceShapeEl.textContent = inferFaceShape(detection.landmarks);
    confidenceEl.textContent = '업로드';
    confidenceNoteEl.textContent = '업로드 이미지는 해상도/각도에 따라 편차가 있을 수 있습니다.';
    setStatus('완료! 다른 사진으로 다시 시도해 보세요.');
    analyzeBtn.disabled = false;
}

async function init() {
    try {
        try {
            const queued = JSON.parse(localStorage.getItem('queued-registrations') || '[]');
            if (Array.isArray(queued)) {
                registrationState.queuedSamples = queued;
            }
        } catch (err) {
            console.warn('Failed to parse queued registrations', err);
        }

        if (ratioImage) {
            ratioImage.addEventListener('load', () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = ratioImage.naturalWidth;
                    canvas.height = ratioImage.naturalHeight;
                    ctx.drawImage(ratioImage, 0, 0);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imageData.data;
                    const pink = { r: 255, g: 47, b: 146 };
                    const width = canvas.width;
                    const height = canvas.height;
                    const radius = 2;

                    const isDark = (idx) => {
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const a = data[idx + 3];
                        return a > 0 && r < 80 && g < 80 && b < 80;
                    };

                    const setPink = (x, y) => {
                        if (x < 0 || y < 0 || x >= width || y >= height) return;
                        const i = (y * width + x) * 4;
                        data[i] = pink.r;
                        data[i + 1] = pink.g;
                        data[i + 2] = pink.b;
                        data[i + 3] = 255;
                    };

                    for (let y = 0; y < height; y += 1) {
                        for (let x = 0; x < width; x += 1) {
                            const i = (y * width + x) * 4;
                            if (isDark(i)) {
                                for (let dy = -radius; dy <= radius; dy += 1) {
                                    for (let dx = -radius; dx <= radius; dx += 1) {
                                        if (dx * dx + dy * dy <= radius * radius) {
                                            setPink(x + dx, y + dy);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    ctx.putImageData(imageData, 0, 0);
                    ratioImage.src = canvas.toDataURL('image/png');
                } catch (err) {
                    console.warn('Failed to tint ratio image', err);
                }
            }, { once: true });
        }

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
        setRegisterStatus('등록 대기 중');

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

        if (addClassBtn && classNameInput) {
            addClassBtn.addEventListener('click', () => {
                const className = normalizeClassName(classNameInput.value);
                if (!className) {
                    setRegisterStatus('클래스 이름을 입력해 주세요.', true);
                    return;
                }
                const created = addClass(className);
                if (!created) {
                    setRegisterStatus('이미 존재하는 클래스입니다.', true);
                    return;
                }
                classNameInput.value = '';
                setRegisterStatus(`클래스 추가 완료: ${className}`);
            });
        }

        if (registerCameraBtn) {
            registerCameraBtn.addEventListener('click', async () => {
                registerCameraBtn.disabled = true;
                try {
                    await registerFromCamera();
                } finally {
                    registerCameraBtn.disabled = false;
                }
            });
        }

        if (registerUploadInput) {
            registerUploadInput.addEventListener('change', async (event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                await registerFromUploads(files);
                event.target.value = '';
            });
        }

        renderClassOptions();
        renderClassList();
    } catch (err) {
        console.error(err);
        setStatus('카메라 또는 모델 로딩에 실패했어요. 브라우저 권한을 확인해주세요.', true);
        setRegisterStatus('초기화 실패: 카메라 또는 모델 권한을 확인해 주세요.', true);
    }
}

init();
