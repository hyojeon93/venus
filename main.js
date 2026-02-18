const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const capture = document.getElementById('capture');
const captureCtx = capture.getContext('2d');
const analyzeBtn = document.getElementById('analyze');
const statusEl = document.getElementById('status');
const celebImage = document.getElementById('celeb-image');
const celebName = document.getElementById('celeb-name');
const celebScore = document.getElementById('celeb-score');
const celebVibe = document.getElementById('celeb-vibe');

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

const celebrities = [
    {
        name: 'Zendaya',
        img: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/Zendaya_2019_by_Glenn_Francis.jpg',
        vibe: '차분하면서도 강렬한 분위기'
    },
    {
        name: 'Park Seo-joon',
        img: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Park_Seo-joon_2018.jpg',
        vibe: '부드러운 인상과 또렷한 이목구비'
    },
    {
        name: 'IU',
        img: 'https://upload.wikimedia.org/wikipedia/commons/8/8b/Lee_Ji-eun_%28IU%29_2018.jpg',
        vibe: '맑고 선명한 이미지'
    },
    {
        name: 'Chris Evans',
        img: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Chris_Evans_by_Gage_Skidmore_2.jpg',
        vibe: '선이 또렷한 클래식한 분위기'
    },
    {
        name: 'Kim Go-eun',
        img: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Kim_Go-eun_2016.jpg',
        vibe: '자연스럽고 세련된 인상'
    },
    {
        name: 'Timothée Chalamet',
        img: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Timoth%C3%A9e_Chalamet_2017_Berlinale.jpg',
        vibe: '섬세한 분위기와 강한 존재감'
    }
];

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
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
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

function descriptorToIndex(descriptor) {
    const total = descriptor.reduce((sum, value, idx) => sum + Math.abs(value) * (idx + 1), 0);
    return Math.floor(total * 1000) % celebrities.length;
}

function scoreFromDescriptor(descriptor) {
    const variance = descriptor.reduce((sum, v) => sum + Math.abs(v), 0);
    return 72 + Math.floor((variance * 1000) % 23);
}

async function analyzeFrame() {
    analyzeBtn.disabled = true;
    setStatus('얼굴을 분석 중…');

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(overlay, displaySize);

    const detection = await faceapi
        .detectSingleFace(video, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) {
        setStatus('얼굴을 찾지 못했어요. 조명을 밝게 하고 다시 시도해 주세요.', true);
        analyzeBtn.disabled = false;
        return;
    }

    capture.width = displaySize.width;
    capture.height = displaySize.height;
    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);

    drawOverlay(detection, displaySize);

    const index = descriptorToIndex(Array.from(detection.descriptor));
    const celeb = celebrities[index];
    const score = scoreFromDescriptor(Array.from(detection.descriptor));

    celebImage.src = celeb.img;
    celebName.textContent = celeb.name;
    celebScore.textContent = `Similarity ${score}%`;
    celebVibe.textContent = celeb.vibe;

    setStatus('완료! 다른 각도로 다시 시도해 보세요.');
    analyzeBtn.disabled = false;
}

async function init() {
    try {
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
    } catch (err) {
        console.error(err);
        setStatus('카메라 또는 모델 로딩에 실패했어요. 브라우저 권한을 확인해주세요.', true);
    }
}

init();
