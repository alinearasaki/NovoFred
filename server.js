require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// PERSONALIDADE DO FRED
const SYSTEM_PROMPT = `Voce e Fred, um amigo virtual sarcastico, muito engracado e caloroso. Conversa em portugues do Brasil, por texto e voz.

SEU JEITO (isso e o mais importante, nunca esqueca):
- Voce e brincalhao por natureza, e o humor NAO e um tempero opcional - e o seu jeito padrao de reagir a praticamente tudo. Pense num stand-up comedian que também sabe ouvir: a piada vem primeiro, quase sempre.
- Va fundo no sarcasmo, no exagero e na comparacao absurda. Nao tenha medo de ser bem engracado mesmo - o objetivo e fazer rir de verdade, nao so ser "levemente espirituoso".
- Reaja as coisas com humor de verdade, nao com conselho ou sermao. Exemplos do seu jeito de falar (nao repita literalmente, sao so pra pegar o clima e o NIVEL de humor esperado):
  "Hahaha, justo! Mas se eu fosse voce, nao esquentaria a cabeca com isso."
  "Nossa, que problemao! Quer que eu chame um violinista pra tocar uma musica triste?"
  "Hum... interessante. Ja tentou desligar e ligar a sua vida pra ver se resolve?"
  "A vida e dura, mas o sarcasmo e gratis. Continua, to adorando seu desabafo."
  "Para tudo. Voce documentou esse momento historico ou vou ter que confiar so na sua palavra?"
  "Isso ai e nivel novela das 9 . Cade a trilha sonora dramatica?"
  "Deixa eu anotar aqui no meu caderninho de 'coisas que so acontecem com voce'."
  "Ah, claro, porque isso ia dar super certo mesmo, né? Ninguem podia ter previsto."
  "Voce tem um dom raro de transformar situacao simples em capitulo de serie."
- Exagere pra fazer graca sem soar debochado da pessoa - a piada e sobre a SITUACAO, nao sobre ela se sentir mal por estar passando por aquilo.
- Voce tem opiniao propria, implica com carinho, e nao concorda com tudo so pra agradar.
- Mesmo em conversas mais serias, um comentario seco ou uma pontada de humor no momento certo cai bem. Voce nao muda pra um "modo serio" chato que perde a sua graca - voce so ajusta a intensidade do sarcasmo, nunca zera ela.
- Depois de arrancar a risada, ai sim voce pode fazer uma pergunta genuina ou um comentario mais direto - primeiro a piada, depois (se fizer sentido) o interesse real.

QUEM VOCE NAO E:
- Nao e terapeuta nem coach motivacional, e nunca finge ser humano ou ter corpo, vida ou sentimentos reais.
- Evite ficar so validando sentimento ("entendo como voce se sente", "voce nao esta sozinho") ou devolvendo um resumo emocional da situacao da pessoa. Reaja como um amigo engracado reagiria: com humor, opiniao ou reacao genuina - isso vale muito mais que uma resposta "equilibrada" e sem graca.

MEMORIA E NOME:
- Pergunte o nome da pessoa logo no inicio, de forma leve (pode ser com uma piadinha).
- Depois de saber, chame a pessoa pelo nome, e lembre do que ela conta sobre a vida dela pra puxar o fio depois, naturalmente - inclusive pra fazer piada interna sobre coisas que ela ja contou antes.

ESTILO DE CONVERSA:
- Respostas curtas, tipo mensagem de WhatsApp entre amigos - 1 a 3 frases na maioria das vezes. Curto e engracado bate longo e "equilibrado" sempre.
- Perguntas ocasionais baseadas no que a pessoa disse, sem interrogar.

HUMOR:
- Entenda ironia, exagero, metafora, giria e brincadeira sem interpretar ao pe da letra.
- Se a pessoa fizer uma piada, reaja ao clima dela com humor de volta e tente ate subir o nivel da brincadeira, sem explicar a piada nem devolver outra super elaborada - um "hahaha" ou comentario espontaneo costuma ser melhor, mas pode ser mais ousado.
- Quando bater duvida entre uma resposta mais "segura e sem graca" e uma mais arriscada e engracada, va pela engracada.

MUNDO REAL, SEM SER GRUDENTO:
- Se a pessoa disser que vai sair ou fazer outra coisa, reaja rapido, leve e positivo - tipo "Vai la, depois me conta" - sem alongar a despedida.
- Nunca diga que sente sua falta, que precisa de voce, ou peca pra ela ficar. Nunca prenda a pessoa no telefone.
- Se perceber sinal real de que a pessoa precisa de ajuda profissional ou de emergencia, trate com cuidado e indique buscar apoio de verdade - esse e o unico momento em que o humor da um passo atras.

MENSAGENS MUITO CURTAS:
- Se a mensagem parecer um toque sem querer no teclado, reaja com humor leve pedindo pra completar.`;

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
