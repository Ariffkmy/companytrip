/* ═══════════════════════════════════════════════════
   Emergency reference for the Japan trip.

   Deliberately static: this page has to work with no signal and no
   backend, so nothing here is fetched at runtime.

   NOT an alert system. Japan's warnings — earthquake, tsunami, typhoon,
   landslide — arrive via cell broadcast and the official Safety tips
   app. See ALERT_SETUP.
   ═══════════════════════════════════════════════════ */

export const ALERT_SETUP = [
  {
    title: 'Install “Safety tips”',
    body: 'The official disaster app for foreign visitors, backed by the Japan Tourism Agency. Pushes earthquake, tsunami, typhoon, heavy-rain and landslide warnings in English. Install it before you fly.',
    action: { label: 'About the app', href: 'https://www.japan.travel/en/japan-safe-travel-information/' },
  },
  {
    title: 'Turn on your phone’s emergency alerts',
    body: 'iPhone: Settings → Notifications → scroll to the bottom → enable Emergency Alerts. Android: Settings → Safety & emergency → Wireless emergency alerts. A Malaysian phone roaming in Japan does not always receive the national cell broadcast, which is exactly why the app above matters.',
  },
  {
    title: 'Keep data roaming on overnight',
    body: 'Warnings arrive as push notifications. A phone in airplane mode or off Wi-Fi at 3am receives nothing.',
  },
];

export const EMERGENCY_NUMBERS = [
  { label: 'Police', number: '110', dial: '110', note: 'Crime, accidents, lost passport report' },
  { label: 'Fire & Ambulance', number: '119', dial: '119', note: 'Fire, injury, sudden illness' },
  { label: 'Coast Guard', number: '118', dial: '118', note: 'Anything at sea — relevant in Atami' },
  {
    label: 'Japan Visitor Hotline',
    number: '050-3816-2787',
    dial: '05038162787',
    note: '24/7, English · Chinese · Korean. JNTO. Use this when unsure who to call.',
    highlight: true,
  },
  {
    label: 'Malaysian Embassy, Tokyo',
    number: '+81 3-3476-3840',
    dial: '+81334763840',
    note: '20-16 Nanpeidai-cho, Shibuya-ku. Office hours Mon–Fri only.',
  },
];

/* Each hazard is its own collapsible card. `when` is the one-line cue
   that tells you this is the card you want. */
export const HAZARDS = [
  {
    id: 'quake',
    icon: '🌏',
    title: 'Earthquake',
    when: 'The ground moves, or your phone screams',
    steps: [
      'Drop, cover, hold on. Get under a sturdy table and protect your head.',
      'Do not run outside while it is moving — most injuries come from falling glass and roof tiles.',
      'Indoors: stay away from windows, mirrors and tall furniture. Do not rush for the exit.',
      'In a lift: press every floor button and get out at the first one that opens.',
      'Outside: move to open ground, away from walls, vending machines and power lines.',
      'In a shop or station: follow the staff. They drill for this constantly.',
      'Once it stops: check for injuries, then expect aftershocks. If you are near the coast, read the Tsunami card now.',
    ],
  },
  {
    id: 'tsunami',
    icon: '🌊',
    title: 'Tsunami',
    when: 'Near the sea after a long or strong quake — Atami, Days 4–5',
    steps: [
      'Atami sits on Sagami Bay. If you are near the water and feel a long or strong quake, move to high ground immediately — do not wait for an official warning.',
      'Go uphill or inland. The hills rise steeply right behind the seafront, so high ground is close. Follow 津波避難場所 (tsunami evacuation site) signs.',
      'Do not go back for luggage, and do not drive. Roads jam instantly.',
      'Stay high until officials declare it clear. A later wave is often bigger than the first.',
    ],
    tiers: [
      { jp: '大津波警報', en: 'Major Tsunami Warning', detail: 'Over 3 m — evacuate to high ground now' },
      { jp: '津波警報', en: 'Tsunami Warning', detail: 'Up to 3 m — leave the coast immediately' },
      { jp: '津波注意報', en: 'Tsunami Advisory', detail: 'Up to 1 m — get out of the water, off the beach' },
    ],
  },
  {
    id: 'typhoon',
    icon: '🌀',
    title: 'Typhoon & heavy rain',
    when: 'October is still typhoon season — the likeliest disruption on this trip',
    steps: [
      'Typhoons are forecast days ahead, so you will get warning. Watch the Weather tab and the Safety tips app.',
      'Trains stop on purpose. JR announces 計画運休 (planned suspension) hours in advance and the whole network can halt — this is what would break the itinerary, not the wind.',
      'If a typhoon is due, move plans earlier in the day and stay put once it lands. Do not try to travel between cities through it.',
      'Stay indoors and away from windows. Flying debris, not rain, is the danger.',
      'Keep away from rivers, drainage channels, the seafront and underpasses. Underpasses flood fast and deep.',
      'Charge everything and top up Suica before it arrives. Power and card readers go down.',
    ],
  },
  {
    id: 'landslide',
    icon: '⛰️',
    title: 'Landslide',
    when: 'Heavy or prolonged rain while on a slope — a real Atami risk',
    steps: [
      'Atami is built on steep ground and suffered a fatal debris flow in 2021 after days of rain. Take 土砂災害警戒情報 (landslide warning) seriously.',
      'Warning signs: small stones tumbling, water suddenly turning muddy, a smell of soil, cracking or rumbling from the slope.',
      'Move away from the base of steep slopes and out of narrow valleys. Go sideways out of the path, not downhill ahead of it.',
      'If you cannot get out, move to the highest floor of a solid building, on the side away from the slope.',
    ],
  },
  {
    id: 'fire',
    icon: '🔥',
    title: 'Fire',
    when: 'In a hotel, restaurant or station',
    steps: [
      'Call 119. Say 火事 (kaji — fire) and the address.',
      'Get out low, under the smoke. Smoke kills long before flame.',
      'Never use the lift. Use the stairs.',
      'Check where your ryokan and hotel exits are on the night you arrive — corridors look very different in the dark.',
    ],
  },
  {
    id: 'medical',
    icon: '🏥',
    title: 'Illness or injury',
    when: 'Someone needs a doctor',
    steps: [
      'Call 119 for an ambulance. It is free to call and free to ride — do not hesitate over cost.',
      'Say 救急車 (kyūkyūsha — ambulance), then the address. Have someone read the address off a building plaque or a convenience store sign.',
      'Hospitals often will not bill Malaysian insurance directly. Expect to pay and claim later — keep every receipt.',
      'Carry your travel insurance policy number offline, not just in email.',
      'Pharmacies (薬局) handle minor things, but many close by 19:00. Convenience stores stock basics.',
    ],
  },
  {
    id: 'lost',
    icon: '🧭',
    title: 'Lost, or lost documents',
    when: 'Separated from the group, or a passport goes missing',
    steps: [
      'Japan has 交番 (kōban) police boxes near almost every station. Staffed, safe, and used to helping tourists. Go to one.',
      'Lost property in Japan is very likely to be handed in — ask at the station office or the kōban before assuming it is gone.',
      'Lost passport: report at a kōban first and get the report slip, then contact the Malaysian Embassy in Tokyo. You need the slip before the embassy can act.',
      'If you are simply separated, stay where you are and message. Moving around makes you harder to find.',
    ],
  },
];

export const REGROUP = [
  'Do not make voice calls — networks jam within minutes. Use LINE or WhatsApp; data usually survives when calls do not.',
  'Message your group leader first, then the committee. Leaders and numbers are on the Group tab.',
  'NTT disaster message board: dial 171, or use web171.',
  'If separated with no signal, return to that night’s hotel lobby. That is the default meeting point for the whole trip.',
];

export const PHRASES = [
  { jp: '助けて！', romaji: 'Tasukete!', en: 'Help!' },
  { jp: '火事だ！', romaji: 'Kaji da!', en: 'Fire!' },
  { jp: '救急車を呼んでください', romaji: 'Kyūkyūsha o yonde kudasai', en: 'Please call an ambulance' },
  { jp: '警察を呼んでください', romaji: 'Keisatsu o yonde kudasai', en: 'Please call the police' },
  { jp: '避難場所はどこですか？', romaji: 'Hinan basho wa doko desu ka?', en: 'Where is the evacuation site?' },
  { jp: '電車は動いていますか？', romaji: 'Densha wa ugoite imasu ka?', en: 'Are the trains running?' },
  { jp: '病院はどこですか？', romaji: 'Byōin wa doko desu ka?', en: 'Where is the hospital?' },
  { jp: 'パスポートをなくしました', romaji: 'Pasupōto o nakushimashita', en: 'I have lost my passport' },
  { jp: '日本語がわかりません', romaji: 'Nihongo ga wakarimasen', en: 'I don’t understand Japanese' },
];
