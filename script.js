(function(){
const ICON_SET = ['favorite','star','bolt','spa','anchor','pets','cyclone','diamond'];
  const NAME = {1:'Player 1', 2:'Player 2'};

  const STORE_KEY = 'pulsematch_users_v1';
  let session = { username:null, isGuest:false, opponent:'Player 2' };

  let cards = [], current = 1, openIdx = [], taps={1:0,2:0}, matches={1:0,2:0}, points={1:0,2:0};
  let gameOver=false, locked=false, matchLog=[];

  const $ = id => document.getElementById(id);
  const boardEl = $('board');

  /* ---------- storage helpers ---------- */
  function loadUsers(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }catch(e){ return {}; } }
  function saveUsers(u){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(u)); }catch(e){} }
  function getProfile(username){
    const users = loadUsers();
    return users[username] || { gamesPlayed:0, wins:0, totalPoints:0, opponent:'Player 2' };
  }
  function updateProfile(username, patchFn){
    if(session.isGuest) return; // don't persist guest stats
    const users = loadUsers();
    const cur = users[username] || { gamesPlayed:0, wins:0, totalPoints:0, opponent:'Player 2' };
    users[username] = patchFn(cur);
    saveUsers(users);
  }

  /* ---------- login ---------- */
  function initials(name){ return (name||'P').trim().slice(0,1).toUpperCase(); }

  $('signInBtn').addEventListener('click', ()=>{
    const name = $('nameInput').value.trim();
    if(!name){ $('loginError').textContent = 'Please enter your name to sign in.'; return; }
    $('loginError').textContent = '';
    session = { username:name, isGuest:false, opponent:getProfile(name).opponent || 'Player 2' };
    enterApp();
  });
  $('guestBtn').addEventListener('click', ()=>{
    session = { username:'Guest', isGuest:true, opponent:'Player 2' };
    enterApp();
  });
  function doLogout(){
    session = { username:null, isGuest:false, opponent:'Player 2' };
    $('screen-app').style.display = 'none';
    $('bottomNav').style.display = 'none';
    $('resetFab').style.display = 'none';
    $('screen-login').style.display = 'flex';
    $('nameInput').value=''; $('passInput').value=''; $('loginError').textContent='';
    hideSnack();
  }
  $('logoutBtn').addEventListener('click', doLogout);
  $('logoutBtn2').addEventListener('click', doLogout);

  function enterApp(){
    $('screen-login').style.display = 'none';
    $('screen-app').style.display = 'flex';
    $('screen-app').style.flexDirection = 'column';
    $('screen-app').style.flex = '1';
    $('bottomNav').style.display = 'flex';

    const ini = initials(session.username);
    $('avatarBtn').textContent = ini;
    $('bigAvatar').textContent = ini;
    $('profileName').textContent = session.username + (session.isGuest ? ' (guest)' : '');
    $('p1NameLbl').textContent = session.username;
    $('p2NameLbl').textContent = session.opponent;
    $('opponentInput').value = session.opponent;
    NAME[1] = session.username;
    NAME[2] = session.opponent;

    refreshProfileStats();
    switchTab('play');
    resetGame();
  }

  function refreshProfileStats(){
    const p = session.isGuest ? {gamesPlayed:0,wins:0,totalPoints:0} : getProfile(session.username);
    $('statGames').textContent = p.gamesPlayed;
    $('statWins').textContent = p.wins;
    $('statPoints').textContent = p.totalPoints;
  }

  $('saveOpponentBtn').addEventListener('click', ()=>{
    const val = $('opponentInput').value.trim() || 'Player 2';
    session.opponent = val;
    NAME[2] = val;
    $('p2NameLbl').textContent = val;
    if(!session.isGuest){
      updateProfile(session.username, cur => ({...cur, opponent: val}));
    }
    showSnack('Opponent name updated for next game.');
  });

  /* ---------- tabs ---------- */
  function switchTab(tab){
    ['play','scores','profile'].forEach(t=>{
      $('tab-'+t).style.display = (t===tab) ? 'flex' : 'none';
    });
    document.querySelectorAll('.nav-item').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.tab===tab);
    });
    $('resetFab').style.display = (tab==='play') ? 'flex' : 'none';
    const titles = { play:'Play', scores:'Scores', profile:'Profile' };
    const subs = { play:'Turn-based · tap tracked · fair play', scores:'Matched pairs, in order found', profile:'Account & opponent settings' };
    $('appTitle').textContent = titles[tab];
    $('appSubtitle').textContent = subs[tab];
    if(tab==='profile') refreshProfileStats();
  }
  document.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=>switchTab(btn.dataset.tab));
  });
  $('avatarBtn').addEventListener('click', ()=>switchTab('profile'));

  /* ---------- game ---------- */
  function shuffledDeck(){
    const deck = [...ICON_SET, ...ICON_SET].map(icon => ({icon, matched:false, flipped:false}));
    for(let i = deck.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function buildBoard(){
    boardEl.innerHTML = '';
    cards.forEach((c,i)=>{
      const div = document.createElement('div');
      div.className = 'card';
      div.dataset.idx = i;
      div.innerHTML = `<div class="inner">
          <div class="face back"><span class="msym">extension</span></div>
          <div class="face front"><span class="msym">${c.icon}</span></div>
        </div>`;
      div.addEventListener('click', ()=>onTap(i));
      boardEl.appendChild(div);
    });
  }

  function render(){
    $('pts-1').textContent = points[1];
    $('pts-2').textContent = points[2];
    $('taps-1').textContent = `${taps[1]} taps · ${matches[1]} matches`;
    $('taps-2').textContent = `${taps[2]} taps · ${matches[2]} matches`;

    $('card-1').classList.toggle('active', current===1 && !gameOver);
    $('card-2').classList.toggle('active', current===2 && !gameOver);

    if(!gameOver){
      $('turnText').textContent = `${NAME[current]}'s turn — flip 2 cards to find a pair`;
      $('turnBanner').style.background = current===1 ? 'rgba(139,92,246,.18)' : 'rgba(255,107,157,.18)';
      $('turnBanner').style.color = current===1 ? '#C9B6FF' : '#FFC2D6';
    }

    [...boardEl.children].forEach((el,i)=>{
      const c = cards[i];
      el.classList.toggle('flipped', c.flipped && !c.matched);
      el.classList.toggle('matched', c.matched);
      if(c.matched){ el.querySelector('.face.front .msym').style.color = c.owner===1 ? '#8B5CF6' : '#FF6B9D'; }
    });
  }

  function renderMatchFeed(){
    $('matchCount').textContent = matchLog.length + ' found';
    $('emptyScores').style.display = matchLog.length ? 'none' : 'flex';
    const feed = $('matchFeed');
    feed.innerHTML = '';
    matchLog.forEach((m, idx)=>{
      const row = document.createElement('div');
      row.className = 'match-row';
      row.style.setProperty('--p-color', m.owner===1 ? '#8B5CF6' : '#FF6B9D');
      row.innerHTML = `
        <div class="seq">${idx+1}</div>
        <span class="msym icon">${m.icon}</span>
        <div class="info">
          <span class="who">${m.name}</span>
          <span class="when">${m.time}</span>
        </div>
        <span class="pts-tag">+${m.pts}</span>`;
      feed.appendChild(row);
    });
  }

  function timeNow(){
    const d = new Date();
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  }

  function onTap(i){
    if(gameOver || locked) return;
    const c = cards[i];
    if(c.matched || c.flipped) return;
    if(openIdx.length >= 2) return;

    taps[current]++;
    points[current]++;
    c.flipped = true;
    openIdx.push(i);
    render();

    if(openIdx.length === 2){
      locked = true;
      const [a,b] = openIdx;
      const isMatch = cards[a].icon === cards[b].icon;

      setTimeout(()=>{
        if(isMatch){
          cards[a].matched = true; cards[b].matched = true;
          cards[a].owner = current; cards[b].owner = current;
          points[current] += 10;
          matches[current]++;
          matchLog.push({ name: NAME[current], owner: current, icon: cards[a].icon, pts: 10, time: timeNow() });
          renderMatchFeed();
        } else {
          cards[a].flipped = false; cards[b].flipped = false;
          boardEl.children[a].classList.add('wrong');
          boardEl.children[b].classList.add('wrong');
          setTimeout(()=>{
            boardEl.children[a].classList.remove('wrong');
            boardEl.children[b].classList.remove('wrong');
          }, 350);
        }

        openIdx = [];
        locked = false;

        if(cards.every(c=>c.matched)){
          gameOver = true;
          render();
          const winner = points[1]===points[2] ? null : (points[1]>points[2] ? 1 : 2);
          finishGame(winner);
          return;
        }
        current = current === 1 ? 2 : 1;
        render();
      }, isMatch ? 450 : 700);
    }
  }

  function finishGame(winner){
    if(!session.isGuest){
      updateProfile(session.username, cur => ({
        ...cur,
        gamesPlayed: cur.gamesPlayed + 1,
        wins: cur.wins + (winner===1 ? 1 : 0),
        totalPoints: cur.totalPoints + points[1],
        opponent: session.opponent
      }));
      refreshProfileStats();
    }
    showSnack(winner ? `${NAME[winner]} wins! ${points[1]} – ${points[2]}` : `It's a tie! ${points[1]} – ${points[2]}`);
  }

  function showSnack(msg){
    $('snackText').textContent = msg;
    $('snackbar').classList.add('show');
  }
  function hideSnack(){ $('snackbar').classList.remove('show'); }

  function resetGame(){
    cards = shuffledDeck();
    current = 1;
    openIdx = [];
    taps = {1:0,2:0};
    matches = {1:0,2:0};
    points = {1:0,2:0};
    gameOver = false;
    locked = false;
    matchLog = [];
    hideSnack();
    buildBoard();
    renderMatchFeed();
    render();
  }

  $('resetFab').addEventListener('click', resetGame);
  $('snackAction').addEventListener('click', resetGame);
})();