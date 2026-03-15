/**
 * 로드트립 루트 비교 지도
 * Leaflet.js + OpenStreetMap (API 키 불필요)
 */
(function () {
  'use strict';

  /* ── 동적 스타일 주입 ── */
  var styleEl = document.createElement('style');
  styleEl.textContent =
    '.stop-dist { color: #5b8cb5; font-size: 0.75em; font-weight: 600; }' +
    '.day-km { background: #1a73e8; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 0.78em; font-weight: 600; margin-left: 6px; vertical-align: middle; }';
  document.head.appendChild(styleEl);

  /* ── 색상/아이콘 설정 ── */
  const ROUTE_COLORS = {
    '1': '#e74c3c', '2': '#3498db', '3': '#2ecc71',
    '4': '#f1c40f', '5': '#9b59b6'
  };

  const GRADE_COLORS = {
    S: '#ff2d55', A: '#ff9500', B: '#007aff', C: '#8e8e93', stay: '#34c759'
  };

  function makeIcon(color, size) {
    return L.divIcon({
      className: 'custom-marker',
      html: '<div style="' +
        'background:' + color + ';' +
        'width:' + size + 'px;height:' + size + 'px;' +
        'border-radius:50%;border:2px solid #fff;' +
        'box-shadow:0 1px 4px rgba(0,0,0,.4);' +
        '"></div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function markerIcon(stop) {
    if (stop.type === 'start' || stop.type === 'end') return makeIcon('#1a1a2e', 14);
    if (stop.type === 'stay') return makeIcon(GRADE_COLORS.stay, 11);
    if (stop.grade === 'S') return makeIcon(GRADE_COLORS.S, 14);
    if (stop.grade === 'A') return makeIcon(GRADE_COLORS.A, 12);
    if (stop.grade === 'B') return makeIcon(GRADE_COLORS.B, 10);
    return makeIcon(GRADE_COLORS.C || '#aaa', 9);
  }

  /* ── 지도를 외부에서 접근 가능하게 노출 ── */
  // (탭 전환 시 invalidateSize 호출 용도)

  /* ── 지도 초기화 ── */
  var map = L.map('map', {
    center: [-31.5, 152.0],
    zoom: 7,
    scrollWheelZoom: true
  });

  window._routeMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  /* ── 데이터 로드 ── */
  var routeData = null;
  var layers = {};        // routeKey → { lines: [], markers: [] }
  var activeRoute = 'all';
  var activeDay = 'all';

  fetch('assets/data/route_data.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      routeData = data.routes;
      buildLayers();
      showAll();
      bindControls();
      normalizeScoreBars();
    });

  /* ── 레이어 구축 ── */
  function buildLayers() {
    Object.keys(routeData).forEach(function (key) {
      var route = routeData[key];
      var color = ROUTE_COLORS[key];
      var routeLayers = { lines: [], markers: [], dayLines: {}, dayMarkers: {} };

      route.days.forEach(function (day) {
        var coords = [];
        var dayMarkers = [];

        day.stops.forEach(function (stop, i) {
          var ll = [stop.lat, stop.lng];
          coords.push(ll);

          var popupHtml = '<strong>' + stop.name + '</strong>';
          if (stop.grade) popupHtml += ' <span style="color:' + (GRADE_COLORS[stop.grade] || '#888') + ';font-weight:bold">' + stop.grade + '등급</span>';
          if (stop.type === 'stay') popupHtml += ' 🏨';
          popupHtml += '<br><small>' + key + '조 Day ' + day.day + ' (' + day.date + ')</small>';

          var marker = L.marker(ll, { icon: markerIcon(stop) }).bindPopup(popupHtml);
          dayMarkers.push(marker);
        });

        // Day polyline
        if (coords.length > 1) {
          var line = L.polyline(coords, {
            color: color,
            weight: 3,
            opacity: 0.8,
            dashArray: day.day > 1 ? null : '8 4'
          });
          routeLayers.lines.push(line);
          routeLayers.dayLines[day.day] = line;
        }

        routeLayers.markers = routeLayers.markers.concat(dayMarkers);
        routeLayers.dayMarkers[day.day] = dayMarkers;
      });

      layers[key] = routeLayers;
    });
  }

  /* ── 표시 함수 ── */
  function clearMap() {
    Object.keys(layers).forEach(function (key) {
      layers[key].lines.forEach(function (l) { map.removeLayer(l); });
      layers[key].markers.forEach(function (m) { map.removeLayer(m); });
    });
  }

  function showAll() {
    clearMap();
    var bounds = [];
    Object.keys(layers).forEach(function (key) {
      layers[key].lines.forEach(function (l) {
        l.setStyle({ weight: 2.5, opacity: 0.6 });
        l.addTo(map);
        bounds = bounds.concat(l.getLatLngs());
      });
      // Only show S-grade markers in "all" view to avoid clutter
      layers[key].markers.forEach(function (m) {
        var ll = m.getLatLng();
        bounds.push(ll);
      });
    });
    // Show only S-grade + start markers in overview, deduplicate by coords
    var shownCoords = {};
    Object.keys(layers).forEach(function (key) {
      var route = routeData[key];
      route.days.forEach(function (day) {
        day.stops.forEach(function (stop, i) {
          if (stop.grade === 'S' || stop.type === 'start' || stop.type === 'end') {
            var coordKey = stop.lat.toFixed(3) + ',' + stop.lng.toFixed(3);
            if (!shownCoords[coordKey]) {
              var dayMarkers = layers[key].dayMarkers[day.day];
              if (dayMarkers && dayMarkers[i]) dayMarkers[i].addTo(map);
              shownCoords[coordKey] = true;
            }
          }
        });
      });
    });
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.05));
  }

  function showRoute(key) {
    clearMap();
    var bounds = [];
    layers[key].lines.forEach(function (l) {
      l.setStyle({ weight: 4, opacity: 0.9 });
      l.addTo(map);
      bounds = bounds.concat(l.getLatLngs());
    });
    layers[key].markers.forEach(function (m) {
      m.addTo(map);
      bounds.push(m.getLatLng());
    });
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.08));
  }

  function showRouteDay(key, dayNum) {
    clearMap();
    var line = layers[key].dayLines[dayNum];
    var markers = layers[key].dayMarkers[dayNum];
    var bounds = [];
    if (line) {
      line.setStyle({ weight: 5, opacity: 1.0 });
      line.addTo(map);
      bounds = bounds.concat(line.getLatLngs());
    }
    if (markers) {
      markers.forEach(function (m) {
        m.addTo(map);
        bounds.push(m.getLatLng());
      });
    }
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds).pad(0.15));
  }

  /* ── 정보 패널 ── */
  function updateInfoPanel(key) {
    var panel = document.getElementById('routeInfo');
    if (!key || key === 'all') {
      panel.innerHTML = '<p class="info-placeholder">루트를 선택하면 일별 경유지를 확인할 수 있습니다.</p>';
      return;
    }
    var route = routeData[key];
    var html = '<h3 style="color:' + ROUTE_COLORS[key] + '">' + route.name + '</h3>';
    html += '<div class="route-stats">';
    html += '<span>총 ' + route.total_km + 'km</span>';
    html += '<span>평가 ' + route.score + '점</span>';
    html += '</div>';
    html += '<div class="day-list">';
    route.days.forEach(function (day) {
      html += '<div class="day-item" data-day="' + day.day + '">';
      html += '<div class="day-header">Day ' + day.day + ' <small>(' + day.date + ')</small> — ' + day.label;
      if (day.day_km) html += ' <span class="day-km">' + day.day_km + 'km</span>';
      html += '</div>';
      html += '<div class="day-stops">';
      day.stops.forEach(function (stop, idx) {
        // 첫 번째 stop이 아니면 화살표와 거리 표시
        if (idx > 0) {
          var distText = (stop.distance_km && stop.distance_km > 0) ? stop.distance_km + 'km' : '';
          html += '<span class="stop-arrow">';
          if (distText) {
            html += '<span class="stop-dist">' + distText + '</span> ';
          }
          html += '\u2192</span>';
        }
        var badge = '';
        if (stop.grade) badge = '<span class="grade-badge grade-' + stop.grade + '">' + stop.grade + '</span> ';
        if (stop.type === 'stay') badge = '<span class="grade-badge stay-badge">숙박</span> ';
        if (stop.type === 'start' || stop.type === 'end') badge = '<span class="grade-badge start-badge">출발</span> ';
        var clickable = stop.grade ? ' stop-clickable" data-stop-name="' + stop.name : '';
        html += '<div class="stop-row' + clickable + '">' + badge + stop.name + '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    panel.innerHTML = html;

    // Click day items to zoom
    panel.querySelectorAll('.day-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var d = parseInt(this.getAttribute('data-day'));
        showRouteDay(key, d);
        // Highlight active day
        panel.querySelectorAll('.day-item').forEach(function (e) { e.classList.remove('active'); });
        this.classList.add('active');
        // Update day buttons
        var dayBtns = document.querySelectorAll('#dayButtons .day-btn');
        dayBtns.forEach(function (b) { b.classList.remove('active'); });
        var matchBtn = document.querySelector('#dayButtons .day-btn[data-day="' + d + '"]');
        if (matchBtn) matchBtn.classList.add('active');
      });
    });

    // 등급이 있는 stop 클릭 시 모달 오픈
    panel.querySelectorAll('.stop-row[data-stop-name]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var name = this.dataset.stopName;
        var place = findPlaceByName(name);
        if (place) openPlaceModal(place);
      });
    });
  }

  /* ── 일별 필터 버튼 ── */
  function buildDayButtons(key) {
    var container = document.getElementById('dayButtons');
    var wrapper = document.getElementById('dayFilter');
    if (!key || key === 'all') {
      wrapper.style.display = 'none';
      return;
    }
    wrapper.style.display = 'flex';
    var route = routeData[key];
    var html = '<button class="day-btn active" data-day="all">전체</button>';
    route.days.forEach(function (day) {
      html += '<button class="day-btn" data-day="' + day.day + '">Day ' + day.day + '</button>';
    });
    container.innerHTML = html;
    container.querySelectorAll('.day-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.day-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        var d = this.getAttribute('data-day');
        if (d === 'all') {
          showRoute(key);
        } else {
          showRouteDay(key, parseInt(d));
        }
      });
    });
  }

  /* ── 점수 바 정규화 (50점 이하 생략, 50~100 절대 스케일) ── */
  var SCORE_BASE = 50;
  var SCORE_MAX = 100;

  function normalizeScoreBars() {
    document.querySelectorAll('.score-item').forEach(function (el) {
      var key = el.getAttribute('data-route');
      var score = routeData[key].score;
      // 50점=0%, 100점=100%
      var pct = ((score - SCORE_BASE) / (SCORE_MAX - SCORE_BASE)) * 100;
      el.querySelector('.score-fill').style.width = Math.max(pct, 1) + '%';
    });
  }

  /* ── 컨트롤 바인딩 ── */
  function bindControls() {
    document.querySelectorAll('.route-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.route-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        var key = this.getAttribute('data-route');
        activeRoute = key;
        activeDay = 'all';
        if (key === 'all') {
          showAll();
          updateInfoPanel(null);
          buildDayButtons(null);
        } else {
          showRoute(key);
          updateInfoPanel(key);
          buildDayButtons(key);
        }
      });
    });

    // Score bar click
    document.querySelectorAll('.score-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = this.getAttribute('data-route');
        activeRoute = key;
        activeDay = 'all';
        document.querySelectorAll('.route-btn').forEach(function (b) { b.classList.remove('active'); });
        var matchBtn = document.querySelector('.route-btn[data-route="' + key + '"]');
        if (matchBtn) matchBtn.classList.add('active');
        showRoute(key);
        updateInfoPanel(key);
        buildDayButtons(key);
      });
    });
  }

  /* ── place_data.json 로드 + 모달 ── */
  var placeData = null;
  fetch('assets/data/place_data.json')
    .then(function (r) { return r.json(); })
    .then(function (d) { placeData = d; });

  var criteriaInfo = {
    scenery: { name: '경치/포토스팟', icon: '\uD83C\uDFDE' },
    uniqueness: { name: '유니크함', icon: '\u2728' },
    google_rating: { name: '구글 평점', icon: '\u2B50' },
    accessibility: { name: '접근성', icon: '\uD83D\uDE97' },
    review_count: { name: '리뷰 수', icon: '\uD83D\uDCAC' },
    value_for_money: { name: '가성비', icon: '\uD83D\uDCB0' },
    time_efficiency: { name: '시간효율', icon: '\u23F1' }
  };
  var criteriaOrder = ['scenery','uniqueness','google_rating','accessibility','review_count','value_for_money','time_efficiency'];

  function findPlaceByName(stopName) {
    if (!placeData) return null;
    var sn = stopName.replace(/[()（）]/g, ' ').trim();
    var best = null;
    var bestScore = 0;
    for (var id in placeData.places) {
      var p = placeData.places[id];
      var pn = p.name_ko.replace(/[()（）]/g, ' ').trim();
      // exact match
      if (pn === sn) return p;
      // substring match
      if (sn.indexOf(pn) >= 0 || pn.indexOf(sn) >= 0) return p;
      // word overlap: split by spaces and count matching words
      var sWords = sn.split(/\s+/);
      var pWords = pn.split(/\s+/);
      var overlap = 0;
      for (var i = 0; i < sWords.length; i++) {
        for (var j = 0; j < pWords.length; j++) {
          if (sWords[i].length >= 2 && sWords[i] === pWords[j]) overlap++;
        }
      }
      if (overlap > bestScore) {
        bestScore = overlap;
        best = p;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  function barColor(score) {
    if (score >= 9) return 'linear-gradient(90deg, #159957, #1ecf7a)';
    if (score >= 7) return 'linear-gradient(90deg, #1890ff, #69c0ff)';
    if (score >= 5) return 'linear-gradient(90deg, #faad14, #ffd666)';
    return 'linear-gradient(90deg, #ff4d4f, #ff7875)';
  }

  function openPlaceModal(place) {
    var p = place;
    var overlay = document.getElementById('placeModal');

    var html = '<h2 class="modal-title">' + p.name_ko + '</h2>';
    if (p.name && p.name !== p.name_ko) html += '<p class="modal-name-en">' + p.name + '</p>';
    if (p.google_maps_url) html += '<div class="modal-map-wrap"><a href="' + p.google_maps_url + '" target="_blank" class="modal-map-link">Google Maps\uC5D0\uC11C \uBCF4\uAE30</a></div>';

    html += '<div class="modal-meta">';
    html += '<span class="modal-grade grade-' + p.grade + '">' + p.grade + '\uB4F1\uAE09</span>';
    html += '<span><strong>' + p.average_score.toFixed(1) + '\uC810</strong></span>';
    html += '<span>\uD83D\uDCCD ' + p.region + '</span>';
    if (p.controversial) html += '<span class="modal-controversy">\u26A1 \uB17C\uC7C1 (\uD3B8\uCC28 ' + p.spread.toFixed(1) + ')</span>';
    html += '</div>';

    // 3인 점수 카드
    html += '<div class="modal-scorers">';
    var personas = placeData.personas;
    var labels = ['A','B','C'];
    var nums = ['\u2460','\u2461','\u2462'];
    for (var i = 0; i < 3; i++) {
      var s = labels[i];
      html += '<div class="scorer-card"><div class="scorer-label">' + nums[i] + ' ' + personas[s].name + '</div>';
      html += '<div class="scorer-score">' + p.scores[s].toFixed(1) + '</div>';
      html += '<div class="scorer-focus">' + personas[s].focus + '</div></div>';
    }
    html += '</div>';

    // 기준별 브레이크다운
    html += '<div class="modal-breakdown">';
    for (var j = 0; j < criteriaOrder.length; j++) {
      var key = criteriaOrder[j];
      var bd = p.breakdown[key];
      if (!bd) continue;
      var ci = criteriaInfo[key];
      var avgPct = (bd.avg / 10) * 100;
      var spread = Math.max(bd.A, bd.B, bd.C) - Math.min(bd.A, bd.B, bd.C);
      var criControv = spread >= 3;

      html += '<div class="breakdown-row' + (criControv ? ' breakdown-controversial' : '') + '">';
      html += '<div class="breakdown-header"><span class="breakdown-label">' + ci.icon + ' ' + ci.name;
      if (criControv) html += ' <span class="criterion-controversy">\u26A1\uD3B8\uCC28 ' + spread + '</span>';
      html += '</span><span class="breakdown-avg">' + bd.avg.toFixed(1) + '</span></div>';
      html += '<div class="breakdown-bar-wrap"><div class="breakdown-bar-track"><div class="breakdown-bar" style="width:' + avgPct + '%;background:' + barColor(bd.avg) + '"></div></div></div>';
      html += '<div class="breakdown-abc">';
      html += '<span class="abc-score abc-a">\u2460\uD6A8\uC728:' + bd.A + '</span>';
      html += '<span class="abc-score abc-b">\u2461\uAC10\uC131:' + bd.B + '</span>';
      html += '<span class="abc-score abc-c">\u2462\uD604\uC2E4:' + bd.C + '</span>';
      html += '</div>';
      html += '<details class="breakdown-reasons"><summary>\uD3C9\uAC00 \uADFC\uAC70</summary><div class="reason-list">';
      html += '<div class="reason-item"><strong>\u2460\uD6A8\uC728:</strong> ' + (bd.reasons.A || '-') + '</div>';
      html += '<div class="reason-item"><strong>\u2461\uAC10\uC131:</strong> ' + (bd.reasons.B || '-') + '</div>';
      html += '<div class="reason-item"><strong>\u2462\uD604\uC2E4:</strong> ' + (bd.reasons.C || '-') + '</div>';
      html += '</div></details></div>';
    }
    html += '</div>';

    overlay.querySelector('.modal-body').innerHTML = html;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // 모달 닫기 이벤트
  document.getElementById('placeModal').querySelector('.modal-close').addEventListener('click', function () {
    document.getElementById('placeModal').classList.remove('active');
    document.body.style.overflow = '';
  });
  document.getElementById('placeModal').addEventListener('click', function (e) {
    if (e.target === this) {
      this.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  /* ── 탭 전환 ── */
  document.querySelectorAll('.route-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.route-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('tab-' + this.dataset.tab).classList.add('active');
      if (this.dataset.tab === 'map') {
        setTimeout(function () { window._routeMap.invalidateSize(); }, 100);
      }
    });
  });

})();
