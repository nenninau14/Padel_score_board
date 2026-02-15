// ── State ──
let match = null;
let history = []; // point-by-point history for undo

const POINT_LABELS = ['0', '15', '30', '40'];

// ── Scoring Engine ──
// Serve rotation: 4-step cycle
// Based on who is picked first, the order is:
//   picked player → their teammate → other team player 1 → other team player 2
function buildServeOrder(firstTeam, firstPlayer) {
  const otherTeam = 1 - firstTeam;
  return [
    [firstTeam, firstPlayer],
    [firstTeam, 1 - firstPlayer],
    [otherTeam, 0],
    [otherTeam, 1],
  ];
}

function getServer(m) {
  const step = m.serveOrder[m.serveIndex % 4];
  return { team: step[0], player: step[1] };
}

function createMatch(team1Players, team2Players, firstServer, firstServerPlayer) {
  return {
    teams: [team1Players, team2Players],
    sets: [[0, 0]],       // array of [t1games, t2games] per set
    setsWon: [0, 0],
    points: [0, 0],        // raw point counters
    serveOrder: buildServeOrder(firstServer, firstServerPlayer),
    serveIndex: 0,          // cycles 0-3 through serveOrder
    tiebreak: false,
    tiebreakPoints: 0,      // total points in current tiebreak (for serve rotation)
    gameNumber: 0,          // games played in match (for serve rotation)
    finished: false,
    winner: null,
    startTime: Date.now(),
  };
}

function getPointDisplay(m) {
  if (m.tiebreak) {
    return [String(m.points[0]), String(m.points[1])];
  }
  const p0 = m.points[0], p1 = m.points[1];
  if (p0 >= 3 && p1 >= 3) {
    if (p0 === p1) return ['40', '40'];
    if (p0 > p1) return ['AD', '40'];
    return ['40', 'AD'];
  }
  return [POINT_LABELS[p0] || String(p0), POINT_LABELS[p1] || String(p1)];
}

function currentSetIndex(m) {
  return m.sets.length - 1;
}

function scorePoint(m, team) {
  if (m.finished) return;

  // Save snapshot for undo
  history.push(JSON.stringify(m));

  m.points[team]++;

  if (m.tiebreak) {
    m.tiebreakPoints++;
    const p0 = m.points[0], p1 = m.points[1];
    // Win tiebreak: first to 7, win by 2
    if ((p0 >= 7 || p1 >= 7) && Math.abs(p0 - p1) >= 2) {
      const tbWinner = p0 > p1 ? 0 : 1;
      winGame(m, tbWinner);
    } else {
      // Serve changes every 2 points in tiebreak
      if (m.tiebreakPoints % 2 === 1) {
        m.serveIndex++;
      }
    }
  } else {
    const p0 = m.points[0], p1 = m.points[1];
    // Check if game is won
    if (p0 >= 4 || p1 >= 4) {
      if (Math.abs(p0 - p1) >= 2) {
        winGame(m, p0 > p1 ? 0 : 1);
      }
      // else deuce continues
    }
  }

  saveMatchToHistory(m);
  renderScoreboard();
}

function winGame(m, team) {
  const wasTiebreak = m.tiebreak;
  const si = currentSetIndex(m);
  m.sets[si][team]++;
  m.points = [0, 0];
  m.gameNumber++;
  m.tiebreak = false;
  m.tiebreakPoints = 0;

  const g0 = m.sets[si][0], g1 = m.sets[si][1];

  // Tiebreak winner takes the set (7-6)
  if (wasTiebreak) {
    winSet(m, team);
  } else if ((g0 >= 6 || g1 >= 6) && Math.abs(g0 - g1) >= 2) {
    winSet(m, g0 > g1 ? 0 : 1);
  } else if (g0 === 6 && g1 === 6) {
    m.tiebreak = true;
  }

  // Advance to next server in the rotation
  m.serveIndex++;
}

function winSet(m, team) {
  m.setsWon[team]++;
  // Check match win: best of 3
  if (m.setsWon[team] >= 2) {
    m.finished = true;
    m.winner = team;
    m.endTime = Date.now();
    saveMatchToHistory(m);
    setTimeout(() => showScreen('setup'), 300);
  } else {
    // Start new set
    m.sets.push([0, 0]);
  }
}

function undo() {
  if (history.length === 0) return;
  match = JSON.parse(history.pop());
  renderScoreboard();
}

// ── History / localStorage ──
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('padel_history') || '[]');
  } catch { return []; }
}

function saveMatchToHistory(m) {
  const records = loadHistory();
  // Check if this match is already saved (by startTime) and update it
  const idx = records.findIndex(r => r.startTime === m.startTime);
  const entry = {
    date: new Date(m.startTime).toISOString(),
    startTime: m.startTime,
    teams: [m.teams[0].join(' / '), m.teams[1].join(' / ')],
    setsWon: [...m.setsWon],
    sets: m.sets.map(s => [...s]),
    winner: m.winner,
    matchState: JSON.stringify(m),
  };
  if (idx >= 0) {
    records[idx] = entry;
  } else {
    records.unshift(entry);
  }
  // Keep last 50
  localStorage.setItem('padel_history', JSON.stringify(records.slice(0, 50)));
}

function resumeMatch(index) {
  const records = loadHistory();
  const r = records[index];
  if (!r || !r.matchState) return;
  match = JSON.parse(r.matchState);
  history = [];
  renderScoreboard();
  showScreen('scoreboard');
}

// ── UI ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Setup
function initSetup() {
  const serveBtns = document.querySelectorAll('.serve-options button');
  serveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      serveBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  serveBtns[0].classList.add('selected');

  // Update serve picker labels as user types names
  const nameInputs = ['t1p1', 't1p2', 't2p1', 't2p2'];
  const serveIds = ['srv-t1p1', 'srv-t1p2', 'srv-t2p1', 'srv-t2p2'];
  nameInputs.forEach((id, i) => {
    document.getElementById(id).addEventListener('input', (e) => {
      document.getElementById(serveIds[i]).textContent =
        e.target.value.trim() || e.target.placeholder;
    });
  });

  document.getElementById('btn-start').addEventListener('click', startMatch);
  document.getElementById('btn-history').addEventListener('click', () => {
    renderHistory();
    showScreen('history');
  });
}

function startMatch() {
  const t1p1 = document.getElementById('t1p1').value.trim() || 'Player 1';
  const t1p2 = document.getElementById('t1p2').value.trim() || 'Player 2';
  const t2p1 = document.getElementById('t2p1').value.trim() || 'Player 3';
  const t2p2 = document.getElementById('t2p2').value.trim() || 'Player 4';

  const serveSel = document.querySelector('.serve-options button.selected');
  const firstServer = parseInt(serveSel.dataset.team);
  const firstServerPlayer = parseInt(serveSel.dataset.player);

  match = createMatch([t1p1, t1p2], [t2p1, t2p2], firstServer, firstServerPlayer);
  history = [];

  renderScoreboard();
  showScreen('scoreboard');
}

// Scoreboard
function renderScoreboard() {
  const m = match;
  if (!m) return;

  // Sets display in header
  const detail = document.querySelector('.sets-detail');
  detail.innerHTML = m.sets.map((s, i) => {
    const cls = i === currentSetIndex(m) ? 'set-score current' : 'set-score';
    const label = m.sets.length > 1 ? `Set ${i + 1}: ` : 'Set: ';
    return `<span class="${cls}">${label}${s[0]}-${s[1]}${m.tiebreak && i === currentSetIndex(m) ? ' (TB)' : ''}</span>`;
  }).join('');

  // Points display
  const pd = getPointDisplay(m);

  // Team 1
  document.getElementById('t1-name').textContent = m.teams[0].join(' / ');
  document.getElementById('t1-points').textContent = pd[0];
  document.getElementById('t1-games').textContent =
    `Games: ${m.sets[currentSetIndex(m)][0]}`;

  // Team 2
  document.getElementById('t2-name').textContent = m.teams[1].join(' / ');
  document.getElementById('t2-points').textContent = pd[1];
  document.getElementById('t2-games').textContent =
    `Games: ${m.sets[currentSetIndex(m)][1]}`;

  // Serve indicator — show which player is serving
  const server = getServer(m);
  document.getElementById('serve0').classList.toggle('active', server.team === 0);
  document.getElementById('serve1').classList.toggle('active', server.team === 1);
  const serverName = m.teams[server.team][server.player];
  document.getElementById('server-name').textContent = `Serving: ${serverName}`;

  // Undo button
  document.getElementById('btn-undo').disabled = history.length === 0;
}

// History
function renderHistory() {
  const records = loadHistory();
  const list = document.querySelector('.history-list');

  if (records.length === 0) {
    list.innerHTML = '<div class="history-empty">No matches yet</div>';
    return;
  }

  list.innerHTML = records.map((r, i) => {
    const date = new Date(r.date).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const setScores = r.sets.map(s => `${s[0]}-${s[1]}`).join(', ');
    let statusText;
    if (r.winner != null) {
      statusText = `Winner: ${r.teams[r.winner]}`;
    } else {
      statusText = 'In progress';
    }
    return `<div class="history-item" onclick="resumeMatch(${i})">
      <div class="date">${date}</div>
      <div class="teams">${r.teams[0]} vs ${r.teams[1]}</div>
      <div class="result">Sets ${r.setsWon[0]}-${r.setsWon[1]} (${setScores}) &mdash; ${statusText}</div>
    </div>`;
  }).join('');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initSetup();

  // Scoreboard tap handlers
  document.getElementById('team0-area').addEventListener('click', () => scorePoint(match, 0));
  document.getElementById('team1-area').addEventListener('click', () => scorePoint(match, 1));
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-new-match').addEventListener('click', () => {
    if (match && !match.finished && history.length > 0) {
      match.endTime = Date.now();
      saveMatchToHistory(match);
    }
    showScreen('setup');
  });

  // History
  document.querySelector('.history-back').addEventListener('click', () => showScreen('setup'));
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    localStorage.removeItem('padel_history');
    renderHistory();
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }

  showScreen('setup');
});
