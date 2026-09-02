// ==================== AHMED TV — Website Logic ====================

// 🔧 رابط الـ Proxy بتاعك على Cloudflare Workers (لحل مشكلة HTTP/HTTPS)
const PROXY_URL = 'https://divine-brook-eddc.mohmedkelf166.workers.dev';

// يحول أي رابط HTTP عادي بحيث يمر من خلال الـ Proxy لو كان غير آمن (http)
function proxify(url){
  if (!url) return url;
  if (url.startsWith('http://')) {
    return PROXY_URL + '/?url=' + encodeURIComponent(url);
  }
  return url; // الروابط اللي أصلاً https تتصل مباشرة من غير proxy
}

const themeColors = ['#7c3aed','#0ea5e9','#10b981','#ef4444','#f59e0b','#ec4899','#6b7280','#06b6d4'];
const themeNames = ['بنفسجي','أزرق','أخضر','أحمر','ذهبي','وردي','رمادي','سماوي'];

let accounts = [];
let allChannels = [], allMovies = [], allSeries = [];
let liveCats = {}, movieCats = {}, seriesCats = {};
let activeLiveCat = 'all', activeMovieCat = 'all', activeSeriesCat = 'all';
let favorites = JSON.parse(localStorage.getItem('ahmedtv_favs') || '[]');
let heroIndex = 0, heroTimer = null;
let previousPage = 'home';

function initThemeFromStorage(){
  const idx = parseInt(localStorage.getItem('ahmedtv_theme') || '0', 10);
  applyTheme(idx, false);
}

function applyTheme(idx, save=true){
  const color = themeColors[idx] || themeColors[0];
  document.documentElement.style.setProperty('--primary', color);
  document.documentElement.style.setProperty('--accent', shade(color, 20));
  document.documentElement.style.setProperty('--secondary', shade(color, -15));
  if (save){
    localStorage.setItem('ahmedtv_theme', idx);
    Toast('تم تغيير اللون إلى ' + themeNames[idx]);
  }
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.idx == idx));
}

function shade(hex, percent){
  const num = parseInt(hex.replace('#',''),16);
  let r = (num>>16) + Math.round(255*percent/100);
  let g = ((num>>8)&0xff) + Math.round(255*percent/100);
  let b = (num&0xff) + Math.round(255*percent/100);
  r = Math.min(255,Math.max(0,r)); g = Math.min(255,Math.max(0,g)); b = Math.min(255,Math.max(0,b));
  return '#' + ((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1);
}

function buildThemeSwatches(){
  const el = document.getElementById('themeSwatches');
  el.innerHTML = themeColors.map((c,i) =>
    `<div class="swatch" data-idx="${i}" style="background:${c}" title="${themeNames[i]}" onclick="applyTheme(${i})"></div>`
  ).join('');
  const idx = parseInt(localStorage.getItem('ahmedtv_theme') || '0', 10);
  document.querySelectorAll('.swatch')[idx]?.classList.add('active');
}

window.toggleThemePanel = function(){
  document.getElementById('themePanel').classList.toggle('active');
};
document.addEventListener('click', (e) => {
  const panel = document.getElementById('themePanel');
  if (panel.classList.contains('active') && !panel.contains(e.target) && !e.target.closest('.icon-btn')) {
    panel.classList.remove('active');
  }
});

window.toggleSearch = function(){
  const wrap = document.getElementById('searchWrap');
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) document.getElementById('searchInput').focus();
};

let searchDebounce;
window.onSearch = function(){
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    const term = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!term){ return; }
    runGlobalSearch(term);
  }, 300);
};

function runGlobalSearch(term){
  const movies = allMovies.filter(m => (m.name||'').toLowerCase().includes(term));
  const series = allSeries.filter(s => (s.name||'').toLowerCase().includes(term));
  const channels = allChannels.filter(c => (c.name||'').toLowerCase().includes(term));
  document.getElementById('searchSub').innerText = `${movies.length + series.length + channels.length} نتيجة لـ "${term}"`;
  const grid = document.getElementById('searchGrid');
  let html = '';
  channels.forEach(c => html += posterCardHTML(c, 'live'));
  movies.forEach(m => html += posterCardHTML(m, 'movie'));
  series.forEach(s => html += posterCardHTML(s, 'series'));
  grid.innerHTML = html || emptyStateHTML('fa-magnifying-glass','لا توجد نتائج مطابقة');
  showPage('search');
}

// ==================== Page navigation ====================
window.showPage = function(pageId){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.topnav a').forEach(a => a.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  const nav = document.querySelector(`.topnav a[data-page="${pageId}"]`);
  if (nav) nav.classList.add('active');
  window.scrollTo({top:0, behavior:'instant'});
  if (pageId !== 'seriesDetail') previousPage = pageId;

  if (pageId === 'live') renderLiveGrid();
  else if (pageId === 'movies') renderMoviesGrid();
  else if (pageId === 'series') renderSeriesGrid();
  else if (pageId === 'favorites') renderFavorites();
};
window.goHome = function(){ showPage('home'); };

// ==================== Data fetching ====================
window.__startApp = function(accts){
  accounts = accts || [];
  if (accounts.length === 0){
    document.getElementById('loader').innerHTML =
      '<div style="color:#ef4444;text-align:center;padding:20px;font-weight:700;">تعذر تحميل بيانات الحسابات.<br>تأكد من إعدادات Firebase.</div>';
    return;
  }
  loadAll();
};

function fetchJSON(url){
  return fetch(proxify(url)).then(r => r.json()).catch(() => null);
}

function loadAll(){
  let done = 0;
  const finish = () => { done++; if (done >= 3) finishLoading(); };

  Promise.all(accounts.map(acc =>
    fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_live_streams`)
      .then(data => Array.isArray(data) ? data.map(x => ({...x, __acc: acc})) : [])
  )).then(results => { allChannels = dedupe(results.flat()); finish(); });

  Promise.all(accounts.map(acc =>
    fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_vod_streams`)
      .then(data => Array.isArray(data) ? data.map(x => ({...x, __acc: acc})) : [])
  )).then(results => { allMovies = dedupe(results.flat()); finish(); });

  Promise.all(accounts.map(acc =>
    fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_series`)
      .then(data => Array.isArray(data) ? data.map(x => ({...x, __acc: acc})) : [])
  )).then(results => { allSeries = dedupe(results.flat()); finish(); });

  // categories (non-blocking)
  Promise.all(accounts.map(acc => fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_live_categories`)))
    .then(rs => { liveCats = mergeCats(rs); buildPills('liveFilters', liveCats, 'live'); });
  Promise.all(accounts.map(acc => fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_vod_categories`)))
    .then(rs => { movieCats = mergeCats(rs); buildPills('moviesFilters', movieCats, 'movie'); });
  Promise.all(accounts.map(acc => fetchJSON(`${acc.host}/player_api.php?username=${acc.user}&password=${acc.pass}&action=get_series_categories`)))
    .then(rs => { seriesCats = mergeCats(rs); buildPills('seriesFilters', seriesCats, 'series'); });

  setTimeout(() => { if (done < 3){ done = 3; finishLoading(); } }, 8000);
}

function mergeCats(results){
  const m = {};
  (results||[]).forEach(data => { if (Array.isArray(data)) data.forEach(c => { if (c.category_id) m[c.category_id] = c.category_name; }); });
  return m;
}

function dedupe(arr){
  const seen = new Set(); const out = [];
  arr.forEach(item => {
    const id = item.stream_id || item.series_id || item.num;
    const key = id ? id + '_' + item.__acc.host : Math.random();
    if (!seen.has(key)){ seen.add(key); out.push(item); }
  });
  return out;
}

function finishLoading(){
  document.getElementById('loader').style.opacity = '0';
  setTimeout(() => document.getElementById('loader').style.display = 'none', 500);
  buildHero();
  buildHomeRows();
}

// ==================== Hero ====================
function buildHero(){
  const pool = allMovies.slice(0, 8);
  const hero = document.getElementById('hero');
  const dots = document.getElementById('heroDots');
  if (pool.length === 0){ hero.innerHTML = ''; return; }

  hero.querySelectorAll('.hero-slide').forEach(s => s.remove());
  let slidesHtml = '', dotsHtml = '';
  pool.forEach((m, i) => {
    const img = m.stream_icon || m.cover || '';
    slidesHtml += `<div class="hero-slide ${i===0?'active':''}" data-i="${i}" style="background-image:url('${img}')"></div>`;
    dotsHtml += `<div class="hero-dot ${i===0?'active':''}" onclick="goHeroSlide(${i})"></div>`;
  });
  hero.insertAdjacentHTML('afterbegin', slidesHtml);
  dots.innerHTML = dotsHtml;

  renderHeroContent(pool[0]);
  if (heroTimer) clearInterval(heroTimer);
  heroTimer = setInterval(() => goHeroSlide((heroIndex+1) % pool.length), 6000);
}

window.goHeroSlide = function(i){
  const pool = allMovies.slice(0,8);
  document.querySelectorAll('.hero-slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.hero-dot').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.hero-slide')[i]?.classList.add('active');
  document.querySelectorAll('.hero-dot')[i]?.classList.add('active');
  heroIndex = i;
  if (pool[i]) renderHeroContent(pool[i]);
};

function renderHeroContent(m){
  const hero = document.getElementById('hero');
  hero.querySelectorAll('.hero-inner').forEach(el => el.remove());
  const title = m.name || 'فيلم مميز';
  const desc = m.plot || 'شاهد أحدث وأفضل الأفلام والمسلسلات بجودة عالية على AHMED TV';
  const url = `${m.__acc.host}/movie/${m.__acc.user}/${m.__acc.pass}/${m.stream_id}.${m.container_extension||'mp4'}`;
  const img = m.stream_icon || '';
  const html = `
    <div class="hero-inner">
      <div class="hero-kicker"><i class="fa-solid fa-star"></i> عرض مميز</div>
      <h1 class="hero-title">${escapeHtml(title)}</h1>
      <p class="hero-desc">${escapeHtml(desc)}</p>
      <div class="hero-actions">
        <button class="btn btn-play" onclick="playVod('${escapeAttr(url)}','${escapeAttr(title)}')"><i class="fa-solid fa-play"></i> تشغيل الآن</button>
        <button class="btn btn-ghost" onclick="toggleFav('${escapeAttr(url)}','${escapeAttr(title)}','${escapeAttr(img)}','movie')"><i class="fa-regular fa-heart"></i> أضف للقائمة</button>
      </div>
    </div>`;
  hero.insertAdjacentHTML('beforeend', html);
}

// ==================== Home rows ====================
function buildHomeRows(){
  const wrap = document.getElementById('homeRows');
  let html = '';

  html += rowSectionHTML('قنوات مباشرة', 'fa-tower-broadcast', 'live', allChannels.slice(0,14));
  html += rowSectionHTML('أحدث الأفلام', 'fa-film', 'movies', allMovies.slice(0,14));
  html += rowSectionHTML('أحدث المسلسلات', 'fa-video', 'series', allSeries.slice(0,14));

  wrap.innerHTML = html;
  lazyLoadImages();
}

function rowSectionHTML(title, icon, moreTarget, items){
  let cardsHtml = '';
  items.forEach(item => {
    if (moreTarget === 'live') cardsHtml += chanChipHTML(item);
    else cardsHtml += posterCardHTML(item, moreTarget === 'movies' ? 'movie' : 'series');
  });
  return `
    <div class="row-section">
      <div class="row-head">
        <div class="row-title"><i class="fa-solid ${icon}"></i> ${title}</div>
        <div class="row-more" onclick="showPage('${moreTarget}')">عرض الكل <i class="fa-solid fa-chevron-left" style="font-size:10px"></i></div>
      </div>
      <div class="row-scroll">${cardsHtml}</div>
    </div>`;
}

function chanChipHTML(ch){
  const img = ch.stream_icon || '';
  const name = ch.name || 'قناة';
  const url = `${ch.__acc.host}/live/${ch.__acc.user}/${ch.__acc.pass}/${ch.stream_id}.m3u8`;
  return `<div class="chan-card" onclick="playLive('${escapeAttr(url)}','${escapeAttr(name)}')">
    <div class="chan-live-badge">LIVE</div>
    <img src="${img}" loading="lazy" onerror="this.src='https://via.placeholder.com/60?text=TV'">
    <div class="name">${escapeHtml(name)}</div>
  </div>`;
}

function posterCardHTML(item, type){
  const isFav = favorites.some(f => f.url === itemUrl(item, type));
  const favIcon = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  if (type === 'live'){
    const img = item.stream_icon || '';
    const name = item.name || 'قناة';
    const url = itemUrl(item, type);
    return `<div class="poster-card" onclick="playLive('${escapeAttr(url)}','${escapeAttr(name)}')">
      <div class="poster-frame">
        <div class="poster-live">مباشر</div>
        <button class="poster-fav ${isFav?'active':''}" onclick="event.stopPropagation();toggleFav('${escapeAttr(url)}','${escapeAttr(name)}','${escapeAttr(img)}','live')"><i class="${favIcon}"></i></button>
        <img src="${img}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://via.placeholder.com/300x450?text=TV'">
        <div class="poster-play"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="poster-title">${escapeHtml(name)}</div>
    </div>`;
  }
  if (type === 'movie'){
    const img = item.stream_icon || '';
    const name = item.name || 'فيلم';
    const url = itemUrl(item, type);
    const rating = item.rating ? `<div class="poster-rating"><i class="fa-solid fa-star"></i> ${item.rating}</div>` : '';
    return `<div class="poster-card" onclick="playVod('${escapeAttr(url)}','${escapeAttr(name)}')">
      <div class="poster-frame">
        ${rating}
        <button class="poster-fav ${isFav?'active':''}" onclick="event.stopPropagation();toggleFav('${escapeAttr(url)}','${escapeAttr(name)}','${escapeAttr(img)}','movie')"><i class="${favIcon}"></i></button>
        <img src="${img}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://via.placeholder.com/300x450?text=Movie'">
        <div class="poster-play"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="poster-title">${escapeHtml(name)}</div>
    </div>`;
  }
  // series
  const img = item.cover || '';
  const name = item.name || 'مسلسل';
  const rating = item.rating ? `<div class="poster-rating"><i class="fa-solid fa-star"></i> ${item.rating}</div>` : '';
  return `<div class="poster-card" onclick="openSeriesDetail(${item.series_id},'${escapeAttr(name)}','${escapeAttr(item.__acc.host)}','${escapeAttr(item.__acc.user)}','${escapeAttr(item.__acc.pass)}')">
    <div class="poster-frame">
      ${rating}
      <button class="poster-fav ${isFav?'active':''}" onclick="event.stopPropagation();toggleFavSeries(${item.series_id},'${escapeAttr(name)}','${escapeAttr(img)}','${escapeAttr(item.__acc.host)}','${escapeAttr(item.__acc.user)}','${escapeAttr(item.__acc.pass)}')"><i class="${favIcon}"></i></button>
      <img src="${img}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://via.placeholder.com/300x450?text=Series'">
      <div class="poster-play"><i class="fa-solid fa-play"></i></div>
    </div>
    <div class="poster-title">${escapeHtml(name)}</div>
  </div>`;
}

function itemUrl(item, type){
  if (type === 'live') return `${item.__acc.host}/live/${item.__acc.user}/${item.__acc.pass}/${item.stream_id}.m3u8`;
  if (type === 'movie') return `${item.__acc.host}/movie/${item.__acc.user}/${item.__acc.pass}/${item.stream_id}.${item.container_extension||'mp4'}`;
  return String(item.series_id);
}

// ==================== Full grids (live / movies / series) ====================
function buildPills(containerId, cats, type){
  const el = document.getElementById(containerId);
  if (!el) return;
  let html = `<div class="pill active" data-cat="all" onclick="filterCat('${type}','all')">الكل</div>`;
  Object.keys(cats).forEach(id => {
    html += `<div class="pill" data-cat="${id}" onclick="filterCat('${type}','${id}')">${escapeHtml(cats[id])}</div>`;
  });
  el.innerHTML = html;
}

window.filterCat = function(type, catId){
  if (type === 'live'){ activeLiveCat = catId; renderLiveGrid(); updatePills('liveFilters', catId); }
  else if (type === 'movie'){ activeMovieCat = catId; renderMoviesGrid(); updatePills('moviesFilters', catId); }
  else if (type === 'series'){ activeSeriesCat = catId; renderSeriesGrid(); updatePills('seriesFilters', catId); }
};

function updatePills(containerId, catId){
  document.querySelectorAll(`#${containerId} .pill`).forEach(p => p.classList.toggle('active', p.dataset.cat === String(catId)));
}

function matchesCat(item, catId){
  if (catId === 'all') return true;
  return String(item.category_id) === String(catId);
}

function renderLiveGrid(){
  const data = allChannels.filter(c => matchesCat(c, activeLiveCat));
  const grid = document.getElementById('liveGrid');
  if (data.length === 0){ grid.innerHTML = emptyStateHTML('fa-tower-broadcast','لا توجد قنوات في هذا التصنيف'); return; }
  grid.innerHTML = data.map(ch => {
    const img = ch.stream_icon || '';
    const name = ch.name || 'قناة';
    const url = itemUrl(ch, 'live');
    return `<div class="chan-row" onclick="playLive('${escapeAttr(url)}','${escapeAttr(name)}')">
      <div class="logo"><img src="${img}" loading="lazy" onerror="this.src='https://via.placeholder.com/40?text=TV'"></div>
      <div class="meta"><div class="n">${escapeHtml(name)}</div><div class="l">بث مباشر</div></div>
      <div class="play"><i class="fa-solid fa-play"></i></div>
    </div>`;
  }).join('');
  lazyLoadImages();
}

function renderMoviesGrid(){
  const data = allMovies.filter(m => matchesCat(m, activeMovieCat));
  const grid = document.getElementById('moviesGrid');
  grid.innerHTML = data.length ? data.map(m => posterCardHTML(m,'movie')).join('') : emptyStateHTML('fa-film','لا توجد أفلام في هذا التصنيف');
  lazyLoadImages();
}

function renderSeriesGrid(){
  const data = allSeries.filter(s => matchesCat(s, activeSeriesCat));
  const grid = document.getElementById('seriesGrid');
  grid.innerHTML = data.length ? data.map(s => posterCardHTML(s,'series')).join('') : emptyStateHTML('fa-video','لا توجد مسلسلات في هذا التصنيف');
  lazyLoadImages();
}

function emptyStateHTML(icon, text){
  return `<div class="empty"><i class="fa-solid ${icon}"></i><p>${text}</p></div>`;
}

function lazyLoadImages(){
  document.querySelectorAll('.poster-frame img, .chan-card img, .chan-row .logo img').forEach(img => {
    if (img.complete) img.classList.add('loaded');
    else img.addEventListener('load', () => img.classList.add('loaded'));
  });
}

// ==================== Series detail ====================
window.openSeriesDetail = function(seriesId, name, host, user, pass){
  showPage('seriesDetail');
  document.querySelector('header.topbar').style.display = 'none';
  const content = document.getElementById('seriesDetailContent');
  content.innerHTML = `<div style="padding:130px 5vw;text-align:center;color:var(--text-mute);">
    <div class="reel" style="margin:0 auto 18px;"></div>جاري تحميل بيانات المسلسل...</div>`;

  fetchJSON(`${host}/player_api.php?username=${user}&password=${pass}&action=get_series_info&series_id=${seriesId}`)
    .then(data => {
      if (!data || !data.episodes){
        content.innerHTML = `<div style="padding:130px 5vw;text-align:center;color:var(--text-mute);">لا توجد حلقات متاحة</div>`;
        return;
      }
      const info = data.info || {};
      const img = info.cover || '';
      const plot = info.plot || '';
      const genre = info.genre || '';
      let html = `
        <div style="padding:80px 5vw 0;">
          <div class="icon-btn" style="margin-bottom:16px;" onclick="closeSeriesDetail()"><i class="fa-solid fa-arrow-right"></i></div>
          <div class="series-hero" style="background-image:url('${img}')">
            <div class="series-hero-content">
              <h2>${escapeHtml(name)}</h2>
              ${genre ? `<div class="genre-badge"><i class="fa-solid fa-tags"></i> ${escapeHtml(genre)}</div>` : ''}
            </div>
          </div>
          ${plot ? `<p class="series-plot">${escapeHtml(plot)}</p>` : ''}`;

      Object.keys(data.episodes).forEach(seasonNum => {
        const eps = data.episodes[seasonNum];
        if (!Array.isArray(eps)) return;
        html += `<div class="season-label">الموسم ${seasonNum}</div>`;
        eps.forEach(ep => {
          const epTitle = ep.title || ('الحلقة ' + ep.episode_num);
          const epUrl = `${host}/series/${user}/${pass}/${ep.id}.${ep.container_extension||'mp4'}`;
          html += `<div class="ep-row" onclick="playVod('${escapeAttr(epUrl)}','${escapeAttr(name + ' - ' + epTitle)}')">
            <div><div class="name">${escapeHtml(epTitle)}</div><div class="sub">انقر للتشغيل الفوري</div></div>
            <i class="fa-solid fa-play"></i>
          </div>`;
        });
      });
      html += `</div>`;
      content.innerHTML = html;
    })
    .catch(() => {
      content.innerHTML = `<div style="padding:130px 5vw;text-align:center;color:var(--text-mute);">فشل تحميل الحلقات</div>`;
    });
};

window.closeSeriesDetail = function(){
  document.querySelector('header.topbar').style.display = 'flex';
  showPage(previousPage || 'home');
};

// ==================== Favorites ====================
function saveFavs(){ localStorage.setItem('ahmedtv_favs', JSON.stringify(favorites)); }

window.toggleFav = function(url, title, img, type){
  const idx = favorites.findIndex(f => f.url === url);
  if (idx >= 0){ favorites.splice(idx,1); Toast('تم الإزالة من القائمة'); }
  else { favorites.push({url, title, img, type}); Toast('تم الإضافة إلى القائمة'); }
  saveFavs();
  refreshCurrentView();
};

window.toggleFavSeries = function(seriesId, title, img, host, user, pass){
  const url = String(seriesId);
  const idx = favorites.findIndex(f => f.url === url);
  if (idx >= 0){ favorites.splice(idx,1); Toast('تم الإزالة من القائمة'); }
  else { favorites.push({url, title, img, type:'series', host, user, pass, seriesId}); Toast('تم الإضافة إلى القائمة'); }
  saveFavs();
  refreshCurrentView();
};

function refreshCurrentView(){
  const active = document.querySelector('.page.active');
  if (!active) return;
  if (active.id === 'page-home'){ buildHomeRows(); }
  else if (active.id === 'page-live'){ renderLiveGrid(); }
  else if (active.id === 'page-movies'){ renderMoviesGrid(); }
  else if (active.id === 'page-series'){ renderSeriesGrid(); }
  else if (active.id === 'page-favorites'){ renderFavorites(); }
}

function renderFavorites(){
  const grid = document.getElementById('favoritesGrid');
  if (favorites.length === 0){ grid.innerHTML = emptyStateHTML('fa-heart','لا توجد عناصر في قائمتك بعد'); return; }
  grid.innerHTML = favorites.map(f => {
    const isFav = true;
    if (f.type === 'series'){
      return `<div class="poster-card" onclick="openSeriesDetail(${f.seriesId},'${escapeAttr(f.title)}','${escapeAttr(f.host)}','${escapeAttr(f.user)}','${escapeAttr(f.pass)}')">
        <div class="poster-frame">
          <button class="poster-fav active" onclick="event.stopPropagation();toggleFavSeries(${f.seriesId},'${escapeAttr(f.title)}','${escapeAttr(f.img)}','${escapeAttr(f.host)}','${escapeAttr(f.user)}','${escapeAttr(f.pass)}')"><i class="fa-solid fa-heart"></i></button>
          <img src="${f.img}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://via.placeholder.com/300x450?text=Series'">
          <div class="poster-play"><i class="fa-solid fa-play"></i></div>
        </div>
        <div class="poster-title">${escapeHtml(f.title)}</div>
      </div>`;
    }
    const playFn = f.type === 'live' ? 'playLive' : 'playVod';
    return `<div class="poster-card" onclick="${playFn}('${escapeAttr(f.url)}','${escapeAttr(f.title)}')">
      <div class="poster-frame">
        ${f.type==='live' ? '<div class="poster-live">مباشر</div>' : ''}
        <button class="poster-fav active" onclick="event.stopPropagation();toggleFav('${escapeAttr(f.url)}','${escapeAttr(f.title)}','${escapeAttr(f.img)}','${f.type}')"><i class="fa-solid fa-heart"></i></button>
        <img src="${f.img}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.src='https://via.placeholder.com/300x450?text=Media'">
        <div class="poster-play"><i class="fa-solid fa-play"></i></div>
      </div>
      <div class="poster-title">${escapeHtml(f.title)}</div>
    </div>`;
  }).join('');
  lazyLoadImages();
}

// ==================== Player ====================
let hlsInstance = null;

window.playLive = function(url, title){ openPlayer(url, title, true); };
window.playVod = function(url, title){ openPlayer(url, title, false); };

function openPlayer(url, title, isHls){
  document.getElementById('playerTitle').innerText = title;
  document.getElementById('playerModal').classList.add('active');
  const video = document.getElementById('videoEl');
  const playUrl = proxify(url);

  if (hlsInstance){ hlsInstance.destroy(); hlsInstance = null; }

  if (isHls && window.Hls && Hls.isSupported()){
    hlsInstance = new Hls();
    hlsInstance.loadSource(playUrl);
    hlsInstance.attachMedia(video);
    video.play().catch(()=>{});
  } else {
    video.src = playUrl;
    video.play().catch(()=>{});
  }
}

window.closePlayer = function(){
  const video = document.getElementById('videoEl');
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (hlsInstance){ hlsInstance.destroy(); hlsInstance = null; }
  document.getElementById('playerModal').classList.remove('active');
};

// ==================== Utils ====================
function escapeHtml(str){
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str){
  if (!str) return '';
  return String(str).replace(/'/g,"\\'").replace(/"/g,'&quot;');
}

function Toast(msg){
  const host = document.getElementById('toastHost');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
  host.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// scroll shadow on topbar
window.addEventListener('scroll', () => {
  document.getElementById('topbar').classList.toggle('scrolled', window.scrollY > 30);
});

// init
initThemeFromStorage();
buildThemeSwatches();
