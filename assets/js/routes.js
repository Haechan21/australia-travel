/**
 * 로드트립 루트 비교 지도
 * Leaflet.js + OpenStreetMap (API 키 불필요)
 */
(function () {
  'use strict';

  /* ── 색상/아이콘 설정 ── */
  const ROUTE_COLORS = {
    A: '#e74c3c', B: '#2ecc71', C: '#3498db',
    D: '#f39c12', E: '#9b59b6'
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

  /* ── 지도 초기화 ── */
  var map = L.map('map', {
    center: [-31.5, 152.0],
    zoom: 7,
    scrollWheelZoom: true
  });

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
          popupHtml += '<br><small>' + key + '안 Day ' + day.day + ' (' + day.date + ')</small>';

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
      html += '<div class="day-header">Day ' + day.day + ' <small>(' + day.date + ')</small> — ' + day.label + '</div>';
      html += '<div class="day-stops">';
      day.stops.forEach(function (stop) {
        var badge = '';
        if (stop.grade) badge = '<span class="grade-badge grade-' + stop.grade + '">' + stop.grade + '</span> ';
        if (stop.type === 'stay') badge = '<span class="grade-badge stay-badge">숙박</span> ';
        if (stop.type === 'start' || stop.type === 'end') badge = '<span class="grade-badge start-badge">출발</span> ';
        html += '<div class="stop-row">' + badge + stop.name + '</div>';
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

})();
