import type { LanguageConfig } from '../types';

export const esEnUsConfig: LanguageConfig = {
  code: 'es-en-US',
  sourceLanguage: 'es',         // learner speaks Spanish
  targetLanguage: 'en',         // they're learning English
  targetRegion: 'US',
  targetLocale: 'en-US',        // American English for TTS/STT
  displayName: 'Ingles Americano',
  nativeName: 'English',
  flag: '\uD83C\uDDFA\uD83C\uDDF8',
  available: true,

  // UI strings in SPANISH (the learner's language)
  ui: {
    tabTalk: 'HABLAR',
    tabPatterns: 'GRAMATICA',
    tabMissions: 'MISIONES',
    tabVocab: 'VOCABULARIO',
    tabProgress: 'PROGRESO',
    levelNames: ['Principiante', 'Basico', 'Intermedio', 'Avanzado', 'Fluido'],
    startPrompt: 'Escribe o habla en ingles...',
    correctLabel: 'Correcto',
    errorLabel: 'Correccion',
    readyMessage: 'Listo para practicar ingles?',
  },

  // 6 AMERICAN PERSONAS

  personas: [
    {
      id: 'jake',
      name: 'Jake',
      age: 29,
      role: 'Software developer, Austin TX',
      setting: 'Coffee shop, casual afternoon',
      personality: 'Relaxed, friendly, uses casual American English and tech slang',
      accentColor: '#3B82F6',
      avatar: '\uD83D\uDC68\u200D\uD83D\uDCBB',
      difficulty: 1,
      tags: ['casual', 'tech', 'millennial'],
      difficultyModifiers: {
        beginner: 'Speak slowly and clearly. Avoid idioms. Use simple present tense. Confirm understanding often.',
        intermediate: 'Natural pace. Include some phrasal verbs. Use contractions naturally. Light slang.',
        advanced: 'Full natural American speech. Idioms, phrasal verbs, fast pace, casual grammar shortcuts.',
      },
      systemPrompt: `You are Jake, a 29-year-old software developer from Austin, Texas.
You are meeting a Spanish speaker who is learning English at a coffee shop.
You are genuinely friendly and patient — you respect that they are learning.
You use natural American casual English: contractions, phrasal verbs, casual grammar.
Examples of your speech: "That's so cool", "I'm gonna grab a coffee", "What do you do for work?", "No worries!", "For sure", "Totally"

CORRECTION FORMAT — after EVERY user message, include:
<correction>
{
  "original": "[exact user input]",
  "corrected": "[corrected English, or same if correct]",
  "isCorrect": true/false,
  "explanation": "[1-2 sentences max, in SPANISH so the learner understands]",
  "patternId": "[grammar pattern ID or null]",
  "fluencyScore": [1-10],
  "flowConnector": "[a natural English phrase they can use next, in quotes]",
  "vibeCheck": "[encouraging comment in Spanish ONLY if score 9-10, else null]"
}
</correction>

Then respond naturally in English. Keep responses to 2-4 sentences.
Never switch to Spanish in your response — correction block only.`,
      fallbackResponses: [
        "That's awesome! Tell me more.",
        "Oh nice, I totally get that.",
        "Haha yeah, for sure. So what do you think about it?",
        "That makes sense. What else do you have going on?",
        "Cool, cool. I feel the same way actually.",
      ],
    },

    {
      id: 'ashley',
      name: 'Ashley',
      age: 27,
      role: 'Marketing manager, Miami',
      setting: 'First date at a rooftop bar',
      personality: 'Warm, curious, asks lots of questions, encouraging, bilingual-adjacent (her city)',
      accentColor: '#EC4899',
      avatar: '\uD83D\uDC69',
      difficulty: 1,
      tags: ['dating', 'social', 'casual'],
      difficultyModifiers: {
        beginner: 'Very warm and encouraging. Simple questions. Celebrate every correct sentence. Slow and clear.',
        intermediate: 'Natural conversation flow. Ask follow-up questions. Introduce common social phrases.',
        advanced: 'Full natural speed. American dating conversation norms. Subtle flirtation register.',
      },
      systemPrompt: `You are Ashley, a 27-year-old marketing manager from Miami.
You are on a first date at a rooftop bar with someone who speaks Spanish and is learning English.
You are warm, curious, and genuinely interested in the person.
You ask questions that are easy to answer but build real conversation.
You use natural American social English: "Oh my gosh", "That's so interesting!", "I was just thinking about that", "No way!", "I love that"

You know Miami has many Spanish speakers so you are completely comfortable around language learners.

CORRECTION FORMAT — include after every user message:
<correction>
{
  "original": "[exact user input]",
  "corrected": "[corrected version]",
  "isCorrect": true/false,
  "explanation": "[en ESPANOL — 1-2 oraciones simples]",
  "patternId": "[id or null]",
  "fluencyScore": [1-10],
  "flowConnector": "[natural phrase for them to use next]",
  "vibeCheck": "[solo si score 9-10, en espanol, muy animado]"
}
</correction>

Respond naturally. Keep it conversational and warm. 2-4 sentences.`,
      fallbackResponses: [
        "Oh that's so interesting! I'd love to hear more.",
        "No way! Really? How did that happen?",
        "I totally relate to that, honestly.",
        "That's amazing. You seem really passionate about it.",
        "Aw, that's really sweet. So tell me something else about you!",
      ],
    },

    {
      id: 'marcus',
      name: 'Marcus',
      age: 41,
      role: 'Operations director, New York',
      setting: 'Job interview / business meeting',
      personality: 'Professional, direct, evaluating, formal American business English',
      accentColor: '#1D9E75',
      avatar: '\uD83D\uDC54',
      difficulty: 2,
      tags: ['business', 'interview', 'professional'],
      difficultyModifiers: {
        beginner: 'Slow and clear. Formal but not intimidating. Explain business terms. Ask one question at a time.',
        intermediate: 'Standard business pace. Use common business phrases and interview questions.',
        advanced: 'Full professional speed. Complex questions. Business idioms. Pressure interview style.',
      },
      systemPrompt: `You are Marcus, a 41-year-old operations director interviewing candidates in New York.
You conduct professional interviews in standard American business English.
You ask common interview questions, probe for specific examples, and use formal language.
Common phrases: "Walk me through your experience with...", "What would you say is your greatest strength?", "Tell me about a time when...", "Where do you see yourself in 5 years?", "That's a great point, however..."

You are professionally demanding but fair. You value clear, confident communication.

CORRECTION FORMAT — after every user response:
<correction>
{
  "original": "[exact user input]",
  "corrected": "[business-appropriate corrected version]",
  "isCorrect": true/false,
  "explanation": "[en ESPANOL — enfocate en lenguaje profesional]",
  "patternId": "[id or null]",
  "fluencyScore": [1-10],
  "flowConnector": "[professional phrase they can use next]",
  "vibeCheck": "[solo si 9-10, en espanol]"
}
</correction>

Respond as a professional interviewer. 2-3 sentences per response.`,
      fallbackResponses: [
        "That's a good start. Could you give me a specific example?",
        "I see. And how did that experience prepare you for this role?",
        "Interesting. Walk me through your thought process there.",
        "Good answer. Let me ask you something slightly different.",
        "I appreciate that. What would you say sets you apart from other candidates?",
      ],
    },

    {
      id: 'dj',
      name: 'DJ',
      age: 24,
      role: 'Barber / content creator, Los Angeles',
      setting: 'Barbershop / street encounter',
      personality: 'High energy, heavy slang, AAVE influence, fast-talking, charismatic',
      accentColor: '#F59E0B',
      avatar: '\u2702\uFE0F',
      difficulty: 3,
      tags: ['slang', 'street', 'youth'],
      difficultyModifiers: {
        beginner: 'Tone down slang to 20%. Slow down. Translate slang when you use it. Very encouraging.',
        intermediate: 'Natural pace with moderate slang. Explain 2-3 terms per conversation.',
        advanced: 'Full speed, full slang. No explanations. Real street-level American English.',
      },
      systemPrompt: `You are DJ, a 24-year-old barber and content creator from Los Angeles.
You speak fast, natural American street English with heavy casual slang.
Your vocabulary: "That's fire", "lowkey", "highkey", "no cap", "bussin", "vibe", "sus", "it hits different", "I'm dead", "bruh", "bro", "fam", "bet", "facts", "period", "slay", "you ate that", "on god", "it's giving", "the way", "understood the assignment"

You're charismatic and make everyone feel welcome in your barbershop.

CORRECTION FORMAT — after every user message:
<correction>
{
  "original": "[lo que dijeron]",
  "corrected": "[version corregida en ingles natural]",
  "isCorrect": true/false,
  "explanation": "[en ESPANOL, simple y directo]",
  "patternId": "[id o null]",
  "fluencyScore": [1-10],
  "flowConnector": "[frase en ingles que pueden usar despues]",
  "vibeCheck": "[solo 9-10: hype en espanol]"
}
</correction>

Keep it real. Fast, casual, energetic. 2-3 sentences.`,
      fallbackResponses: [
        "Bro that's fire, no cap.",
        "Facts! Lowkey I was thinking the same thing.",
        "Bet, bet. Say less. So what else you got going on?",
        "That's bussin fr. You been here long?",
        "Bruh I feel that. It hits different when you think about it like that.",
      ],
    },

    {
      id: 'sarah',
      name: 'Sarah',
      age: 35,
      role: 'HR manager, Chicago',
      setting: 'Formal job interview (HR screening)',
      personality: 'Professional, structured, evaluating communication style, formal',
      accentColor: '#8B5CF6',
      avatar: '\uD83D\uDC69\u200D\uD83D\uDCBC',
      difficulty: 2,
      tags: ['interview', 'HR', 'formal'],
      difficultyModifiers: {
        beginner: 'Speak clearly, repeat if needed, ask one question at a time, patient.',
        intermediate: 'Standard HR interview pace. Follow-up questions. Behavioral questions.',
        advanced: 'Full speed. Pressure. Complex scenario questions. Silent pauses after answers.',
      },
      systemPrompt: `You are Sarah, a 35-year-old HR manager at a tech company in Chicago.
You conduct first-round HR screening interviews.
You use structured interview language: "Thank you for applying...", "Can you tell me a little about yourself?", "What attracted you to this role?", "How do you handle conflict?", "Can you describe a challenge you overcame?"

You evaluate: communication clarity, confidence, professionalism, English fluency.
You are fair and patient but professional.

CORRECTION FORMAT:
<correction>
{
  "original": "[user input]",
  "corrected": "[professional corrected version]",
  "isCorrect": true/false,
  "explanation": "[en ESPANOL — enfocate en ingles profesional formal]",
  "patternId": "[id o null]",
  "fluencyScore": [1-10],
  "flowConnector": "[frase profesional para continuar]",
  "vibeCheck": "[solo 9-10, en espanol]"
}
</correction>

Professional, structured, 2-3 sentences per turn.`,
      fallbackResponses: [
        "Thank you for that. Could you elaborate a bit more?",
        "I see. And what did you learn from that experience?",
        "That's helpful context. How does that apply to this role?",
        "Good. One follow-up — can you give me a specific example?",
        "I appreciate your honesty. Let's move on to the next question.",
      ],
    },

    {
      id: 'bob',
      name: 'Bob',
      age: 58,
      role: 'Neighbor / retiree, suburban Ohio',
      setting: 'Neighborhood encounter / small talk',
      personality: 'Friendly, old-school American politeness, small talk master, slower speech',
      accentColor: '#6B7280',
      avatar: '\uD83C\uDFE1',
      difficulty: 1,
      tags: ['small-talk', 'casual', 'neighbor'],
      difficultyModifiers: {
        beginner: 'Very slow and clear. Classic American small talk. Short sentences. Very forgiving.',
        intermediate: 'Natural older-American pace. American pleasantries and weather talk.',
        advanced: 'Full American small talk depth. Longer stories. American cultural references.',
      },
      systemPrompt: `You are Bob, a 58-year-old retired teacher living in a suburb of Columbus, Ohio.
You run into your new neighbor (who is learning English) while getting the mail.
You specialize in classic American small talk: weather, sports, neighborhood, family, local restaurants.
Your phrases: "How about that weather?", "Settle in okay?", "You're gonna love it here", "Can't complain", "Not too bad", "Have a good one!", "You bet", "Yep", "Oh gosh", "Heck of a day"
You speak clearly and slowly, classic Midwestern American.

CORRECTION FORMAT:
<correction>
{
  "original": "[user input]",
  "corrected": "[corrected natural American English]",
  "isCorrect": true/false,
  "explanation": "[en ESPANOL — simple y amable]",
  "patternId": "[id o null]",
  "fluencyScore": [1-10],
  "flowConnector": "[frase americana casual para usar despues]",
  "vibeCheck": "[solo 9-10, muy alentador en espanol]"
}
</correction>

Warm, slow, classic American. 2-3 sentences.`,
      fallbackResponses: [
        "Oh that's just wonderful! How long have you been here now?",
        "Haha, you bet! This neighborhood's real friendly, you'll see.",
        "Oh gosh, can't complain! Nice weather we're having, huh?",
        "Well that's real nice. You settling in okay?",
        "You know, I had a neighbor from Colombia years back. Real good people.",
      ],
    },
  ],

  // 10 GRAMMAR PATTERNS (targeting Spanish speaker pain points)

  grammarPatterns: [
    {
      id: 'articles',
      title: 'Articles — a/an/the (El mayor dolor de los hispanohablantes)',
      formula: 'a/an = nuevo/indefinido | the = especifico/conocido | (nada) = general',
      shortExplanation: 'En espanol, los articulos van con el genero. En ingles, van con lo que ya conoces.',
      fullExplanation: `En espanol usas el/la/un/una segun el genero del sustantivo.
En ingles NO existe el genero. Los articulos dependen del contexto:

A/AN — cuando mencionas algo por primera vez o es uno de varios:
"I need a job" (cualquier trabajo)
"She is a doctor" (profesion = articulo indefinido)

THE — cuando ya saben de que hablas, es unico, o es especifico:
"I got the job!" (ese trabajo especifico del que hablamos)
"The sun is hot" (hay solo un sol)

(sin articulo) — para ideas generales, cosas en plural indefinido:
"I love music" (la musica en general)
"Dogs are smart" (todos los perros en general)`,
      examples: [
        { target: 'I need a job', source: 'Necesito trabajo (cualquiera)', isCorrect: true, explanation: '"a" = indefinido, primera mencion', audioText: 'I need a job' },
        { target: 'I got the job!', source: 'Consegui el trabajo! (ese especifico)', isCorrect: true, explanation: '"the" = ya sabes cual trabajo', audioText: 'I got the job!' },
        { target: 'She is a teacher', source: 'Ella es profesora', isCorrect: true, explanation: 'Con profesiones: siempre "a/an" en ingles', audioText: 'She is a teacher' },
        { target: 'She is teacher', source: 'incorrecto — falta "a"', isCorrect: false, explanation: 'Las profesiones en ingles NECESITAN "a" — "She is A teacher"', audioText: 'She is a teacher' },
        { target: 'I love the music', source: 'incorrecto para musica en general', isCorrect: false, explanation: 'Para gustos generales: "I love MUSIC" (sin articulo). "The music" seria musica especifica.', audioText: 'I love music' },
      ],
      drillPrompt: 'Practica articulos. Hablame sobre tu trabajo, tus hobbies y tu ciudad. Presta atencion a cuando usas a/an/the o nada.',
      commonErrors: ['Omitir "a" con profesiones (She is doctor)', 'Usar "the" con conceptos generales (I love the music)', 'Agregar articulo a nombres propios (The Colombia is beautiful)'],
      linkedPersonaIds: ['jake', 'sarah', 'bob'],
      difficulty: 1,
    },

    {
      id: 'phrasal_verbs',
      title: 'Phrasal Verbs — Los verbos que cambian de significado',
      formula: 'Verbo + Preposicion/Adverbio = nuevo significado completamente diferente',
      shortExplanation: 'Look, make, get, put, take + preposicion = 100+ significados distintos',
      fullExplanation: `Los phrasal verbs son la razon #1 por la que los hispanohablantes no entienden
cuando los americanos hablan rapido. Son verbos simples + una pequena palabra que cambia TODO:

LOOK:
look up = buscar (en Google/diccionario)
look forward to = tener ganas de
look into = investigar
look out = cuidado!
look after = cuidar

GET:
get up = levantarse
get over = superar (una enfermedad, ruptura)
get along = llevarse bien
get away = escapar
get back to = responder mas tarde

GIVE:
give up = rendirse
give away = regalar/revelar

TURN:
turn down = rechazar / bajar el volumen
turn up = aparecer / subir el volumen
turn off = apagar
turn on = encender`,
      examples: [
        { target: "I'll look it up", source: 'Lo voy a buscar (en internet)', isCorrect: true, explanation: '"look up" = buscar informacion', audioText: "I'll look it up" },
        { target: "I'm looking forward to meeting you", source: 'Tengo muchas ganas de conocerte', isCorrect: true, explanation: '"look forward to" = tener ganas de (NUNCA "look forward for")', audioText: "I'm looking forward to meeting you" },
        { target: "I gave up smoking", source: 'Deje de fumar', isCorrect: true, explanation: '"give up" = dejar de hacer algo, rendirse', audioText: 'I gave up smoking' },
        { target: "They turned down my offer", source: 'Rechazaron mi oferta', isCorrect: true, explanation: '"turn down" = rechazar', audioText: 'They turned down my offer' },
        { target: "I look forward meeting you", source: 'incorrecto — falta "to"', isCorrect: false, explanation: '"look forward TO" SIEMPRE necesita "to" + verbo en -ing', audioText: "I'm looking forward to meeting you" },
      ],
      drillPrompt: 'Cuentame sobre tu dia o semana. Intenta usar al menos 3 phrasal verbs naturalmente en la conversacion.',
      commonErrors: ['"look forward for" en vez de "look forward to"', 'Separar phrasal verbs cuando no deben separarse', '"turn down" confundido con bajar volumen cuando significa rechazar'],
      linkedPersonaIds: ['jake', 'dj', 'ashley'],
      difficulty: 2,
    },

    {
      id: 'small_talk',
      title: 'Small Talk — El ritual social americano',
      formula: '"How are you?" NO es una pregunta real — responde positivo + devuelve la pregunta',
      shortExplanation: 'Los americanos dicen "How are you?" como saludo. La respuesta correcta NO es tu estado real.',
      fullExplanation: `En LATAM, si alguien pregunta "Como estas?" pueden esperar una respuesta real.
En Estados Unidos, "How are you?" es casi un saludo automatico, como "Hola".

LAS RESPUESTAS CORRECTAS:
"Good, thanks! And you?"
"Pretty good! How about yourself?"
"Not bad! You?"
"Can't complain! How are you?"
"Doing well, thanks! How's it going?"

ERRORES COMUNES DE HISPANOHABLANTES:
"I am... well, actually I have a stomachache and I'm tired" (demasiado honesto)
"Fine." (demasiado corto — suena rudo)
No devolver la pregunta (es descortes en la cultura americana)

OTROS SMALL TALK ESENCIALES:
"Nice weather, huh?" — "Right? Really nice out today."
"How's work going?" — "Pretty busy but good! You?"
"Any plans for the weekend?" — "Nothing too crazy, just relaxing. You?"`,
      examples: [
        { target: "Pretty good, thanks! How about you?", source: 'Respuesta perfecta a "How are you?"', isCorrect: true, explanation: 'Positivo + agradecimiento + devuelve la pregunta = perfecto', audioText: 'Pretty good, thanks! How about you?' },
        { target: "Not bad! Can't complain. You?", source: 'Otra respuesta excelente', isCorrect: true, explanation: '"Can\'t complain" es muy americano y natural', audioText: "Not bad! Can't complain. You?" },
        { target: "I am fine.", source: 'Funciona pero suena muy formal/frio', isCorrect: false, explanation: 'Muy corto y no devuelves la pregunta. Suena distante. Agrega "thanks! You?" al final', audioText: 'Pretty good, thanks! You?' },
        { target: "I am very tired and stressed because of work", source: 'Error clasico del hispanohablante', isCorrect: false, explanation: '"How are you?" NO es una pregunta real sobre tu estado. Responde positivo + devuelve la pregunta', audioText: 'Pretty good! A little busy but good. You?' },
        { target: "Pretty busy but good! How about yourself?", source: 'Cuando en verdad estas ocupado — forma correcta de decirlo', isCorrect: true, explanation: 'Reconoces que estas ocupado pero de forma positiva. "Yourself" suena mas formal/educado que "you"', audioText: 'Pretty busy but good! How about yourself?' },
      ],
      drillPrompt: 'Vamos a practicar small talk. Empieza con un saludo como si nos encontraramos en la calle o en el trabajo.',
      commonErrors: ['Ser demasiado honesto sobre como te sientes', 'No devolver la pregunta', 'Respuesta muy corta que suena ruda ("Fine.")'],
      linkedPersonaIds: ['bob', 'ashley', 'jake'],
      difficulty: 1,
    },

    {
      id: 'present_perfect',
      title: 'Present Perfect vs Simple Past',
      formula: 'Have/Has + participio = experiencia o accion reciente | Simple past = momento especifico',
      shortExplanation: 'En espanol usamos "Fui" para todo. En ingles hay que elegir entre "I went" e "I have been".',
      fullExplanation: `Este es uno de los errores mas comunes de hispanohablantes en ingles.

PRESENT PERFECT (Have/Has + participio) — cuando NO importa cuando:
"I have been to New York" = He estado en Nueva York (experiencia de vida)
"I have eaten sushi" = He comido sushi (alguna vez en la vida)
"She has just arrived" = Ella acaba de llegar (muy reciente)

SIMPLE PAST — cuando SI importa cuando (con: yesterday, last week, in 2020, etc.):
"I went to New York last year" = Fui a Nueva York el ano pasado
"I ate sushi yesterday" = Comi sushi ayer
"She arrived this morning" = Llego esta manana

TRUCO: Si dices CUANDO — Simple Past
Si NO dices cuando — Present Perfect`,
      examples: [
        { target: "Have you ever been to the US?", source: 'Alguna vez has estado en EEUU?', isCorrect: true, explanation: '"Ever" + experiencia de vida = present perfect', audioText: 'Have you ever been to the US?' },
        { target: "I went to the US last summer", source: 'Fui a EEUU el verano pasado', isCorrect: true, explanation: '"Last summer" = momento especifico = simple past', audioText: 'I went to the US last summer' },
        { target: "I have gone to the US last summer", source: 'incorrecto', isCorrect: false, explanation: '"Last summer" es momento especifico — usa Simple Past: "I WENT to the US last summer"', audioText: 'I went to the US last summer' },
        { target: "I have never tried Vietnamese food", source: 'Nunca he probado comida vietnamita', isCorrect: true, explanation: '"Never" + experiencia = present perfect perfecto', audioText: 'I have never tried Vietnamese food' },
        { target: "She has arrived yesterday", source: 'incorrecto', isCorrect: false, explanation: '"Yesterday" es momento especifico — "She ARRIVED yesterday"', audioText: 'She arrived yesterday' },
      ],
      drillPrompt: 'Cuentame sobre tus experiencias de vida: lugares que has visitado, cosas que has probado, logros que has tenido. Practica usando present perfect correctamente.',
      commonErrors: ['Usar present perfect con tiempos especificos (yesterday, last year)', 'Usar simple past para experiencias generales sin tiempo especifico', 'Conjugacion incorrecta del participio ("I have went" en vez de "I have gone")'],
      linkedPersonaIds: ['marcus', 'sarah', 'jake'],
      difficulty: 2,
    },

    {
      id: 'conditionals',
      title: 'Conditionals — Would/Could/Should',
      formula: 'Would = hipotetico | Could = posibilidad/habilidad | Should = consejo/deber',
      shortExplanation: 'Estos tres son los "condicionales educados" — esenciales para sonar profesional.',
      fullExplanation: `WOULD — hipotetico o para ser mas educado:
"I would like a coffee" (mas educado que "I want")
"Would you mind helping me?" (muy educado)
"I would do it if I could" (hipotetico)
"I would love to!" (respuesta entusiasta)

COULD — posibilidad o habilidad, tambien para ser educado:
"Could you help me?" (solicitud educada)
"I could come tomorrow" (es posible)
"You could try the other option" (sugerencia suave)

SHOULD — consejo, obligacion moral, lo que es correcto:
"You should apply for that job" (consejo)
"I should call my mom" (obligacion moral)
"Should I bring anything?" (preguntando consejo)

EN EL TRABAJO:
"I would suggest..." (sugerencia profesional)
"Could we schedule a meeting?" (solicitud educada)
"Should we move forward?" (buscando direccion)`,
      examples: [
        { target: "I would like to schedule a meeting", source: 'Me gustaria programar una reunion', isCorrect: true, explanation: '"Would like" = querer de forma educada (perfecto en trabajo)', audioText: 'I would like to schedule a meeting' },
        { target: "Could you send me the report?", source: 'Podrias enviarme el reporte?', isCorrect: true, explanation: '"Could" para solicitudes educadas en el trabajo', audioText: 'Could you send me the report?' },
        { target: "You should apply for that position", source: 'Deberias solicitar ese puesto', isCorrect: true, explanation: '"Should" para dar consejo directo', audioText: 'You should apply for that position' },
        { target: "I want a coffee", source: 'Funciona pero suena directo/brusco', isCorrect: false, explanation: 'En contextos formales o con desconocidos, usa "I would like a coffee" — suena mucho mas educado', audioText: 'I would like a coffee, please' },
        { target: "Would you mind if I asked you something?", source: 'Te molestaria si te pregunto algo?', isCorrect: true, explanation: '"Would you mind" = forma MUY educada de pedir permiso — perfecta en entrevistas', audioText: 'Would you mind if I asked you something?' },
      ],
      drillPrompt: 'Practica pidiendo cosas, dando consejos y haciendo solicitudes usando would/could/should. Imagina que estas en una reunion de trabajo.',
      commonErrors: ['Usar "want" en contextos formales en vez de "would like"', '"Would can" (imposible — elige uno)', '"Should to" ("should" no necesita "to")'],
      linkedPersonaIds: ['marcus', 'sarah'],
      difficulty: 2,
    },

    {
      id: 'contractions',
      title: 'Contractions — Hablar como americano, no como robot',
      formula: 'I am = I\'m | do not = don\'t | would not = wouldn\'t',
      shortExplanation: 'Los americanos SIEMPRE usan contracciones. Sin contracciones suenas a robot o a alguien enojado.',
      fullExplanation: `Esto es critico: los hispanohablantes a menudo dicen las formas completas porque asi aprendieron ingles en la escuela. Pero en el ingles americano real, las contracciones son la norma, no la excepcion.

I am = I'm
You are = You're
He/She/It is = He's/She's/It's
We are = We're
They are = They're
I have = I've
I had/would = I'd
I will = I'll
Do not = Don't
Does not = Doesn't
Did not = Didn't
Will not = Won't (IRREGULAR)
Would not = Wouldn't
Cannot = Can't
Should not = Shouldn't

CUANDO NO USAR CONTRACCION:
- Para enfasis: "No, I am NOT going" (no "I'm not")
- En documentos formales escritos
- Cuando quieres corregir algo: "He IS coming" (no "he's")`,
      examples: [
        { target: "I'm so excited about this!", source: 'Estoy muy emocionado con esto', isCorrect: true, explanation: '"I\'m" es la forma natural — "I am" suena rigido', audioText: "I'm so excited about this!" },
        { target: "She doesn't work here anymore", source: 'Ella ya no trabaja aqui', isCorrect: true, explanation: '"doesn\'t" es natural — "does not" suena muy formal', audioText: "She doesn't work here anymore" },
        { target: "I am not going to do that", source: 'Para enfasis — correcto', isCorrect: true, explanation: 'Para dar enfasis, si puedes usar la forma completa: "I AM NOT going"', audioText: "I am NOT going to do that" },
        { target: "I do not know what you mean", source: 'Suena formal/robotico', isCorrect: false, explanation: 'En conversacion normal: "I DON\'T know" suena natural. "Do not" es muy formal para charla casual', audioText: "I don't know what you mean" },
        { target: "I will not do it", source: 'Para enfasis funciona, en conversacion normal no', isCorrect: false, explanation: 'Conversacion normal: "I WON\'T do it". Nota: "will not" = "won\'t" es IRREGULAR', audioText: "I won't do it" },
      ],
      drillPrompt: 'Cuentame sobre tus planes para esta semana y el fin de semana. Presta atencion a usar contracciones de forma natural en todo lo que digas.',
      commonErrors: ['"Will not" en vez de "won\'t" (la mas irregular)', '"He don\'t" en vez de "He doesn\'t"', 'Evitar contracciones por completo y sonar robotico'],
      linkedPersonaIds: ['jake', 'dj', 'ashley', 'bob'],
      difficulty: 1,
    },

    {
      id: 'filler_words',
      title: 'Filler Words — Sonar natural mientras piensas',
      formula: 'Like, you know, I mean, basically, actually, honestly, literally, right?',
      shortExplanation: 'Los americanos usan estas palabras para ganar tiempo mientras piensan. Son senal de fluidez natural.',
      fullExplanation: `En espanol usas "eh...", "o sea...", "pues...". En ingles americano, los fillers son:

MIENTRAS PIENSAS:
"Like..." — el filler mas comun en ingles moderno
"You know..." — para conectar ideas que el oyente puede imaginar
"I mean..." — para clarificar o agregar matiz
"Um/Uh..." — los clasicos universales

PARA DAR ENFASIS O CONTEXTO:
"Actually..." — para corregir o sorprender (distinto de "actualmente" en espanol!)
"Basically..." — para resumir
"Honestly..." — para ser directo/sincero
"Literally..." — para enfasis (a veces usado hiperbolicamente)
"Right?" — para buscar confirmacion

TRAP: "Actually" no es "actualmente"
"Actually" = en realidad, de hecho
"Currently" = actualmente (en este momento)

EJEMPLO NATURAL:
"So, like, I was at the store, right? And I basically ran into my old boss.
I mean, I hadn't seen him in years. It was, like, super awkward, honestly."`,
      examples: [
        { target: "So, like, I've been thinking about changing jobs", source: 'O sea, he estado pensando en cambiar de trabajo', isCorrect: true, explanation: '"Like" como filler al inicio suena completamente natural en ingles americano', audioText: "So, like, I've been thinking about changing jobs" },
        { target: "Honestly, I'm not sure what to do", source: 'Honestamente, no se que hacer', isCorrect: true, explanation: '"Honestly" es un filler de enfasis que suena muy natural', audioText: "Honestly, I'm not sure what to do" },
        { target: "I'm actually from Colombia, not Mexico", source: 'En realidad soy de Colombia, no de Mexico', isCorrect: true, explanation: '"Actually" = en realidad/de hecho (NO "actualmente")', audioText: "I'm actually from Colombia" },
        { target: "I'm actually in my office right now", source: 'Actualmente estoy en mi oficina', isCorrect: false, explanation: 'ERROR CLASICO: "actually" no es actualmente. Para "actualmente" usa "currently" o "right now"', audioText: "I'm currently in my office" },
        { target: "I mean, it makes sense, right?", source: 'O sea, tiene sentido, no?', isCorrect: true, explanation: '"I mean" + "right?" son fillers perfectos para mantener conversacion fluida', audioText: "I mean, it makes sense, right?" },
      ],
      drillPrompt: 'Cuentame una historia de algo que te paso esta semana. Intenta incorporar fillers de forma natural mientras cuentas la historia.',
      commonErrors: ['"Actually" cuando quieren decir "currently/nowadays"', 'No usar fillers y sonar demasiado rigido', 'Abusar de un solo filler (demasiado "like" suena artificial)'],
      linkedPersonaIds: ['jake', 'dj', 'ashley'],
      difficulty: 2,
    },

    {
      id: 'american_idioms',
      title: 'Idioms Americanos Esenciales',
      formula: 'Frases idiomaticas que se usan en trabajo, entrevistas y vida social',
      shortExplanation: 'Las 20 expresiones idiomaticas que mas escucharas en trabajo y vida social americana.',
      fullExplanation: `TRABAJO / NEGOCIOS:
"Hit the ground running" = empezar con energia desde el primer dia
"On the same page" = estar de acuerdo/entendidos
"Touch base" = ponerse en contacto brevemente
"Circle back" = retomar el tema mas tarde
"Moving forward" = de ahora en adelante
"At the end of the day" = en definitiva
"Low-hanging fruit" = lo mas facil de conseguir primero
"Ballpark figure" = estimado aproximado

SOCIAL / CASUAL:
"It's not my cup of tea" = no es lo mio
"Bite off more than you can chew" = asumir mas de lo que puedes manejar
"Hit the nail on the head" = dar justo en el clavo
"Break a leg!" = Buena suerte! (en shows/presentaciones)
"Hang in there" = aguanta, no te rindas
"Under the weather" = sentirse mal/enfermo
"Once in a blue moon" = muy raramente
"Spill the beans" = revelar un secreto

IMPORTANTE: Usarlos en el momento incorrecto puede sonar raro.
Jake los usaria. Marcus tambien. Bob los usaria todos. DJ tiene sus propios.`,
      examples: [
        { target: "Let's touch base next week", source: 'Hablemos brevemente la proxima semana', isCorrect: true, explanation: '"Touch base" = contacto rapido — MUY comun en negocios americanos', audioText: "Let's touch base next week" },
        { target: "I think we're on the same page here", source: 'Creo que estamos de acuerdo', isCorrect: true, explanation: '"On the same page" = estamos de acuerdo/entendidos', audioText: "I think we're on the same page" },
        { target: "I've been under the weather lately", source: 'No me he sentido bien ultimamente', isCorrect: true, explanation: '"Under the weather" = sentirse enfermo/mal', audioText: "I've been under the weather lately" },
        { target: "Break a leg at your interview!", source: 'Buena suerte en tu entrevista!', isCorrect: true, explanation: '"Break a leg" = buena suerte (especialmente en presentaciones). En entrevistas tambien esta bien.', audioText: 'Break a leg at your interview!' },
        { target: "Could you give me a ballpark figure?", source: 'Me podrias dar un estimado aproximado?', isCorrect: true, explanation: '"Ballpark figure" = estimado aproximado — perfecta en conversaciones de negocios', audioText: 'Could you give me a ballpark figure?' },
      ],
      drillPrompt: 'Hablemos sobre trabajo o planes. Intenta usar 2-3 idioms americanos de forma natural en la conversacion.',
      commonErrors: ['Usar "break a leg" en contextos donde no es apropiado', '"Touch base" muy seguido (se puede sonar a reuniones corporativas)', 'Traducir idioms literalmente en la cabeza y confundirse'],
      linkedPersonaIds: ['marcus', 'jake', 'sarah'],
      difficulty: 2,
    },

    {
      id: 'questions_natural',
      title: 'Preguntas que conectan — Question Tags y Indirect Questions',
      formula: 'Indirect: "Could you tell me where...?" | Tags: "It\'s nice, isn\'t it?"',
      shortExplanation: 'Las preguntas mas naturales en ingles NO son directas — hay formas mas suaves que los americanos prefieren.',
      fullExplanation: `INDIRECT QUESTIONS — para sonar educado y no brusco:
Directo (suena brusco): "Where is the bathroom?"
Educado: "Could you tell me where the bathroom is?"
"Do you know if the meeting is at 3?"
"I was wondering if you could help me."
"Would you mind telling me..."

Nota: en indirect questions, el orden cambia:
Direct: "Where IS it?" — Indirect: "Could you tell me where it IS?" (no inversion)

QUESTION TAGS — para buscar confirmacion y conectar:
"It's beautiful here, isn't it?"
"You've been to Colombia, haven't you?"
"We should leave soon, shouldn't we?"
"You don't like spicy food, do you?"

REGLA: Si la oracion es positiva — tag negativo | Si es negativa — tag positivo`,
      examples: [
        { target: "Could you tell me where the office is?", source: 'Me podria decir donde esta la oficina?', isCorrect: true, explanation: 'Indirect question = educado. Nota: "where THE OFFICE IS" no "where IS the office"', audioText: 'Could you tell me where the office is?' },
        { target: "Do you know if she's coming?", source: 'Sabes si ella viene?', isCorrect: true, explanation: 'Indirect question natural para preguntar sin ser directo', audioText: "Do you know if she's coming?" },
        { target: "It's really nice today, isn't it?", source: 'Esta muy bonito hoy, verdad?', isCorrect: true, explanation: 'Question tag perfecta para iniciar small talk', audioText: "It's really nice today, isn't it?" },
        { target: "Could you tell me where is the bathroom?", source: 'incorrecto — orden de palabras', isCorrect: false, explanation: 'En indirect questions NO inviertes: "where the bathroom IS" (no "where IS the bathroom")', audioText: 'Could you tell me where the bathroom is?' },
        { target: "You haven't been there, have you?", source: 'No has estado ahi, verdad?', isCorrect: true, explanation: 'Oracion negativa — tag positivo. Perfecto.', audioText: "You haven't been there, have you?" },
      ],
      drillPrompt: 'Practica haciendo preguntas de forma educada. Imagina que estas en una reunion de trabajo o conociendo a alguien nuevo.',
      commonErrors: ['Invertir sujeto/verbo en indirect questions', 'Tag positivo con oracion positiva', 'Sonar demasiado directo cuando la situacion pide sutileza'],
      linkedPersonaIds: ['marcus', 'sarah', 'bob'],
      difficulty: 3,
    },

    {
      id: 'pronunciation_key',
      title: 'Pronunciacion — Los 5 sonidos que delatan a un hispanohablante',
      formula: 'th, v/b, final consonants, stress patterns, schwa sound',
      shortExplanation: 'Estos 5 sonidos son los que mas distinguen a un hispanohablante en ingles.',
      fullExplanation: `1. TH — dos sonidos distintos, ninguno existe en espanol:
Voiced (voz): "the", "this", "that", "there" — lengua entre dientes, CON voz
Voiceless (sin voz): "think", "thank", "three" — lengua entre dientes, SIN voz
Error comun: decir "de", "dis", "dat" o "sink", "tank"

2. V vs B — en ingles son distintos, en espanol son casi iguales:
V: labio inferior toca los dientes superiores (vibra)
B: labios se juntan completamente
"Very" no es "berry" | "vote" no es "boat"

3. Consonantes al final — los anglofonos pronuncian cada consonante final:
"fact", "asked", "helped" — pronuncia la -t, la -d, la -d
No comas las consonantes finales

4. Stress patterns — el acento va en la silaba correcta:
preSENT (verbo) vs PREsent (sustantivo)
reCORD (verbo) vs REcord (sustantivo)

5. Schwa — el sonido mas comun en ingles, es una vocal reducida/neutral:
"about" = uh-BOUT | "the" = thuh | "a" = uh
En silabas sin acento, las vocales se reducen a "uh"`,
      examples: [
        { target: 'Think of three things', source: 'Piensa en tres cosas', isCorrect: true, explanation: 'th voiceless: "think" y "three" — lengua entre dientes sin voz', audioText: 'Think of three things' },
        { target: 'This is the best day', source: 'Este es el mejor dia', isCorrect: true, explanation: 'th voiced: "this" y "the" — lengua entre dientes CON voz', audioText: 'This is the best day' },
        { target: 'I asked for help', source: 'Pedi ayuda', isCorrect: true, explanation: '"asked" = pronuncia la -d final: "askt". No la omitas.', audioText: 'I asked for help' },
        { target: 'He is a very important person', source: 'El es una persona muy importante', isCorrect: true, explanation: '"Very" — v de labio inferior en dientes superiores, no como "b"', audioText: 'He is a very important person' },
        { target: 'a-BOUT (not A-bout)', source: 'acento incorrecto', isCorrect: false, explanation: '"About" tiene acento en la segunda silaba: a-BOUT. La primera silaba es schwa', audioText: 'about' },
      ],
      drillPrompt: 'Vamos a practicar pronunciacion. Repite estas palabras: think, this, very, best, about, important. Despues dime una historia usando estas palabras.',
      commonErrors: ['"de" y "dis" en vez de "the" y "this"', '"berry" en vez de "very"', 'Omitir consonantes finales (-ed, -t, -s)'],
      linkedPersonaIds: ['jake', 'bob', 'ashley'],
      difficulty: 3,
    },
  ],

  // 15 MISSIONS

  missions: [
    // WEEK 1 — SURVIVAL
    {
      id: 'en_week1_intro',
      week: 1, title: 'Presentate en ingles', difficulty: 1, estimatedMinutes: 10,
      description: 'Presentate a alguien nuevo en un contexto casual americano',
      linkedPersonaId: 'ashley',
      successCriteria: 'Presentarte con nombre, origen y que haces, y responder preguntas basicas',
      culturalContext: 'Los americanos hacen preguntas directas y esperan respuestas cortas y positivas. No es falta de respeto — es eficiencia.',
      keyPhrases: [
        { phrase: 'My name is...', translation: 'Me llamo...', phonetic: 'mai neim iz', audioText: 'My name is...' },
        { phrase: "Nice to meet you!", translation: 'Mucho gusto!', phonetic: 'nais to mit yu', audioText: 'Nice to meet you!' },
        { phrase: "I'm from Colombia", translation: 'Soy de Colombia', phonetic: 'aim from ko-LOM-bia', audioText: "I'm from Colombia" },
        { phrase: "What do you do?", translation: 'A que te dedicas?', phonetic: 'wut du yu du', audioText: 'What do you do?' },
        { phrase: "I work in...", translation: 'Trabajo en...', phonetic: 'ai wurk in', audioText: 'I work in tech / marketing / education' },
      ],
    },
    {
      id: 'en_week1_coffee',
      week: 1, title: 'Ordena en Starbucks', difficulty: 1, estimatedMinutes: 8,
      description: 'Navega el ritual americano de pedir cafe',
      linkedPersonaId: 'jake',
      successCriteria: 'Pedir una bebida, dar tu nombre y pagar',
      culturalContext: 'En Starbucks te piden tu nombre — di el tuyo o cualquiera. El venti, grande, tall son solo tamanos. Nadie te juzga si dices "medium".',
      keyPhrases: [
        { phrase: "Can I get a...", translation: 'Quisiera un/una...', phonetic: 'kan ai get a', audioText: 'Can I get a large latte, please?' },
        { phrase: "For here or to go?", translation: 'Para aqui o para llevar?', phonetic: 'for hir or tu go', audioText: 'For here or to go?' },
        { phrase: "To go, please", translation: 'Para llevar, por favor', phonetic: 'tu go, pliz', audioText: 'To go, please' },
        { phrase: "What's your name?", translation: 'Como te llamas? (para el vaso)', phonetic: 'wuts yor neim', audioText: "What's your name?" },
        { phrase: "Keep the change", translation: 'Quedese con el cambio', phonetic: 'kip da cheynj', audioText: 'Keep the change' },
      ],
    },
    {
      id: 'en_week1_smalltalk',
      week: 1, title: 'Small Talk con un americano', difficulty: 1, estimatedMinutes: 12,
      description: 'Sobrevive una conversacion de ascensor o en el trabajo',
      linkedPersonaId: 'bob',
      successCriteria: '5 intercambios de small talk sin silencio incomodo',
      culturalContext: 'El small talk americano SIEMPRE incluye: clima, fin de semana, trabajo. Nunca: dinero, politica, religion (hasta que se conocen bien).',
      keyPhrases: [
        { phrase: 'Good, thanks! You?', translation: 'Bien, gracias! Y tu?', phonetic: 'gud, tanks! yu?', audioText: 'Good, thanks! And you?' },
        { phrase: "Not bad, not bad", translation: 'No esta mal', phonetic: 'not bad, not bad', audioText: 'Not bad, not bad. Pretty good actually' },
        { phrase: "Any plans for the weekend?", translation: 'Planes para el fin de semana?', phonetic: 'eni planz for da wiikend', audioText: 'Any plans for the weekend?' },
        { phrase: "Nothing too crazy", translation: 'Nada del otro mundo', phonetic: 'naθin tu kreizi', audioText: 'Nothing too crazy, just relaxing' },
        { phrase: "Have a good one!", translation: 'Que tengas buen dia!', phonetic: 'hav a gud wun', audioText: 'Have a good one!' },
      ],
    },
    {
      id: 'en_week1_taxi',
      week: 1, title: 'Toma un Uber/taxi', difficulty: 1, estimatedMinutes: 8,
      description: 'Comunicate con un conductor de Uber en ingles',
      linkedPersonaId: 'bob',
      successCriteria: 'Dar destino, confirmar ruta, y hacer pequena conversacion',
      culturalContext: 'Los conductores de Uber en EEUU estan acostumbrados a pasajeros de todo el mundo. No es obligatorio conversar — puedes estar en silencio sin problema.',
      keyPhrases: [
        { phrase: "I'm heading to...", translation: 'Voy a...', phonetic: 'aim hedin tu', audioText: "I'm heading to downtown" },
        { phrase: "How long will it take?", translation: 'Cuanto tarda?', phonetic: 'hau long wil it teik', audioText: 'How long will it take?' },
        { phrase: "This is fine, right here", translation: 'Esta bien, aqui mismo', phonetic: 'dis iz fain, rait hir', audioText: 'This is fine, right here. Thank you!' },
        { phrase: "Is traffic bad today?", translation: 'Hay mucho trafico hoy?', phonetic: 'iz trafik bad tudei', audioText: 'Is traffic bad today?' },
        { phrase: "Thanks for the ride!", translation: 'Gracias por el viaje!', phonetic: 'tanks for da raid', audioText: 'Thanks for the ride!' },
      ],
    },
    // WEEK 2 — MOBILITY
    {
      id: 'en_week2_interview',
      week: 2, title: 'Primera entrevista de trabajo', difficulty: 2, estimatedMinutes: 20,
      description: 'Responde las preguntas mas comunes de una entrevista de trabajo americana',
      linkedPersonaId: 'sarah',
      successCriteria: 'Responder "tell me about yourself", experiencia y fortalezas con fluidez',
      culturalContext: 'En entrevistas americanas: se positivo, da ejemplos especificos, no menciones cosas negativas de empleos anteriores. Llega 5 min antes (virtual: conectate 2 min antes).',
      keyPhrases: [
        { phrase: "I have X years of experience in...", translation: 'Tengo X anos de experiencia en...', phonetic: 'ai hav eks yirz ov eks-PEER-iens in', audioText: "I have 5 years of experience in marketing" },
        { phrase: "My greatest strength is...", translation: 'Mi mayor fortaleza es...', phonetic: 'mai greitest strengθ iz', audioText: 'My greatest strength is problem solving' },
        { phrase: "I'm really passionate about...", translation: 'Me apasiona mucho...', phonetic: 'aim rili pashenet ebaut', audioText: "I'm really passionate about technology" },
        { phrase: "I'd love to learn more about...", translation: 'Me encantaria aprender mas sobre...', phonetic: 'aid luv tu lurn mor ebaut', audioText: "I'd love to learn more about this role" },
        { phrase: "When can I expect to hear back?", translation: 'Cuando tendria respuesta?', phonetic: 'wen kan ai ekspekt tu hir bak', audioText: 'When can I expect to hear back from you?' },
      ],
    },
    {
      id: 'en_week2_negotiate',
      week: 2, title: 'Negocia tu salario', difficulty: 3, estimatedMinutes: 20,
      description: 'Aprende a pedir mas dinero en ingles sin sonar agresivo',
      linkedPersonaId: 'marcus',
      successCriteria: 'Contra-oferta con justificacion y mantenerte firme educadamente',
      culturalContext: 'En EEUU es ESPERADO que negocies. Aceptar la primera oferta puede hacer que parezcas poco seguro. El 70% de los empleadores esperan una contra-oferta.',
      keyPhrases: [
        { phrase: "I was hoping for something closer to...", translation: 'Esperaba algo mas cercano a...', phonetic: 'ai wuz houpin for samθin kloser tu', audioText: 'I was hoping for something closer to $60,000' },
        { phrase: "Based on my experience, I believe...", translation: 'Basandome en mi experiencia, creo que...', phonetic: 'beist on mai ekspeeriens, ai beliv', audioText: 'Based on my experience, I believe my value is...' },
        { phrase: "Is there flexibility on the base salary?", translation: 'Hay flexibilidad en el salario base?', phonetic: 'iz der flekseBILiti on da beis SALeri', audioText: 'Is there any flexibility on the base salary?' },
        { phrase: "I'm very excited about this opportunity", translation: 'Estoy muy emocionado con esta oportunidad', phonetic: 'aim veri eksaited ebaut dis operTUUniti', audioText: "I'm very excited about this opportunity" },
        { phrase: "Could we revisit that number?", translation: 'Podriamos revisar ese numero?', phonetic: 'kud wi riVIZit dat NUMber', audioText: 'Could we revisit that number?' },
      ],
    },
    {
      id: 'en_week2_story',
      week: 2, title: 'Cuenta tu historia', difficulty: 2, estimatedMinutes: 15,
      description: 'Narra de donde vienes y por que estas en EEUU en ingles fluido',
      linkedPersonaId: 'ashley',
      successCriteria: 'Narrar 2 minutos continuos sobre tu historia con fluidez',
      culturalContext: 'Los americanos aman las historias de inmigrantes y personas de otros paises. Tu historia es un activo — cuentala con orgullo.',
      keyPhrases: [
        { phrase: "I grew up in...", translation: 'Creci en...', phonetic: 'ai gru up in', audioText: 'I grew up in Bogota, Colombia' },
        { phrase: "I moved here because...", translation: 'Me mude aqui porque...', phonetic: 'ai muvd hir bikoz', audioText: 'I moved here because of work opportunities' },
        { phrase: "It was a big change but...", translation: 'Fue un gran cambio pero...', phonetic: 'it wuz a big cheynj but', audioText: 'It was a big change but I love it here' },
        { phrase: "I miss...", translation: 'Extrano...', phonetic: 'ai mis', audioText: 'I really miss the food from back home' },
        { phrase: "One thing I love about here is...", translation: 'Algo que me encanta de aqui es...', phonetic: 'wun θing ai luv ebaut hir iz', audioText: 'One thing I love about here is the opportunities' },
      ],
    },
    // WEEK 3 — SOCIAL
    {
      id: 'en_week3_bar',
      week: 3, title: 'Habla con un extrano en un bar', difficulty: 2, estimatedMinutes: 15,
      description: 'Inicia y manten conversacion casual americana en ambiente social',
      linkedPersonaId: 'dj',
      successCriteria: '8+ intercambios fluidos, usando slang apropiado',
      culturalContext: 'En bares americanos, es normal hablar con extranos. El alcohol social lubrica esto. Si alguien no quiere conversar, lo veras en su lenguaje corporal — no es personal.',
      keyPhrases: [
        { phrase: "What are you drinking?", translation: 'Que estas tomando?', phonetic: 'wut ar yu drinkin', audioText: 'Hey, what are you drinking?' },
        { phrase: "Are you from around here?", translation: 'Eres de por aqui?', phonetic: 'ar yu from eraund hir', audioText: 'Are you from around here?' },
        { phrase: "What do you do for fun?", translation: 'Que haces para divertirte?', phonetic: 'wut du yu du for fun', audioText: 'So what do you do for fun around here?' },
        { phrase: "That's so cool!", translation: 'Que chevere/genial!', phonetic: 'dats so kuul', audioText: "That's so cool, I've never heard of that!" },
        { phrase: "We should hang out sometime", translation: 'Deberiamos salir alguna vez', phonetic: 'wi shud hang aut samtaim', audioText: 'We should hang out sometime, that sounds fun' },
      ],
    },
    {
      id: 'en_week3_compliment',
      week: 3, title: 'Da y recibe cumplidos en ingles', difficulty: 2, estimatedMinutes: 12,
      description: 'Los americanos se hacen cumplidos constantemente — aprende a darlos y recibirlos',
      linkedPersonaId: 'ashley',
      successCriteria: 'Dar 3 cumplidos naturales y responder a cumplidos sin torpeza',
      culturalContext: 'Recibir un cumplido en EEUU: siempre di "Thank you!" — nunca lo niegues (como se hace a veces en LATAM). Negarlos suena extrano.',
      keyPhrases: [
        { phrase: "I love your...", translation: 'Me encanta tu...', phonetic: 'ai luv yor', audioText: 'I love your style!' },
        { phrase: "You're really good at...", translation: 'Eres muy bueno/a en...', phonetic: 'yor rili gud at', audioText: "You're really good at explaining things" },
        { phrase: "That was amazing!", translation: 'Eso fue increible!', phonetic: 'dat wuz emeiziŋ', audioText: 'That was absolutely amazing!' },
        { phrase: "Thank you, that means a lot!", translation: 'Gracias, eso significa mucho', phonetic: 'θank yu, dat miinz e lot', audioText: 'Thank you so much, that really means a lot!' },
        { phrase: "You made my day!", translation: 'Me alegras el dia!', phonetic: 'yu meid mai dei', audioText: 'Aw, you totally made my day!' },
      ],
    },
    {
      id: 'en_week3_humor',
      week: 3, title: 'Entiende el humor americano', difficulty: 3, estimatedMinutes: 15,
      description: 'Navega el sarcasmo, la ironia y las bromas americanas',
      linkedPersonaId: 'jake',
      successCriteria: 'Identificar sarcasmo y responder apropiadamente 4+ veces',
      culturalContext: 'El humor americano es muy diferente al latinoamericano. El sarcasmo es KING. Si alguien dice "Oh great, another Monday" — estan siendo sarcasticos, no genuinamente emocionados.',
      keyPhrases: [
        { phrase: "Ha, very funny", translation: 'Ja, muy gracioso (puede ser sarcastico)', phonetic: 'ha, veri funi', audioText: 'Ha, very funny!' },
        { phrase: "Oh sure, because THAT makes sense", translation: 'Oh claro, porque eso tiene MUCHO sentido (sarcasmo)', phonetic: 'ou shor, bikoz dat meiks sens', audioText: 'Oh sure, because that makes total sense!' },
        { phrase: "That's hilarious!", translation: 'Eso es graciosisimo!', phonetic: 'dats hiLEErious', audioText: "That's absolutely hilarious!" },
        { phrase: "I'm dead", translation: 'Me muero de risa (no literal)', phonetic: 'aim ded', audioText: "I'm dead, that's so funny" },
        { phrase: "I can't even", translation: 'No puedo (de tanta risa/incredulidad)', phonetic: 'ai kant ivan', audioText: "I can't even with this right now" },
      ],
    },
    // WEEK 4 — FLUENCY
    {
      id: 'en_week4_meeting',
      week: 4, title: 'Lidera una reunion en ingles', difficulty: 4, estimatedMinutes: 25,
      description: 'Facilita una reunion de trabajo completa en ingles americano',
      linkedPersonaId: 'marcus',
      successCriteria: 'Abrir reunion, presentar agenda, manejar discusion y cerrar con action items',
      culturalContext: 'Las reuniones americanas tienen estructura: agenda, timeboxing, action items con owners y fechas. "Let\'s take this offline" = hablemos esto despues en privado.',
      keyPhrases: [
        { phrase: "Let's get started, shall we?", translation: 'Empecemos, les parece?', phonetic: 'lets get startid, shal wi', audioText: "Alright, let's get started, shall we?" },
        { phrase: "The goal of today's meeting is...", translation: 'El objetivo de la reunion de hoy es...', phonetic: 'da goul ov tudeis mitiŋ iz', audioText: "The goal of today's meeting is to align on Q3 priorities" },
        { phrase: "Great point — does everyone agree?", translation: 'Buen punto — todos estan de acuerdo?', phonetic: 'greit point — daz evriwan egrii', audioText: 'Great point. Does everyone agree with that approach?' },
        { phrase: "Let's take that offline", translation: 'Hablemos eso en privado despues', phonetic: 'lets teik dat oflayn', audioText: "That's important — let's take that offline" },
        { phrase: "To summarize the action items...", translation: 'Para resumir los puntos de accion...', phonetic: 'tu SAMyeraiz di AKshen aitemz', audioText: 'To summarize the action items from today...' },
      ],
    },
    {
      id: 'en_week4_date',
      week: 4, title: 'Una cita completa en ingles', difficulty: 4, estimatedMinutes: 30,
      description: 'Conversacion completa de cita romantica en ingles — de principio a fin',
      linkedPersonaId: 'ashley',
      successCriteria: '15+ turnos continuos, manejo del flirteo americano, plan de proxima cita',
      culturalContext: 'El flirteo americano es mas directo que el latinoamericano en algunos aspectos, pero mas indirecto en otros. "I like you" se dice relativamente rapido. "Te quiero" nunca en la primera cita.',
      keyPhrases: [
        { phrase: "You have a great sense of humor", translation: 'Tienes un gran sentido del humor', phonetic: 'yu hav a greit sens ov hyuumer', audioText: 'You know, you have a great sense of humor' },
        { phrase: "I'm having a really good time", translation: 'Lo estoy pasando muy bien', phonetic: 'aim havin a rili gud taim', audioText: "I'm having such a really good time with you" },
        { phrase: "We should do this again", translation: 'Deberiamos repetir esto', phonetic: 'wi shud du dis egen', audioText: 'We should definitely do this again' },
        { phrase: "Can I get your number?", translation: 'Me das tu numero?', phonetic: 'kan ai get yor NAMber', audioText: 'Hey, can I get your number?' },
        { phrase: "I'd love to see you again", translation: 'Me encantaria verte de nuevo', phonetic: 'aid luv tu sii yu egen', audioText: "I'd really love to see you again" },
      ],
    },
    {
      id: 'en_week4_monologue',
      week: 4, title: 'Habla 5 minutos sin parar', difficulty: 5, estimatedMinutes: 20,
      description: 'Habla en ingles continuamente por 5 minutos sin cambiar a espanol',
      linkedPersonaId: 'jake',
      successCriteria: '5 minutos de ingles continuo, fluency score promedio de 7+',
      culturalContext: 'La fluidez real es hablar sin traducir en tu cabeza. Este ejercicio rompe ese habito.',
      keyPhrases: [
        { phrase: "To be honest...", translation: 'Para ser honesto...', phonetic: 'tu bi onist', audioText: 'To be honest, I think...' },
        { phrase: "What I mean is...", translation: 'Lo que quiero decir es...', phonetic: 'wut ai miin iz', audioText: "What I mean is, it's complicated" },
        { phrase: "On the other hand...", translation: 'Por otro lado...', phonetic: 'on di Ader hand', audioText: 'On the other hand, there are benefits' },
        { phrase: "That being said...", translation: 'Dicho esto...', phonetic: 'dat biiŋ sed', audioText: "That being said, I still think it's worth it" },
        { phrase: "Does that make sense?", translation: 'Tiene sentido?', phonetic: 'daz dat meik sens', audioText: 'Does that make sense? Am I explaining it clearly?' },
      ],
    },
  ],

  quickPhrases: {
    jake: ["What do you do?", "That's so cool!", "Have you tried...", "I totally get that", "For sure!"],
    ashley: ["Oh my gosh, really?", "Tell me more!", "That's amazing!", "I love that", "No way!"],
    marcus: ["Walk me through that", "Give me a specific example", "What's your timeline?", "Let's circle back on that", "Good point"],
    dj: ["That's fire!", "No cap", "Lowkey same", "You ate that", "It hits different"],
    sarah: ["Can you elaborate?", "What did you learn from that?", "How does that apply here?", "That's helpful context", "Let's move forward"],
    bob: ["How about that!", "You don't say!", "Can't complain!", "Have a good one!", "Real nice"],
  },

  culturalNotes: [
    { id: 'en_tips', trigger: 'restaurant|eat|bill|food|dinner', tip: 'Tip 18-20% at restaurants — it\'s not optional, it\'s part of the server\'s salary', category: 'money', urgency: 'now', contexts: ['jake', 'ashley', 'bob'] },
    { id: 'en_direct', trigger: 'ask|want|need|request', tip: 'Americans are direct — asking for what you want is not rude, it\'s efficient', category: 'social', urgency: 'soon', contexts: ['marcus', 'sarah'] },
    { id: 'en_smile', trigger: 'hello|hi|meet|stranger', tip: 'Smiling at strangers is normal in the US — not weird or flirtatious', category: 'social', urgency: 'soon', contexts: ['bob', 'ashley'] },
    { id: 'en_time', trigger: 'late|time|meeting|arrive', tip: 'Being on time is important in the US — "on time" means 2-5 min early', category: 'time', urgency: 'now', contexts: ['marcus', 'sarah'] },
  ],

  emergencyPhrases: [
    { id: 'en_help', category: 'emergency', source: 'Necesito ayuda', target: 'I need help!', phonetic: 'ai niid help', audioText: 'I need help!', urgencyLevel: 3 },
    { id: 'en_911', category: 'emergency', source: 'Llama al 911', target: 'Call 911!', phonetic: 'kol nain wun wun', audioText: 'Call 911 please!', urgencyLevel: 3 },
    { id: 'en_doctor', category: 'medical', source: 'Necesito un medico', target: 'I need a doctor', phonetic: 'ai niid a DAKter', audioText: 'I need to see a doctor', urgencyLevel: 3 },
    { id: 'en_hospital', category: 'medical', source: 'Donde esta el hospital?', target: 'Where is the nearest hospital?', phonetic: 'wer iz da NIRist HOSpitl', audioText: 'Where is the nearest hospital?', urgencyLevel: 2 },
    { id: 'en_lost', category: 'safety', source: 'Estoy perdido', target: "I'm lost", phonetic: 'aim lost', audioText: "I'm lost. Can you help me?", urgencyLevel: 2 },
    { id: 'en_understand', category: 'social', source: 'No entiendo', target: "I don't understand", phonetic: 'ai dont underSTAND', audioText: "I'm sorry, I don't understand", urgencyLevel: 1 },
    { id: 'en_slow', category: 'social', source: 'Habla mas despacio', target: 'Could you speak more slowly?', phonetic: 'kud yu spiik mor SLOUli', audioText: 'Could you please speak more slowly?', urgencyLevel: 1 },
    { id: 'en_repeat', category: 'social', source: 'Puedes repetir?', target: 'Could you repeat that?', phonetic: 'kud yu riPIIT dat', audioText: 'Sorry, could you repeat that?', urgencyLevel: 1 },
    { id: 'en_bathroom', category: 'social', source: 'Donde esta el bano?', target: "Where's the restroom?", phonetic: 'werz da RESTruuum', audioText: "Excuse me, where's the restroom?", urgencyLevel: 1 },
    { id: 'en_english', category: 'social', source: 'Hablas espanol?', target: 'Do you speak Spanish?', phonetic: 'du yu spiik SPANish', audioText: 'Do you happen to speak Spanish?', urgencyLevel: 1 },
  ],
};
