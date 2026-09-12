const SONGS = [
  { title:"Em Của Ngày Hôm Qua",        year:2012, dur:"4:12", icon:"🎵" },
  { title:"Cơn Mưa Ngang Qua",          year:2013, dur:"4:08", icon:"🎵" },
  { title:"Nắng Ấm Xa Dần",             year:2013, dur:"4:35", icon:"🎵" },
  { title:"Ngày Chưa Giông Bão",        year:2014, dur:"4:28", icon:"🎵" },
  { title:"Âm Thầm Bên Em",             year:2014, dur:"5:02", icon:"🎵" },
  { title:"Chúng Ta Không Thuộc Về Nhau",year:2016, dur:"4:47", icon:"🎵" },
  { title:"Lạc Trôi",                   year:2017, dur:"3:58", icon:"🎵" },
  { title:"Nơi Này Có Anh",             year:2017, dur:"4:21", icon:"🎵" },
  { title:"Chạy Ngay Đi",               year:2018, dur:"3:50", icon:"🎵" },
  { title:"Hãy Trao Cho Anh",           year:2019, dur:"3:43", icon:"🎵" },
  { title:"Muộn Rồi Mà Sao Còn",       year:2021, dur:"3:52", icon:"🎵" },
  { title:"Có Chắc Yêu Là Đây",        year:2020, dur:"3:35", icon:"🎵" },
  { title:"Tâm Tình",                   year:2020, dur:"4:18", icon:"🎵" },
  { title:"Chúng Ta Của Hiện Tại",      year:2021, dur:"4:05", icon:"🎵" },
  { title:"Một Nhà",                    year:2022, dur:"3:44", icon:"🎵" },
  { title:"Đừng Lo Em Ơi",             year:2020, dur:"3:33", icon:"🎵" },
  { title:"Thế Giới Ảo",               year:2018, dur:"4:10", icon:"🎵" },
  { title:"Hồng Nhan",                  year:2022, dur:"3:28", icon:"🎵" },
];

const MP = (() => {
  let cur = 0, playing = false, elapsed = 0, timer = null, listOpen = false;

  function toSec(str) {
    const [m,s] = str.split(':').map(Number); return m*60+s;
  }
  function fmt(s) {
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }

  function render() {
    const s = SONGS[cur];
    document.getElementById('music-thumb').textContent = s.icon;
    document.getElementById('music-title').textContent = s.title;
    document.getElementById('play-btn').textContent = playing ? '⏸' : '▶';
    const tot = toSec(s.dur);
    document.getElementById('prog-fill').style.width = tot ? (elapsed/tot*100)+'%' : '0%';
    document.getElementById('music-time-cur').textContent = fmt(elapsed);
    document.getElementById('music-time-tot').textContent = s.dur;
    renderList();
  }

  function renderList() {
    document.getElementById('pl-list').innerHTML = SONGS.map((s,i) => `
      <div class="pl-item${i===cur?' active':''}" onclick="MP.jumpTo(${i})">
        <div class="pl-num">${i===cur ? '♪' : i+1}</div>
        <div class="pl-meta">
          <div class="pl-name">${s.title}</div>
          <div class="pl-yr">${s.year}</div>
        </div>
        <div class="pl-dur">${s.dur}</div>
      </div>`).join('');
  }

  function tick() {
    elapsed++;
    if (elapsed >= toSec(SONGS[cur].dur)) { next(); return; }
    render();
  }

  return {
    init() { render(); },
    toggle() {
      playing = !playing;
      if (playing) timer = setInterval(tick, 1000);
      else { clearInterval(timer); timer = null; }
      render();
    },
    next() {
      clearInterval(timer); timer = null;
      cur = (cur+1) % SONGS.length; elapsed = 0;
      if (playing) timer = setInterval(tick, 1000);
      render();
    },
    prev() {
      if (elapsed > 3) { elapsed = 0; render(); return; }
      clearInterval(timer); timer = null;
      cur = (cur-1+SONGS.length) % SONGS.length; elapsed = 0;
      if (playing) timer = setInterval(tick, 1000);
      render();
    },
    jumpTo(i) {
      clearInterval(timer); timer = null;
      cur = i; elapsed = 0; playing = true;
      timer = setInterval(tick, 1000);
      render();
    },
    seek(e) {
      const bar = document.getElementById('prog-bar');
      const r = bar.getBoundingClientRect();
      elapsed = Math.floor(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)) * toSec(SONGS[cur].dur));
      render();
    },
    toggleList() {
      listOpen = !listOpen;
      document.getElementById('playlist-panel').classList.toggle('hidden', !listOpen);
      if (listOpen) renderList();
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => MP.init());
