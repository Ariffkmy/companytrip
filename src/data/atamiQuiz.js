/* ═══════════════════════════════════════════════════
   How Well Do You Know Atami? — the question bank
   ═══════════════════════════════════════════════════

   The second half of stamp 3 (cp2b), unlocked by the Find the place
   selfie. Each team is dealt a random handful per round from this bank
   (see checkpoints.cp2b in src/lib/huntConfig.js); admins can edit it
   on the Admin page, and this file is only the starting set.

   A question: { q, options, a, why }
     options  what the team picks from, shown in this order
     a        index into options of the right one
     why      shown after the team picks, right or wrong
*/

const ATAMI_QUIZ = [
  { q: 'In which Japanese prefecture is Atami located?', options: ['Hokkaido', 'Shizuoka', 'Osaka', 'Kyoto'], a: 1, why: 'Atami is located in Shizuoka Prefecture.' },
  { q: 'What is Atami particularly famous for?', options: ['Ski resorts', 'Desert safaris', 'Hot springs', 'Large-scale rice plantations'], a: 2, why: 'Atami is a well-known Japanese hot-spring resort town.' },
  { q: 'What does the name Atami traditionally refer to?', options: ['Hot sea', 'Blue mountain', 'Golden forest', 'Sleeping dragon'], a: 0, why: 'The name is traditionally associated with hot water rising from the sea.' },
  { q: 'Which body of water borders Atami?', options: ['Sea of Japan', 'Seto Inland Sea', 'East China Sea', 'Sagami Bay'], a: 3, why: 'Atami is situated along Sagami Bay.' },
  { q: 'What is Japan’s currency?', options: ['Won', 'Yen', 'Yuan', 'Ringgit'], a: 1, why: 'Japan uses the Japanese yen.' },
  { q: 'What is the primary language spoken in Atami?', options: ['Korean', 'Mandarin', 'Japanese', 'Thai'], a: 2, why: 'Japanese is the primary language spoken in Atami.' },
  { q: 'Which Japanese high-speed train serves Atami Station?', options: ['Tokaido Shinkansen', 'Hokkaido Shinkansen only', 'Yamanote Line', 'Tokyo Metro Ginza Line'], a: 0, why: 'Atami Station is served by the Tokaido Shinkansen.' },
  { q: 'What kind of destination is Atami best described as?', options: ['Industrial port city only', 'Desert resort', 'Ski-only destination', 'Coastal hot-spring resort town'], a: 3, why: 'Atami combines coastal scenery with hot springs and resort facilities.' },
  { q: 'What is the time zone used in Atami?', options: ['UTC+7', 'UTC+9', 'UTC+10', 'UTC+8'], a: 1, why: 'Japan Standard Time is UTC+9.' },
  { q: 'Which season does October fall in in Japan?', options: ['Spring', 'Summer', 'Autumn', 'Winter'], a: 2, why: 'October is part of autumn in Japan.' },
  { q: 'Which famous Japanese shogun was associated with Atami’s hot springs?', options: ['Tokugawa Ieyasu', 'Toyotomi Hideyoshi', 'Oda Nobunaga', 'Minamoto no Yoritomo'], a: 0, why: 'Tokugawa Ieyasu was historically associated with Atami’s hot springs.' },
  { q: 'What is an onsen?', options: ['A Japanese sword', 'A traditional Japanese hot spring', 'A type of sushi', 'A Japanese train'], a: 1, why: 'Onsen refers to a natural hot spring and, commonly, bathing facilities using its water.' },
  { q: 'True or false: Atami Castle is an original medieval castle that has survived unchanged for centuries.', options: ['True', 'False'], a: 1, why: 'The current Atami Castle was built in 1959 as a tourist attraction.' },
  { q: 'Which tree is especially famous at Kinomiya Shrine?', options: ['Cherry tree', 'Bamboo tree', 'Sacred camphor tree', 'Coconut tree'], a: 2, why: 'Kinomiya Shrine is renowned for its large sacred camphor tree.' },
  { q: 'What traditional Japanese garment is often worn at an onsen resort?', options: ['Kimono or yukata', 'Hanbok', 'Cheongsam', 'Ao dai'], a: 0, why: 'Yukata and kimono are traditional Japanese garments.' },
  { q: 'What material is a traditional yukata commonly made from?', options: ['Heavy leather', 'Wool', 'Metal mesh', 'Lightweight cotton or similar fabric'], a: 3, why: 'Yukata are traditionally lightweight garments, commonly made from cotton.' },
  { q: 'What is the purpose of purification at a Shinto shrine?', options: ['To cool down after walking', 'To perform ritual purification', 'To test water temperature', 'To prepare food'], a: 1, why: 'Purification rituals are performed before worship at many Shinto shrines.' },
  { q: 'What is a torii?', options: ['A Japanese dessert', 'A hot-spring bath', 'A traditional gate associated with Shinto shrines', 'A type of bullet train'], a: 2, why: 'Torii gates traditionally mark the entrance to a Shinto sacred area.' },
  { q: 'True or false: Atami has a history as a hot-spring destination dating back more than 1,000 years.', options: ['True', 'False'], a: 0, why: 'Atami has a long-established hot-spring history.' },
  { q: 'What is the Japanese word for a souvenir commonly bought when travelling?', options: ['Shinkansen', 'Tatami', 'Onsen', 'Omiyage'], a: 3, why: 'Omiyage refers to souvenirs or gifts brought back from a trip.' },
  { q: 'Which attraction in Atami is known for Japanese and East Asian art?', options: ['MOA Museum of Art', 'Tokyo Disneyland', 'Osaka Aquarium', 'Sapporo Beer Museum'], a: 0, why: 'MOA Museum of Art displays Japanese and East Asian art.' },
  { q: 'What can visitors see at Atami Plum Garden during the appropriate season?', options: ['Lavender fields', 'Plum blossoms', 'Giant sunflower farms only', 'Snow-covered pine forests year-round'], a: 1, why: 'Atami Plum Garden is known for its seasonal plum blossoms.' },
  { q: 'What is the main purpose of the Atami Ropeway?', options: ['To transport passengers between Tokyo and Osaka', 'To carry cars across the sea', 'To take visitors to an elevated viewpoint', 'To transport passengers underground'], a: 2, why: 'The ropeway provides access to elevated viewpoints overlooking Atami.' },
  { q: 'What is Atami Sun Beach best known for?', options: ['A ski jump', 'A freshwater lake', 'A rice terrace', 'A sandy waterfront and seaside atmosphere'], a: 3, why: 'Atami Sun Beach is a popular seaside destination.' },
  { q: 'What makes the Atami Marine Fireworks Festival distinctive?', options: ['It can be held at various times throughout the year', 'It only takes place once every 100 years', 'It is held inside a shopping mall', 'It only happens at sunrise'], a: 0, why: 'Atami holds scheduled fireworks events in multiple seasons.' },
  { q: 'What type of transport is a ropeway?', options: ['A ferry', 'A cable-propelled aerial transport system', 'A bicycle', 'A subway train'], a: 1, why: 'A ropeway carries passengers in suspended cabins using cables.' },
  { q: 'True or false: Atami’s fireworks festival takes place every single night.', options: ['True', 'False'], a: 1, why: 'The fireworks festival takes place on scheduled dates, not every night.' },
  { q: 'Which activity is most closely associated with a traditional Japanese hot-spring resort?', options: ['Sandboarding in a desert', 'Glacier climbing', 'Soaking in an onsen', 'Dog sledding'], a: 2, why: 'Soaking in hot-spring water is a signature onsen experience.' },
  { q: 'What is Kiunkaku in Atami known for?', options: ['A historic villa and its architecture', 'A Formula One circuit', 'A modern international airport', 'A giant indoor ski resort'], a: 0, why: 'Kiunkaku is a historic villa featuring distinctive architecture and gardens.' },
  { q: 'Which location is a practical starting point for exploring shops and eateries around central Atami?', options: ['Mount Fuji summit', 'Atami Station', 'Kansai International Airport', 'Tokyo Tower'], a: 1, why: 'Atami Station is a transport hub near shopping streets and eateries.' },
  { q: 'What is himono, a food associated with Atami and the surrounding region?', options: ['A sweet rice cake', 'A fermented soybean soup', 'Dried fish', 'A green tea dessert'], a: 2, why: 'Himono is fish that has been dried, often for preservation and flavour.' },
  { q: 'What is onsen manju?', options: ['A steamed bun usually filled with sweet red-bean paste', 'A grilled seafood dish', 'A type of Japanese curry', 'A cold noodle salad'], a: 0, why: 'Onsen manju is a traditional sweet sold in many hot-spring towns.' },
  { q: 'Which Japanese dish typically consists of rice topped with seafood?', options: ['Ramen', 'Tempura udon', 'Okonomiyaki', 'Seafood donburi'], a: 3, why: 'Donburi is a rice bowl, often topped with seafood or other ingredients.' },
  { q: 'True or false: You should generally wash your body before entering a communal Japanese onsen bath.', options: ['True', 'False'], a: 0, why: 'Bathers should wash and rinse before entering shared bathing water.' },
  { q: 'Which is good etiquette when using a communal onsen?', options: ['Swim across the bath', 'Keep your hair out of the bathing water', 'Bring food into the bath', 'Wash your clothes in the bath'], a: 1, why: 'Keeping hair out of the shared water is standard onsen etiquette.' },
  { q: 'What is the time difference between Malaysia and Japan?', options: ['Japan is 2 hours behind Malaysia', 'Both countries use the same time', 'Japan is 1 hour ahead of Malaysia', 'Japan is 3 hours ahead of Malaysia'], a: 2, why: 'Malaysia uses UTC+8 while Japan uses UTC+9.' },
  { q: 'If it is 10:00 a.m. in Malaysia, what time is it in Atami?', options: ['11:00 a.m.', '9:00 a.m.', '12:00 noon', '10:00 p.m.'], a: 0, why: 'Japan is one hour ahead of Malaysia.' },
  { q: 'True or false: Atami is located in Hokkaido, Japan’s northernmost main island.', options: ['True', 'False'], a: 1, why: 'Atami is in Shizuoka Prefecture in central Japan.' },
  { q: 'What is customary when receiving a Japanese business card?', options: ['Immediately fold it into your pocket', 'Write on it without looking at it', 'Hand it back without acknowledging it', 'Receive it respectfully and take a moment to look at it'], a: 3, why: 'Japanese business-card etiquette emphasises respectful handling and acknowledgement.' },
  { q: 'Why should visitors check the weather before outdoor activities in Atami?', options: ['Japan has no weather forecasts', 'Coastal weather can affect visibility, comfort and outdoor plans', 'It is always snowing in October', 'The weather never changes near the sea'], a: 1, why: 'Weather conditions can affect coastal sightseeing and outdoor activities.' },
];

export default ATAMI_QUIZ;
