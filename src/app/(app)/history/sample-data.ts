const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ts(msAgo: number) {
  const date = new Date(Date.now() - msAgo);
  return { toDate: () => date };
}

export function getSampleConversations() {
  return [
    {
      id: 'sample-1',
      scenarioId: 'ordering-coffee',
      scenarioTitle: 'Ordering a Coffee',
      languageCode: 'es',
      languageName: 'Spanish',
      difficulty: 'medium',
      startedAt: ts(35 * MINUTE),
      endedAt: ts(35 * MINUTE - (5 * MINUTE + 32 * 1000)),
      messages: [
        { role: 'user', text: 'Hola, un café con leche por favor.', timestamp: ts(35 * MINUTE) },
        {
          role: 'ai',
          text: '¡Hola! Claro, ¿lo quieres grande o pequeño? Y ¿algún tamaño especial de leche?',
          timestamp: ts(35 * MINUTE - 15 * 1000),
        },
        {
          role: 'user',
          text: 'Grande, con leche de avena si tienen.',
          timestamp: ts(35 * MINUTE - 30 * 1000),
        },
        {
          role: 'ai',
          text: 'Perfecto, sí tenemos leche de avena. ¿Quieres que te agregue algo de vainilla o azúcar? ¿Y quieres acompañarlo con algo de comer?',
          timestamp: ts(35 * MINUTE - 45 * 1000),
        },
        {
          role: 'user',
          text: 'No, solo el café. ¿Cuánto es?',
          timestamp: ts(35 * MINUTE - 60 * 1000),
        },
        {
          role: 'ai',
          text: 'Son cinco con cincuenta. ¿Lo vas a tomar aquí o para llevar?',
          timestamp: ts(35 * MINUTE - 75 * 1000),
        },
        { role: 'user', text: 'Para llevar, gracias.', timestamp: ts(35 * MINUTE - 90 * 1000) },
        {
          role: 'ai',
          text: '¡Perfecto! Te lo preparo ahora. Que tengas un buen día.',
          timestamp: ts(35 * MINUTE - 105 * 1000),
        },
      ],
    },
    {
      id: 'sample-2',
      scenarioId: 'restaurant-dining',
      scenarioTitle: 'Dining at a Restaurant',
      languageCode: 'ja',
      languageName: 'Japanese',
      difficulty: 'hard',
      startedAt: ts(8 * HOUR),
      endedAt: ts(8 * HOUR - (8 * MINUTE + 12 * 1000)),
      messages: [
        { role: 'user', text: 'こんばんは、予約はしていないんですけど。', timestamp: ts(8 * HOUR) },
        {
          role: 'ai',
          text: 'いらっしゃいませ。何名様でしょうか？少々お待ちいただくかもしれません。',
          timestamp: ts(8 * HOUR - 20 * 1000),
        },
        {
          role: 'user',
          text: '二人です。どのくらい待ちますか？',
          timestamp: ts(8 * HOUR - 40 * 1000),
        },
        {
          role: 'ai',
          text: '十五分ほどでカウンター席が空きます。テーブル席でしたらもう少しかかりますね。',
          timestamp: ts(8 * HOUR - 60 * 1000),
        },
        {
          role: 'user',
          text: 'カウンターで大丈夫です。おすすめは何ですか？',
          timestamp: ts(8 * HOUR - 80 * 1000),
        },
        {
          role: 'ai',
          text: '今日は鰆（さわら）が入ってまして、塩焼きにするのがおすすめです。あとは季節の刺身盛り合わせもいいですよ。',
          timestamp: ts(8 * HOUR - 100 * 1000),
        },
      ],
    },
    {
      id: 'sample-3',
      scenarioId: 'asking-directions',
      scenarioTitle: 'Asking for Directions',
      languageCode: 'fr',
      languageName: 'French',
      difficulty: 'easy',
      startedAt: ts(1 * DAY + 2 * HOUR),
      endedAt: ts(1 * DAY + 2 * HOUR - (3 * MINUTE + 45 * 1000)),
      messages: [
        {
          role: 'user',
          text: 'Excusez-moi, où est la gare ?',
          timestamp: ts(1 * DAY + 2 * HOUR),
        },
        {
          role: 'ai',
          text: 'La gare ? Elle est tout près. Tournez à droite au prochain feu, puis continuez tout droit.',
          timestamp: ts(1 * DAY + 2 * HOUR - 20 * 1000),
        },
        {
          role: 'user',
          text: 'C\'est loin ?',
          timestamp: ts(1 * DAY + 2 * HOUR - 40 * 1000),
        },
        {
          role: 'ai',
          text: 'Non, cinq minutes à pied. Vous ne pouvez pas la manquer, elle est très grande.',
          timestamp: ts(1 * DAY + 2 * HOUR - 60 * 1000),
        },
        {
          role: 'user',
          text: 'Merci beaucoup !',
          timestamp: ts(1 * DAY + 2 * HOUR - 80 * 1000),
        },
        {
          role: 'ai',
          text: 'Je vous en prie. Bonne journée !',
          timestamp: ts(1 * DAY + 2 * HOUR - 100 * 1000),
        },
      ],
    },
    {
      id: 'sample-4',
      scenarioId: 'inviting-friend',
      scenarioTitle: 'Inviting a Friend Out',
      languageCode: 'de',
      languageName: 'German',
      difficulty: 'medium',
      startedAt: ts(5 * DAY + 3 * HOUR),
      endedAt: ts(5 * DAY + 3 * HOUR - (6 * MINUTE + 5 * 1000)),
      messages: [
        {
          role: 'user',
          text: 'Hey, hast du am Samstagabend schon was vor?',
          timestamp: ts(5 * DAY + 3 * HOUR),
        },
        {
          role: 'ai',
          text: 'Samstag? Noch nichts Festes. Was hast du im Kopf?',
          timestamp: ts(5 * DAY + 3 * HOUR - 15 * 1000),
        },
        {
          role: 'user',
          text: 'Es gibt ein Konzert im Park. Hättest du Lust mitzukommen?',
          timestamp: ts(5 * DAY + 3 * HOUR - 30 * 1000),
        },
        {
          role: 'ai',
          text: 'Klingt cool! Um wie viel Uhr fängt das an? Und ist das draußen? Ich hab gehört, es soll regnen.',
          timestamp: ts(5 * DAY + 3 * HOUR - 45 * 1000),
        },
        {
          role: 'user',
          text: 'Um acht. Ja, draußen, aber es gibt ein Zelt falls es regnet.',
          timestamp: ts(5 * DAY + 3 * HOUR - 60 * 1000),
        },
        {
          role: 'ai',
          text: 'Okay, ich bin dabei. Wollen wir uns vorher treffen und zusammen was essen?',
          timestamp: ts(5 * DAY + 3 * HOUR - 75 * 1000),
        },
        {
          role: 'user',
          text: 'Klar! Sagen wir sieben bei mir?',
          timestamp: ts(5 * DAY + 3 * HOUR - 90 * 1000),
        },
        {
          role: 'ai',
          text: 'Perfekt. Bis Samstag dann!',
          timestamp: ts(5 * DAY + 3 * HOUR - 105 * 1000),
        },
      ],
    },
    {
      id: 'sample-5',
      scenarioId: 'ordering-coffee',
      scenarioTitle: 'Ordering a Coffee',
      languageCode: 'it',
      languageName: 'Italian',
      difficulty: 'easy',
      startedAt: ts(14 * DAY),
      endedAt: ts(14 * DAY - (2 * MINUTE + 18 * 1000)),
      messages: [
        { role: 'user', text: 'Buongiorno, un cappuccino per favore.', timestamp: ts(14 * DAY) },
        {
          role: 'ai',
          text: 'Buongiorno! Subito. Vuole anche qualcosa da mangiare?',
          timestamp: ts(14 * DAY - 15 * 1000),
        },
        { role: 'user', text: 'Un cornetto, grazie.', timestamp: ts(14 * DAY - 30 * 1000) },
        {
          role: 'ai',
          text: 'Perfetto. Sono quattro euro.',
          timestamp: ts(14 * DAY - 45 * 1000),
        },
      ],
    },
  ];
}
