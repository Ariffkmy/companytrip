/* ═══════════════════════════════════════════════════
   Treasure hunt groups — for the hunt only
   ═══════════════════════════════════════════════════

   The hunt is played in four groups, not the five trip teams in
   groupRoster (Ruby, Sapphire, …), which stay for everything else on
   the trip. Names are groupRoster's short names. Ariff, Carmen and
   Kevin are the committee and don't play.

   Who is in which group in the app comes from allowed_emails.hunt_group
   (set in Admin → Trip members); this list is the committee's grouping
   it was seeded from, and what the editor and the game label groups by.

   Each group has a rival. In Know your colleagues a group is asked
   about its rival's members: A ↔ B, C ↔ D. */

const huntGroups = [
  {
    id: 'group-a',
    name: 'Group A',
    colour: 'var(--red)',
    rival: 'group-b',
    members: ['Helmi', 'Ruby', 'Aidan', "Asma'", 'Jay'],
    leader: 'Jay',
  },
  {
    id: 'group-b',
    name: 'Group B',
    colour: 'var(--sea)',
    rival: 'group-a',
    members: ['Aina', 'Ashley', 'Hairul', 'Raf', 'Shahrul'],
    leader: 'Raf',
  },
  {
    id: 'group-c',
    name: 'Group C',
    colour: '#E9A82C',
    rival: 'group-d',
    members: ['Aiman', 'Huai Yu', 'Ragina', 'Eleora', 'Yu Han'],
    leader: 'Huai Yu',
  },
  {
    id: 'group-d',
    name: 'Group D',
    colour: '#5B7F3E',
    rival: 'group-c',
    members: ['Nicholas', 'Amir', 'Jord', 'Liyana', 'Chiew'],
    leader: 'Jord',
  },
];

export const HUNT_GROUP_IDS = huntGroups.map((g) => g.id);

export const huntGroupOf = (id) => huntGroups.find((g) => g.id === id) ?? null;

export default huntGroups;
