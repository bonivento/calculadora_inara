/* Mis productos (agente D) — CI.ui.productos.mount / onShow */
(function () {
  'use strict';
  window.CI = window.CI || {};
  CI.ui = CI.ui || {};

  var P = { root: null, listEl: null, countEl: null, q: '', tipo: 'todos', orden: 'recientes', mayorista: true, stale: false, mounted: false, rows: [] };

  function U() { return CI.util || {}; }
  function money(n) { return U().fmtCOP ? U().fmtCOP(n || 0) : '$' + Math.round(n || 0).toLocaleString('es-CO'); }
  function fpct(n) { return U().fmtPct ? U().fmtPct(n || 0, 1) : (Math.round((n || 0) * 10) / 10) + '%'; }
  function toast(m, t) { if (U().toast) U().toast(m, t || 'ok'); }
  function debounce(fn, ms) {
    if (U().debounce) return U().debounce(fn, ms);
    var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'value') e.value = v;
        else if (k === 'checked') e.checked = !!v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
    e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function icon(n) { return h('span', { class: 'material-symbols-outlined', 'aria-hidden': 'true' }, n); }

  var CSS = [
    '.prod-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:16px;margin-bottom:16px}',
    '.prod-bar .grow{flex:1 1 220px;min-width:0}',
    '.prod-bar .ci-input{width:100%;box-sizing:border-box}',
    '.prod-card0{background:#fff;border:1px solid rgba(201,199,185,.7);border-radius:8px;box-shadow:0 1px 8px rgba(30,32,25,.04)}',
    '.prod-chips{display:inline-flex;gap:6px;flex-wrap:wrap}',
    '.prod-chips button{padding:8px 14px;border:1px solid #c9c7b9;border-radius:999px;background:#fff;color:#48473d;font:500 11px/16px Montserrat,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}',
    '.prod-chips button[aria-pressed=true]{background:#5d5e38;border-color:#5d5e38;color:#fff}',
    '.prod-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}',
    '.prod-chk{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:#48473d}',
    '.prod-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}',
    '.prod-card{padding:16px;display:flex;flex-direction:column;gap:12px}',
    '.prod-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}',
    '.prod-name{font-family:"Playfair Display",Georgia,serif;font-size:20px;line-height:26px;margin:0;color:#1a1c15;overflow-wrap:anywhere}',
    '.prod-sub{font-size:13px;color:#79776c}',
    '.prod-tipo{display:inline-flex;gap:4px;align-items:center;padding:2px 10px;border-radius:999px;background:#eeefe3;color:#5d5e38;font:600 10px/16px Montserrat,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}',
    '.prod-tipo .material-symbols-outlined{font-size:14px}',
    '.prod-nums{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.prod-num{background:#f4f4e9;border-radius:8px;padding:8px 10px}',
    '.prod-num span{display:block;font:500 10px/14px Montserrat,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#725b27}',
    '.prod-num b{font-size:17px;line-height:24px;color:#1a1c15}',
    '.prod-num.hi{background:#5d5e38}.prod-num.hi span,.prod-num.hi b{color:#fff}',
    '.prod-m{display:inline-block;padding:2px 8px;border-radius:999px;font:600 11px/16px Montserrat,system-ui,sans-serif}',
    '.prod-m.ok{background:#dcebc8;color:#2f4a16}.prod-m.bajo{background:#fcdc9b;color:#5b4410}.prod-m.perdida{background:#ffdad6;color:#93000a}',
    '.prod-act{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}',
    '.prod-warn{font-size:12px;color:#93000a;display:flex;gap:4px;align-items:center}',
    '.prod-warn .material-symbols-outlined{font-size:16px}',
    '.prod-empty{padding:32px 16px;text-align:center;color:#48473d;display:flex;flex-direction:column;gap:12px;align-items:center}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('prod-style')) return;
    var s = document.createElement('style'); s.id = 'prod-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ---------- datos ---------- */
  function compute() {
    var by = CI.store.insumosById(), st = CI.store.getSettings();
    return (CI.store.listRecetas() || []).map(function (r) {
      var res;
      try { res = CI.calc.calcular(r, by, st); } catch (e) { res = { ok: false, advertencias: [] }; }
      var c = res.costos || {}, p = res.precio || {}, d = p.detal || {}, m = p.mayorista || {};
      var errs = (res.advertencias || []).filter(function (w) { return w.nivel === 'error'; }).length;
      return {
        r: r, res: res, costo: c.totalUnidad || 0, detal: d.final || 0, mayor: m.final || 0,
        margen: d.margenRealPct, utilidad: d.utilidadUnidad || 0, errs: errs
      };
    });
  }
  function margenClass(m) { return m == null ? 'bajo' : (m < 0 ? 'perdida' : (m < 25 ? 'bajo' : 'ok')); }

  function visibleRows() {
    var q = norm(P.q.trim());
    var rows = P.rows.filter(function (x) {
      if (P.tipo !== 'todos' && x.r.tipo !== P.tipo) return false;
      if (!q) return true;
      return norm(x.r.nombre + ' ' + (x.r.formato || '') + ' ' + (x.r.notas || '')).indexOf(q) >= 0;
    });
    var cmp = {
      recientes: function (a, b) { return String(b.r.actualizado || '').localeCompare(String(a.r.actualizado || '')); },
      nombre: function (a, b) { return String(a.r.nombre).localeCompare(String(b.r.nombre), 'es'); },
      costo: function (a, b) { return b.costo - a.costo; },
      precio: function (a, b) { return b.detal - a.detal; },
      margen: function (a, b) { return (b.margen || -1e9) - (a.margen || -1e9); }
    }[P.orden] || null;
    if (cmp) rows.sort(cmp);
    return rows;
  }

  /* ---------- render ---------- */
  function renderList() {
    P.stale = false;
    P.rows = compute();
    var rows = visibleRows(), el = P.listEl;
    el.textContent = '';
    P.countEl.textContent = rows.length + (rows.length === 1 ? ' producto' : ' productos') + (rows.length !== P.rows.length ? ' de ' + P.rows.length : '');
    if (!rows.length) {
      el.appendChild(h('div', { class: 'prod-card0 prod-empty' },
        icon('inventory_2'),
        h('div', null, P.rows.length ? 'Ningún producto coincide con la búsqueda.' : 'Aún no has guardado productos. Calcula el costo de tu primera vela o jabón y guárdalo aquí.'),
        P.rows.length ? null : h('button', { type: 'button', class: 'ci-btn ci-btn-primary', onclick: function () { CI.app.go('calculadora'); } }, icon('calculate'), ' Ir a la calculadora')));
      return;
    }
    var grid = h('div', { class: 'prod-grid' });
    rows.forEach(function (x) { grid.appendChild(card(x)); });
    el.appendChild(grid);
  }

  function card(x) {
    var r = x.r, jab = r.tipo === 'jabon';
    var un = r.unidadesPorLote || 1;
    return h('article', { class: 'prod-card0 prod-card' },
      h('div', { class: 'prod-top' },
        h('div', null, h('h3', { class: 'prod-name' }, r.nombre || '(sin nombre)'),
          h('div', { class: 'prod-sub' }, (r.formato ? r.formato + ' · ' : '') + un + (jab ? ' barras' : ' unid.') + ' por lote')),
        h('span', { class: 'prod-tipo' }, icon(jab ? 'soap' : 'local_fire_department'), jab ? 'Jabón' : 'Vela')),
      h('div', { class: 'prod-nums' },
        num('Costo unidad', money(x.costo)),
        num('Precio detal', money(x.detal), true),
        num('Mayorista', money(x.mayor)),
        h('div', { class: 'prod-num' }, h('span', null, 'Margen detal'),
          h('b', null, x.margen == null ? '—' : fpct(x.margen)), ' ',
          h('span', { class: 'prod-m ' + margenClass(x.margen), style: 'display:inline-block;margin-left:4px;letter-spacing:0;text-transform:none' }, money(x.utilidad) + ' / u'))),
      r.precioActual ? h('div', { class: 'prod-sub' }, 'Vendes hoy a ' + money(r.precioActual) + (x.detal ? ' (sugerido ' + money(x.detal) + ')' : '')) : null,
      x.errs ? h('div', { class: 'prod-warn' }, icon('error'), x.errs + (x.errs === 1 ? ' problema por revisar' : ' problemas por revisar')) : null,
      h('div', { class: 'prod-act' },
        h('button', { type: 'button', class: 'ci-btn ci-btn-primary', onclick: function () { CI.app.go('calculadora', { recetaId: r.id }); } }, icon('edit'), ' Editar'),
        h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: function () { dup(r); } }, icon('content_copy'), ' Duplicar'),
        h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', 'aria-label': 'Eliminar ' + (r.nombre || 'receta'), onclick: function () { del(r); } }, icon('delete'), ' Eliminar')));
  }
  function num(l, v, hi) { return h('div', { class: 'prod-num' + (hi ? ' hi' : '') }, h('span', null, l), h('b', null, v)); }

  function dup(r) {
    var n;
    try { n = CI.store.duplicateReceta(r.id); } catch (e) { toast('No se pudo duplicar', 'error'); return; }
    toast('Receta duplicada' + (n && n.nombre ? ': ' + n.nombre : ''));
  }
  function del(r) {
    var ask = U().confirmDialog ? U().confirmDialog('¿Eliminar «' + (r.nombre || 'esta receta') + '»? No se puede deshacer.') : Promise.resolve(true);
    ask.then(function (ok) {
      if (!ok) return;
      CI.store.deleteReceta(r.id);
      toast('Receta eliminada');
    });
  }

  /* ---------- exportar ---------- */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCsv() {
    var rows = visibleRows();
    if (!rows.length) { toast('No hay productos para exportar', 'error'); return; }
    var head = ['Nombre', 'Tipo', 'Formato', 'Unidades por lote', 'Costo unidad', 'Precio detal', 'Precio mayorista', 'Utilidad detal', 'Margen detal %', 'Precio actual'];
    var lines = [head.join(';')];
    rows.forEach(function (x) {
      lines.push([x.r.nombre, x.r.tipo === 'jabon' ? 'Jabón' : 'Vela', x.r.formato || '', x.r.unidadesPorLote || 1,
        Math.round(x.costo), Math.round(x.detal), Math.round(x.mayor), Math.round(x.utilidad),
        x.margen == null ? '' : (Math.round(x.margen * 10) / 10).toString().replace('.', ','), x.r.precioActual != null ? x.r.precioActual : ''].map(csvCell).join(';'));
    });
    var name = 'lista-precios-' + new Date().toISOString().slice(0, 10) + '.csv';
    var text = '﻿' + lines.join('\r\n');
    if (U().download) U().download(name, text, 'text/csv;charset=utf-8');
    toast('CSV exportado');
  }

  function whatsappText() {
    var rows = visibleRows(), st = CI.store.getSettings();
    var out = ['*' + (st.nombreNegocio || 'Lista de precios') + '* — Lista de precios', ''];
    [['vela', 'Velas'], ['jabon', 'Jabones']].forEach(function (g) {
      var list = rows.filter(function (x) { return x.r.tipo === g[0]; }).sort(function (a, b) { return String(a.r.nombre).localeCompare(String(b.r.nombre), 'es'); });
      if (!list.length) return;
      out.push('*' + g[1] + '*');
      list.forEach(function (x) {
        out.push('• ' + x.r.nombre + (x.r.formato ? ' (' + x.r.formato + ')' : '') + ': ' + money(x.detal) + (P.mayorista ? ' | Mayorista: ' + money(x.mayor) : ''));
      });
      out.push('');
    });
    return out.join('\n').trim();
  }
  function copyWhatsapp() {
    if (!visibleRows().length) { toast('No hay productos para copiar', 'error'); return; }
    var t = whatsappText();
    function fallback() {
      var ta = h('textarea', { style: 'position:fixed;opacity:0;left:-9999px', 'aria-hidden': 'true' }); ta.value = t;
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Lista copiada. Pégala en WhatsApp' : 'No se pudo copiar', ok ? 'ok' : 'error');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('Lista copiada. Pégala en WhatsApp'); }, fallback);
    } else fallback();
  }

  /* ---------- montaje ---------- */
  function chip(val, label) {
    var b = h('button', { type: 'button', 'aria-pressed': P.tipo === val ? 'true' : 'false', onclick: function () {
      P.tipo = val;
      Array.prototype.forEach.call(b.parentNode.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      renderList();
    } }, label);
    return b;
  }

  function isVisible() { return P.root && P.root.offsetParent !== null; }

  CI.ui.productos = {
    mount: function (el) {
      injectStyle();
      P.root = el; el.textContent = '';
      var search = h('input', { type: 'search', class: 'ci-input', id: 'prod-q', placeholder: 'Nombre, formato...', autocomplete: 'off' });
      search.addEventListener('input', debounce(function () { P.q = search.value; renderList(); }, 150));
      var sort = h('select', { class: 'ci-input select-botanic', id: 'prod-sort' },
        h('option', { value: 'recientes' }, 'Más recientes'), h('option', { value: 'nombre' }, 'Nombre (A–Z)'),
        h('option', { value: 'costo' }, 'Mayor costo'), h('option', { value: 'precio' }, 'Mayor precio detal'),
        h('option', { value: 'margen' }, 'Mayor margen'));
      sort.value = P.orden;
      sort.addEventListener('change', function () { P.orden = sort.value; renderList(); });
      var chk = h('input', { type: 'checkbox', checked: P.mayorista });
      chk.addEventListener('change', function () { P.mayorista = chk.checked; });
      P.countEl = h('span', { class: 'prod-sub', 'aria-live': 'polite' });
      P.listEl = h('div');

      el.appendChild(h('div', { class: 'prod-card0 prod-bar' },
        h('div', { class: 'grow' }, h('label', { class: 'ci-label', for: 'prod-q' }, 'Buscar'), search),
        h('div', null, h('span', { class: 'ci-label', style: 'display:block' }, 'Tipo'),
          h('div', { class: 'prod-chips', role: 'group', 'aria-label': 'Filtrar por tipo' }, chip('todos', 'Todos'), chip('vela', 'Velas'), chip('jabon', 'Jabones'))),
        h('div', null, h('label', { class: 'ci-label', for: 'prod-sort', style: 'display:block' }, 'Ordenar'), sort)));

      el.appendChild(h('div', { class: 'prod-tools' },
        h('button', { type: 'button', class: 'ci-btn ci-btn-primary', onclick: function () {
          var c = CI.ui.calculadora; var p = c && c.nueva ? c.nueva('vela') : Promise.resolve(true);
          p.then(function (ok) { if (ok) CI.app.go('calculadora'); });
        } }, icon('add'), ' Nueva receta'),
        h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: exportCsv }, icon('download'), ' Exportar CSV'),
        h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: copyWhatsapp }, icon('chat'), ' Copiar lista para WhatsApp'),
        h('label', { class: 'prod-chk' }, chk, 'Incluir mayorista'),
        h('span', { style: 'flex:1' }), P.countEl));
      el.appendChild(P.listEl);

      P.mounted = true;
      renderList();
      if (CI.store.on) CI.store.on(function () { if (isVisible()) renderList(); else P.stale = true; });
    },
    onShow: function () { if (P.mounted) renderList(); }
  };
})();
