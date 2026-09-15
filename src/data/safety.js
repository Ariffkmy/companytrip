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

/* ── Medical ────────────────────────────────────────────
   Hospitals and clinics along the actual route, grouped by where the
   itinerary puts us. For a real emergency you still call 119 — an
   ambulance decides which hospital will accept the patient, you do not.
   This list is for the other case: someone is unwell but walking, and
   you need to know where to take them without searching on a dead phone.

   Verified Sept 2026 from JNTO, hospital sites and city pages. */

export const MEDICAL_HOTLINES = [
  {
    label: 'Kanagawa Emergency Consultation',
    number: '#7119',
    dial: '#7119',
    note: '24/7. “Do we need an ambulance?” Covers Yokohama, Kamakura, Fujisawa. Direct line 045-232-7119. Japanese — pair it with AMDA below.',
  },
  {
    label: 'Shizuoka Emergency Consultation',
    number: '#7119',
    dial: '#7119',
    note: 'Same service in Shizuoka prefecture — this is the one that applies in Atami on Day 4.',
  },
  {
    label: 'AMDA Medical Info Center',
    number: '03-6233-9266',
    dial: '0362339266',
    note: '10:00–16:00 daily. Free multilingual medical advice AND free phone interpretation into a hospital. Call them before you call a clinic.',
    highlight: true,
  },
];

export const MEDICAL = [
  {
    id: 'base',
    area: 'Hotel MyStays Yokohama',
    where: 'Koganecho / Bandobashi · 4-81 Sueyoshicho, Naka-ku',
    days: 'Every night, D1–D5 — the default for anything overnight',
    facilities: [
      {
        name: 'Yokohama City University Medical Center',
        jp: '横浜市立大学附属市民総合医療センター',
        tag: 'ER · 24h',
        address: '4-57 Urafune-cho, Minami-ku, Yokohama',
        phone: '045-261-5656',
        dial: '0452615656',
        note: 'The closest major emergency hospital to the hotel — just across the river in Minami-ku, walkable. Tertiary ER, takes the serious cases. This is the answer to “which hospital?” for most of this trip.',
      },
      {
        name: 'Yokohama City Minato Red Cross Hospital',
        jp: '横浜市立みなと赤十字病院',
        tag: 'ER · 24h',
        address: '3-12-1 Shinyamashita, Naka-ku, Yokohama',
        phone: '045-628-6100',
        dial: '0456286100',
        note: 'Accepts non-Japanese emergency patients and uses a translation device with doctors and nurses. Use it if you want the better language odds.',
      },
    ],
  },
  {
    id: 'shin-yokohama',
    area: 'Shin-Yokohama — Macnica day',
    where: 'Macnica office · Ramen Museum · Zauo',
    days: 'D2 · Fri 23 Oct',
    facilities: [
      {
        name: 'Yokohama Rosai Hospital',
        jp: '横浜労災病院',
        tag: 'ER · 24h',
        address: '3211 Kozukue-cho, Kohoku-ku, Yokohama',
        phone: '045-474-8111',
        dial: '0454748111',
        note: '10 min walk from Shin-Yokohama Station (7 min from the subway). 24-hour emergency and critical care centre — the nearest ER to the Macnica office. Macnica staff will know it.',
      },
    ],
  },
  {
    id: 'kamakura',
    area: 'Kamakura — Hasedera',
    where: 'Hase · Komachi · Kamakura Station',
    days: 'D3 morning · Sat 24 Oct',
    facilities: [
      {
        name: 'Shonan Kamakura General Hospital',
        jp: '湘南鎌倉総合病院',
        tag: 'ER · 24h · English',
        address: '1370-1 Okamoto, Kamakura',
        phone: '0467-46-9931',
        dial: '0467469931',
        note: 'Emergency department open 24h, 365 days. Has an International Medical Support Center with English interpretation — the best-equipped option on the whole route for a non-Japanese speaker. Roughly 15 min by taxi from Hase.',
      },
    ],
  },
  {
    id: 'enoshima',
    area: 'Enoshima & Koshigoe',
    where: 'Enoshima Aquarium · Shirasu Ya dinner',
    days: 'D3 afternoon & evening · Sat 24 Oct',
    facilities: [
      {
        name: 'Fujisawa City Hospital',
        jp: '藤沢市民病院',
        tag: 'ER · 24h',
        address: '2-6-1 Fujisawa, Fujisawa',
        phone: '0466-25-3111',
        dial: '0466253111',
        note: 'Tertiary emergency department, and the hospital that covers Katase-Kaigan and the aquarium. About 10 min by taxi, or 2 stops on the Odakyu line to Fujisawa.',
      },
      {
        name: 'Shonan Kamakura General Hospital',
        jp: '湘南鎌倉総合病院',
        tag: 'ER · 24h · English',
        address: '1370-1 Okamoto, Kamakura',
        phone: '0467-46-9931',
        dial: '0467469931',
        note: 'Still the better choice for the Koshigoe dinner stop, and for English. Same hospital as the morning card.',
      },
    ],
  },
  {
    id: 'atami',
    area: 'Atami — treasure hunt & fireworks',
    where: 'Atami Station · Nakamise-dōri · Sun Beach',
    days: 'D4 · Sun 25 Oct — the highest-risk day',
    facilities: [
      {
        name: 'IUHW Atami Hospital',
        jp: '国際医療福祉大学熱海病院',
        tag: 'ER · Disaster base hospital',
        address: '13-1 Higashikaigan-cho, Atami',
        phone: '0557-81-9171',
        dial: '0557819171',
        note: 'Atami’s main hospital, on the seafront road — close to Sun Beach and the fireworks viewing area. Shizuoka-designated disaster base hospital with a DMAT team. Outpatient Mon–Sat; for Sunday the 25th, call first or dial 119.',
      },
      {
        name: 'Atami Tokoro Memorial Hospital',
        jp: '熱海所記念病院',
        tag: 'Emergency-designated',
        address: '20-20 Showacho, Atami',
        phone: '0557-82-3000',
        dial: '0557823000',
        note: 'Second Atami hospital, emergency-designated. Reception 08:30–12:00 and 13:30–16:30, closed Sundays, holidays and Saturday afternoons — so closed on our Sunday. Useful only as a backup via 119.',
      },
    ],
    warning:
      'Day 4 is a Sunday, most of it is on foot and downhill, and after the fireworks there is no bus or train — a 17 min walk to the station with heavy crowds. If someone is hurt during the treasure hunt, call 119 straight away rather than trying to walk them out. Give the checkpoint name and the nearest shop sign as your location.',
  },
  {
    id: 'minatomirai',
    area: 'Minato Mirai & Sakuragicho',
    where: 'Cup Noodles Museum · World Porters · Red Brick',
    days: 'D5 · Mon 26 Oct',
    facilities: [
      {
        name: 'Landmark Yokohama International Clinic',
        jp: 'ランドマーク横浜国際クリニック',
        tag: 'Clinic · English · CLOSED Mon',
        address: 'Landmark Plaza 1F, 2-2-1 Minatomirai, Nishi-ku, Yokohama',
        phone: '045-224-2111',
        dial: '0452242111',
        note: '5 min walk from Sakuragicho, right beside the free-time area. English-speaking, general practice. ⚠️ Closed Sunday and Monday — which means it is closed on our Day 5. Listed because it is the obvious walk-in if plans shift.',
      },
      {
        name: 'Yokohama City University Medical Center',
        jp: '横浜市立大学附属市民総合医療センター',
        tag: 'ER · 24h',
        address: '4-57 Urafune-cho, Minami-ku, Yokohama',
        phone: '045-261-5656',
        dial: '0452615656',
        note: 'The fallback on Day 5, and conveniently the same hospital as the hotel card — a few minutes away on the Keikyu line.',
      },
    ],
  },
  {
    id: 'haneda',
    area: 'Haneda Airport',
    where: 'Terminal 3, ground floor',
    days: 'D1 arrival & D5 departure',
    facilities: [
      {
        name: 'Toho University Haneda Airport Terminal 3 Clinic',
        jp: '東邦大学羽田空港第3ターミナルクリニック',
        tag: 'Clinic · English',
        address: '1F, Terminal 3, 2-6-5 Haneda Airport, Ota-ku, Tokyo',
        phone: '03-6428-8121',
        dial: '0364288121',
        note: 'Open daily 09:00–11:30 and 13:00–22:30. Internal medicine and surgery, English available. ⚠️ We land at 23:50 on Day 1 — it is shut. Anything that cannot wait until morning means calling 119 from the terminal or telling airport staff.',
      },
    ],
  },
];

export const MEDICAL_NOTES = [
  'Bring your passport. Hospitals ask for photo ID before they will register you.',
  'You pay on the spot, in full — Japanese hospitals will not bill Etiqa directly. Cards are widely accepted at large hospitals, less so at small clinics. Carry cash.',
  'Keep every receipt and the itemised bill (明細書, meisaisho). Ask for it explicitly — it is what Etiqa needs for the claim.',
  'Save your Etiqa policy number offline, not just in your email.',
  'An ambulance (119) is free to call and free to ride. Cost is never a reason to hesitate.',
  'Pharmacies (薬局) handle minor things but most close by 19:00. Convenience stores stock painkillers, plasters and cold remedies at all hours.',
  'Tell the committee. Nobody goes to a hospital alone — send a JP speaker from your team.',
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
      'Do not choose the hospital yourself in an emergency — the ambulance crew finds one that will accept the patient. The list below is for when someone is unwell but walking.',
      'Not sure if it is serious? Dial #7119 (24h) or call AMDA on 03-6233-9266 for free multilingual advice and interpretation.',
      'Hospitals often will not bill Malaysian insurance directly. Expect to pay and claim later — keep every receipt.',
      'Carry your travel insurance policy number offline, not just in email.',
      'Pharmacies (薬局) handle minor things, but many close by 19:00. Convenience stores stock basics.',
      'See the “Hospitals along the route” section below for the nearest ER at each stop on the itinerary.',
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
  { jp: '一番近い病院に連れて行ってください', romaji: 'Ichiban chikai byōin ni tsurete itte kudasai', en: 'Please take me to the nearest hospital (to a taxi driver)' },
  { jp: '英語を話せる医師はいますか？', romaji: 'Eigo o hanaseru ishi wa imasu ka?', en: 'Is there a doctor who speaks English?' },
  { jp: '明細書をください', romaji: 'Meisaisho o kudasai', en: 'Please give me an itemised receipt (for the insurance claim)' },
  { jp: 'パスポートをなくしました', romaji: 'Pasupōto o nakushimashita', en: 'I have lost my passport' },
  { jp: '日本語がわかりません', romaji: 'Nihongo ga wakarimasen', en: 'I don’t understand Japanese' },
];
