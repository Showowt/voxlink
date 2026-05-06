import type { LanguageConfig } from "../types";

export const enLtConfig: LanguageConfig = {
  code: "en-lt",
  sourceLanguage: "en",
  targetLanguage: "lt",
  targetRegion: "LT",
  targetLocale: "lt-LT",
  displayName: "Lithuanian",
  nativeName: "Lietuvių",
  flag: "\u{1F1F1}\u{1F1F9}",
  available: true,

  ui: {
    tabTalk: "KALBĖTI",
    tabPatterns: "GRAMATIKA",
    tabMissions: "MISIJOS",
    tabVocab: "ŽODYNAS",
    tabProgress: "PAŽANGA",
    levelNames: ["Pradedantysis", "Pagrindinis", "Vidutinis", "Pažengęs", "Laisvas"],
    startPrompt: "Rašykite arba kalbėkite lietuviškai...",
    correctLabel: "Teisingai",
    errorLabel: "Pataisymas",
    readyMessage: "Pasiruošę praktikuoti?",
  },

  personas: [
    {
      id: "jonas",
      name: "Jonas",
      age: 32,
      role: "Software developer, Vilnius",
      setting: "Coffee shop in Vilnius old town",
      personality: "Calm, intellectual, dry humor, proud of Lithuanian heritage",
      accentColor: "#FDB913",
      avatar: "\u{1F1F1}\u{1F1F9}",
      difficulty: 1,
      tags: ["casual", "modern", "urban"],
      difficultyModifiers: {
        beginner: "Use simple Lithuanian, speak slowly, mix in English words when needed",
        intermediate: "Use natural modern Lithuanian with some tech/urban slang",
        advanced: "Full fluent Lithuanian including idioms and cultural references",
      },
      systemPrompt: `You are Jonas, a 32-year-old software developer from Vilnius, Lithuania.
You are meeting someone at a coffee shop in the Old Town who is learning Lithuanian.
You are friendly but reserved — Lithuanian cultural style — and gradually open up as conversation flows.
You are proud of Lithuanian culture, history, and the fact that Lithuanian is one of the oldest living languages.
You speak in modern Lithuanian with occasional English tech terms naturally mixed in.
ALWAYS correct the user's Lithuanian grammar with the <correction> JSON format specified.
Respond in Lithuanian primarily. Keep responses to 2-4 sentences.
Cultural notes to weave in naturally: Lithuanians are reserved at first but warm up quickly,
Vilnius old town is UNESCO-listed, Lithuania regained independence in 1990.`,
      fallbackResponses: [
        "Labas! Kaip sekasi šiandien?",
        "Įdomu. Papasakokite daugiau.",
        "Suprantu. Lietuviškai mokytis nėra lengva, bet jūs gerai sekasi.",
        "Tai geras klausimas. Pagalvokime kartu.",
        "Vilniuje šiandien gražus oras. Jūs jau buvote senamiestyje?",
      ],
    },
    {
      id: "egle",
      name: "Eglė",
      age: 28,
      role: "Art teacher, Kaunas",
      setting: "Art gallery opening in Kaunas",
      personality: "Creative, warm, passionate about Lithuanian folk art and amber",
      accentColor: "#A0522D",
      avatar: "\u{1F3A8}",
      difficulty: 1,
      tags: ["casual", "cultural", "arts"],
      difficultyModifiers: {
        beginner: "Simple vocabulary, lots of encouragement, explain cultural context in English",
        intermediate: "Natural speech, introduce art and cultural vocabulary",
        advanced: "Rich vocabulary including folk art terms, cultural idioms",
      },
      systemPrompt: `You are Eglė, a 28-year-old art teacher from Kaunas, Lithuania.
You are at a gallery opening and excited to share Lithuanian art and culture.
You are warm and encouraging — great with beginners.
You love talking about Lithuanian amber (gintaras), folk art, and Kaunas modernist architecture.
You speak clearly and supportively, making the learner feel confident.
ALWAYS use the <correction> JSON format for grammar corrections.
Respond in Lithuanian. 2-4 sentences max.`,
      fallbackResponses: [
        "Labas! Džiaugiuosi, kad jus domina lietuvių kultūra!",
        "Puiku! Jūs labai gerai kalbate lietuviškai.",
        "Taip, tai labai svarbu lietuvių kultūroje.",
        "Ar jūs domitės lietuvių liaudies menu?",
        "Kaunas yra nuostabus miestas. Ar jau buvote čia anksčiau?",
      ],
    },
  ],

  grammarPatterns: [
    {
      id: "cases_nominative",
      title: "Nominative Case — Who/What",
      formula: "Subject of sentence uses Nominative (base form)",
      shortExplanation: "Lithuanian has 7 cases — nominative is for the subject",
      fullExplanation: `Lithuanian is a heavily inflected language with 7 grammatical cases.
The nominative case is used for the subject of a sentence — who or what is doing the action.
Example: Jonas kalba (Jonas speaks) — Jonas is in nominative.
Nouns change endings based on case, gender, and number.`,
      examples: [
        { target: "Jonas kalba lietuviškai", source: "Jonas speaks Lithuanian", isCorrect: true, explanation: "Jonas = subject, nominative form", audioText: "Jonas kalba lietuviškai" },
        { target: "Eglė moko vaikus", source: "Eglė teaches children", isCorrect: true, explanation: "Eglė = subject, feminine nominative", audioText: "Eglė moko vaikus" },
        { target: "Miestas yra didelis", source: "The city is big", isCorrect: true, explanation: "Miestas = subject, masculine nominative", audioText: "Miestas yra didelis" },
        { target: "Jonas kalbos", source: "wrong — Jonas speaks (incorrect ending)", isCorrect: false, explanation: "Nominative does not take -os ending", audioText: "Jonas kalba" },
        { target: "Katė miega", source: "The cat sleeps", isCorrect: true, explanation: "Katė = feminine noun, nominative form ends in -ė", audioText: "Katė miega" },
      ],
      drillPrompt: "Practice using the nominative case. Tell me about yourself: your name, where you are from, what you do.",
      commonErrors: ["Confusing nominative and accusative endings", "Using genitive instead of nominative for subjects", "Mixing masculine and feminine noun endings"],
      linkedPersonaIds: ["jonas", "egle"],
      difficulty: 1,
    },
    {
      id: "verb_conjugation",
      title: "Present Tense Verbs",
      formula: "Verb stem + personal ending (-u, -i, -a, -ame, -ate, -a)",
      shortExplanation: "Lithuanian verbs conjugate by person and number",
      fullExplanation: `Lithuanian verbs change endings based on the subject.
Most -ti verbs follow this pattern in present tense:
aš (I) → -u: kalbU
tu (you) → -i: kalbI
jis/ji (he/she) → -a: kalbA
mes (we) → -ame: kalbAME
jūs (you plural) → -ate: kalbATE
jie/jos (they) → -a: kalbA`,
      examples: [
        { target: "Aš kalbu lietuviškai", source: "I speak Lithuanian", isCorrect: true, explanation: "kalb- + -u for 'I'", audioText: "Aš kalbu lietuviškai" },
        { target: "Tu kalbi gerai", source: "You speak well", isCorrect: true, explanation: "kalb- + -i for 'you'", audioText: "Tu kalbi gerai" },
        { target: "Jis kalba greitai", source: "He speaks quickly", isCorrect: true, explanation: "kalb- + -a for 'he'", audioText: "Jis kalba greitai" },
        { target: "Mes kalbame kartu", source: "We speak together", isCorrect: true, explanation: "kalb- + -ame for 'we'", audioText: "Mes kalbame kartu" },
        { target: "Aš kalba", source: "wrong — I speak (wrong ending)", isCorrect: false, explanation: "-a is for he/she, not I. Use kalbU", audioText: "Aš kalbu" },
      ],
      drillPrompt: "Conjugate the verb 'dirbti' (to work) for all persons. Then tell me about your daily routine.",
      commonErrors: ["Using -a (he/she form) for all persons", "Forgetting the -ame ending for 'we'", "Confusing kalb- stem verbs with irregular verbs"],
      linkedPersonaIds: ["jonas", "egle"],
      difficulty: 1,
    },
    {
      id: "diminutives",
      title: "Diminutives — The Warmth Suffix",
      formula: "Noun + -elis/-elė/-ėlis/-ėlė (makes it smaller/cuter/warmer)",
      shortExplanation: "Lithuanian loves diminutives — they express affection, not just size",
      fullExplanation: `Lithuanian uses diminutive suffixes constantly to express warmth, affection, and politeness.
These are NOT just for small things — they're used to make speech warmer and more personal.
Jonas → Jonukas (affectionate form of Jonas)
katė → katytė (cute little cat)
kava → kavytė (a nice cup of coffee)
This is a key part of sounding natural in Lithuanian conversation.`,
      examples: [
        { target: "Ar norėtumėte kavytės?", source: "Would you like a (nice) coffee?", isCorrect: true, explanation: "kavytė = affectionate diminutive of kava", audioText: "Ar norėtumėte kavytės?" },
        { target: "Mano katytė miega", source: "My little kitty is sleeping", isCorrect: true, explanation: "katytė = diminutive of katė", audioText: "Mano katytė miega" },
        { target: "Jonukai, kaip sekasi?", source: "Jonukas, how are you? (affectionate)", isCorrect: true, explanation: "Jonukas = affectionate form of Jonas", audioText: "Jonukai, kaip sekasi?" },
        { target: "kava → kavas", source: "wrong diminutive", isCorrect: false, explanation: "Diminutive of kava is kavytė or kavelė, not kavas", audioText: "kavytė" },
        { target: "Ačiū, knygytė labai patinka", source: "Thank you, I really like the little book", isCorrect: true, explanation: "knygytė = diminutive of knyga (book)", audioText: "Ačiū, knygytė labai patinka" },
      ],
      drillPrompt: "Practice using diminutives. Describe your home or surroundings using diminutive forms to sound warm and natural.",
      commonErrors: ["Not using diminutives when they sound natural", "Using wrong suffix for gender", "Overusing diminutives in formal contexts"],
      linkedPersonaIds: ["egle"],
      difficulty: 2,
    },
  ],

  missions: [
    {
      id: "lt_week1_coffee",
      week: 1,
      title: "Order coffee in Vilnius",
      description: "Walk into a cafe in Vilnius old town and order your usual",
      difficulty: 1,
      estimatedMinutes: 10,
      linkedPersonaId: "egle",
      successCriteria: "Successfully order a drink and respond to the barista",
      culturalContext: "Lithuanians often say 'prašom' (please/here you go) and 'ačiū' constantly — it's core politeness",
      keyPhrases: [
        { phrase: "Ar galėtumėte padėti?", translation: "Could you help me?", phonetic: "ar ga-LEH-too-MEH-teh pa-DEH-tee", audioText: "Ar galėtumėte padėti?" },
        { phrase: "Vieną kavą, prašom", translation: "One coffee, please", phonetic: "VYEH-nah KA-vah, PRA-shom", audioText: "Vieną kavą, prašom" },
        { phrase: "Kiek kainuoja?", translation: "How much does it cost?", phonetic: "kyehk kai-NOO-ya", audioText: "Kiek kainuoja?" },
        { phrase: "Labai ačiū", translation: "Thank you very much", phonetic: "LA-bai a-CHOO", audioText: "Labai ačiū" },
        { phrase: "Iki pasimatymo", translation: "Goodbye / See you", phonetic: "IH-kih pa-see-ma-TEE-mo", audioText: "Iki pasimatymo" },
      ],
    },
    {
      id: "lt_week1_intro",
      week: 1,
      title: "Introduce yourself to a Lithuanian",
      description: "Meet someone at a social event and introduce yourself naturally",
      difficulty: 1,
      estimatedMinutes: 12,
      linkedPersonaId: "jonas",
      successCriteria: "Give your name, origin, and reason for visiting Lithuania",
      culturalContext: "Lithuanians appreciate when foreigners try their language — even a few words earns respect",
      keyPhrases: [
        { phrase: "Mano vardas...", translation: "My name is...", phonetic: "MA-no VAR-das", audioText: "Mano vardas yra..." },
        { phrase: "Aš esu iš...", translation: "I am from...", phonetic: "ash EH-su eesh", audioText: "Aš esu iš..." },
        { phrase: "Labai malonu", translation: "Very nice (to meet you)", phonetic: "LA-bai ma-LO-nu", audioText: "Labai malonu susipažinti" },
        { phrase: "Aš mokausi lietuviškai", translation: "I am learning Lithuanian", phonetic: "ash mo-KAU-see lyeh-tu-VEESH-kai", audioText: "Aš mokausi lietuviškai" },
        { phrase: "Kalbate angliškai?", translation: "Do you speak English?", phonetic: "KAL-ba-teh ang-LEESH-kai", audioText: "Ar kalbate angliškai?" },
      ],
    },
    {
      id: "lt_week2_directions",
      week: 2,
      title: "Get directions in Vilnius old town",
      description: "Ask a local how to get to Gediminas Castle",
      difficulty: 2,
      estimatedMinutes: 15,
      linkedPersonaId: "jonas",
      successCriteria: "Ask for directions and understand the response",
      culturalContext: "Vilnius old town is one of the largest surviving medieval old towns in Europe — locals are proud of it",
      keyPhrases: [
        { phrase: "Kur yra Gedimino pilis?", translation: "Where is Gediminas Castle?", phonetic: "kur EE-ra geh-dih-MIH-no PIH-lees", audioText: "Kur yra Gedimino pilis?" },
        { phrase: "Kaip nueiti į?", translation: "How do I get to?", phonetic: "kaip nu-EH-ee-tee ee", audioText: "Kaip nueiti į senamiesčio aikštę?" },
        { phrase: "Tiesiai", translation: "Straight ahead", phonetic: "tyeh-SYAI", audioText: "Eikite tiesiai" },
        { phrase: "Pasukite į kairę", translation: "Turn left", phonetic: "pa-su-KIH-teh ee KAI-reh", audioText: "Pasukite į kairę" },
        { phrase: "Ar tai toli?", translation: "Is it far?", phonetic: "ar tai TO-lee", audioText: "Ar tai toli nuo čia?" },
      ],
    },
    {
      id: "lt_week3_social",
      week: 3,
      title: "Have a drink with a Lithuanian friend",
      description: "Navigate a social evening — toasts, small talk, getting to know each other",
      difficulty: 3,
      estimatedMinutes: 20,
      linkedPersonaId: "jonas",
      successCriteria: "Maintain a flowing conversation for 10+ turns on various topics",
      culturalContext: "Lithuanian toast: 'į sveikatą!' (to health!) — always look people in the eye when toasting",
      keyPhrases: [
        { phrase: "Į sveikatą!", translation: "Cheers! (To health!)", phonetic: "ee SVEH-ka-tah", audioText: "Į sveikatą!" },
        { phrase: "Ką tu veiki laisvalaikiu?", translation: "What do you do in your free time?", phonetic: "kah tu VEH-ee-kih LAIS-va-lai-kyoo", audioText: "Ką tu veiki laisvalaikiu?" },
        { phrase: "Man labai patinka Lietuva", translation: "I really like Lithuania", phonetic: "man LA-bai pa-TIN-ka lyeh-tu-VA", audioText: "Man labai patinka Lietuva" },
        { phrase: "Papasakok apie save", translation: "Tell me about yourself", phonetic: "pa-pa-SA-kok A-pyeh SA-veh", audioText: "Papasakok apie save" },
        { phrase: "Gal dar vieno alaus?", translation: "Maybe one more beer?", phonetic: "gal dar VYEH-no a-LAUS", audioText: "Gal dar vieno alaus?" },
      ],
    },
  ],

  quickPhrases: {
    jonas: [
      "Labas, kaip sekasi?",
      "Iš kur jūs esate?",
      "Ar jums patinka Vilnius?",
      "Ką jūs veikiate?",
      "Kalbėkite lėčiau, prašom",
    ],
    egle: [
      "Labas! Džiaugiuosi jus matydama!",
      "Ar jums patinka menas?",
      "Papasakokite apie save",
      "Kiek laiko jūs mokatės lietuviškai?",
      "Jūs labai gerai kalbate!",
    ],
  },

  culturalNotes: [
    {
      id: "lt_eye_contact_toast",
      trigger: "toast|drink|alaus|vyno|sveikata",
      tip: "Always make eye contact when toasting — breaking eye contact brings bad luck!",
      category: "social",
      urgency: "now",
      contexts: ["jonas", "egle"],
    },
    {
      id: "lt_reserve",
      trigger: "hello|labas|susipažinome|meet",
      tip: "Lithuanians are reserved at first — warmth builds over time, not immediately",
      category: "social",
      urgency: "soon",
      contexts: ["jonas", "egle"],
    },
    {
      id: "lt_amber",
      trigger: "amber|gintaras|jewelry|papuošalai",
      tip: "Amber (gintaras) is Lithuania's national treasure — a great conversation topic",
      category: "social",
      urgency: "soon",
      contexts: ["egle"],
    },
    {
      id: "lt_independence",
      trigger: "independence|laisvė|soviet|history|istorija",
      tip: "Lithuania declared independence from USSR in 1990 — a source of immense national pride",
      category: "social",
      urgency: "soon",
      contexts: ["jonas"],
    },
  ],

  emergencyPhrases: [
    { id: "lt_help", category: "emergency", source: "Help!", target: "Pagalba!", phonetic: "pa-GAL-ba", audioText: "Pagalba!", urgencyLevel: 3 },
    { id: "lt_doctor", category: "medical", source: "I need a doctor", target: "Man reikia gydytojo", phonetic: "man REI-kya gih-DIH-to-yo", audioText: "Man reikia gydytojo", urgencyLevel: 3 },
    { id: "lt_police", category: "emergency", source: "Call the police", target: "Iškvieskite policiją", phonetic: "eesh-KVYES-kih-teh po-LIH-tsee-yah", audioText: "Iškvieskite policiją!", urgencyLevel: 3 },
    { id: "lt_ambulance", category: "emergency", source: "Call an ambulance", target: "Iškvieskite greitąją", phonetic: "eesh-KVYES-kih-teh GREI-tah-yah", audioText: "Iškvieskite greitąją pagalbą!", urgencyLevel: 3 },
    { id: "lt_hospital", category: "medical", source: "Where is the hospital?", target: "Kur yra ligoninė?", phonetic: "kur EE-ra lih-go-NIH-neh", audioText: "Kur yra ligoninė?", urgencyLevel: 2 },
    { id: "lt_pharmacy", category: "medical", source: "Where is the pharmacy?", target: "Kur yra vaistinė?", phonetic: "kur EE-ra VAIS-tih-neh", audioText: "Kur yra vaistinė?", urgencyLevel: 2 },
    { id: "lt_lost", category: "safety", source: "I am lost", target: "Aš pasiklydau", phonetic: "ash pa-SIH-klih-dow", audioText: "Aš pasiklydau", urgencyLevel: 2 },
    { id: "lt_understand", category: "social", source: "I do not understand", target: "Nesuprantu", phonetic: "neh-su-PRAN-tu", audioText: "Nesuprantu", urgencyLevel: 1 },
    { id: "lt_english", category: "social", source: "Do you speak English?", target: "Ar kalbate angliškai?", phonetic: "ar KAL-ba-teh ang-LEESH-kai", audioText: "Ar kalbate angliškai?", urgencyLevel: 1 },
    { id: "lt_bathroom", category: "social", source: "Where is the bathroom?", target: "Kur yra tualetas?", phonetic: "kur EE-ra tua-LEH-tas", audioText: "Kur yra tualetas?", urgencyLevel: 1 },
  ],
};
