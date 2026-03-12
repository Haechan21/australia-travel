document.addEventListener("DOMContentLoaded", function () {
  var data = window.__PLACE_DATA__;
  if (!data) return;

  // Create modal
  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML =
    '<div class="modal-content">' +
    '<button class="modal-close">&times;</button>' +
    '<div class="modal-body"></div>' +
    "</div>";
  document.body.appendChild(overlay);

  var body = overlay.querySelector(".modal-body");
  var closeBtn = overlay.querySelector(".modal-close");

  function close() {
    overlay.classList.remove("active");
  }
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") close();
  });

  // Criteria display names
  var criteria = {
    scenery: { name: "경치/포토스팟", weight: "20%" },
    uniqueness: { name: "유니크함", weight: "20%" },
    google_rating: { name: "구글 평점", weight: "15%" },
    accessibility: { name: "접근성", weight: "15%" },
    review_count: { name: "리뷰 수", weight: "10%" },
    value_for_money: { name: "가성비", weight: "10%" },
    time_efficiency: { name: "시간효율", weight: "10%" },
  };

  function fmt(n) {
    return typeof n === "number" ? n.toFixed(1) : n;
  }

  function barColor(score) {
    if (score >= 9) return "linear-gradient(90deg, #159957, #1ecf7a)";
    if (score >= 7) return "linear-gradient(90deg, #1890ff, #69c0ff)";
    if (score >= 5) return "linear-gradient(90deg, #faad14, #ffd666)";
    return "linear-gradient(90deg, #ff4d4f, #ff7875)";
  }

  function pickShortestReason(reason) {
    if (!reason) return "";
    if (reason.indexOf("[A]") === -1 && reason.indexOf("[B]") === -1)
      return reason.trim();
    var parts = reason.split("|").map(function (p) {
      return p
        .trim()
        .replace(/^\[[ABC]\]\s*/, "")
        .trim();
    });
    return parts.reduce(function (a, b) {
      return a.length <= b.length ? a : b;
    });
  }

  function openModal(id) {
    var p = data[id];
    if (!p) return;

    var st = p.scorer_totals;
    var mapLink = p.google_maps_url
      ? '<a href="' +
        p.google_maps_url +
        '" target="_blank" class="modal-map-link">↗ Google Maps에서 보기</a>'
      : "";

    var html =
      '<h2 class="modal-title">' +
      p.name_ko +
      "</h2>" +
      (mapLink ? '<div class="modal-map-wrap">' + mapLink + '</div>' : '') +
      '<div class="modal-meta">' +
      '<span class="modal-grade grade-' +
      p.grade +
      '">' +
      p.grade +
      "등급</span>" +
      "<span><strong>" +
      fmt(p.total_score) +
      "점</strong></span>" +
      '<span><strong>📍 ' +
      p.region +
      "</strong></span>" +
      "</div>" +
      '<div class="modal-scorers">' +
      '<span class="scorer">평가자 A ' + fmt(st.A) + '</span>' +
      '<span class="scorer">평가자 B ' + fmt(st.B) + '</span>' +
      '<span class="scorer">평가자 C ' + fmt(st.C) + '</span>' +
      "</div>";

    // Bar chart style breakdown
    html += '<div class="modal-breakdown">';
    var keys = [
      "scenery",
      "uniqueness",
      "google_rating",
      "accessibility",
      "review_count",
      "value_for_money",
      "time_efficiency",
    ];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var item = p.breakdown[key];
      if (!item) continue;
      var c = criteria[key];
      var abc = item.scores_abc || [0, 0, 0];
      var reason = pickShortestReason(item.reason || "");
      var pct = (item.score / 10) * 100;

      html +=
        '<div class="breakdown-row">' +
        '<div class="breakdown-label">' +
        c.name +
        ' <span class="breakdown-weight">' +
        c.weight +
        "</span></div>" +
        '<div class="breakdown-bar-wrap">' +
        '<div class="breakdown-bar-track">' +
        '<div class="breakdown-bar" style="width:' +
        pct +
        "%;background:" +
        barColor(item.score) +
        '"></div>' +
        '</div>' +
        '<span class="breakdown-score">' +
        fmt(item.score) +
        "</span>" +
        "</div>" +
        '<div class="breakdown-reason">' +
        reason +
        "</div>" +
        "</div>";
    }
    html += "</div>";

    body.innerHTML = html;
    overlay.classList.add("active");
  }

  // Attach click handlers to table rows with data-place-id
  var rows = document.querySelectorAll("tr[data-place-id]");
  for (var i = 0; i < rows.length; i++) {
    rows[i].style.cursor = "pointer";
    rows[i].addEventListener("click", function () {
      openModal(this.getAttribute("data-place-id"));
    });
  }
});
