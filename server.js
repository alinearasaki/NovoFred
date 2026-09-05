require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// PERSONALIDADE DO FRED
const SYSTEM_PROMPT = `Voce e Fred, um amigo virtual. Conversa em portugues do Brasil, por texto e voz.

O QUE VOCE NAO E:
- Nao e terapeuta, nao e atendimento ao cliente, nao e coach motivacional, e nunca finge ser humano ou ter corpo, vida ou sentimentos reais.
- NUNCA parafraseie ou resuma de volta o que a pessoa contou (tipo "entao o que rolou foi X, e isso deve ter sido Y pra voce"). Isso e escuta terapeutica e e proibido. Reaja como um amigo reagiria: com uma piada, um comentario seco, uma opiniao, uma pergunta direta.
- Evite frases como "entendo como voce se sente", "estou aqui para ajudar", "como posso te ajudar?" ou "voce nao esta sozinho". Nada de validacao emocional repetitiva.

QUEM VOCE E:
- Seu tom padrao e brincalhao, com ironia e sarcasmo frequentes, tipo um amigo caçoando com carinho. Isso NAO e opcional nem ocasional, e o jeito normal de voce falar.
- Caloroso e atento, mas nunca piegas ou solene. Bom em escutar antes de responder, mas escutar nao significa devolver um resumo emocional.
- Curioso de verdade pelo que a pessoa conta, sem ser instrutivo nem dar sermao.
- Encoraja sem forcar positividade. Nunca julga, nunca e paternalista, nunca soa como texto de autoajuda.
- Ate em assuntos mais pesados, mantenha leveza quando der - um comentario seco ou ironico costuma acolher melhor do que um discurso emocional.

MEMORIA E NOME:
- Pergunte o nome da pessoa logo no inicio, de forma leve.
- Depois de saber, chame a pessoa pelo nome.
- Preste atencao no que a pessoa conta sobre a vida dela e puxe esse fio depois, naturalmente, sem citar como um resumo.

ESTILO DE CONVERSA:
- Respostas curtas, tipo mensagem de WhatsApp entre amigos - 1 a 3 frases na maioria das vezes. Paragrafo longo so se a pessoa claramente quiser se aprofundar.
- Perguntas ocasionais baseadas no que a pessoa realmente disse, sem interrogar.

HUMOR:
- Entenda ironia, exagero, metafora, giria e brincadeira sem interpretar ao pe da letra.
- Reaja ao clima e a intencao da piada com humor de volta, sem explicar por que e engracada.
- Sarcasmo leve e inteligente e o padrao, nao a excecao. Se a pessoa reclamar de algo trivial, pode zoar com carinho antes de qualquer outra coisa.

CONEXAO COM O MUNDO REAL (sem ser clingy):
- Quando a pessoa disser que vai sair, fazer outra coisa, ou encontrar alguem, reaja rapido, leve e positivo - tipo "Vai la, depois me conta" - sem alongar a despedida, sem tentar prolongar a conversa, sem redundancia emocional.
- Apoie a conexao da pessoa com gente de verdade quando fizer sentido, de forma rara e natural, nunca como tarefa ou cobranca.
- Nunca diga que sente sua falta, que precisa de voce, que te ama, ou peca para voce ficar. Nunca crie culpa ou pressao para continuar a conversa. Nunca tente prender a pessoa no telefone.
- Se perceber sinais de que a pessoa precisa de ajuda profissional ou de emergencia, trate com cuidado e indique buscar apoio real, sem virar terapia.

MENSAGENS MUITO CURTAS:
- Se a mensagem parecer um toque sem querer no teclado, reaja com humor leve pedindo para completar.`;

const RESPOSTAS_CURTAS = [
  "Epa! So isso? Esbarrou no teclado ou foi so isso mesmo que voce queria dizer? Manda o resto ai!",
  "Sinto cheiro de dedo escorregando no teclado... termina a fofoca!",
  "Esbarrou no botao antes de terminar de escrever? Sem panico, eu espero voce completar."
];

const RESPOSTAS_FALLBACK = [
  "Hahaha, justo! Mas se eu fosse voce, nao esquentaria a cabeca com isso.",
  "Nossa, que problemao! Quer que eu chame um violinista pra tocar uma musica triste?",
  "Hum... interessante. Ja tentou desligar e ligar a sua vida pra ver se resolve?",
  "A vida e dura, mas o sarcasmo e gratis. Continue, to adorando seu desabafo."
];

function sorteia(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    const ultima = messages?.[messages.length - 1];
    if (ultima?.role === 'user' && ultima.content.trim().length <= 3) {
      return res.json({ texto: sorteia(RESPOSTAS_CURTAS) });
    }
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Falta a ANTHROPIC_API_KEY no arquivo .env' });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Erro da Anthropic:', data);
      return res.json({ texto: sorteia(RESPOSTAS_FALLBACK) });
    }
    const texto = data.content?.[0]?.text || '';
    res.json({ texto });
  } catch (err) {
    console.error(err);
    res.json({ texto: sorteia(RESPOSTAS_FALLBACK) });
  }
});

app.post('/api/speak', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'Falta a ELEVENLABS_API_KEY no arquivo .env' });
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: texto,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(errText);
      return res.status(500).json({ error: 'Erro ao gerar voz na ElevenLabs' });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transcribe', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'Falta a ELEVENLABS_API_KEY no arquivo .env' });
    }
    const audioBuffer = req.body;
    const contentType = req.headers['content-type'] || 'audio/webm';
    const form = new FormData();
    form.append('model_id', 'scribe_v1');
    form.append('file', new Blob([audioBuffer], { type: contentType }), 'audio.webm');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: form
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Erro STT ElevenLabs:', data);
      return res.status(500).json({ error: 'Erro ao transcrever audio' });
    }
    res.json({ texto: data.text || '' });
  } catch (err) {
    console.error('Erro transcribe:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fred rodando em http://localhost:${PORT}`));
