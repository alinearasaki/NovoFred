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
let mediaRecorder = null;
let audioChunks = [];
let recording = false;
let maxRecTimeout = null;

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
    const audio = new Audio(url);
    setStatus('Falando...');
    audio.onended = () => {
      setStatus('');
      if (handsFree) iniciarGravacao();
    };
    await audio.play();
  } catch (err) {
    setStatus('');
    if (handsFree) iniciarGravacao();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

async function iniciarGravacao() {
  if (recording) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Seu navegador nao permite usar o microfone aqui.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) ? 'audio/webm' :
                      ((window.MediaRecorder && MediaRecorder.isTypeSupported('audio/mp4')) ? 'audio/mp4' : '');
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    audioChunks = [];
    recording = true;
    micBtn.classList.add('recording');
    setStatus('Ouvindo... toque no microfone de novo pra enviar');

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recording = false;
      micBtn.classList.remove('recording');
      if (maxRecTimeout) { clearTimeout(maxRecTimeout); maxRecTimeout = null; }
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      if (blob.size < 500) {
        setStatus('');
        return;
      }
      enviarAudio(blob);
    };

    mediaRecorder.start();
    maxRecTimeout = setTimeout(() => {
      if (recording && mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    }, 30000);
  } catch (err) {
    setStatus('Nao consegui acessar o microfone. Confirma se voce permitiu o acesso.');
  }
}

function pararGravacao() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
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
  if (recording) {
    pararGravacao();
  } else {
    iniciarGravacao();
  }
});

handsFreeBtn.addEventListener('click', () => {
  handsFree = !handsFree;
  handsFreeBtn.textContent = 'Maos-livres: ' + (handsFree ? 'ligado' : 'desligado');
  handsFreeBtn.classList.toggle('on', handsFree);
  if (handsFree) {
    iniciarGravacao();
  } else if (recording) {
    pararGravacao();
  }
});
