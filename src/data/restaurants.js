const restaurants = [
  // ATAMI
  { city: 'Atami', name: 'ATAMI せかいえ (Sekaie)', tags: ['halal', 'group', 'hot'], phone: '0557-86-2002', address: '熱海市伊豆山269-1', note: 'Halal-certified ryokan (Malaysia Halal Corporation). Halal kaiseki, Muslim chef, separate utensils. Prayer space + mat + Quran + qibla compass. ☆ Main rec: stay + dinner fireworks night.', maps: 'ATAMI+せかいえ+熱海市伊豆山269-1' },
  { city: 'Atami', name: '海幸楽膳 釜つる (Kamatsuru)', tags: ['pork', 'group'], phone: '0557-85-1755', address: 'Atami Ginza (熱海市銀座町10-11)', note: 'Pork-free kitchen + halal cooking certification. Shizuoka portal ✅. Fresh grilled fish. Request no sake/mirin. Prayer space.', maps: '海幸楽膳+釜つる+熱海市銀座町' },
  { city: 'Atami', name: 'Yuyado Ichibanchi', tags: ['muslim'], phone: '', address: 'Atami', note: 'Private onsen. Tatami + futon. From ¥39,000/night. Check Rakuten Travel.', maps: 'Yuyado+Ichibanchi+Atami' },
  { city: 'Atami', name: 'Washokudokoro Tensho', tags: ['pork'], phone: '', address: 'Around Atami Station', note: 'Traditional Japanese set meals, seasonal fish. Can prepare without pork/sake/mirin upon request. ¥1,500-3,000.', maps: 'Washokudokoro+Tensho+Atami' },
  { city: 'Atami', name: 'Atami Ginza Osakana Shokudo Hanare', tags: ['pork'], phone: '', address: 'Atami Ginza', note: 'Seafood bowls + kamameshi. ¥1,500-2,500. Request no pork/alcohol.', maps: 'Atami+Ginza+Osakana+Shokudo+Hanare' },
  { city: 'Atami', name: 'Cafe & Restaurant Nagisa', tags: ['pork'], phone: '', address: 'Atami seafront', note: 'Fluffy 3-egg omurice + sea-view terrace. ¥1,500-2,500. Request no pork/alcohol.', maps: 'Cafe+&+Restaurant+Nagisa+Atami' },
  { city: 'Atami', name: 'Atami Desserts (Street Food)', tags: [], phone: '', address: 'Atami Ginza / station area', note: 'Atami Pudding (retro) · Atami Butter An · Square Choux · Aobasha/Satori matcha. Check ingredients.', maps: 'Atami+Ginza' },
  // YOKOHAMA
  { city: 'Yokohama', name: 'Khazana Minatomirai', tags: ['halal', 'group'], phone: '045-682-2873', address: 'Queens Tower B1F, 1 min from Minatomirai Station', note: 'Indian (Maharaja Group). Halal-certified meat. Lunch buffet all-you-can-eat naan + curry. ☆ Top choice for group.', maps: 'Khazana+Minatomirai+Yokohama' },
  { city: 'Yokohama', name: 'Cinta Jawa Café Yokohama', tags: ['halal', 'group'], phone: '045-211-4277', address: '3 min from Kannai Station', note: 'Halal-certified Indonesian. 48 seats, party course ¥2,500 + free flow ¥1,500. Can charter (貸切). Nasi goreng, satay, rendang.', maps: 'Cinta+Jawa+Cafe+Yokohama+Kannai' },
  { city: 'Yokohama', name: '🇲🇾 Malay Asian Cuisine Yokohama', tags: ['muslim', 'group'], phone: '045-307-9839', address: '82-3 Yamashita-cho (next to Chinatown)', note: 'MALAYSIAN restaurant! Muslim owner + chef. Halal meat, separate kitchen. Malay-speaking staff. Laksa, nasi lemak. Lunch ¥1,000 / dinner ¥3,000. Closed Mondays - OK for trip dates.', maps: 'Malay+Asian+Cuisine+Yokohama+82-3+Yamashita-cho' },
  { city: 'Yokohama', name: 'SARIO Heichinsaryoo (World Porters)', tags: ['muslim', 'group'], phone: '', address: 'World Porters, Minato Mirai', note: 'Casual Chinese (Heichinrou brand). Muslim-friendly menu since 2018. Halal chicken curry, dandan noodles. Prayer space in mall.', maps: 'SARIO+Heichinsaryoo+Yokohama+World+Porters' },
  { city: 'Yokohama', name: 'Kissho Yokohama (吉祥)', tags: ['muslim'], phone: '045-222-5522', address: 'Landmark Plaza 5F, Minato Mirai', note: 'Halal-friendly Japanese chain (unagi, sukiyaki). Confirm halal status for this branch when booking.', maps: '吉祥+Kissho+Yokohama+Landmark+Plaza' },
  { city: 'Yokohama', name: 'AFURI Yokohama Joinus', tags: ['halal'], phone: '', address: 'Joinus, Yokohama', note: 'Famous yuzu ramen - halal-certified (official Yokohama Muslim guide). Small shop, not 30 pax.', maps: 'AFURI+Yokohama+Joinus' },
  { city: 'Yokohama', name: 'Vee Sweets Café', tags: ['muslim'], phone: '', address: 'Minato Mirai area', note: 'Plant-based/vegan - safe for Muslim travelers. Coffee & dessert stop.', maps: 'Vee+Sweets+Cafe+Yokohama' },
  // KAMAKURA
  { city: 'Kamakura', name: 'Kondo (鎌倉わそうざいこんどう)', tags: ['muslim'], phone: '', address: '1-8-36 Yukinoshita (near Tsurugaoka Hachimangu)', note: 'Japanese cuisine using halal seasonings. Separate cooking. Lunch ¥1,500-2,000. Halalgourmet ✅.', maps: '鎌倉わそうざいこんどう+雪ノ下' },
  { city: 'Kamakura', name: 'Kamakura Turkish Cuisine EGE', tags: ['halal'], phone: '', address: 'Kamakura', note: 'Halal Turkish food (5.0★ Yelp). Kebab, grilled meat. Confirm capacity for group.', maps: 'Kamakura+Turkish+Cuisine+EGE' },
  { city: 'Kamakura', name: 'Hachinoki (鉢の木)', tags: ['veg'], phone: '', address: 'Kita-Kamakura (near Kenchoji)', note: 'Shojin ryori (Buddhist vegetarian) since 1964. ~¥4,000/set. Safe for Muslim; request no mirin/sake.', maps: 'Hachinoki+Kita-Kamakura' },
  { city: 'Kamakura', name: 'Komachi-dori Street Food', tags: [], phone: '', address: 'Komachi-dori', note: 'Menchi katsu, grilled senbei, dango, matcha sweets. ⚠️ Many stalls use pork - check each one.', maps: 'Komachi-dori+Kamakura' },
];

const tagColors = {
  halal: { bg: 'var(--tag-halal-bg)', color: 'var(--tag-halal-fg)', border: 'var(--tag-halal-bd)', label: 'Halal Certified' },
  pork: { bg: 'var(--tag-pork-bg)', color: 'var(--tag-pork-fg)', border: 'var(--tag-pork-bd)', label: 'Pork-Free Kitchen' },
  muslim: { bg: 'var(--tag-muslim-bg)', color: 'var(--tag-muslim-fg)', border: 'var(--tag-muslim-bd)', label: 'Muslim-Friendly' },
  group: { bg: 'var(--tag-group-bg)', color: 'var(--tag-group-fg)', border: 'var(--tag-group-bd)', label: 'Fits 30 pax' },
  veg: { bg: 'var(--tag-veg-bg)', color: 'var(--tag-veg-fg)', border: 'var(--tag-veg-bd)', label: 'Vegetarian' },
  hot: { bg: 'var(--tag-hot-bg)', color: 'var(--tag-hot-fg)', border: 'var(--tag-hot-bd)', label: 'Ryokan' },
};

export default restaurants;
export { tagColors };