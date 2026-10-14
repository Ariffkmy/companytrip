/* Cash management (Ellice and Tim) pays on each day, by activity.
   DUMMY DATA — the committee replaces these with the real amounts.
   `day` matches schedule.js. An item is either a fixed `amount` or
   `perPax` × `pax`; all in yen. */
const PAX = 27;

const cashExpenses = [
  {
    day: 'D1',
    items: [
      { activity: 'Chartered bus Haneda → hotel (balance)', amount: 30000 },
    ],
  },
  {
    day: 'D2',
    items: [
      { activity: 'Thank-you gift for the Macnica team', amount: 10000 },
    ],
  },
  {
    day: 'D3',
    items: [
      { activity: 'Hasedera Temple entry', perPax: 400, pax: PAX },
      { activity: 'Enoshima Aquarium entry', perPax: 2520, pax: PAX },
      { activity: 'Group dinner at Shirasu Ya', perPax: 2000, pax: PAX },
    ],
  },
  {
    day: 'D4',
    items: [
      { activity: 'Kiunkaku entry (Option 1 group)', perPax: 610, pax: 14 },
      { activity: 'Treasure hunt — Buy it, try it', perPax: 500, pax: PAX },
      { activity: 'Group dinner at Izutaro', perPax: 3000, pax: PAX },
    ],
  },
  {
    day: 'D5',
    items: [
      { activity: 'Cup Noodles Museum workshop', perPax: 1000, pax: PAX },
      { activity: 'Group lunch at the museum', perPax: 500, pax: PAX },
    ],
  },
  {
    day: 'D6',
    items: [],
  },
];

export const itemTotal = (it) => it.amount ?? (it.perPax ?? 0) * (it.pax ?? 0);

export default cashExpenses;
