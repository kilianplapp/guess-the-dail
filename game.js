const PARTIES = ["Fianna Fáil", "Fine Gael", "Sinn Féin", "Labour", "Social Democrats"];
const ADVANCE_MS = 1800;
const HISTORY_LIMIT = 50;
const STATE_KEY = "guessthedail.state.v1";
const SESSION_KEY = "guessthedail.session.v1";

const SESSION_ID = (() => {
  let s = localStorage.getItem(SESSION_KEY);
  if (!s) {
    s = (crypto.randomUUID && crypto.randomUUID()) ||
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
        });
    localStorage.setItem(SESSION_KEY, s);
  }
  return s;
})();

const sb = (() => {
  if (typeof SUPABASE_URL !== "undefined" && typeof SUPABASE_KEY !== "undefined" &&
      SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
      window.supabase && window.supabase.createClient) {
    try {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {}
  }
  return null;
})();

const els = {
  photoA:    document.getElementById("photo-a"),
  photoB:    document.getElementById("photo-b"),
  reveal:    document.getElementById("reveal"),
  name:      document.getElementById("name"),
  actual:    document.getElementById("actual"),
  buttons:   document.getElementById("buttons"),
  countdown: document.getElementById("countdown"),
  card:      document.getElementById("card"),
  status:    document.getElementById("status"),
  scoreVal:  document.getElementById("score-value"),
  streakVal: document.getElementById("streak-value"),
  bestVal:   document.getElementById("best-value"),
  reset:     document.getElementById("reset"),
  history:   document.getElementById("history-section"),
  histList:  document.getElementById("history-list"),
};

let pool = [];
let queue = [];
let current = null;
let answered = false;
let advanceTimer = null;
let activePhoto = els.photoA;
let inactivePhoto = els.photoB;

const state = loadState();

function defaultState() {
  return { score: 0, attempts: 0, streak: 0, best: 0, history: [] };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (s && typeof s.score === "number") return Object.assign(defaultState(), s);
  } catch (e) {}
  return defaultState();
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function bump(el) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function renderStats(animate) {
  els.scoreVal.textContent = `${state.score} / ${state.attempts}`;
  els.streakVal.textContent = state.streak;
  els.bestVal.textContent = state.best;
  if (animate) {
    bump(els.scoreVal);
    bump(els.streakVal);
    if (state.streak === state.best && state.streak > 0) bump(els.bestVal);
  }
}

function renderHistory() {
  if (state.history.length === 0) {
    els.history.hidden = true;
    return;
  }
  els.history.hidden = false;
  els.histList.innerHTML = "";
  for (const h of state.history) {
    const li = document.createElement("li");
    li.className = "history-item " + (h.correct ? "correct" : "wrong");
    li.innerHTML = `
      <img class="history-thumb" src="${h.image}" alt="">
      <div class="history-body">
        <div class="history-name"></div>
        <div class="history-meta"></div>
      </div>
      <div class="history-mark"></div>
    `;
    li.querySelector(".history-name").textContent = h.name;
    li.querySelector(".history-meta").textContent = h.correct
      ? h.party
      : `${h.party} · you guessed ${h.guess}`;
    els.histList.appendChild(li);
  }
}

function pushHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  renderHistory();
}

async function load() {
  try {
    const res = await fetch("candidates.json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    pool = data.filter(c => c.image_src && PARTIES.includes(c.party));
  } catch (e) {
    els.status.textContent =
      "Couldn't load candidates.json. Run `python fetch_candidates.py` first, then `python -m http.server` in this folder.";
    return;
  }

  if (pool.length === 0) {
    els.status.textContent = "No candidates found. Run fetch_candidates.py first.";
    return;
  }

  els.status.textContent = `${pool.length} TDs loaded`;
  renderStats(false);
  renderHistory();
  reshuffle();
  nextRound();
}

function reshuffle() {
  queue = pool.slice();
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
}

function swapPhoto(src) {
  inactivePhoto.onload = () => {
    inactivePhoto.classList.add("active");
    activePhoto.classList.remove("active");
    [activePhoto, inactivePhoto] = [inactivePhoto, activePhoto];
    if (current) current.shownAt = performance.now();
  };
  inactivePhoto.onerror = () => {
    nextRound();
  };
  inactivePhoto.src = src;
}

function nextRound() {
  clearTimeout(advanceTimer);
  if (queue.length === 0) reshuffle();
  current = queue.pop();
  answered = false;

  els.reveal.classList.remove("show");
  els.countdown.classList.remove("run");
  for (const btn of els.buttons.children) {
    btn.disabled = false;
    btn.classList.remove("correct", "wrong");
  }
  swapPhoto(current.image_src);
}

function guess(party) {
  if (answered) return;
  answered = true;

  const correct = party === current.party;
  state.attempts++;
  if (correct) {
    state.score++;
    state.streak++;
    if (state.streak > state.best) state.best = state.streak;
  } else {
    state.streak = 0;
  }

  for (const btn of els.buttons.children) {
    btn.disabled = true;
    if (btn.dataset.party === current.party) btn.classList.add("correct");
    else if (btn.dataset.party === party) btn.classList.add("wrong");
  }

  els.name.textContent = current.name;
  els.actual.textContent = current.party;
  els.reveal.classList.add("show");

  pushHistory({
    name: current.name,
    party: current.party,
    guess: party,
    correct,
    image: current.image_src,
  });
  renderStats(true);
  saveState();

  // Log to Supabase (fire-and-forget, never blocks gameplay)
  if (sb && current && current.id != null) {
    const elapsedMs = current.shownAt
      ? Math.round(performance.now() - current.shownAt)
      : null;
    sb.from("guesses").insert({
      session_id:       SESSION_ID,
      candidate_id:     current.id,
      actual_party:     current.party,
      guessed_party:    party,
      time_to_guess_ms: elapsedMs,
    }).then(() => {}, () => {});
  }

  els.countdown.style.setProperty("--ms", ADVANCE_MS + "ms");
  void els.countdown.offsetWidth;
  els.countdown.classList.add("run");
  advanceTimer = setTimeout(nextRound, ADVANCE_MS);
}

els.buttons.addEventListener("click", e => {
  const btn = e.target.closest(".party-btn");
  if (btn) guess(btn.dataset.party);
});

els.card.addEventListener("click", e => {
  if (answered && !e.target.closest(".party-btn")) {
    clearTimeout(advanceTimer);
    nextRound();
  }
});

document.addEventListener("keydown", e => {
  if (e.target.tagName === "BUTTON" && e.key === " ") return;
  if (!answered) {
    const idx = "12345".indexOf(e.key);
    if (idx >= 0) guess(PARTIES[idx]);
  } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
    e.preventDefault();
    clearTimeout(advanceTimer);
    nextRound();
  }
});

els.reset.addEventListener("click", () => {
  if (!confirm("Reset score, streak and history?")) return;
  Object.assign(state, defaultState());
  saveState();
  renderStats(false);
  renderHistory();
});

load();
