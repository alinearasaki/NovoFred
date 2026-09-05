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
let recognition = null;
let recognizing = false;
let travouTimeout = null;

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
  if (!texto.trim()) return;
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
      if (handsFree) iniciarEscuta();
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    setStatus('Falando...');
    audio.onended = () => {
      setStatus('');
      if (handsFree) iniciarEscuta();
    };
    await audio.play();
  } catch (err) {
    setStatus('');
    if (handsFree) iniciarEscuta();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(inputEl.value);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function pararEscuta() {
  if (travouTimeout) { clearTimeout(travouTimeout); travouTimeout = null; }
  recognizing = false;
  micBtn.classList.remove('recording');
}

function iniciarEscuta() {
  if (!SpeechRecognition) {
    setStatus('Seu navegador nao suporta reconhecimento de voz. Use texto ou tente no Chrome.');
    return;
  }
  if (recognizing) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognizing = true;
    micBtn.classList.add('recording');
    setStatus('Ouvindo...');
    travouTimeout = setTimeout(() => {
      try { recognition.stop(); } catch (e) {}
      pararEscuta();
      setStatus('Nao consegui te ouvir direito. Tenta falar de novo.');
    }, 10000);
  };
  recognition.onresult = (event) => {
    pararEscuta();
    const texto = event.results[0][0].transcript;
    sendMessage(texto);
  };
  recognition.onerror = () => {
    pararEscuta();
    setStatus('');
  };
  recognition.onend = () => {
    pararEscuta();
  };
  recognition.start();
}

micBtn.addEventListener('click', () => {
  if (recognizing) {
    recognition.stop();
  } else {
    iniciarEscuta();
  }
});

handsFreeBtn.addEventListener('click', () => {
  handsFree = !handsFree;
  handsFreeBtn.textContent = 'Maos-livres: ' + (handsFree ? 'ligado' : 'desligado');
  handsFreeBtn.classList.toggle('on', handsFree);
  if (handsFree) {
    iniciarEscuta();
  } else if (recognizing) {
    recognition.stop();
  }
});
