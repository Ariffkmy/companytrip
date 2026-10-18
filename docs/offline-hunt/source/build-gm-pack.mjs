/* Builds game-master-pack.html from the app's own data, so the offline
   answer key can't drift from the game. Run from the repo root:
     node docs/offline-hunt/source/build-gm-pack.mjs */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ATAMI_QUIZ from '../../../src/data/atamiQuiz.js';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const L = 'ABCD';

/* The manual's styles, so both documents look the same. */
const css = readFileSync(join(here, 'players-manual.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];

const rows = ATAMI_QUIZ.map((x, i) => `
  <tr>
    <td class="n">${i + 1}</td>
    <td>${esc(x.q)}<div class="small muted">${x.options.map((o, k) => `${L[k]}. ${esc(o)}`).join(' &nbsp;·&nbsp; ')}</div></td>
    <td class="ans"><b>${L[x.a]}</b> ${esc(x.options[x.a])}</td>
  </tr>`).join('');

const groups = ['A', 'B', 'C', 'D'];
const games = [
  ['1', 'Photo bingo', '10 + 1/photo (all tiles)'],
  ['2', 'Copy the pose', '10'],
  ['3', 'Atami quiz', '10 + 2/right'],
  ['4', 'Buy it, try it', '10 + 2 × rating'],
  ['5', 'Look around you', '10 + 2/right'],
  ['6', 'Know your colleagues', '10 + 2/right'],
  ['7', 'Find the boss', '20'],
  ['', 'Best pose (judged)', '+5'],
  ['', 'Funniest boss photo (judged)', '+5'],
  ['★', 'First to finish', '+15'],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Atami Treasure Hunt — Game Master Pack</title>
<style>${css}
  .ans { width: 32%; }
  .bank td { padding: 4px 6px; font-size: 9.3pt; }
  .sheet td, .sheet th { text-align: center; }
  .sheet td:nth-child(2), .sheet th:nth-child(2) { text-align: left; }
  .sheet td { height: 24px; }
  .confidential { background: var(--red); color: #fff; font-weight: 800; border-radius: 6px; padding: 3px 10px; display: inline-block; font-size: 9pt; letter-spacing: .08em; }
</style>
</head>
<body>

<section class="page">
  <div class="cover-band">
    <div class="eyebrow">Atami Treasure Hunt · Game Master pack</div>
    <h1>For Ariff only.</h1>
    <p>Answer key, setup and score sheet for running the hunt on WhatsApp if the app is down. <b>Don’t share this with the groups.</b></p>
  </div>
  <span class="confidential">CONFIDENTIAL · CONTAINS ANSWERS</span>

  <h3>Before the day (while the app still works)</h3>
  <ul>
    <li><span class="tick"></span>Fill in your WhatsApp number on page 1 of the players’ manual, then print it or share the PDF with all four leaders.</li>
    <li><span class="tick"></span>Create four WhatsApp groups: <b>“Find the boss – Group A/B/C/D”</b>, each with that group’s members, <b>Tim, Ellice and you</b>.</li>
    <li><span class="tick"></span>Save every group’s reference photos to your phone, by group: <b>bingo tiles</b> (numbered), <b>Copy the pose</b> WHERE + POSE (+ its area), <b>Atami quiz</b> landmark WHERE photo. They are in Admin → Hunt editor.</li>
    <li><span class="tick"></span>Export the <b>Know your colleagues</b> questions and answers for each group (they live in the database, so you can’t get them once the server is down). Print or save them.</li>
    <li><span class="tick"></span>Check the <b>Look around you</b> questions in the editor match the manual; reprint if they were edited.</li>
    <li><span class="tick"></span>Tell Tim and Ellice: in offline mode they answer yes/no in each group’s chat, post <b>“🚶 We’re moving”</b> in all four chats when they move, and WhatsApp you each pitch rating (group + 1–10).</li>
  </ul>

  <h3>Switching to offline mode</h3>
  <ol>
    <li>Post in the trip group: <b>“Treasure hunt is now OFFLINE. Leaders, open the offline manual.”</b></li>
    <li>Send each leader their group’s reference photos (bingo card, pose, landmark).</li>
    <li>Send <b>START</b> (or, mid-hunt, tell everyone how many minutes are left). Note the time: ______</li>
    <li>Write down the stamps each group already had in the app, if you can still see them.</li>
  </ol>

  <h3>While it runs</h3>
  <ul>
    <li>Reply <b>✅ Stamp N</b> as soon as you accept a game. Log it on the score sheet with the WhatsApp time.</li>
    <li><b>Bingo:</b> stamp only when every tile has a correct selfie. 1 point per tile.</li>
    <li><b>Atami quiz:</b> call the leader, read 15 questions from the bank (skip ones they’ve already had), 10 seconds each. A time-out restarts from question 1 with new questions. Pass = 10 right. Points = 2 × right in the passing round.</li>
    <li><b>Buy it, try it:</b> stamp needs the video <b>and</b> the bosses’ rating. Points = 2 × rating.</li>
    <li><b>Look around you:</b> first message only. Mark at the finish.</li>
    <li><b>Know your colleagues:</b> call the leader, ask all questions, no pass mark. Points = 2 × right.</li>
    <li><b>Find the boss:</b> 20 for the photo with both bosses. 2 questions per group per spot.</li>
    <li>Several groups ready for a call? Take them in the order their “Ready” messages arrived. Carmen or Kevin can run a quiz call with this pack.</li>
  </ul>
  <div class="foot"><span>Game Master pack</span><span>Setup</span></div>
</section>

<section class="page">
  <div class="eyebrow">Score sheet</div>
  <h2 style="margin:4px 0 10px">Points by group</h2>
  <table class="sheet">
    <tr><th>#</th><th>Game</th><th>Scoring</th>${groups.map((g) => `<th>Group ${g}</th>`).join('')}</tr>
    ${games.map(([n, name, how]) => `<tr><td class="n">${n}</td><td><b>${name}</b></td><td class="small">${how}</td>${groups.map(() => '<td></td>').join('')}</tr>`).join('')}
    <tr><td></td><td><b>TOTAL</b></td><td></td>${groups.map(() => '<td></td>').join('')}</tr>
  </table>

  <h3>Stamp log (WhatsApp time of each ✅)</h3>
  <table class="sheet">
    <tr><th>Group</th><th>Games done (1–7)</th><th>Time of 7th ✅</th><th>Notes</th></tr>
    ${groups.map((g) => `<tr><td><b>${g}</b></td><td style="text-align:left">☐1 ☐2 ☐3 ☐4 ☐5 ☐6 ☐7</td><td></td><td></td></tr>`).join('')}
  </table>

  <h3>Atami quiz attempts</h3>
  <table class="sheet">
    <tr><th>Group</th><th>Attempt 1 (right / 15)</th><th>Attempt 2</th><th>Attempt 3</th><th>Passed with</th></tr>
    ${groups.map((g) => `<tr><td><b>${g}</b></td><td></td><td></td><td></td><td></td></tr>`).join('')}
  </table>

  <h3>Pitch ratings (from Tim / Ellice)</h3>
  <table class="sheet">
    <tr><th>Group</th><th>Video received</th><th>Rating (1–10)</th><th>Rated by</th></tr>
    ${groups.map((g) => `<tr><td><b>${g}</b></td><td>☐</td><td></td><td></td></tr>`).join('')}
  </table>
  <div class="foot"><span>Game Master pack</span><span>Score sheet</span></div>
</section>

<section class="page">
  <div class="eyebrow">Answer key · ${ATAMI_QUIZ.length} questions</div>
  <h2 style="margin:4px 0 4px">How well do you know Atami?</h2>
  <p class="muted small">Read the question and the choices. 10 seconds to answer. Tick each one used per group so a retry gets new questions. This is the app’s starting bank; if the committee edited it in Admin, use the edited version.</p>
  <table class="bank">
    <tr><th>#</th><th>Question and choices</th><th>Answer</th></tr>
    ${rows}
  </table>
  <div class="foot"><span>Game Master pack</span><span>Atami quiz answer key</span></div>
</section>

</body>
</html>`;

writeFileSync(join(here, 'game-master-pack.html'), html);
console.log(`game-master-pack.html written (${ATAMI_QUIZ.length} questions)`);
