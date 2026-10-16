/* Cash management (Ellice and Tim) pays on each day, by activity.
   `day` matches schedule.js. An item is either a fixed `amount` or
   `perPax` × `pax`; all in yen. */
const cashExpenses = [
  { day: 'D1', items: [] },
  { day: 'D2', items: [] },
  {
    day: 'D3',
    items: [
      { activity: 'Hasedera Temple', amount: 11000 },
      { activity: 'Aquarium', amount: 77000 },
      { activity: 'Group dinner', amount: 67100 },
    ],
  },
  {
    day: 'D4',
    items: [
      { activity: 'Group dinner', amount: 64900 },
    ],
  },
  { day: 'D5', items: [] },
  { day: 'D6', items: [] },
];

export const itemTotal = (it) => it.amount ?? (it.perPax ?? 0) * (it.pax ?? 0);

export default cashExpenses;
