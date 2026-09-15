/* ═══════════════════════════════════════════════════
   Team arrangement, from the proposal deck (slide 10).

   Five teams, each with a Team Lead and a JP Speaker. The short
   names are the deck's own; `full` is the passport-style name
   already held in this app, matched where the pairing is
   unambiguous. Two members have no full name on file yet.

   Phone numbers are deliberately null — the previous values in
   this file were sequential dummies (012-555-01xx). A fake number
   beside a real name is worse than no number in an app people
   may open in an emergency. Fill these in before departure.
   ═══════════════════════════════════════════════════ */

const groupRoster = [
  {
    id: 'team-ruby',
    name: 'Team Ruby',
    members: [
      { name: 'Nicholas', full: 'NICHOLAS (YAP WEI CHOONG)', role: 'Team Lead', phone: null },
      { name: 'Chiew', full: 'CHIEW SOW DING', role: 'JP Speaker', phone: null },
      { name: 'Amir', full: 'AMIR ARSHAD ABD AZIZ', role: 'Member', phone: null },
      { name: 'Rabiatul', full: null, role: 'Member', phone: null },
      { name: 'Ruby', full: 'RUBY BALASINGAM', role: 'Member', phone: null },
    ],
  },
  {
    id: 'team-sapphire',
    name: 'Team Sapphire',
    members: [
      { name: 'Helmi', full: 'HELMI PUTERA BIN NURNASHRIQ AZIZ', role: 'Team Lead', phone: null },
      { name: 'Shahrul', full: 'SHAHRULNIZAM BIN AHMAD SHAMSUDDIN', role: 'JP Speaker', phone: null },
      { name: 'Carmen', full: 'CARMEN SEE THOO', role: 'Member', phone: null },
      { name: 'Jord', full: 'JORD TEN BULTE', role: 'Member', phone: null },
      { name: 'Liyana', full: 'NUR LIYANA BINTI YAACOB', role: 'Member', phone: null },
    ],
  },
  {
    id: 'team-emerald',
    name: 'Team Emerald',
    members: [
      { name: 'Eleora', full: 'ELEORA LINA SCHWARTZ', role: 'Team Lead', phone: null },
      { name: 'Aidan', full: null, role: 'JP Speaker', phone: null },
      { name: 'Ariff', full: 'ARIFF HAKIMI BIN CHIK', role: 'Member', phone: null },
      { name: 'Raf', full: 'RAF SWIGGERS', role: 'Member', phone: null },
      { name: 'Ashley', full: 'ASHLEY ANG', role: 'Member', phone: null },
    ],
  },
  {
    id: 'team-diamond',
    name: 'Team Diamond',
    members: [
      { name: 'Hairul', full: 'MUHAMMAD HAIRULWAFIQ BIN HAIRUNIZAM', role: 'Team Lead', phone: null },
      { name: "Asma'", full: "ASMA' BINTI ZUBIR", role: 'JP Speaker', phone: null },
      { name: 'Aina', full: 'NUR AINA NAJWA BINTI NOR DAUMI', role: 'Member', phone: null },
      { name: 'Zaire', full: 'MOHD ZAIRE BIN RAMLI', role: 'Member', phone: null },
      { name: 'Kevin', full: 'KEVIN LEE', role: 'Member', phone: null },
    ],
  },
  {
    id: 'team-pearl',
    name: 'Team Pearl',
    members: [
      { name: 'Aiman', full: 'MOHD AIMAN HAKIM BIN SHAMSUL KAHAR', role: 'Team Lead', phone: null },
      { name: 'Yu Han', full: 'ONG YU HAN', role: 'JP Speaker', phone: null },
      { name: 'Ragina', full: 'REGINA MOEY', role: 'Member', phone: null },
      { name: 'Jay', full: 'JAY ANIL SINGH SHEMAR', role: 'Member', phone: null },
      { name: 'Huai Yu', full: 'KHAW HUAI YU', role: 'Member', phone: null },
    ],
  },
];

export default groupRoster;
