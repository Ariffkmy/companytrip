/* Atami treasure hunt — the three areas
   From the committee's marked-up satellite map (October 2026), which
   circles three patches around the station:
     1. the station building and Lusca,
     2. the Heiwa-dori and Nakamise-dori shopping streets, down to
        Taharahoncho,
     3. the Daiichi building across the bus terminal.

   Teams roam in whatever order they like, so there is no walking line
   here — an area is a patch of Atami you are in, not a stop you arrive
   at in turn. The three are separate loops, not a tiling: the plaza
   and the roads between them belong to no area.

   The outlines are the committee's red lines, extracted from the
   screenshot pixel by pixel and georeferenced against five OpenStreetMap
   landmarks (Ieyasu-no-yu, Lusca, Atami Pudding, the Taharahoncho
   signal, Yuyado Ichibanchi) to within about 6 m. They follow the hand-
   drawn lines, not the streets, so treat a border as "roughly here".
   [lat, lng] pairs. */

/* The map's "Google Maps" button: the start & finish point, in the
   documented Maps URLs format, which opens in the Google Maps app or the
   browser alike. The committee's original short link (kept for the
   record) opens walking directions through the old checkpoints, and some
   phones' Maps app rejected it as an unsupported link. */
export const OLD_HUNT_MAP_LINK = 'https://maps.app.goo.gl/Mkf8ULbmPrUoC4KS8';
export const HUNT_MAP_LINK = 'https://www.google.com/maps/search/?api=1&query=35.1033591%2C139.078452';

/* Rough size of the playing area, from the south-west tip of area 2 to
   the far side of area 3, for the map's summary line. */
export const ROUTE_STATS = { km: 0.4, walkMin: 6 };
/* What ROUTE_STATS was for the six-area field, so a stored config still
   showing those numbers can be brought up to date. */
export const OLD_ROUTE_STATS = { km: 1.1, walkMin: 16 };

export const START = { lat: 35.1033591, lng: 139.078452, label: 'Start & finish' };

/* The three areas are islands, so there is no outer field edge: each
   area's own outline is what to stay inside. Kept as an (empty) export
   so a field edge can come back without touching the map. */
export const FIELD_BOUNDARY = [];

export const AREAS = [
  {
    n: 1,
    label: 'Area 1',
    note: 'The station and Lusca. Start & finish is on the plaza just outside.',
    polygon: [
      [35.103703, 139.078216], [35.103744, 139.07811], [35.10352, 139.077799],
      [35.103207, 139.077255], [35.103122, 139.077244], [35.102827, 139.077418],
      [35.102821, 139.077501], [35.102993, 139.077853], [35.103025, 139.078017],
      [35.103143, 139.078205], [35.10323, 139.078395], [35.1033, 139.078402],
      [35.103417, 139.078366], [35.103635, 139.078271],
    ],
  },
  {
    n: 2,
    label: 'Area 2',
    note: 'Heiwa-dori and Nakamise-dori shopping streets, down to Taharahoncho.',
    polygon: [
      [35.102968, 139.078092], [35.103019, 139.078009], [35.102912, 139.077791],
      [35.10282, 139.077504], [35.102758, 139.077403], [35.10247, 139.07707],
      [35.102227, 139.076833], [35.102072, 139.076544], [35.101954, 139.076382],
      [35.101846, 139.076348], [35.101761, 139.076368], [35.101739, 139.076401],
      [35.101768, 139.076718], [35.101831, 139.077087], [35.102125, 139.077714],
      [35.102187, 139.077776], [35.102359, 139.077854], [35.102555, 139.077912],
    ],
  },
  {
    n: 3,
    label: 'Area 3',
    note: 'The Daiichi building, across the bus terminal.',
    polygon: [
      [35.103782, 139.079415], [35.103816, 139.079356], [35.103604, 139.079091],
      [35.103305, 139.078651], [35.103229, 139.078648], [35.102947, 139.078827],
      [35.102957, 139.078931], [35.103106, 139.079302], [35.103209, 139.079491],
      [35.1033, 139.07959], [35.103535, 139.079554],
    ],
  },
];
