-- Atami quiz: add questions 41–80 to the live question bank
--
-- The game reads its questions from public.hunt_config (id 'atami'),
-- config -> checkpoints -> cp2b -> questions, once the bank has been
-- saved from the Admin page. This appends the questions below to that
-- list. A question whose text is already there is skipped, so it is
-- safe to run more than once.
--
-- If the bank has never been saved, there is nothing to append to: the
-- app is still using src/data/atamiQuiz.js, which already has these
-- 40 questions. The script then changes nothing and says so.
--
-- Run in the Supabase SQL editor. Close the hunt editor on the Admin
-- page first, or reload it after: saving an editor opened before this
-- ran would write the old list back.

do $$
declare
  new_q  jsonb := $json$[
  {
    "q": "Why did Atami begin holding its sea fireworks festival in 1952?",
    "options": [
      "To celebrate the Tokaido Shinkansen opening",
      "To mark Japan's first seaside Olympics",
      "To celebrate a newly built castle",
      "To encourage recovery after a typhoon and major fires"
    ],
    "a": 3,
    "why": "The festival began in 1952 to support and recognise local recovery following the 1949 Kitty Typhoon and destructive fires in 1950."
  },
  {
    "q": "Why does Atami Bay produce such powerful echoes during fireworks?",
    "options": [
      "The fireworks are mainly launched inside a tunnel",
      "Mountains surround the bay on three sides, reflecting the sound",
      "Submerged speakers amplify each explosion",
      "The bay's shallow water prevents sound from escaping"
    ],
    "a": 1,
    "why": "Atami Bay has a bowl-like setting enclosed by mountains on three sides, creating an amphitheatre-like acoustic effect."
  },
  {
    "q": "Despite its name, what is the 'Dai-Kuchu Niagara' finale at Atami's fireworks festival?",
    "options": [
      "A broad aerial display of synchronised silver starmines",
      "A waterfall of fireworks hanging from a bridge",
      "A series of floating firework wheels pulled by boats",
      "A row of fountains spraying water and light"
    ],
    "a": 0,
    "why": "The 'Great Aerial Niagara' is an expansive starmine display filling the night sky, not a fixed waterfall suspended from wires."
  },
  {
    "q": "For the scheduled Atami fireworks on Sunday, 25 October 2026, which plan best matches the published information?",
    "options": [
      "Arrive for a 19:00–19:30 show that is cancelled for any rain",
      "Expect a 21:00–21:30 show only if skies are clear",
      "Plan around 20:20–20:40; rain alone does not normally cancel it",
      "Watch a 20:20–21:20 show from inside Atami Castle"
    ],
    "a": 2,
    "why": "Atami's official 2026 calendar lists 25 October and a 20:20–20:40 show; it is normally held in rain, although schedules can change for safety reasons."
  },
  {
    "q": "What makes Hashiriyu, one of Atami's oldest hot springs, geologically unusual?",
    "options": [
      "It flows directly out of an underwater coral reef",
      "It emerges through a horizontal cave in the hillside",
      "It is powered by artificial steam boilers",
      "It appears only during high tide"
    ],
    "a": 1,
    "why": "Hashiriyu is a rare horizontal-cave hot-spring source in Izusan, traditionally counted among Japan's three ancient hot springs."
  },
  {
    "q": "What is unusual about the visible eruptions at the historic Oyu Geyser today?",
    "options": [
      "They now consist entirely of cold seawater",
      "They occur naturally at exactly 12-hour intervals",
      "The geyser has been replaced by a public bath",
      "They are recreated artificially after natural eruptions declined"
    ],
    "a": 3,
    "why": "Oyu's natural eruptions stopped in 1923; today, a display recreates an eruption roughly every five minutes. It is not a bathing facility."
  },
  {
    "q": "At Ozawa no Yu, one of the Atami Seven Hot Springs, what can visitors traditionally prepare using geothermal steam?",
    "options": [
      "Steamed eggs",
      "Grilled mochi",
      "Tofu made with seawater",
      "Salted dried fish"
    ],
    "a": 0,
    "why": "Ozawa no Yu is known for using its hot spring steam to cook eggs; it is a local attraction rather than a communal bath."
  },
  {
    "q": "According to local tradition, what does walking once around Kinomiya Shrine's great camphor tree symbolise?",
    "options": [
      "A wish for a safe sea crossing",
      "Cleansing bad luck for seven generations",
      "Gaining one extra year of life",
      "Completing a formal Shinto wedding ritual"
    ],
    "a": 2,
    "why": "Local belief says that circling the ancient camphor tree once extends one's life by a year; this is a tradition, not a scientific claim."
  },
  {
    "q": "Which historical couple is closely connected with Izusan Shrine's reputation as a place for romantic bonds?",
    "options": [
      "Minamoto no Yoritomo and Hojo Masako",
      "Tokugawa Ieyasu and Lady Tsukiyama",
      "Emperor Meiji and Empress Shoken",
      "Emperor Taisho and Empress Teimei"
    ],
    "a": 0,
    "why": "Izusan Shrine is associated with the relationship between Minamoto no Yoritomo and Hojo Masako, making it a well-known shrine for matchmaking."
  },
  {
    "q": "Which sequence correctly describes Kiunkaku's history?",
    "options": [
      "Opened as a museum in 1919, became a ryokan in 1947",
      "Founded as a shrine in 1919, rebuilt as a castle in 1947",
      "Built as a private villa in 1919, became a ryokan in 1947",
      "Built as a station hotel in 1947, became a private villa in 1919"
    ],
    "a": 2,
    "why": "Kiunkaku began as a private holiday villa in 1919; from 1947 it operated as a ryokan before becoming a publicly accessible cultural property."
  },
  {
    "q": "What combination of architectural influences makes Kiunkaku particularly distinctive?",
    "options": [
      "Only classical Japanese temple architecture",
      "Japanese, Chinese and European elements",
      "Austrian, Russian and Scandinavian styles",
      "Modern concrete and American Art Deco only"
    ],
    "a": 1,
    "why": "Kiunkaku combines Japanese buildings with rooms incorporating Japanese, Chinese and European decorative traditions."
  },
  {
    "q": "Apart from early-blooming plum trees, which seasonal display is Atami Plum Garden noted for?",
    "options": [
      "Hydrangeas that bloom throughout late winter",
      "A late-spring wisteria festival",
      "Camellias that flower throughout summer",
      "Autumn leaves that turn relatively late in the year"
    ],
    "a": 3,
    "why": "The garden is promoted for Japan's early plum blossoms and unusually late autumn foliage, often best viewed around November to early December."
  },
  {
    "q": "What idea helped inspire the establishment of Atami Plum Garden in 1886?",
    "options": [
      "Gentle exercise can complement the health benefits of hot-spring treatment",
      "The town needed a defensive hilltop lookout",
      "Merchants wanted a permanent outdoor fish market",
      "The government planned to build a new railway terminus"
    ],
    "a": 0,
    "why": "The park was established partly around the view that suitable exercise, not only mineral water, supports recovery during a hot-spring stay."
  },
  {
    "q": "Which island is reached by passenger boat from Atami Port in roughly 25–30 minutes?",
    "options": [
      "Enoshima",
      "Izu Oshima",
      "Hatsushima",
      "Miyakejima"
    ],
    "a": 2,
    "why": "Hatsushima is a small inhabited island offshore from Atami, served by regular boats from Atami Port. The crossing is around 25–30 minutes."
  },
  {
    "q": "The Atami Ropeway's approximately three-minute ride brings visitors to a viewpoint on which hill?",
    "options": [
      "Mount Omuro",
      "Hachiman-yama",
      "Mount Takao",
      "Mount Komagatake"
    ],
    "a": 1,
    "why": "The Atami Ropeway runs from the Korakuen area up to Hachiman-yama, where visitors can enjoy the Umisora Terrace viewpoint."
  },
  {
    "q": "What usually happens to the decorative lighting at Atami Sun Beach during a fireworks display?",
    "options": [
      "It changes to bright red for the full show",
      "It stays at full brightness to illuminate the sea",
      "It is switched on only after the final fireworks",
      "It is switched off during the launch period"
    ],
    "a": 3,
    "why": "Atami Sun Beach is illuminated most evenings until 22:00, but its lighting is turned off while the fireworks are being launched."
  },
  {
    "q": "Which Japanese artist created the famous 'Red and White Plum Blossoms' folding screens held by Atami's MOA Museum of Art?",
    "options": [
      "Hokusai Katsushika",
      "Tawaraya Sotatsu",
      "Ogata Korin",
      "Hasegawa Tohaku"
    ],
    "a": 2,
    "why": "The National Treasure 'Red and White Plum Blossoms' (Kohaku Baizu Byobu) is by Ogata Korin. It is exhibited only during selected periods."
  },
  {
    "q": "Which citrus fruit is an Atami speciality and has a name associated with a family prospering for generations?",
    "options": [
      "Daidai",
      "Sudachi",
      "Kabosu",
      "Yuzu"
    ],
    "a": 0,
    "why": "Atami is known for producing daidai, a fragrant, sour citrus whose name sounds like 'generation after generation' in Japanese."
  },
  {
    "q": "Why can Atami-zakura cherry blossoms often remain in bloom for around a month?",
    "options": [
      "The trees are covered with snow-proof nets",
      "Each branch forms both early- and later-opening flower buds",
      "Artificial lighting keeps the blossoms open all night",
      "Gardeners attach new blossoms to branches each week"
    ],
    "a": 1,
    "why": "Atami-zakura develops early and late flower buds on the same branch, helping extend its flowering period. It often blooms in January–February."
  },
  {
    "q": "What traditional art can visitors see performed at the Atami Geigi Kenban, which has been used by local geigi (geisha)?",
    "options": [
      "Kabuki with full theatrical stage sets",
      "Sumo wrestling demonstrations",
      "Classical Noh theatre by monks",
      "Geigi dance performances"
    ],
    "a": 3,
    "why": "The Atami Geigi Kenban is a training and performance venue where audiences can see traditional dances by Atami geigi, including 'Hana no Mai' performances."
  },
  {
    "q": "Which Japanese novel inspired the Kanichi-and-Omiya statue along Atami’s waterfront?",
    "options": [
      "Kokoro",
      "The Golden Demon (Konjiki Yasha)",
      "The Tale of Genji",
      "Snow Country"
    ],
    "a": 1,
    "why": "Kanichi and Omiya are fictional characters from Ozaki Koyo’s Meiji-era novel The Golden Demon, which helped make Atami’s coast famous."
  },
  {
    "q": "Why are the jacaranda trees near Atami’s seafront an unusual sight in Japan?",
    "options": [
      "They are an alpine species that blooms above the snowline",
      "They are a native plum variety whose flowers turn purple",
      "They are a coastal pine variety that produces purple cones",
      "They originated in South America, and outdoor flowering on Japan’s mainland is uncommon"
    ],
    "a": 3,
    "why": "Jacarandas are South American trees with violet flowers. Japan’s mainland climate makes reliable outdoor flowering uncommon, but they sometimes flower along Atami’s seafront."
  },
  {
    "q": "What should visitors know about Kiunkaku’s Roman-style bathroom today?",
    "options": [
      "It is preserved for viewing, not available for bathing",
      "It opens for public bathing during the winter festival",
      "It is now the source of Atami’s Oyu geyser",
      "It was converted into an outdoor swimming pool"
    ],
    "a": 0,
    "why": "Kiunkaku retains a distinctive Roman-style bath as part of its historical interiors, but visitors cannot bathe in it."
  },
  {
    "q": "Which description of Kinomiya Shrine’s famous camphor tree matches its official heritage status?",
    "options": [
      "About 500 years old and protected only by the city",
      "About 1,000 years old and planted in the Edo period",
      "More than 2,000 years old and designated a National Natural Monument",
      "More than 4,000 years old and preserved as a museum exhibit"
    ],
    "a": 2,
    "why": "The sacred camphor tree at Kinomiya Shrine is estimated to be more than 2,000 years old and has National Natural Monument status."
  },
  {
    "q": "Atami’s Shinsui Park and Moon Terrace evoke a Mediterranean resort partly because of a sister-city link with which city?",
    "options": [
      "Cannes, France",
      "Sanremo, Italy",
      "Dubrovnik, Croatia",
      "Valletta, Malta"
    ],
    "a": 1,
    "why": "Atami is twinned with Sanremo in northern Italy. Parts of Shinsui Park were designed with the Italian Riviera and other Mediterranean coastlines in mind."
  },
  {
    "q": "What distinction is associated with the night-time lighting at Atami Sun Beach?",
    "options": [
      "It is illuminated solely by lanterns from fishing boats",
      "It changes colour according to the tide level",
      "It is a replica of the lighting used at Tokyo Bay in 1964",
      "It is described as Japan’s first illuminated beach, with lighting designed by Motoko Ishii"
    ],
    "a": 3,
    "why": "Atami’s official tourism website describes the beach illumination as Japan’s first of its kind, created by prominent lighting designer Motoko Ishii."
  },
  {
    "q": "The cliffs and unusual rock formations of Nishikigaura are linked to which geological history?",
    "options": [
      "An ancient coral reef exposed after sea levels fell",
      "A valley carved by glaciers during the last ice age",
      "Remnants of the Atami–Taga volcano, later shaped by waves",
      "Sediment deposited on the bed of a former inland lake"
    ],
    "a": 2,
    "why": "Nishikigaura preserves traces of the Atami–Taga volcano. Sea erosion helped shape the cliffs and striking coastal rock formations."
  },
  {
    "q": "Why was the Ieyasu no Yu footbath installed near Atami Station in 2004?",
    "options": [
      "To mark 400 years since Tokugawa Ieyasu visited Atami",
      "To celebrate the 100th anniversary of Atami Station",
      "To commemorate the reopening of the Oyu geyser",
      "To celebrate the opening of the Tokaido Shinkansen"
    ],
    "a": 0,
    "why": "The free footbath was installed in March 2004 to mark the 400th anniversary of Tokugawa Ieyasu’s visit to Atami."
  },
  {
    "q": "What is the main connection between Yumae Shrine and Atami’s local history?",
    "options": [
      "It was built to bless deep-sea fishing vessels",
      "It honours and protects the hot springs that supported the town",
      "It was established for merchants crossing the Tokaido road",
      "It marks the former location of an imperial mint"
    ],
    "a": 1,
    "why": "Yumae Shrine is associated with the protective deity of Atami’s hot springs; traditional festivals give thanks for the waters and pray that they continue flowing."
  },
  {
    "q": "Which of Atami’s historic hot-spring sources was once especially important because ordinary villagers could use it?",
    "options": [
      "Oyu Geyser",
      "Sajiro no Yu",
      "Seizaemon no Yu",
      "Kawara-yu"
    ],
    "a": 3,
    "why": "At a time when many hot-spring sources were restricted to guests or particular households, Kawara-yu was historically accessible to local villagers."
  },
  {
    "q": "Which description is used by the official Atami tourism website for Hatsushima island?",
    "options": [
      "Japan’s largest island in the Seto Inland Sea",
      "The only island in Japan with hot springs",
      "Shizuoka Prefecture’s only inhabited offshore island",
      "The birthplace of the Tokaido Shinkansen"
    ],
    "a": 2,
    "why": "Hatsushima is described as Shizuoka Prefecture’s only inhabited offshore island. It is reached by passenger boat from Atami Port."
  },
  {
    "q": "Which attraction on Hatsushima offers visitors an elevated coastal panorama from a climbable structure?",
    "options": [
      "Hatsushima Lighthouse",
      "Hatsushima Aquarium Tower",
      "Hatsushima Ropeway",
      "Hatsushima Castle"
    ],
    "a": 0,
    "why": "Hatsushima Lighthouse is open to visitors for climbing and offers expansive views toward the Izu Peninsula and neighbouring islands."
  },
  {
    "q": "Which Atami attraction includes themed gardens and the COEDA HOUSE café designed by architect Kengo Kuma?",
    "options": [
      "Atami Plum Garden",
      "Himenosawa Park",
      "MOA Museum of Art",
      "ACAO FOREST"
    ],
    "a": 3,
    "why": "ACAO FOREST features 13 themed gardens and COEDA HOUSE, a café designed by Kengo Kuma."
  },
  {
    "q": "You want to see MOA Museum’s famous Red and White Plum Blossoms folding screens. What is the best approach?",
    "options": [
      "Assume they are always displayed at the main entrance",
      "Look for them in the museum’s permanent outdoor garden",
      "Check the exhibition calendar because the original screens are shown for limited periods",
      "Visit only after sunset when the originals are unveiled"
    ],
    "a": 2,
    "why": "The screens by Ogata Korin are National Treasures, but the original artwork is exhibited only during designated periods rather than on permanent display."
  },
  {
    "q": "In addition to its art collections, MOA Museum of Art contains a venue for which Japanese stage tradition?",
    "options": [
      "Sumo wrestling",
      "Noh theatre",
      "Bunraku puppet theatre",
      "Kabuki theatre"
    ],
    "a": 1,
    "why": "The MOA Museum of Art complex includes a Noh theatre, alongside its galleries and Japanese-style garden spaces."
  },
  {
    "q": "Which German architect designed the distinctive basement interiors of Atami’s Old Hyuga Villa?",
    "options": [
      "Bruno Taut",
      "Frank Lloyd Wright",
      "Antonin Raymond",
      "Togo Murano"
    ],
    "a": 0,
    "why": "Bruno Taut designed the Old Hyuga Villa’s basement interiors, a rare surviving example of his architectural work in Japan."
  },
  {
    "q": "Which fruit-picking activity does Atami promote as a seasonal experience from roughly October to December?",
    "options": [
      "Peach picking",
      "Strawberry picking",
      "Blueberry picking",
      "Mikan (mandarin orange) picking"
    ],
    "a": 3,
    "why": "Atami tourism information promotes mikan-picking at local orchards during autumn and early winter, including October."
  },
  {
    "q": "What is the most accurate description of the “Atami Seven Hot Springs” (Atami Nanayu)?",
    "options": [
      "Seven modern public bathhouses with a shared admission ticket",
      "Seven historic hot-spring sources found around the town",
      "Seven underwater geysers reached by boat",
      "Seven mountain spas operating only in winter"
    ],
    "a": 1,
    "why": "Atami Nanayu refers to traditional hot-spring sources around the town. Many are historical viewing spots rather than bathhouses where visitors can soak."
  },
  {
    "q": "At a Japanese shrine, what is a goshuin?",
    "options": [
      "A distinctive calligraphic stamp or inscription collected in a special book",
      "A small protective charm kept in a handbag",
      "A wooden plaque on which visitors write wishes",
      "A paper slip giving a written fortune"
    ],
    "a": 0,
    "why": "A goshuin is a shrine or temple seal, often accompanied by calligraphy, collected in a goshuincho booklet."
  },
  {
    "q": "If someone buys an omamori at Kinomiya Shrine, what have they purchased?",
    "options": [
      "An omikuji paper fortune",
      "An ema wooden wish plaque",
      "A protective amulet associated with blessings or good luck",
      "A goshuin shrine stamp"
    ],
    "a": 2,
    "why": "Omamori are small protective amulets from shrines or temples. They differ from omikuji (fortune slips), ema (wish plaques) and goshuin (seals)."
  }
]$json$::jsonb;
  cur    jsonb;
  to_add jsonb;
begin
  select config -> 'checkpoints' -> 'cp2b' -> 'questions' into cur
  from public.hunt_config where id = 'atami';

  if cur is null or jsonb_typeof(cur) <> 'array' then
    raise notice 'No saved Atami quiz in the database: the app uses src/data/atamiQuiz.js. Nothing changed.';
    return;
  end if;

  select coalesce(jsonb_agg(n.q order by n.i), '[]'::jsonb) into to_add
  from jsonb_array_elements(new_q) with ordinality as n(q, i)
  where not exists (
    select 1 from jsonb_array_elements(cur) c where c ->> 'q' = n.q ->> 'q'
  );

  update public.hunt_config
  set config = jsonb_set(config, '{checkpoints,cp2b,questions}', cur || to_add)
  where id = 'atami';

  raise notice 'Added % question(s); the bank now has %.',
    jsonb_array_length(to_add), jsonb_array_length(cur || to_add);
end $$;

-- Check: how many questions the bank holds now.
select jsonb_array_length(config -> 'checkpoints' -> 'cp2b' -> 'questions') as atami_questions
from public.hunt_config where id = 'atami';
