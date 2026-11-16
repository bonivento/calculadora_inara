/* Shell de la app: CI.util y CI.app. Se carga PRIMERO; no ejecuta nada hasta CI.app.start(). */
(function (w) {
  'use strict';
  var CI = (w.CI = w.CI || {});
  CI.ui = CI.ui || {};

  /* ---------- util ---------- */
  var nfCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, minimumFractionDigits: 0 });

  function isNum(n) { return typeof n === 'number' && isFinite(n); }

  var util = {
    fmtCOP: function (n) {
      n = Number(n);
      if (!isNum(n)) n = 0;
      // Intl en es-CO da "$ 12.500"; se normaliza a "$12.500"
      return nfCOP.format(Math.round(n)).replace(/\s| /g, '');
    },
    fmtNum: function (n, dec) {
      n = Number(n);
      if (!isNum(n)) n = 0;
      dec = dec == null ? 1 : dec;
      return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(n);
    },
    fmtPct: function (n, dec) {
      return util.fmtNum(n, dec == null ? 1 : dec) + '%';
    },
    uid: function () {
      var r = Math.random().toString(36).slice(2, 8);
      return Date.now().toString(36) + r;
    },
    escapeHtml: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    debounce: function (fn, ms) {
      var t;
      return function () {
        var self = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms == null ? 200 : ms);
      };
    },
    /* Mini-hyperscript: el('div', {class:'x', onclick:fn, dataset:{a:1}, style:{...}}, 'texto', otroEl, [..]) */
    el: function (tag, attrs) {
      var node = document.createElement(tag);
      var start = 2;
      if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { attrs = null; start = 1; }
      if (attrs) {
        Object.keys(attrs).forEach(function (k) {
          var v = attrs[k];
          if (v == null || v === false) return;
          if (k === 'class' || k === 'className') node.className = v;
          else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
          else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
          else if (k === 'html') node.innerHTML = v;
          else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
          else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') node[k] = v;
          else node.setAttribute(k, v === true ? '' : v);
        });
      }
      (function add(list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c == null || c === false) continue;
          if (Array.isArray(c)) add(c);
          else node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
        }
      })(Array.prototype.slice.call(arguments, start));
      return node;
    },
    /* Parseo tolerante: "1.234,5" -> 1234.5 ; "1234.5" -> 1234.5 ; "12.500" -> 12500 ; "$ 3,4%" -> 3.4 */
    num: function (v, def) {
      def = def == null ? 0 : def;
      if (typeof v === 'number') return isNum(v) ? v : def;
      if (v == null) return def;
      var s = String(v).trim().replace(/[^\d.,\-]/g, '');
      if (!s || s === '-' || s === '.' || s === ',') return def;
      var neg = s.charAt(0) === '-';
      s = s.replace(/-/g, '');
      var lastDot = s.lastIndexOf('.'), lastCom = s.lastIndexOf(',');
      if (lastDot >= 0 && lastCom >= 0) {
        if (lastCom > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
      } else if (lastCom >= 0) {
        if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, '');
        else s = s.replace(',', '.');
      } else if (lastDot >= 0) {
        var multi = (s.match(/\./g) || []).length > 1;
        if (multi || (/^[1-9]\d{0,2}\.\d{3}$/.test(s))) s = s.replace(/\./g, '');
      }
      var n = parseFloat(s);
      if (!isNum(n)) return def;
      return neg ? -n : n;
    },
    download: function (filename, text, mime) {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    },
    toast: function (msg, tipo) {
      var zone = document.getElementById('ci-toasts');
      if (!zone) return;
      tipo = tipo === 'error' ? 'error' : 'ok';
      var t = util.el('div', { class: 'ci-toast ci-toast-' + tipo, role: tipo === 'error' ? 'alert' : 'status' },
        util.el('span', { class: 'material-symbols-outlined', 'aria-hidden': 'true' }, tipo === 'error' ? 'error' : 'check_circle'),
        util.el('span', null, String(msg)));
      zone.appendChild(t);
      while (zone.children.length > 4) zone.removeChild(zone.firstChild);
      setTimeout(function () {
        t.classList.add('is-out');
        setTimeout(function () { t.remove(); }, 300);
      }, tipo === 'error' ? 6000 : 3500);
    },
    /* confirmDialog(msg | {mensaje, titulo, ok, cancelar, peligro}) -> Promise<boolean> */
    confirmDialog: function (opts) {
      if (typeof opts === 'string') opts = { mensaje: opts };
      opts = opts || {};
      return new Promise(function (resolve) {
        var dlg = document.getElementById('ci-confirm');
        if (!dlg || typeof dlg.showModal !== 'function') { resolve(false); return; }
        var ok = document.getElementById('ci-confirm-ok');
        document.getElementById('ci-confirm-title').textContent = opts.titulo || 'Confirmar';
        document.getElementById('ci-confirm-msg').textContent = opts.mensaje || '¿Seguro?';
        ok.textContent = opts.ok || 'Aceptar';
        document.getElementById('ci-confirm-cancel').textContent = opts.cancelar || 'Cancelar';
        ok.classList.toggle('ci-btn-danger', !!opts.peligro);
        var prev = document.activeElement;
        function done() {
          dlg.removeEventListener('close', done);
          if (prev && prev.focus) { try { prev.focus(); } catch (e) {} }
          resolve(dlg.returnValue === 'ok');
        }
        dlg.returnValue = 'cancel';
        dlg.addEventListener('close', done);
        dlg.showModal();
        document.getElementById('ci-confirm-cancel').focus();
      });
    }
  };
  CI.util = util;

  /* ---------- app ---------- */
  var VIEWS = ['calculadora', 'productos', 'insumos', 'ajustes'];
  var mounted = {};
  var current = null;
  var pending = null; // params de la próxima navegación

  function uiOf(name) { return CI.ui && CI.ui[name]; }

  function mount(name) {
    if (mounted[name]) return;
    var ui = uiOf(name), box = document.getElementById('view-' + name);
    if (!ui || !box || typeof ui.mount !== 'function') return;
    try { ui.mount(box); mounted[name] = true; }
    catch (e) { console.error('[CI] error montando ' + name, e); util.toast('No se pudo cargar la sección «' + name + '».', 'error'); }
  }

  function viewFromHash() {
    var h = (location.hash || '').replace(/^#/, '').split('?')[0];
    return VIEWS.indexOf(h) >= 0 ? h : null;
  }

  function show(name, params) {
    if (VIEWS.indexOf(name) < 0) name = 'calculadora';
    mount(name);
    var changed = current !== name;
    current = name;
    VIEWS.forEach(function (v) {
      var box = document.getElementById('view-' + v);
      if (box) box.hidden = v !== name;
    });
    document.querySelectorAll('[data-view].ci-tab, [data-view].ci-bn').forEach(function (a) {
      var on = a.getAttribute('data-view') === name;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var titles = { calculadora: 'Calculadora', productos: 'Mis productos', insumos: 'Insumos', ajustes: 'Ajustes' };
    document.title = titles[name] + ' — Calculadora Inara by Alma';
    CI.app.params = params || {};
    var ui = uiOf(name);
    if (ui) {
      try {
        if (typeof ui.onShow === 'function') ui.onShow(CI.app.params);
        if (name === 'calculadora' && params && params.recetaId && typeof ui.load === 'function') ui.load(params.recetaId);
      } catch (e) { console.error('[CI] error en ' + name, e); util.toast('Ocurrió un error al mostrar la sección.', 'error'); }
    } else if (!mounted[name]) {
      var box = document.getElementById('view-' + name);
      if (box && !box.firstChild) box.appendChild(util.el('p', { class: 'ci-muted' }, 'Esta sección aún no está disponible.'));
    }
    if (changed) window.scrollTo(0, 0);
  }

  function onHash() {
    var v = viewFromHash();
    if (!v) { show('calculadora', pending); pending = null; return; }
    var p = pending; pending = null;
    show(v, p);
  }

  CI.app = {
    params: {},
    views: VIEWS,
    current: function () { return current; },
    start: function () {
      if (CI.app._started) return;
      CI.app._started = true;
      document.querySelectorAll('[data-skip]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); var m = document.getElementById('ci-main'); if (m) m.focus(); });
      });
      VIEWS.forEach(mount);
      w.addEventListener('hashchange', onHash);
      // Si cambian datos, las vistas escuchan CI.store.on por su cuenta.
      onHash();
    },
    go: function (view, params) {
      if (VIEWS.indexOf(view) < 0) view = 'calculadora';
      pending = params || null;
      if (viewFromHash() === view) { var p = pending; pending = null; show(view, p); }
      else location.hash = '#' + view;
    }
  };
})(window);
