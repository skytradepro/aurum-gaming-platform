/* Aurum — small progressive enhancements. Every page works without this file. */
(function () {
  'use strict';
  var doc = document;

  // ---- hero slider: arrows, dots, autoplay, pause on hover/focus -------------------------------
  doc.querySelectorAll('[data-slider]').forEach(function (slider) {
    var track = slider.querySelector('[data-track]');
    var slides = Array.prototype.slice.call(track.children);
    var dots = Array.prototype.slice.call(slider.querySelectorAll('[data-goto]'));
    if (slides.length < 2) return;
    var index = 0;
    var timer = null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function show(i, smooth) {
      index = (i + slides.length) % slides.length;
      // in right-to-left pages scrollLeft counts negative from the start edge
      var rtl = getComputedStyle(track).direction === 'rtl';
      var left = index * track.clientWidth * (rtl ? -1 : 1);
      track.scrollTo({ left: left, behavior: smooth === false ? 'auto' : 'smooth' });
      dots.forEach(function (d, k) { if (k === index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    }
    function next() { show(index + 1); }
    function start() { if (!reduce) { stop(); timer = setInterval(next, 6000); } }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    var prevBtn = slider.querySelector('[data-prev]');
    var nextBtn = slider.querySelector('[data-next]');
    if (prevBtn) prevBtn.addEventListener('click', function () { show(index - 1); start(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { show(index + 1); start(); });
    dots.forEach(function (d) { d.addEventListener('click', function () { show(Number(d.getAttribute('data-goto'))); start(); }); });
    // keep the dots in sync when the visitor swipes
    var settle = null;
    track.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () {
        var center = track.getBoundingClientRect().left + track.clientWidth / 2;
        var best = 0, bestDist = Infinity;
        slides.forEach(function (s, k) { var r = s.getBoundingClientRect(); var dist = Math.abs(r.left + r.width / 2 - center); if (dist < bestDist) { bestDist = dist; best = k; } });
        index = best;
        dots.forEach(function (d, k) { if (k === index) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      }, 120);
    }, { passive: true });
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
    slider.addEventListener('focusin', stop);
    slider.addEventListener('focusout', start);
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else start(); });
    start();
  });

  // ---- login / register dialogs -----------------------------------------------------------------
  function openDialog(name) {
    var dialog = doc.getElementById('dialog-' + name);
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    doc.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
    dialog.showModal();
    var first = dialog.querySelector('input:not([type=hidden]), select');
    if (first) first.focus();
    return true;
  }
  doc.addEventListener('click', function (event) {
    var opener = event.target.closest('[data-dialog]');
    if (opener && openDialog(opener.getAttribute('data-dialog'))) { event.preventDefault(); return; }
    var closer = event.target.closest('[data-close]');
    if (closer) { var d = closer.closest('dialog'); if (d) d.close(); return; }
    if (event.target.tagName === 'DIALOG') event.target.close(); // click on the backdrop
  });

  // ---- dropdowns: one open at a time, close on outside click / Escape ----------------------------
  var dropdowns = doc.querySelectorAll('[data-dropdown]');
  dropdowns.forEach(function (d) {
    d.addEventListener('toggle', function () { if (d.open) dropdowns.forEach(function (o) { if (o !== d) o.open = false; }); });
  });
  doc.addEventListener('click', function (event) {
    dropdowns.forEach(function (d) { if (d.open && !d.contains(event.target)) d.open = false; });
  });
  doc.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') dropdowns.forEach(function (d) { if (d.open) { d.open = false; var s = d.querySelector('summary'); if (s) s.focus(); } });
  });

  // ---- theme switch without a reload -----------------------------------------------------------
  doc.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      var root = doc.documentElement;
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      var secure = location.protocol === 'https:' ? '; Secure' : '';
      doc.cookie = 'aurum_theme=' + next + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
    });
  });

  // ---- selects that apply at once ----------------------------------------------------------------
  doc.querySelectorAll('select[data-autosubmit]').forEach(function (s) {
    s.addEventListener('change', function () { if (s.form) s.form.submit(); });
  });

  // ---- confirmation for important actions --------------------------------------------------------
  doc.addEventListener('submit', function (event) {
    var form = event.target;
    var submitter = event.submitter || form.querySelector('[data-confirm]');
    var message = submitter && submitter.getAttribute && submitter.getAttribute('data-confirm');
    if (message && !window.confirm(message)) { event.preventDefault(); return; }
    // one submission only (the server is idempotent anyway, this avoids double clicks)
    if (form.dataset.submitted === '1') { event.preventDefault(); return; }
    if (form.method && form.method.toLowerCase() === 'post') {
      form.dataset.submitted = '1';
      setTimeout(function () { form.dataset.submitted = ''; }, 8000);
    }
  });

  // ---- "Load more" games: append the next page in place ------------------------------------------
  doc.addEventListener('click', function (event) {
    var link = event.target.closest('[data-load-more]');
    if (!link) return;
    var grid = doc.getElementById(link.getAttribute('data-target'));
    if (!grid || !window.fetch) return;
    event.preventDefault();
    link.setAttribute('aria-busy', 'true');
    var url = new URL(link.href, location.href);
    url.searchParams.set('partial', '1');
    fetch(url.toString(), { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
      .then(function (text) {
        var tpl = doc.createElement('template');
        tpl.innerHTML = text;
        var meta = tpl.content.querySelector('template[data-meta]');
        if (meta) meta.remove();
        grid.appendChild(tpl.content);
        var box = link.parentNode;
        box.innerHTML = '';
        if (meta) box.appendChild(meta.content.cloneNode(true));
        history.replaceState(null, '', link.href);
      })
      .catch(function () { location.href = link.href; });
  });

  // ---- copy buttons ----------------------------------------------------------------------------
  doc.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-copy]');
    if (!btn || !navigator.clipboard) return;
    navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(function () {
      btn.classList.add('copied');
      var label = btn.querySelector('span');
      if (label) { var old = label.textContent; label.textContent = '✓'; setTimeout(function () { label.textContent = old; }, 1500); }
    });
  });

  // ---- print ----------------------------------------------------------------------------------
  doc.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
})();
