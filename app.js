const chatEl = document.getElementById('chat');
const formEl = document.getElementById('form');
const inputEl = document.getElementById('input');
const micBtn = document.getElementById('micBtn');
const handsFreeBtn = document.getElementById('handsFreeBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');

const STORAGE_KEY = 'fred_conversa';
const MENSAGEM_ABERTURA = 'Oi. Quer conversar um pouco?';

let history = [];
let handsFree = false;

const audioPlayer = new Audio();
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audioPlayer.play().catch(() => {});
  audioPlayer.pause();
}
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('touchend', unlockAudio, { once: true });

let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;
let currentAudioCtx = null;
let recording = false;
let maxRecTimeout = null;
let watchdogTimeout = null;
let silenceRAF = null;

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = 'bubble ' + role;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text || '';
}

function salvarMemoria() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {}
}

function iniciarConversa() {
  let salvo = null;
  try {
    salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (e) { salvo = null; }

  if (Array.isArray(salvo) && salvo.length > 0) {
    history = salvo;
    history.forEach((m) => addBubble(m.role, m.content));
  } else {
    history = [{ role: 'assistant', content: MENSAGEM_ABERTURA }];
    addBubble('assistant', MENSAGEM_ABERTURA);
    salvarMemoria();
  }
}

resetBtn.addEventListener('click', () => {
  if (!confirm('Comecar uma conversa nova com o Fred? Isso apaga o que ele lembra de voce.')) return;
  localStorage.removeItem(STORAGE_KEY);
  chatEl.innerHTML = '';
  iniciarConversa();
});

iniciarConversa();

async function sendMessage(texto) {
  if (!texto || !texto.trim()) return;
  addBubble('user', texto);
  history.push({ role: 'user', content: texto });
  salvarMemoria();
  inputEl.value = '';
  setStatus('Fred esta digitando...');

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history })
    });
    const data = await resp.json();
    if (!resp.ok) {
      setStatus('');
      addBubble('assistant', 'Ops, deu um erro: ' + (data.error || 'desconhecido'));
      return;
    }
    history.push({ role: 'assistant', content: data.texto });
    salvarMemoria();
    addBubble('assistant', data.texto);
    await falar(data.texto);
  } catch (err) {
    setStatus('');
    addBubble('assistant', 'Nao consegui falar com o servidor: ' + err.message);
  }
}

async function falar(texto) {
  setStatus('Gerando voz...');
  try {
    const resp = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texto })
    });
    if (!resp.ok) {
      setStatus('');
      if (handsFree) iniciarGravacao();
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    audioPlayer.pause();
    audioPlayer.src = url;
    setStatus('Falando...');
    audioPlayer.onended = () => {
      setStatus('');
      if (handsFree) iniciarGravacao();
    };
    await audioPlayer.play();
  } catch (err) {
    setStatus('');
    if (handsFree) iniciarGravacao();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

// No iOS, fechar e reabrir o microfone (getUserMedia) a cada gravacao faz o
// Safari nao reativar a captura de audio direito na vez seguinte (o stream
// "abre" mas fica mudo). Por isso, no modo maos-livres, mantemos o MESMO
// stream e o MESMO AudioContext abertos entre uma gravacao e outra, e so
// fechamos de vez quando o maos-livres e desligado (ou da erro real).
function limparGravacao(fecharStream) {
  if (maxRecTimeout) { clearTimeout(maxRecTimeout); maxRecTimeout = null; }
  if (watchdogTimeout) { clearTimeout(watchdogTimeout); watchdogTimeout = null; }
  if (silenceRAF) { cancelAnimationFrame(silenceRAF); silenceRAF = null; }
  mediaRecorder = null;
  recording = false;
  micBtn.classList.remove('recording');

  if (fecharStream) {
    if (currentAudioCtx) {
      try { currentAudioCtx.close(); } catch (e) {}
      currentAudioCtx = null;
    }
    if (currentStream) {
      try { currentStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      currentStream = null;
    }
  }
}

async function iniciarGravacao() {
  if (recording) return;
  limparGravacao(false);
  unlockAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Seu navegador nao permite usar o microfone aqui.');
    return;
  }
  try {
    // Reaproveita o microfone ja aberto (se ainda estiver ativo) em vez de
    // pedir um novo a cada gravacao - isso e o que resolve o problema no iOS.
    let stream = currentStream;
    const streamMorto = !stream || stream.getAudioTracks().every((t) => t.readyState === 'ended');
    if (streamMorto) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      currentStream = stream;
    }
    const mimeType = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' :
                      ((window.MediaRecorder && MediaRecorder.isTypeSupported('audio/mp4')) ? 'audio/mp4' : '');
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    audioChunks = [];
    recording = true;
    micBtn.classList.add('recording');
    setStatus('Ouvindo...');

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const tipo = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
      const blob = new Blob(audioChunks, { type: tipo });
      // so fecha o stream de vez se o maos-livres estiver desligado;
      // se estiver ligado, mantem o microfone aberto pra proxima escuta
      limparGravacao(!handsFree);
      if (blob.size < 500) {
        setStatus('');
        return;
      }
      enviarAudio(blob);
    };
    mediaRecorder.onerror = () => {
      limparGravacao(true);
      setStatus('Deu erro no microfone. Tenta de novo.');
    };

    mediaRecorder.start();

    try {
      // Reaproveita o AudioContext ja existente (se ainda estiver rodando)
      // em vez de fechar e criar um novo a cada gravacao.
      let audioCtx = currentAudioCtx;
      if (!audioCtx || audioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        currentAudioCtx = audioCtx;
      }
      if (audioCtx.state !== 'running' && audioCtx.resume) {
        await audioCtx.resume().catch(() => {});
      }
      if (audioCtx.state === 'running') {
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const inicioGravacao = Date.now();
        let ultimoSom = Date.now();
        const LIMIAR = 10;
        const SILENCIO_MS = 1600;
        const MIN_GRAVACAO_MS = 1200;

        const checarSilencio = () => {
          if (!recording) return;
          analyser.getByteFrequencyData(dataArray);
          let soma = 0;
          for (let i = 0; i < dataArray.length; i++) soma += dataArray[i];
          const media = soma / dataArray.length;
          if (media > LIMIAR) ultimoSom = Date.now();
          const agora = Date.now();
          if (agora - inicioGravacao > MIN_GRAVACAO_MS && agora - ultimoSom > SILENCIO_MS) {
            pararGravacao();
            return;
          }
          silenceRAF = requestAnimationFrame(checarSilencio);
        };
        silenceRAF = requestAnimationFrame(checarSilencio);
      }
      // se o audioCtx nao rodar (comum em auto-restart no iOS), seguimos sem
      // parada automatica - o limite de 30s abaixo garante que nao fica preso.
    } catch (e) {
      // se o navegador nao suportar analise de audio, so seguimos sem parada automatica
    }

    maxRecTimeout = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 30000);
    watchdogTimeout = setTimeout(() => {
      if (recording) {
        limparGravacao(true);
        setStatus('O microfone travou. Toca de novo pra tentar.');
      }
    }, 35000);
  } catch (err) {
    limparGravacao(true);
    setStatus('Nao consegui acessar o microfone. Confirma se voce permitiu o acesso.');
  }
}

function pararGravacao() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  } else {
    limparGravacao(!handsFree);
  }
}

async function enviarAudio(blob) {
  setStatus('Transcrevendo...');
  try {
    const resp = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': blob.type || 'audio/webm' },
      body: blob
    });
    const data = await resp.json();
    if (!resp.ok || !data.texto || !data.texto.trim()) {
      setStatus('Nao consegui te ouvir direito. Tenta falar de novo.');
      return;
    }
    sendMessage(data.texto);
  } catch (err) {
    setStatus('Nao consegui transcrever. Tenta de novo.');
  }
}

micBtn.addEventListener('click', () => {
  unlockAudio();
  if (recording) {
    pararGravacao();
  } else {
    iniciarGravacao();
  }
});

handsFreeBtn.addEventListener('click', () => {
  unlockAudio();
  handsFree = !handsFree;
  handsFreeBtn.textContent = 'Maos-livres: ' + (handsFree ? 'ligado' : 'desligado');
  handsFreeBtn.classList.toggle('on', handsFree);
  if (handsFree) {
    iniciarGravacao();
  } else if (recording) {
    pararGravacao();
  }
});
