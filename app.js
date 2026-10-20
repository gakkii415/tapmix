import {PAIRS, youtubeURL} from './data.js';
import {renderDemo, analyzeAudio, planMix, AutoMixer} from './audio.js';

const $ = id => document.getElementById(id);
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime = seconds => `${String(Math.floor(Math.max(0,seconds) / 60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,seconds) % 60)).padStart(2,'0')}`;
const safeGet = key => {try{return localStorage.getItem(key);}catch{return null;}};
const safeSet = (key,value) => {try{localStorage.setItem(key,value);}catch{/* Private browsing may disable persistent settings. */}};
const files = new Map();
const demoCache = new Map();
const uploadTokens = new Map();
let selected = PAIRS.find(p => p.id === safeGet('tapmix-pair')) || PAIRS[0];
let filter = selected.genre;
let selectionVersion = 0;
let activePlan = null;
let activeSources = null;
let playbackState = 'stopped';
let completed = false;
let busy = false;
let frame = 0;
let toastTimer;
let fileTarget;
let youtubePlayers = [];
let youtubeStates = [];
let youtubeReady = [];
let youtubeErrors = [];
let youtubeGeneration = 0;
let youtubeApiPromise = null;
let dbPromise;
let playbackRequest = 0;
let storageEpoch = 0;
let loadingSelectionVersion = 0;
const pendingUploads = new Map();

const mixer = new AutoMixer({
  onStateChange(state){
    playbackState = state;
    if(state === 'ended') completed = true;
    if(state === 'playing') {
      $('mix-room').classList.add('playing');
      $('mix-room').classList.remove('paused');
      startAnimation();
    } else {
      $('mix-room').classList.remove('playing');
      $('mix-room').classList.toggle('paused',state === 'paused');
      cancelAnimationFrame(frame);
      drawWaveform(state === 'ended' ? activePlan?.duration : mixer.getPosition());
    }
    updateControls();
  },
  onEnded(){
    $('room-state').textContent = 'THAT WAS YOUR MIX.';
    $('mix-stage').textContent = 'いい感じ。もう一度、聴いてみる？';
    $('time-current').textContent = formatTime(activePlan?.duration || 0);
    $('wave-playhead').style.left = '100%';
  }
});

function toast(message){
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'),6500);
}

function database(){
  if(!dbPromise) dbPromise = new Promise((resolve,reject) => {
    if(!window.indexedDB) return reject(new Error('保存は利用できません'));
    const request = indexedDB.open('tapmix-local-audio',1);
    request.onupgradeneeded = () => request.result.createObjectStore('tracks');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のタブを閉じてください'));
  });
  return dbPromise;
}

async function readSaved(key){
  try{
    const db = await database();
    return await new Promise((resolve,reject) => {
      const request = db.transaction('tracks','readonly').objectStore('tracks').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }catch{return null;}
}

async function writeSaved(key,record){
  const db = await database();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction('tracks','readwrite');
    const store = transaction.objectStore('tracks');
    if(record) store.put(record,key); else store.delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('保存できませんでした'));
  });
}

function sourcesFor(pair = selected){
  return pair.genre === 'demo' ? demoCache.get(pair.id) : [files.get(`${pair.id}:0`),files.get(`${pair.id}:1`)];
}

function isReady(pair = selected){return sourcesFor(pair)?.every(Boolean) === true;}

function setBusy(value){busy=value;$('mix-room').classList.toggle('loading',value);updateControls();}
function refreshBusy(){setBusy(loadingSelectionVersion===selectionVersion||[...pendingUploads.keys()].some(key=>key.startsWith(`${selected.id}:`)));}

async function loadDemo(pair){
  if(demoCache.has(pair.id)) return demoCache.get(pair.id);
  // Yield before synthesis so selection and loading feedback paint first.
  await new Promise(resolve => requestAnimationFrame(resolve));
  const context = mixer.getContext();
  const rendered = renderDemo(pair.id);
  const tracks = rendered.map((track,index) => {
    const buffer = context.createBuffer(1,track.samples.length,track.sampleRate);
    buffer.copyToChannel(track.samples,0);
    const analysis = analyzeAudio(buffer);
    return {buffer,analysis:{...analysis,bpm:track.bpm,beatOffset:0,confidence:1},fileName:pair.tracks[index].title,original:true};
  });
  demoCache.set(pair.id,tracks);
  return tracks;
}

async function decodeFile(blob,fileName){
  const bytes = await blob.arrayBuffer();
  const buffer = await mixer.getContext().decodeAudioData(bytes);
  if(buffer.duration < 3) throw new Error('3秒以上の音源を選んでください。');
  if(buffer.duration > 15*60) throw new Error('15分以内の音源を選んでください。');
  const analysis = analyzeAudio(buffer);
  return {buffer,analysis,fileName,original:false};
}

function buildPlan(){
  const sources = sourcesFor();
  if(!sources?.every(Boolean)){activeSources=null;activePlan=null;return;}
  activeSources = sources;
  activePlan = planMix(...sources.map(source => ({duration:source.buffer.duration,...source.analysis})));
}

function stopPlayback(){
  ++playbackRequest;
  mixer.stop();
  completed = false;
  cancelAnimationFrame(frame);
  $('mix-room').classList.remove('playing','paused','transitioning','second-track');
  $('room-state').textContent = 'READY WHEN YOU ARE';
  $('mix-stage').textContent = isReady() ? 'あとは、再生を押すだけ。' : '音源を追加すると、波形を表示します。';
  $('time-current').textContent = '00:00';
  $('wave-playhead').style.left = '0%';
  drawWaveform(0);
  updateControls();
}

function trackTitle(index){
  const source = sourcesFor()?.[index];
  return selected.genre === 'custom' && source ? source.fileName.replace(/\.[^.]+$/,'') : selected.tracks[index].title;
}

function updateTrackMetadata(){
  const sources = sourcesFor();
  ['a','b'].forEach((letter,index) => {
    const source = sources?.[index];
    $(`track-${letter}-title`).textContent = trackTitle(index);
    $(`track-${letter}-artist`).textContent = selected.genre === 'custom' && source ? 'あなたのライブラリ' : selected.tracks[index].artist;
    const tempo = source?.analysis.bpm;
    $(`bpm-${letter}`).innerHTML = tempo ? `${Math.round(tempo)} <small>${source.original ? 'BPM' : 'BPM 推定'}</small>` : '<small>未解析</small>';
    const label = document.querySelector(`.deck-${letter} .vinyl-label`);
    label.className = `vinyl-label theme-${selected.theme} label-${letter}`;
    const words = selected.genre === 'demo' ? (selected.id === 'neon' ? ['NEON<br>DRIVE','AFTER<br>GLOW'] : ['MOON<br>LIGHT','BLUE<br>HOUR']) : (selected.genre === 'custom' ? ['YOUR<br>MUSIC','YOUR<br>MIX'] : ['SIDE<br>A','SIDE<br>B']);
    label.querySelector('.label-word').innerHTML = words[index];
    label.querySelector('.label-ring').textContent = selected.genre === 'demo' ? `TAPMIX ORIGINAL · SIDE ${letter.toUpperCase()} ·` : `TAPMIX · SIDE ${letter.toUpperCase()} ·`;
  });
  const ready=isReady();
  $('source-chip').textContent = selected.genre === 'demo' ? 'ORIGINAL DEMO' : ready ? 'YOUR AUDIO' : '音源の準備';
  $('mix-description').textContent = selected.genre === 'demo' ? '音源なしで、すぐ試せる。' : ready ? '2曲の準備ができました。' : '音源を追加すると、自動ミックスできます。';
  $('time-total').textContent = activePlan ? formatTime(activePlan.duration) : '--:--';
  $('mix-stage').textContent = ready ? 'あとは、再生を押すだけ。' : '音源を追加すると、波形を表示します。';
  $('player-footnote').textContent = selected.genre === 'demo' ? 'オリジナルのインスト2曲を、約1分に自動ミックス。' : ready ? (activePlan?.synced ? '推定テンポを合わせてミックス。再生速度と音の高さも少し変化します。' : '曲の雰囲気を保って、音量をなめらかに切り替えます。') : '原曲はYouTubeで試聴できます。ミックスには利用できる音源を追加してください。';
  if(selected.genre === 'custom' && !ready) $('player-footnote').textContent='手元の音源から、約1分のミックスを自動でつくります。';
  $('source-actions').hidden = selected.genre === 'demo';
  $('youtube-button').hidden = !selected.tracks[0].youtube;
  $('add-audio-button').querySelector('span').textContent=ready?'追加した音源を管理':'音源を追加して、ミックスする';
  updateControls();
  drawWaveform(0);
}

function updateControls(){
  const button=$('play-button');
  const state=playbackState;
  const text=busy?'音源を準備しています…':state==='playing'?'ミックスを一時停止':state==='paused'?'つづきから再生':!isReady()?'音源を追加してミックス':completed?'もう一度、ミックス':'ワンタップでミックス';
  button.querySelector('span').textContent=text;
  button.querySelector('use').setAttribute('href',state==='playing'?'#i-pause':!isReady()&&!busy?'#i-plus':'#i-play');
  button.disabled=busy;
  $('stop-button').disabled=!(state==='playing'||state==='paused'||completed);
  const importReady=isReady()&&!busy;
  $('import-play-button').disabled=!importReady;
  $('import-play-button').innerHTML=icon('play')+(busy?'音源を読み込んでいます…':'この2曲をミックス');
}

async function selectPair(id,{scroll=false}={}){
  const pair=PAIRS.find(p=>p.id===id);
  if(!pair) return;
  stopPlayback();
  const version=++selectionVersion;
  selected=pair;activePlan=null;activeSources=null;
  safeSet('tapmix-pair',id);
  renderCards();
  updateTrackMetadata();
  if(scroll) $('mix-room').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  loadingSelectionVersion=version;refreshBusy();
  try{
    if(pair.genre==='demo') await loadDemo(pair);
    else {
      await Promise.all([0,1].map(async index=>{
        const key=`${pair.id}:${index}`;
        if(files.has(key)) return;
        const token=uploadTokens.get(key);
        const epoch=storageEpoch;
        const saved=await readSaved(key);
        if(!saved || uploadTokens.get(key)!==token || epoch!==storageEpoch) return;
        try{
          const source=await decodeFile(saved.blob,saved.fileName);
          if(uploadTokens.get(key)===token&&epoch===storageEpoch) files.set(key,source);
        }catch{if(version===selectionVersion)toast('保存した音源を読み込めませんでした。もう一度追加してください。');}
      }));
    }
    if(version!==selectionVersion)return;
    buildPlan();updateTrackMetadata();renderCards();
  }catch(error){
    if(version===selectionVersion) toast(error.message.includes('Web Audio')?'このブラウザは音声ミックスに対応していません。Safari・Chromeなどの最新版でお試しください。':'音源の準備に失敗しました。ページを開き直してください。');
  }finally{if(version===selectionVersion){loadingSelectionVersion=0;refreshBusy();}}
}

function renderFilters(){
  document.querySelectorAll('[data-filter]').forEach(button=>{
    const active=button.dataset.filter===filter;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
  $('filter-note').textContent={demo:'TAPMIXのオリジナル音源。準備なしで、自動ミックスを体験できます。',vocaloid:'有名ボカロから3組。YouTubeで原曲を試聴でき、手元の音源を追加するとミックスできます。',edm:'歌える、盛り上がれる2組。YouTubeで試聴でき、手元の音源を追加するとミックスできます。',custom:'利用できる音源を2つ追加。音源はこのブラウザに保存されるので、次回の準備もいりません。'}[filter];
}

function renderCards(){
  renderFilters();
  const labels={neon:'NEON<br>AFTERGLOW',moon:'MOONLIGHT<br>BLUE HOUR',deco:'MIKU<br>ROCKS.',wowaka:'ROLLING<br>UNKNOWN',livetune:'HELLO,<br>YOUR WORLD.',avicii:'THE NIGHTS<br>WE REMEMBER',zedd:'STAY IN<br>CLARITY',custom:'YOUR MUSIC.<br>YOUR MIX.'};
  $('pair-grid').innerHTML=PAIRS.filter(pair=>pair.genre===filter).map((pair,index)=>{
    const chosen=pair.id===selected.id;
    const ready=isReady(pair);
    return `<article class="pair-card${chosen?' selected':''}"><button class="pair-select" data-pair="${pair.id}" aria-pressed="${chosen}" aria-label="${escapeHTML(pair.name)}を選ぶ"><div class="card-cover theme-${pair.theme}"><span class="cover-corner">${pair.genre==='demo'?'TAPMIX ORIGINAL':pair.genre==='custom'?'YOUR LIBRARY':'CURATED PAIR'}</span><span class="cover-orbit"></span><span class="cover-type">${labels[pair.id]}</span><span class="cover-number">PAIR / 0${index+1}</span>${chosen?`<span class="selected-badge">${icon('check')}</span>`:''}</div><div class="card-content"><span class="card-tag"><i></i>${escapeHTML(pair.tag)}</span><h3>${escapeHTML(pair.name)}</h3>${pair.tracks.map((track,i)=>`<div class="card-song"><small>${i?'B':'A'}</small><span>${escapeHTML(pair.genre==='custom'&&files.get(`${pair.id}:${i}`)?files.get(`${pair.id}:${i}`).fileName:track.title)}</span></div>`).join('')}</div></button><div class="card-bottom"><span class="${ready||pair.genre==='demo'?'ready':''}">${pair.genre==='demo'?`${pair.bpm} BPM · デモ音源付`:ready?'音源追加済 · ミックスOK':'ミックスには音源を追加'}</span><span class="card-bottom-right">${pair.tracks[0].youtube?pair.tracks.map((track,i)=>`<a href="${youtubeURL(track.youtube)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(track.title)}の公式YouTube動画を開く">${i?'B':'A'} ${icon('link')}</a>`).join(''):icon(chosen?'check':'arrow')}</span></div></article>`;
  }).join('');
}

async function primaryAction(){
  if(busy)return;
  const request=++playbackRequest;
  const pairId=selected.id;
  if(!isReady()){openImport();return;}
  try{
    if(playbackState==='playing'){mixer.pause();return;}
    if(playbackState==='paused'){await mixer.resume();return;}
    // Resume within the tap gesture, before any asynchronous work.
    const context=mixer.getContext();
    if(context.state==='suspended') await context.resume();
    if(request!==playbackRequest||selected.id!==pairId||busy||!isReady())return;
    closeYouTube();
    completed=false;
    buildPlan();
    if(!activeSources||!activePlan)return;
    mixer.setVolume(Number($('volume').value)/100);
    await mixer.play(activeSources[0].buffer,activeSources[1].buffer,activePlan);
  }catch(error){stopPlayback();toast('音を再生できませんでした。端末の音量を確認して、もう一度再生を押してください。');}
}

function startAnimation(){
  cancelAnimationFrame(frame);
  const tick=()=>{
    if(!mixer.isPlaying||!activePlan)return;
    const position=mixer.getPosition();
    $('time-current').textContent=formatTime(position);
    $('wave-playhead').style.left=`${Math.min(100,position/activePlan.duration*100)}%`;
    const transition=position>=activePlan.bStart&&position<activePlan.lengthA;
    const second=position>=activePlan.lengthA;
    $('mix-room').classList.toggle('transitioning',transition);
    $('mix-room').classList.toggle('second-track',second);
    $('room-state').textContent=transition?'MAKING THE CONNECTION.':second?'KEEP THE FEELING GOING.':'YOU ARE IN THE MIX.';
    $('mix-stage').textContent=transition?'2曲を、つないでいます。':second?'B の曲へ、バトンタッチ。':`A を再生中 · ${activePlan.synced?'テンポ合わせ ON':'自動クロスフェード'}`;
    drawWaveform(position);
    frame=requestAnimationFrame(tick);
  };
  tick();
}

function drawWaveform(position=0){
  const canvas=$('waveform');
  const width=canvas.clientWidth;
  if(!width)return;
  const height=canvas.clientHeight;
  const ratio=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  }
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
  const count=Math.floor(width/5);
  const gap=width/count;
  const ready=activePlan&&activeSources;
  for(let i=0;i<count;i++){
    const at=ready?i/count*activePlan.duration:0;
    let amplitude=0;
    if(ready){
      [0,1].forEach(index=>{
        const start=index?activePlan.bStart:0;
        const length=index?activePlan.lengthB:activePlan.lengthA;
        if(at<start||at>start+length)return;
        const source=activeSources[index];
        const rate=index?activePlan.rateB:activePlan.rateA;
        const offset=index?activePlan.offsetB:activePlan.offsetA;
        const sourceTime=offset+(at-start)*rate;
        const peakIndex=Math.min(source.analysis.peaks.length-1,Math.floor(sourceTime/source.buffer.duration*source.analysis.peaks.length));
        let gain=1;
        if(activePlan.fadeDuration){const p=Math.max(0,Math.min(1,(at-activePlan.bStart)/activePlan.fadeDuration));gain=index?Math.sin(p*Math.PI/2):Math.cos(p*Math.PI/2);}
        amplitude=Math.max(amplitude,(source.analysis.peaks[peakIndex]||0)*gain);
      });
    }
    const barHeight=Math.max(2,amplitude*(height-8));
    const second=ready&&at>=activePlan.bStart+activePlan.fadeDuration/2;
    const played=position>at;
    ctx.fillStyle=!ready?'#3a4331':second?(played?'#bfdcf8':'#678297'):(played?'#d0f680':'#73894c');
    ctx.globalAlpha=ready?1:.65;
    ctx.fillRect(i*gap,(height-barHeight)/2,Math.max(1,gap-2),barHeight);
  }
  ctx.globalAlpha=1;
}

function openDialog(id){if(!$(id).open)$(id).showModal();}
function openImport(){renderUploads();openDialog('import-dialog');}
function renderUploads(){
  const currentId=selected.id;
  $('upload-slots').innerHTML=selected.tracks.map((track,index)=>{
    const source=files.get(`${currentId}:${index}`);
    return `<div class="upload-slot${source?' loaded':''}" data-slot="${index}"><span class="upload-letter">${index?'B':'A'}</span><div class="upload-copy"><strong>${escapeHTML(selected.genre==='custom'&&source?source.fileName:track.title)}</strong><span>${source?`${escapeHTML(source.fileName)} · ${formatTime(source.buffer.duration)}${source.analysis.bpm?` · 約${Math.round(source.analysis.bpm)} BPM`:''}`:'ファイルを選ぶ、またはここにドロップ'}</span></div><button class="upload-pick" data-pick="${index}">${source?'変更':'追加'}</button>${source?`<button class="upload-delete" data-delete="${index}" aria-label="${index?'B':'A'}の音源を削除">${icon('trash')}</button>`:''}</div>`;
  }).join('');
  updateControls();
}

function pickFile(slot){fileTarget={pairId:selected.id,slot};$('file-input').value='';$('file-input').click();}

async function importFile(file,pairId,slot){
  if(!file)return;
  if(file.size>35*1024*1024){toast('音源は1曲35MBまでです。小さめの音源を選んでください。');return;}
  if(file.size<44){toast('音源ファイルを読み込めません。別のファイルを選んでください。');return;}
  const key=`${pairId}:${slot}`;
  const token=Symbol();uploadTokens.set(key,token);
  pendingUploads.set(key,token);
  if(pairId===selected.id)stopPlayback();
  refreshBusy();
  try{
    const source=await decodeFile(file,file.name);
    if(uploadTokens.get(key)!==token)return;
    files.set(key,source);
    let persisted=true;
    try{await writeSaved(key,{blob:file,fileName:file.name});}
    catch{persisted=false;}
    if(pairId===selected.id){buildPlan();updateTrackMetadata();renderUploads();renderCards();if(persisted)toast(`${slot?'B':'A'}の音源を追加しました。`);}
    if(!persisted)toast('音源を追加しましたが、このブラウザには保存できませんでした。今回は再生でき、次回は追加し直す必要があります。');
  }catch(error){
    if(uploadTokens.get(key)===token)toast(error.message.includes('選んでください')?error.message:'この音源は読み込めませんでした。MP3やWAVなど、別の形式をお試しください。');
  }finally{
    if(pendingUploads.get(key)===token)pendingUploads.delete(key);
    refreshBusy();
    if(pairId===selected.id&&uploadTokens.get(key)===token)renderUploads();
  }
}

async function deleteFile(slot){
  stopPlayback();
  const key=`${selected.id}:${slot}`;uploadTokens.set(key,Symbol());files.delete(key);
  pendingUploads.delete(key);refreshBusy();
  try{await writeSaved(key,null);}catch{toast('保存データの削除に失敗しました。ブラウザのサイトデータから削除できます。');}
  buildPlan();updateTrackMetadata();renderCards();renderUploads();
}

function showInfo(kind){
  const contents={
    mix:`<h2>つなぎは、TAPMIXにおまかせ。</h2><div class="prose"><p>2曲の冒頭から、それぞれ最大約32秒を使います。終わりと始まりを数秒重ね、片方を小さく、もう片方を大きくして自然につなぎます。</p><h3>テンポも、できる範囲で。</h3><p>音源からテンポを推定し、十分な確かさがあってテンポが近い場合は、拍のタイミングを合わせます。再生速度を変えるため、音の高さも少し変わります。テンポ差が大きい曲や拍を検出できない曲は、元の速度でつなぎます。</p><p>おすすめは曲調・アーティストで選んだ候補です。キーや曲の構成の完全な一致、すべての曲での自然なつながりを保証するものではありません。</p></div>`,
    privacy:`<h2>あなたの音源は、あなたの中に。</h2><div class="prose"><p>追加した音源は、お使いのブラウザのIndexedDBに保存し、この端末内で解析・再生します。音源をサーバーへアップロードしたり、ほかの人に公開したりする機能はありません。</p><p>選んだ組み合わせ・音量・YouTube試聴への同意は、このブラウザのlocalStorageに保存します。ブラウザ・端末・サイトの配信元を変えた場合や、サイトデータを削除した場合は引き継がれません。</p><h3>音源を削除するには</h3><p>曲を選んで「追加した音源を管理」を開き、ごみ箱を押すとその音源を削除できます。下のボタンですべての保存音源と設定を削除できます。</p><button class="delete-all" id="delete-all-button">${icon('trash')}保存した音源と設定をすべて削除</button><h3>外部サービス</h3><p>このサイトのフォントはGoogle Fontsから読み込みます。YouTubeの試聴は同意後にプレーヤーを読み込み、YouTubeへ情報が送られます。詳しくは<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Googleのプライバシーポリシー</a>をご確認ください。このサイトはGitHub Pagesで配信します。</p></div>`,
    youtube:`<h2>YouTubeは、原曲を聴く場所。</h2><div class="prose"><p>ボカロ・EDMの各組に、公式投稿のYouTubeリンクを用意しています。「YouTubeを2つ並べる」では、2つの公式プレーヤーを同じ画面に並べます。A・Bそれぞれの動画内で再生を押し、音量や再生位置を操作できます。</p><p>この試聴画面は、各動画を手動で開始する方式です。ブラウザや端末によっては、2本目の再生で1本目が停止する場合があります。アプリによる同時自動再生・テンポ合わせは行いません。YouTubeの利用規約や音源の利用条件も適用されます。</p><p>自動ミックスにはオリジナルデモ、またはご自身で利用できる音源をご使用ください。おすすめに掲載したことは、各楽曲の加工許諾を意味しません。</p><p>広告・地域制限・埋め込み制限・ブラウザの自動再生制限により、試聴が止まる場合があります。その場合は公式YouTubeリンクから開けます。</p><p><a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube利用規約</a> / <a href="https://developers.google.com/youtube/terms/developer-policies" target="_blank" rel="noopener noreferrer">YouTube開発者ポリシー</a> / <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Googleプライバシーポリシー</a></p></div>`
  };
  $('info-content').innerHTML=contents[kind];openDialog('info-dialog');
}

async function clearAll(){
  stopPlayback();++selectionVersion;
  ++storageEpoch;loadingSelectionVersion=0;
  files.clear();uploadTokens.clear();pendingUploads.clear();refreshBusy();
  try{
    const db=await database();
    await new Promise((resolve,reject)=>{const transaction=db.transaction('tracks','readwrite');transaction.objectStore('tracks').clear();transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
    for(const key of ['tapmix-pair','tapmix-volume','tapmix-youtube-consent'])try{localStorage.removeItem(key);}catch{/* Nothing persisted. */}
    $('volume').value='70';$('volume-value').textContent='70';mixer.setVolume(.7);
    filter='demo';$('info-dialog').close();await selectPair('neon');toast('保存した音源と設定を削除しました。');
  }catch{toast('削除できませんでした。ブラウザ設定のサイトデータから削除してください。');}
}

function openYouTube(){
  if(!selected.tracks[0].youtube)return;
  if($('youtube-dialog').open)return;
  stopPlayback();
  $('youtube-links').innerHTML=selected.tracks.map((track,index)=>`<a href="${youtubeURL(track.youtube)}" target="_blank" rel="noopener noreferrer">${icon('link')}${index?'B':'A'} · ${escapeHTML(track.title)} — ${escapeHTML(track.artist)} をYouTubeで開く</a>`).join('');
  $('youtube-consent').hidden=safeGet('tapmix-youtube-consent')==='yes';
  $('youtube-stage').hidden=!$('youtube-consent').hidden;
  openDialog('youtube-dialog');
  if($('youtube-consent').hidden)startYouTube();
}

function loadYouTubeAPI(){
  if(window.YT?.Player)return Promise.resolve();
  if(youtubeApiPromise)return youtubeApiPromise;
  youtubeApiPromise=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{youtubeApiPromise=null;reject(new Error('timeout'));},15000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);resolve();};
    let script=document.querySelector('script[data-youtube-api]');
    if(script)script.remove();
    script=document.createElement('script');script.dataset.youtubeApi='true';script.src='https://www.youtube.com/iframe_api';
    script.onerror=()=>{clearTimeout(timer);youtubeApiPromise=null;script.remove();reject(new Error('network'));};
    document.head.append(script);
  });
  return youtubeApiPromise;
}

async function startYouTube(){
  const tracks=selected.tracks.map(track=>({...track}));
  const generation=++youtubeGeneration;
  releaseYouTubePlayers();
  $('youtube-consent').hidden=true;$('youtube-stage').hidden=false;
  $('youtube-status').textContent='YouTubeに接続しています…';
  try{
    await loadYouTubeAPI();
    if(generation!==youtubeGeneration||!$('youtube-dialog').open)return;
    youtubeStates=[-1,-1];youtubeReady=[false,false];youtubeErrors=['',''];
    $('youtube-player-mount').innerHTML=tracks.map((track,index)=>{
      const side=index?'b':'a';
      return `<section class="youtube-deck" aria-label="${side.toUpperCase()}のYouTubeプレーヤー"><div class="youtube-deck-heading"><span class="deck-letter">${side.toUpperCase()}</span><div><h3>${escapeHTML(track.title)}</h3><p>${escapeHTML(track.artist)}</p></div></div><div class="youtube-frame"><div id="youtube-player-${side}"></div></div><p class="youtube-deck-status" id="youtube-state-${side}" role="status">動画を読み込んでいます…</p></section>`;
    }).join('');
    tracks.forEach((track,index)=>{
      const side=index?'b':'a';
      youtubePlayers[index]=new YT.Player(`youtube-player-${side}`,{
        width:'100%',height:'240',videoId:track.youtube,host:'https://www.youtube-nocookie.com',
        // Only native player taps start playback. The app never auto-starts either video.
        playerVars:{autoplay:0,controls:1,playsinline:1,rel:0,origin:location.origin},events:{
          onReady(event){
            if(generation!==youtubeGeneration){event.target.destroy();return;}
            youtubeReady[index]=true;
            event.target.getIframe?.()?.setAttribute('title',`${side.toUpperCase()} · ${track.title} — YouTube`);
            updateYouTubeStatus();
          },
          onStateChange(event){
            if(generation!==youtubeGeneration)return;
            youtubeStates[index]=event.data;
            if(event.data===1)youtubeErrors[index]='';
            updateYouTubeStatus();
          },
          onAutoplayBlocked(){
            if(generation!==youtubeGeneration)return;
            $(`youtube-state-${side}`).textContent='動画内の再生ボタンを押してください。';
          },
          onError(event){
            if(generation!==youtubeGeneration)return;
            youtubeErrors[index]=([100,101,150,153].includes(event.data)?'ここでは再生できません。':'再生に失敗しました。')+' 下の公式リンクから開いてください。';
            youtubeStates[index]=-1;
            updateYouTubeStatus();
          }
        }
      });
    });
  }catch{
    if(generation===youtubeGeneration){++youtubeGeneration;releaseYouTubePlayers();$('youtube-status').textContent='YouTubeに接続できませんでした。下の公式リンクから開いてください。';}
  }
}

function updateYouTubeStatus(){
  ['a','b'].forEach((side,index)=>{
    const state=youtubeStates[index];
    const target=$(`youtube-state-${side}`);
    if(target)target.textContent=youtubeErrors[index]||(state===1?'再生中':state===2?'一時停止中':state===0?'再生終了':state===3?'読み込み中…':youtubeReady[index]?'動画内の再生ボタンでスタート。':'動画を読み込んでいます…');
  });
  const playing=youtubeStates.filter(state=>state===1).length;
  const failed=youtubeErrors.some(Boolean);
  $('youtube-pause-button').disabled=!youtubeReady.some(Boolean);
  $('youtube-status').textContent=playing===2?'A と B を同時に再生中。音量・再生位置は各動画で調整できます。':playing===1?`${youtubeStates[0]===1?'A':'B'} を再生中。${failed?'もう一方は公式リンクから開けます。':'もう一方も、動画内の再生ボタンから開始できます。'}`:failed?'再生できない動画は、下の公式リンクから開いてください。':youtubeReady.every(Boolean)?'A と B、それぞれの動画内の再生ボタンを押してください。':'YouTubeに接続しています…';
}

function pauseYouTube(){
  for(const player of youtubePlayers)try{player?.pauseVideo?.();}catch{/* A player may still be connecting. */}
}

function releaseYouTubePlayers(){
  const players=youtubePlayers;
  youtubePlayers=[];youtubeStates=[];youtubeReady=[];youtubeErrors=[];
  for(const player of players)try{player?.destroy();}catch{/* Already detached. */}
  $('youtube-player-mount').replaceChildren();
  $('youtube-pause-button').disabled=true;
}

function closeYouTube(){
  ++youtubeGeneration;
  releaseYouTubePlayers();
  if($('youtube-dialog').open)$('youtube-dialog').close();
}

$('play-button').addEventListener('click',primaryAction);
$('stop-button').addEventListener('click',stopPlayback);
$('volume').value=String(Math.max(0,Math.min(100,Number(safeGet('tapmix-volume')??70)||0)));
$('volume-value').textContent=$('volume').value;
$('volume').addEventListener('input',event=>{const value=event.target.value;mixer.setVolume(Number(value)/100);$('volume-value').textContent=value;safeSet('tapmix-volume',value);});
$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
$('details-button').addEventListener('click',()=>showInfo('mix'));
$('privacy-button').addEventListener('click',()=>showInfo('privacy'));
$('youtube-info-button').addEventListener('click',()=>showInfo('youtube'));
$('add-audio-button').addEventListener('click',openImport);
$('youtube-button').addEventListener('click',openYouTube);
$('youtube-consent-button').addEventListener('click',()=>{safeSet('tapmix-youtube-consent','yes');startYouTube();});
$('youtube-pause-button').addEventListener('click',pauseYouTube);
$('import-play-button').addEventListener('click',()=>{$('import-dialog').close();primaryAction();});

document.addEventListener('click',event=>{
  const close=event.target.closest('[data-close]');
  if(close){close.dataset.close==='youtube-dialog'?closeYouTube():$(close.dataset.close).close();return;}
  const category=event.target.closest('[data-filter]');
  if(category){filter=category.dataset.filter;renderCards();return;}
  const card=event.target.closest('[data-pair]');
  if(card){selectPair(card.dataset.pair,{scroll:window.innerWidth<700});return;}
  const pick=event.target.closest('[data-pick]');
  if(pick){pickFile(Number(pick.dataset.pick));return;}
  const remove=event.target.closest('[data-delete]');
  if(remove){deleteFile(Number(remove.dataset.delete));return;}
  if(event.target.closest('#delete-all-button'))clearAll();
});

$('file-input').addEventListener('change',event=>{if(fileTarget&&event.target.files[0])importFile(event.target.files[0],fileTarget.pairId,fileTarget.slot);});
$('upload-slots').addEventListener('dragover',event=>{const slot=event.target.closest('[data-slot]');if(slot){event.preventDefault();slot.classList.add('dragover');}});
$('upload-slots').addEventListener('dragleave',event=>{if(!event.currentTarget.contains(event.relatedTarget))document.querySelectorAll('.dragover').forEach(slot=>slot.classList.remove('dragover'));});
$('upload-slots').addEventListener('drop',event=>{event.preventDefault();document.querySelectorAll('.dragover').forEach(slot=>slot.classList.remove('dragover'));const slot=event.target.closest('[data-slot]');if(slot&&event.dataTransfer.files[0])importFile(event.dataTransfer.files[0],selected.id,Number(slot.dataset.slot));});

document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.id==='youtube-dialog'?closeYouTube():dialog.close();}});
});
$('youtube-dialog').addEventListener('cancel',event=>{event.preventDefault();closeYouTube();});
$('youtube-dialog').addEventListener('close',()=>{if(!$('youtube-dialog').open&&youtubePlayers.length)closeYouTube();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseYouTube();});
window.addEventListener('pagehide',()=>{mixer.stop();closeYouTube();});
window.addEventListener('resize',()=>drawWaveform(mixer.getPosition()));

renderCards();
selectPair(selected.id);
