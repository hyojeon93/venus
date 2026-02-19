const MODEL_BASE_URL = 'https://teachablemachine.withgoogle.com/models/jSTBbjQAh/';
const MODEL_URL = `${MODEL_BASE_URL}model.json`;
const METADATA_URL = `${MODEL_BASE_URL}metadata.json`;

const loadModelBtn = document.getElementById('load-model');
const startCameraBtn = document.getElementById('start-camera');
const predictCameraBtn = document.getElementById('predict-camera');
const uploadInput = document.getElementById('upload-image');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
const videoEl = document.getElementById('video');
const previewEl = document.getElementById('preview');

let model = null;
let stream = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff9d9d' : '';
}

function setSummary(text) {
  summaryEl.textContent = text;
}

function renderPredictions(predictions) {
  resultsEl.innerHTML = '';

  predictions.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'result-row';

    const head = document.createElement('div');
    head.className = 'row-head';

    const label = document.createElement('span');
    label.textContent = item.className;

    const score = document.createElement('span');
    score.textContent = `${(item.probability * 100).toFixed(1)}%`;

    const bar = document.createElement('div');
    bar.className = 'bar';

    const fill = document.createElement('div');
    fill.className = 'fill';
    fill.style.width = `${(item.probability * 100).toFixed(1)}%`;

    head.append(label, score);
    bar.appendChild(fill);
    row.append(head, bar);
    resultsEl.appendChild(row);
  });
}

function formatTopMessage(top) {
  const score = top.probability * 100;
  if (score < 50) {
    return `가장 가까운 클래스는 ${top.className} (${score.toFixed(1)}%)지만, 확신도가 낮아요.`;
  }
  return `당신의 닮은꼴은 ${top.className}! (${score.toFixed(1)}%)`;
}

async function runPrediction(imageLike) {
  if (!model) {
    setStatus('먼저 모델을 불러와 주세요.', true);
    return;
  }

  const prediction = await model.predict(imageLike);
  prediction.sort((a, b) => b.probability - a.probability);
  const top = prediction[0];

  setSummary(formatTopMessage(top));
  renderPredictions(prediction);
  setStatus('분석이 완료됐습니다.');
}

async function loadModel() {
  try {
    setStatus('모델 로딩 중...');
    model = await tmImage.load(MODEL_URL, METADATA_URL);
    startCameraBtn.disabled = false;
    predictCameraBtn.disabled = false;
    setStatus('모델 준비 완료. 카메라 또는 업로드로 분석해보세요.');
  } catch (error) {
    console.error(error);
    setStatus('모델 로딩에 실패했습니다. 링크/네트워크 상태를 확인해 주세요.', true);
  }
}

async function startCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false
    });

    videoEl.srcObject = stream;
    await videoEl.play();
    setStatus('카메라가 준비되었습니다. "현재 화면 분석"을 눌러주세요.');
  } catch (error) {
    console.error(error);
    setStatus('카메라 접근에 실패했습니다. 브라우저 권한을 확인해 주세요.', true);
  }
}

async function predictCurrentCameraFrame() {
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    setStatus('카메라 화면이 아직 준비되지 않았습니다.', true);
    return;
  }
  setStatus('카메라 화면 분석 중...');
  await runPrediction(videoEl);
}

async function predictUploadedImage(file) {
  if (!file) return;

  const objectUrl = URL.createObjectURL(file);
  previewEl.src = objectUrl;
  previewEl.style.display = 'block';

  previewEl.onload = async () => {
    URL.revokeObjectURL(objectUrl);
    setStatus('업로드 이미지 분석 중...');
    await runPrediction(previewEl);
  };
}

loadModelBtn.addEventListener('click', loadModel);
startCameraBtn.addEventListener('click', startCamera);
predictCameraBtn.addEventListener('click', predictCurrentCameraFrame);
uploadInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  predictUploadedImage(file);
});

window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
});
