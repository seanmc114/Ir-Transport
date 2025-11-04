// TURBO: IR + Transport — Present tense only (pos / neg / q)
(()=>{
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));

  // ----- CONFIG -----
  const CONFIG = {
    title: "IR + Transport",
    // Optional unlock codes (keep or change)
    codes: { D2: "MTW-D2-OPEN", D3: "MTW-D3-OPEN", FRIDAY: "MTW-FRI-OPEN" },
    days: {
      D1: { label: "Monday (IR + Transport)", verbs: ["ir"] },
      D2: { label: "Tuesday (IR + Transport)", verbs: ["ir"] },
      D3: { label: "Wednesday (IR + Transport)", verbs: ["ir"] }
    },
    QUESTIONS_PER_RUN: 10,
    PENALTY_SECONDS: 30
  };

  // ----- VOICE -----
  const VOICE = {
    enabled: 'speechSynthesis' in window,
    english: null, spanish: null,
    init(){
      if(!this.enabled) return;
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.english = voices.find(v=>/^en[-_]/i.test(v.lang)) || voices.find(v=>/en/i.test(v.lang)) || voices[0] || null;
        this.spanish = voices.find(v=>/^es[-_]/i.test(v.lang)) || voices.find(v=>/spanish/i.test(v.name)) || voices.find(v=>/es/i.test(v.lang)) || this.english;
      };
      pick();
      window.speechSynthesis.onvoiceschanged = pick;
    },
    speak(text, lang='en'){
      if(!this.enabled || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      const voice = lang.startsWith('es') ? (this.spanish || this.english) : (this.english || this.spanish);
      if(voice) u.voice = voice;
      u.lang = voice?.lang || (lang.startsWith('es') ? 'es-ES' : 'en-GB');
      try { speechSynthesis.cancel(); } catch(e){}
      speechSynthesis.speak(u);
    }
  };
  VOICE.init();

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srSupported = !!SR;

  // ----- IR DB -----
  const DB = {
    ir: { present: ["voy","vas","va","va","vamos","vais","van"] }
  };

  // Persons with you clarification
  const PERSONS = [
    {label:"I", en:"I", tag:""},
    {label:"you (sg.)", en:"you", tag:" (you: singular)"},
    {label:"he", en:"he", tag:""},
    {label:"she", en:"she", tag:""},
    {label:"we", en:"we", tag:""},
    {label:"you (pl.)", en:"you", tag:" (you: plural)"},
    {label:"they", en:"they", tag:""}
  ];

  // Transport options (English label + Spanish phrase)
  // Most take "en ..."; walking is "a pie".
  const TRANSPORTS = [
    {en:"by bus",        es:"en autobús"},
    {en:"by train",      es:"en tren"},
    {en:"by car",        es:"en coche"},
    {en:"by bicycle",    es:"en bicicleta"},
    {en:"on foot",       es:"a pie"},
    {en:"by tram",       es:"en tranvía"},
    {en:"by scooter",    es:"en patinete"},
    {en:"by motorbike",  es:"en moto"}
  ];

  // Single tense (Present) for this game
  let currentTense = "Present";
  let currentMode = null;
  let startTime = 0, timerId = null;

  // Title
  document.title = `TURBO: ${CONFIG.title}`;
  $("h1").innerHTML = `<span class="turbo">TURBO</span>: ${CONFIG.title}`;

  // Lock tense to Present and disable the other buttons visually
  setTenseButtonsToPresentOnly();

  $("#codeBtn").onclick = handleCode;
  renderModes();

  // ----- Unlock state -----
  function keyUnlocked(day){ return `turbo_mtw_unlocked_${CONFIG.title}_${day}`; }
  function isUnlocked(day){
    if (day === "D1") return true;      // Monday always open
    if (day === "HOMEWORK") return true;
    const v = localStorage.getItem(keyUnlocked(day));
    return v === "1";
  }
  function unlock(day){ localStorage.setItem(keyUnlocked(day), "1"); }

  function handleCode(){
    const code = ($("#codeInput").value || "").trim();
    const msg = $("#codeMsg");
    const map = CONFIG.codes || {};
    let matched = null;
    for (const [day, c] of Object.entries(map)) { if (c === code) { matched = day; break; } }
    if (!matched) { msg.textContent = "❌ Code not recognised"; return; }
    if (matched === "FRIDAY") {
      unlock("D2"); unlock("D3"); unlock("FRIDAY");
      msg.textContent = "✅ Friday Test (and all days) unlocked!";
    } else {
      unlock(matched);
      if (isUnlocked("D2") && isUnlocked("D3")) unlock("FRIDAY");
      msg.textContent = `✅ ${CONFIG.days[matched]?.label || matched} unlocked`;
    }
    renderModes();
    $("#codeInput").value = "";
  }

  // ----- Menu -----
  function renderModes(){
    const host = $("#mode-list"); host.innerHTML = "";
    host.appendChild(makeModeBtn("HOMEWORK", "Homework Tonight (All unlocked days)"));
    host.appendChild(makeModeBtn("D1", CONFIG.days.D1.label));
    host.appendChild(makeModeBtn("D2", CONFIG.days.D2.label));
    host.appendChild(makeModeBtn("D3", CONFIG.days.D3.label));
    host.appendChild(makeModeBtn("FRIDAY", "Friday Test (All week)"));
  }
  function makeModeBtn(modeKey, label){
    const btn = document.createElement("button"); btn.className = "mode-btn"; btn.dataset.mode = modeKey;
    const locked = (modeKey==="HOMEWORK") ? false
                  : (modeKey==="D1") ? false
                  : (modeKey==="FRIDAY") ? !isUnlocked("FRIDAY") && !(isUnlocked("D2") && isUnlocked("D3"))
                  : !isUnlocked(modeKey);
    btn.disabled = locked; 
    const icon = locked ? "🔒" : "🔓";
    const best = getBest(currentTense, modeKey);
    btn.textContent = `${icon} ${label}${best!=null ? " — Best: "+best.toFixed(1)+"s" : ""}`;
    btn.onclick = () => { if (!locked) startMode(modeKey); };
    return btn;
  }

  // ----- Build quiz (IR + Transport, Present) -----
  function startMode(modeKey){
    currentMode = modeKey;
    $("#mode-list").style.display = "none";
    $("#game").style.display = "block";
    $("#results").innerHTML = "";
    $("#back-button").style.display = "none";

    const pool = buildPoolForMode(modeKey /* Present-only */);
    shuffle(pool);
    const quiz = pool.slice(0, CONFIG.QUESTIONS_PER_RUN);

    const qwrap = $("#questions"); qwrap.innerHTML = "";

    // Voice bar
    const vbar = $("#voice-bar");
    if (VOICE.enabled) {
      vbar.style.display = "flex";
      $("#read-all").onclick = () => {
        let i = 0; const items = quiz.map(q => q.prompt.replace(/\s*\(.*\)\s*$/,''));
        const next = () => { if (i >= items.length) return; VOICE.speak(items[i], 'en'); i++; setTimeout(next, 1700); };
        next();
      };
    } else vbar.style.display = "none";

    quiz.forEach((q,i) => {
      const row = document.createElement("div");
      row.className = "q";

      const promptRow = document.createElement("div"); promptRow.className = "prompt-row";
      const p = document.createElement("div"); p.className = "prompt"; p.textContent = `${i+1}. ${q.prompt}`;

      const spk = document.createElement("button"); spk.className = "icon-btn"; spk.textContent = "🔊"; spk.title = "Read this question";
      spk.onclick = ()=> VOICE.speak(q.prompt.replace(/\s*\(.*\)\s*$/,''), 'en');

      const mic = document.createElement("button"); mic.className = "icon-btn"; mic.textContent = "🎤"; mic.title = srSupported ? "Dictate answer (Spanish)" : "Speech recognition not supported";
      const input = document.createElement("input"); input.type = "text"; input.placeholder = "Type or dictate: voy al colegio en autobús";
      if (srSupported) {
        mic.onclick = ()=>{ const rec = new SR(); rec.lang = "es-ES"; rec.interimResults = false; rec.maxAlternatives = 1;
          mic.disabled = true; mic.textContent = "⏺️…";
          rec.onresult = e => { const said = e.results[0][0].transcript || ""; input.value = said; };
          rec.onerror = ()=>{}; rec.onend = ()=>{ mic.disabled=false; mic.textContent="🎤"; };
          try { rec.start(); } catch(e) { mic.disabled=false; mic.textContent="🎤"; }
        };
      } else mic.disabled = true;

      promptRow.appendChild(p); promptRow.appendChild(spk); promptRow.appendChild(mic);
      row.appendChild(promptRow); row.appendChild(input); qwrap.appendChild(row);

      input.addEventListener('focus', ()=>{ const a = $("#auto-read"); if(a && a.checked) VOICE.speak(q.prompt.replace(/\s*\(.*\)\s*$/,''), 'en'); });
    });

    $("#submit").onclick = () => checkAnswers(quiz);
    startTimer();
  }

  function buildPoolForMode(modeKey){
    // For this game, all modes use the same IR+Transport pool (Present)
    const persons = PERSONS;
    const pool = [];

    const dayKeys = (modeKey === "HOMEWORK") ? ["D1","D2","D3"].filter(d => isUnlocked(d) || d==="D1")
                   : (modeKey === "FRIDAY") ? ["D1","D2","D3"]
                   : [modeKey];

    // We’ll still respect unlocked days, but all days share the same topic.
    dayKeys.forEach(_d=>{
      persons.forEach((person, idx) => {
        TRANSPORTS.forEach(tr => {
          const conj = DB.ir.present[idx]; // voy/vas/va/vamos/vais/van
          const targetPos = `${conj} al colegio ${tr.es}`;
          const targetNeg = `no ${conj} al colegio ${tr.es}`;
          const targetQ   = `¿${conj} al colegio ${tr.es}?`;

          pool.push({ prompt: enPrompt(person, "pos", tr.en), answer: targetPos });
          pool.push({ prompt: enPrompt(person, "neg", tr.en), answer: targetNeg });
          pool.push({ prompt: enPrompt(person, "q",   tr.en), answer: targetQ   });
        });
      });
    });

    return pool;
  }

  // ----- English prompt helpers (Present) -----
  const is3 = s => (s==="he"||s==="she"||s==="it");
  const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;

  function enPrompt(person, kind, transportEN){
    const s = person.en, t = person.tag || "";
    const goes = is3(s) ? "goes" : "go";
    if (kind==="pos") return `${cap(s)}${t} ${goes} to school ${transportEN} (ir)`;
    if (kind==="neg") return `${cap(s)}${t} ${is3(s)?'does':'do'} not go to school ${transportEN} (ir)`;
    // question
    return `${is3(s)?'Does':'Do'} ${s}${t} go to school ${transportEN}? (ir)`;
  }

  // ----- Timer & scoring -----
  function startTimer(){
    startTime = performance.now();
    $("#timer").textContent = "Time: 0s";
    clearInterval(timerId);
    timerId = setInterval(()=>{
      const e = (performance.now() - startTime)/1000;
      $("#timer").textContent = `Time: ${e.toFixed(1)}s`;
    }, 100);
  }
  function stopTimer(){ clearInterval(timerId); }

  function checkAnswers(quiz){
    stopTimer();
    const inputs = $$("#questions .q input");
    let correct = 0; const items = [];
    inputs.forEach((inp,i)=>{
      const expected = quiz[i].answer;
      const ok = norm(inp.value) === norm(expected);
      inp.classList.remove("good","bad"); inp.classList.add(ok ? "good" : "bad");
      if (ok) correct++;
      const li = document.createElement("li");
      li.className = ok ? "correct" : "incorrect";
      li.textContent = `${i+1}. ${quiz[i].prompt} → ${quiz[i].answer}`;
      items.push(li);
    });
    const elapsed = (performance.now() - startTime)/1000;
    const penalty = (quiz.length - correct) * CONFIG.PENALTY_SECONDS;
    const finalTime = elapsed + penalty;

    if (currentMode) saveBest(currentTense, currentMode, finalTime);

    const summary = document.createElement("div");
    summary.className = "result-summary";
    summary.innerHTML = [
      `<div class="final-time">🏁 Final Time: ${finalTime.toFixed(1)}s</div>`,
      `<div class="line">✅ Correct: ${correct}/${quiz.length}</div>`,
      penalty>0 ? `<div class="line">⏱️ Penalty: +${penalty}s (${CONFIG.PENALTY_SECONDS}s per incorrect)</div>` : ``
    ].join("");

    const ul = document.createElement("ul"); items.forEach(li => ul.appendChild(li));
    const results = $("#results"); results.innerHTML = ""; results.appendChild(summary); results.appendChild(ul);

    if (VOICE.enabled) VOICE.speak(`You got ${correct} out of ${quiz.length}. Final time ${finalTime.toFixed(1)} seconds.`, 'en');

    $("#back-button").style.display = "inline-block";
    $("#back-button").onclick = ()=>{ $("#game").style.display = "none"; $("#mode-list").style.display = "flex"; renderModes(); };
  }

  function norm(s){
    // accents required visually, but normalize for fair checking (as agreed in your prefs)
    return (s||"").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"") // strip accents
      .replace(/[¿?¡!]/g,"").replace(/\s+/g," ").trim();
  }

  // ----- Best per (tense, mode) -----
  function bestKey(tense, mode){ return `turbo_mtw_best_${CONFIG.title}_${tense}_${mode}`; }
  function getBest(tense, mode){ const v = localStorage.getItem(bestKey(tense, mode)); return v ? parseFloat(v) : null; }
  function saveBest(tense, mode, score){
    const cur = getBest(tense, mode);
    const best = (cur == null || score < cur) ? score : cur;
    localStorage.setItem(bestKey(tense, mode), best.toString());
  }

  // ----- Force Present only -----
  function setTenseButtonsToPresentOnly(){
    const btns = $$(".tense-button");
    btns.forEach(b=>{
      const isPresent = b.dataset.tense === "Present";
      b.classList.toggle("active", isPresent);
      b.disabled = !isPresent;
      if (!isPresent) b.title = "Present only in this game";
      b.onclick = ()=>{}; // no-op for this game
    });
    // Ensure currentTense is Present
    currentTense = "Present";
  }

  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

})();
