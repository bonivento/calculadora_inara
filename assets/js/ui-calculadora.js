/* Calculadora (agente D) — CI.ui.calculadora.mount / onShow / load(recetaId) / nueva(tipo)
   Formulario por secciones + panel de resultado en vivo. Solo el panel se reconstruye al escribir. */
(function () {
  'use strict';
  window.CI = window.CI || {};
  CI.ui = CI.ui || {};

  var S = {
    root: null, formEl: null, panelEl: null, barEl: null, headEl: null,
    rec: null, dirty: false, open: {}, stale: false, res: null, mounted: false
  };

  /* ---------- utilidades locales ---------- */
  function U() { return CI.util || {}; }
  function money(n) { return U().fmtCOP ? U().fmtCOP(n || 0) : '$' + Math.round(n || 0).toLocaleString('es-CO'); }
  function fnum(n, d) {
    if (U().fmtNum) return U().fmtNum(n || 0, d == null ? 1 : d);
    return (n || 0).toLocaleString('es-CO', { maximumFractionDigits: d == null ? 1 : d });
  }
  function fpct(n, d) {
    if (U().fmtPct) return U().fmtPct(n || 0, d == null ? 1 : d);
    return fnum(n, d) + '%';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return U().uid ? U().uid() : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(m, t) { if (U().toast) U().toast(m, t || 'ok'); }
  function debounce(fn, ms) {
    if (U().debounce) return U().debounce(fn, ms);
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }
  function confirmDialog(msg) {
    if (U().confirmDialog) return U().confirmDialog(msg);
    return Promise.resolve(true);
  }

  /* número tolerante: "1.234,5" -> 1234.5 ; "0.183" -> 0.183 ; vacío/inválido -> null */
  function parseNum(s) {
    s = String(s == null ? '' : s).trim().replace(/\s|\$/g, '');
    if (!s) return null;
    var hasC = s.indexOf(',') >= 0, hasD = s.indexOf('.') >= 0;
    if (hasC && hasD) s = s.replace(/\./g, '').replace(',', '.');
    else if (hasC) s = s.replace(',', '.');
    else if (hasD && s.split('.').length > 2) s = s.replace(/\./g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function fmtIn(v) { return v == null || v === '' || !isFinite(v) ? '' : String(Math.round(v * 10000) / 10000); }

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

  function unitCost(ins) {
    if (CI.calc && CI.calc.costoUnitarioInsumo) { try { return CI.calc.costoUnitarioInsumo(ins) || 0; } catch (e) { /* sigue */ } }
    return ins && ins.cantidadCompra ? ins.precioCompra / ins.cantidadCompra : 0;
  }
  function fmtUnitCost(ins) {
    var c = unitCost(ins);
    return '$' + c.toLocaleString('es-CO', { maximumFractionDigits: c < 10 ? 2 : 0 }) + '/' + (ins.unidad || 'un');
  }
  function byId() { return CI.store.insumosById ? CI.store.insumosById() : {}; }
  function settings() { return CI.store.getSettings ? CI.store.getSettings() : {}; }

  /* ---------- estilos ---------- */
  var CSS = [
    '.cal-wrap{display:grid;gap:24px;grid-template-columns:minmax(0,1fr);padding-bottom:96px}',
    '@media(min-width:1024px){.cal-wrap{grid-template-columns:minmax(0,1fr) 400px;align-items:start;padding-bottom:0}}',
    '.cal-main{display:flex;flex-direction:column;gap:16px;min-width:0}',
    '.cal-card{background:#fff;border:1px solid rgba(201,199,185,.7);border-radius:8px;box-shadow:0 1px 8px rgba(30,32,25,.04)}',
    '.cal-head{padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}',
    '.cal-head h2{font-family:"Playfair Display",Georgia,serif;font-size:22px;line-height:30px;margin:0;color:#1a1c15}',
    '.cal-seg{display:inline-flex;border:1px solid #c9c7b9;border-radius:8px;overflow:hidden}',
    '.cal-seg button{padding:8px 16px;font:500 11px/16px Montserrat,system-ui,sans-serif;letter-spacing:.15em;text-transform:uppercase;background:#fff;color:#48473d;border:0;cursor:pointer;display:inline-flex;gap:6px;align-items:center}',
    '.cal-seg button[aria-pressed=true]{background:#5d5e38;color:#fff}',
    '.cal-actions{display:flex;flex-wrap:wrap;gap:8px}',
    '.cal-chip-dirty{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fcdc9b;color:#5b4410;font:600 10px/14px Montserrat,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;vertical-align:middle}',
    '.cal-sec{overflow:hidden}',
    '.cal-sec>summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;align-items:center;gap:10px;font:600 12px/16px Montserrat,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#5d5e38}',
    '.cal-sec>summary::-webkit-details-marker{display:none}',
    '.cal-sec>summary .cal-chev{margin-left:auto;transition:transform .2s}',
    '.cal-sec[open]>summary .cal-chev{transform:rotate(180deg)}',
    '.cal-sec[open]>summary{border-bottom:1px solid #eeefe3}',
    '.cal-body{padding:16px;display:grid;gap:14px}',
    '.cal-grid2{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '.cal-f{display:flex;flex-direction:column;gap:4px;min-width:0}',
    '.cal-f .ci-input,.cal-row .ci-input{width:100%;box-sizing:border-box}',
    '.cal-hint{font-size:12px;line-height:16px;color:#79776c}',
    '.cal-hint a{color:#725b27;text-decoration:underline;cursor:pointer;margin-left:6px}',
    '.cal-row{display:grid;grid-template-columns:minmax(0,1fr) 110px 36px;gap:8px;align-items:start;padding:10px;background:#f4f4e9;border-radius:8px}',
    '.cal-row .cal-q{display:flex;align-items:center;gap:4px}',
    '.cal-row .cal-q span{font-size:12px;color:#48473d;min-width:18px}',
    '.cal-row3{grid-template-columns:minmax(0,1fr) 120px auto 36px}',
    '.cal-row .cal-sel-wrap{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.cal-rm{width:36px;height:36px;border:0;background:transparent;color:#ba1a1a;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
    '.cal-rm:hover{background:rgba(186,26,26,.08)}',
    '.cal-chk{display:inline-flex;align-items:center;gap:6px;font-size:12px;height:40px;white-space:nowrap}',
    '@media(max-width:520px){.cal-row,.cal-row3{grid-template-columns:minmax(0,1fr) 36px}.cal-row .cal-sel-wrap{grid-column:1/2}.cal-row .cal-q{grid-column:1/2;grid-row:2}.cal-row .cal-rm{grid-column:2;grid-row:1}.cal-row .cal-chk{grid-column:1/2}}',
    '.cal-sum{font-size:12px;color:#48473d}.cal-sum.bad{color:#ba1a1a;font-weight:600}.cal-sum.ok{color:#4a6b2f}',
    '.cal-addrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.cal-panel{padding:16px;display:flex;flex-direction:column;gap:16px}',
    '@media(min-width:1024px){.cal-panel{position:sticky;top:var(--ci-sticky-top,88px);max-height:calc(100vh - var(--ci-sticky-top,88px) - 16px);overflow:auto}}',
    '.cal-hero{background:#5d5e38;color:#fff;border-radius:8px;padding:16px}',
    '.cal-lab{font:500 10px/14px Montserrat,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;opacity:.85}',
    '.cal-big{font-family:"Playfair Display",Georgia,serif;font-size:36px;line-height:44px}',
    '.cal-sub{font-size:14px;opacity:.95}',
    '.cal-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.cal-stat{background:#f4f4e9;border-radius:8px;padding:10px 12px}',
    '.cal-stat .cal-lab{color:#725b27;opacity:1}',
    '.cal-stat b{display:block;font-size:17px;line-height:24px;color:#1a1c15}',
    '.cal-stat small{font-size:12px;color:#48473d}',
    '.cal-h{font:600 11px/16px Montserrat,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#725b27;margin:0 0 8px}',
    '.cal-bar-row{display:grid;grid-template-columns:110px 1fr auto;gap:8px;align-items:center;font-size:13px;margin-bottom:6px}',
    '.cal-track{height:10px;background:#eeefe3;border-radius:999px;overflow:hidden}',
    '.cal-fill{height:100%;border-radius:999px;transition:width .25s}',
    '.cal-tag{display:inline-block;padding:2px 8px;border-radius:999px;font:600 10px/14px Montserrat,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}',
    '.cal-tag.ok{background:#dcebc8;color:#2f4a16}.cal-tag.bajo{background:#fcdc9b;color:#5b4410}.cal-tag.perdida{background:#ffdad6;color:#93000a}',
    '.cal-warn{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:18px;padding:8px 10px;border-radius:8px;margin-bottom:6px}',
    '.cal-warn.error{background:#ffdad6;color:#93000a}.cal-warn.aviso{background:#fff1cf;color:#5b4410}.cal-warn.info{background:#eeefe3;color:#48473d}',
    '.cal-warn .material-symbols-outlined{font-size:18px}',
    '.cal-tec{display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:13px}.cal-tec dt{color:#48473d}.cal-tec dd{margin:0;text-align:right;font-weight:600}',
    '.cal-det summary{cursor:pointer;font-size:13px;color:#725b27}',
    '.cal-det table{width:100%;font-size:12px;border-collapse:collapse;margin-top:8px}.cal-det td,.cal-det th{padding:3px 4px;text-align:right}.cal-det td:first-child,.cal-det th:first-child{text-align:left}',
    '.cal-bottom{position:fixed;left:0;right:0;bottom:var(--ci-bottomnav-h,0px);z-index:40;background:#fff;border-top:1px solid #c9c7b9;box-shadow:0 -6px 20px -10px rgba(30,32,25,.25);padding:8px 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}',
    '@media(min-width:1024px){.cal-bottom{display:none}}',
    '.cal-bottom .p{font-family:"Playfair Display",Georgia,serif;font-size:22px;line-height:26px;color:#5d5e38}',
    '.cal-bottom small{display:block;font-size:11px;color:#48473d}',
    '.cal-empty{padding:16px;font-size:14px;color:#48473d}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById('cal-style')) return;
    var s = document.createElement('style'); s.id = 'cal-style'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ---------- modelo ---------- */
  function ensure(r) {
    r.extras = r.extras || []; r.costosExtra = r.costosExtra || [];
    if (r.unidadesPorLote == null) r.unidadesPorLote = 1;
    if (r.manoObraMin == null) r.manoObraMin = 0;
    if (r.energiaMin == null) r.energiaMin = 0;
    if (r.tipo === 'jabon') {
      var j = r.jabon = r.jabon || {};
      j.metodo = j.metodo || 'frio'; j.aceites = j.aceites || []; j.bases = j.bases || []; j.aditivos = j.aditivos || [];
      if (j.superGrasaPct == null) j.superGrasaPct = 5;
      if (j.aguaPct == null) j.aguaPct = 33;
      if (j.fraganciaPct == null) j.fraganciaPct = 3;
      if (j.mermaCuradoPct == null) j.mermaCuradoPct = 15;
      if (j.semanasCurado == null) j.semanasCurado = 4;
    } else {
      r.tipo = 'vela';
      var v = r.vela = r.vela || {};
      v.ceras = v.ceras || []; v.colorantes = v.colorantes || []; v.mechas = v.mechas || [];
      if (v.llenadoPct == null) v.llenadoPct = 90;
      if (v.fraganciaPct == null) v.fraganciaPct = 8;
    }
    return r;
  }
  function blank(tipo) { return ensure(clone(CI.store.newReceta(tipo))); }
  function isSaved() { return !!(S.rec && S.rec.id && CI.store.getReceta && CI.store.getReceta(S.rec.id)); }
  function isVisible() { return S.root && S.root.offsetParent !== null; }

  function touch() {
    if (!S.dirty) { S.dirty = true; renderHead(); }
    recalcSoon();
  }

  /* ---------- campos ---------- */
  function wrapField(label, control, hint) {
    return h('label', { class: 'cal-f' }, h('span', { class: 'ci-label' }, label), control,
      hint ? h('span', { class: 'cal-hint' }, hint) : null);
  }
  function numInput(obj, key, o) {
    o = o || {};
    var inp = h('input', {
      type: 'text', inputmode: 'decimal', class: 'ci-input', autocomplete: 'off',
      value: fmtIn(obj[key]), placeholder: o.placeholder || '', 'aria-label': o.aria || null
    });
    inp.addEventListener('input', function () {
      var v = parseNum(inp.value);
      if (v == null) obj[key] = o.nullable ? null : 0; else obj[key] = v;
      if (o.onChange) o.onChange();
      touch();
    });
    return inp;
  }
  function textInput(obj, key, o) {
    o = o || {};
    var inp = h('input', { type: 'text', class: 'ci-input', value: obj[key] || '', placeholder: o.placeholder || '', 'aria-label': o.aria || null, autocomplete: 'off' });
    inp.addEventListener('input', function () { obj[key] = inp.value; touch(); });
    return inp;
  }
  function numField(label, obj, key, o) {
    o = o || {};
    return wrapField(label + (o.suffix ? ' (' + o.suffix + ')' : ''), numInput(obj, key, o), o.hint);
  }

  /* select de insumos filtrado por categoría; onChange(id|null, insumo|undefined) */
  function insumoSelect(cats, value, onChange, aria, withLink) {
    var all = byId();
    var list = (CI.store.listInsumos() || []).filter(function (i) { return cats.indexOf(i.categoria) >= 0; })
      .sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
    var sel = h('select', { class: 'ci-input select-botanic', 'aria-label': aria || 'Insumo' });
    sel.appendChild(h('option', { value: '' }, '— Selecciona —'));
    var found = false;
    list.forEach(function (i) {
      if (i.id === value) found = true;
      sel.appendChild(h('option', { value: i.id }, i.nombre + ' · ' + fmtUnitCost(i)));
    });
    if (value && !found) {
      var o = all[value];
      sel.appendChild(h('option', { value: value }, o ? o.nombre + ' · ' + fmtUnitCost(o) : '(insumo eliminado)'));
    }
    sel.value = value || '';
    var hint = h('span', { class: 'cal-hint' });
    function upd() {
      var ins = all[sel.value];
      hint.textContent = '';
      if (ins) hint.appendChild(document.createTextNode('Costo: ' + fmtUnitCost(ins) + (ins.proveedor ? ' · ' + ins.proveedor : '')));
      else if (sel.value) hint.appendChild(document.createTextNode('Este insumo ya no existe'));
      if (withLink) hint.appendChild(h('a', { role: 'link', tabindex: '0', onclick: goInsumos, onkeydown: function (e) { if (e.key === 'Enter') goInsumos(); } }, '+ nuevo insumo'));
    }
    sel.addEventListener('change', function () { upd(); onChange(sel.value || null, all[sel.value]); });
    upd();
    return h('div', { class: 'cal-sel-wrap' }, sel, hint);
  }
  function goInsumos() { if (CI.app && CI.app.go) CI.app.go('insumos'); }

  function selField(label, cats, obj, key, extra) {
    var ctl = insumoSelect(cats, obj[key], function (id) { obj[key] = id; touch(); if (extra) extra(); }, label, true);
    return h('div', { class: 'cal-f' }, h('span', { class: 'ci-label' }, label), ctl);
  }

  /* filas dinámicas: arr de objetos {insumoId, [qtyKey]} */
  function rowsEditor(arr, o) {
    var wrap = h('div', { class: 'cal-body', style: 'padding:0' });
    var rowsEl = h('div', { style: 'display:grid;gap:8px' });
    var sumEl = o.sum ? h('div', { class: 'cal-sum', 'aria-live': 'polite' }) : null;
    function updSum() { if (sumEl) o.sum(sumEl); }
    arr.forEach(function (row, i) {
      var suf = h('span', null, o.suffix || '');
      function setSuf(ins) { if (!o.suffix) suf.textContent = ins ? ins.unidad : ''; }
      var sel = insumoSelect(o.cats, row.insumoId, function (id, ins) { row.insumoId = id; setSuf(ins); touch(); }, o.aria + ' ' + (i + 1), false);
      var q = numInput(row, o.qty, { aria: o.qtyLabel + ' ' + (i + 1), onChange: updSum });
      if (!o.suffix) setSuf(byId()[row.insumoId]);
      var rm = h('button', {
        type: 'button', class: 'cal-rm', 'aria-label': 'Quitar fila', title: 'Quitar',
        onclick: function () { arr.splice(i, 1); touch(); buildForm(); }
      }, icon('delete'));
      rowsEl.appendChild(h('div', { class: 'cal-row' }, sel, h('div', { class: 'cal-q' }, q, suf), rm));
    });
    wrap.appendChild(rowsEl);
    var addBtn = h('button', {
      type: 'button', class: 'ci-btn ci-btn-ghost',
      onclick: function () { arr.push(o.mk(arr)); touch(); buildForm(); }
    }, icon('add'), ' Añadir');
    wrap.appendChild(h('div', { class: 'cal-addrow' }, addBtn,
      h('span', { class: 'cal-hint' }, h('a', { role: 'link', tabindex: '0', style: 'margin-left:0', onclick: goInsumos, onkeydown: function (e) { if (e.key === 'Enter') goInsumos(); } }, '+ nuevo insumo')),
      sumEl));
    if (!arr.length && o.empty) wrap.insertBefore(h('div', { class: 'cal-hint' }, o.empty), rowsEl);
    updSum();
    return wrap;
  }

  function costosExtraEditor(arr) {
    var wrap = h('div', { class: 'cal-body', style: 'padding:0' });
    var rowsEl = h('div', { style: 'display:grid;gap:8px' });
    arr.forEach(function (row, i) {
      var c = textInput(row, 'concepto', { placeholder: 'Ej.: etiqueta impresa, flete', aria: 'Concepto ' + (i + 1) });
      var m = numInput(row, 'monto', { aria: 'Monto ' + (i + 1), placeholder: '$' });
      var chk = h('input', { type: 'checkbox', checked: !!row.porLote });
      chk.addEventListener('change', function () { row.porLote = chk.checked; touch(); });
      var rm = h('button', { type: 'button', class: 'cal-rm', 'aria-label': 'Quitar costo', onclick: function () { arr.splice(i, 1); touch(); buildForm(); } }, icon('delete'));
      rowsEl.appendChild(h('div', { class: 'cal-row cal-row3' }, c, m, h('label', { class: 'cal-chk' }, chk, 'Por lote'), rm));
    });
    wrap.appendChild(h('div', { class: 'cal-hint' }, '«Por lote» divide el monto entre las unidades de la tanda; si no, se suma por cada unidad.'));
    wrap.appendChild(rowsEl);
    wrap.appendChild(h('div', { class: 'cal-addrow' }, h('button', {
      type: 'button', class: 'ci-btn ci-btn-ghost',
      onclick: function () { arr.push({ concepto: '', monto: 0, porLote: true }); touch(); buildForm(); }
    }, icon('add'), ' Añadir costo')));
    return wrap;
  }

  function section(id, title, ic, defOpen, body) {
    var open = S.open[id] != null ? S.open[id] : defOpen;
    var d = h('details', { class: 'cal-sec cal-card', id: 'cal-sec-' + id },
      h('summary', null, icon(ic), title, h('span', { class: 'material-symbols-outlined cal-chev', 'aria-hidden': 'true' }, 'expand_more')),
      h('div', { class: 'cal-body' }, body));
    if (open) d.setAttribute('open', '');
    d.addEventListener('toggle', function () { S.open[id] = d.open; });
    return d;
  }

  /* ---------- formulario ---------- */
  function pctRest(arr, key) {
    var s = 0; arr.forEach(function (x) { s += Number(x[key]) || 0; });
    return Math.max(0, Math.round((100 - s) * 100) / 100);
  }

  function buildForm() {
    var r = S.rec, f = S.formEl;
    var scrollY = window.scrollY;
    f.textContent = '';
    var st = settings();
    var secs = [];

    // Lote y precio (siempre visible)
    var lote = h('div', { class: 'cal-card cal-body' },
      h('div', { class: 'cal-h', style: 'margin:0' }, 'Lote, márgenes y precio actual (escenarios)'),
      h('div', { class: 'cal-grid2' },
        numField(r.tipo === 'jabon' ? 'Barras por lote' : 'Unidades por lote', r, 'unidadesPorLote', { hint: 'Cambia el número y mira el costo al instante' }),
        numField('Margen detal', r, 'margenDetalPct', { nullable: true, suffix: '%', placeholder: 'Ajustes: ' + (st.margenDetalPct != null ? st.margenDetalPct : ''), hint: 'Vacío = usa Ajustes' }),
        numField('Margen mayorista', r, 'margenMayoristaPct', { nullable: true, suffix: '%', placeholder: 'Ajustes: ' + (st.margenMayoristaPct != null ? st.margenMayoristaPct : ''), hint: 'Vacío = usa Ajustes' }),
        numField('Precio actual de venta', r, 'precioActual', { nullable: true, suffix: 'COP', hint: 'Para comparar con el sugerido' })));
    f.appendChild(lote);

    secs.push(section('basico', 'Datos básicos', 'edit_note', true, [
      h('div', { class: 'cal-grid2' },
        wrapField('Nombre de la receta', textInput(r, 'nombre', { placeholder: r.tipo === 'jabon' ? 'Ej.: Jabón de avena y miel' : 'Ej.: Vela lavanda 8oz', aria: 'Nombre de la receta' })),
        wrapField('Formato', textInput(r, 'formato', { placeholder: r.tipo === 'jabon' ? 'Barra 100g' : 'Vaso 8oz' }))),
      wrapField('Notas', (function () {
        var t = h('textarea', { class: 'ci-input', rows: '2', 'aria-label': 'Notas' }); t.value = r.notas || '';
        t.addEventListener('input', function () { r.notas = t.value; touch(); }); return t;
      })())
    ]));

    if (r.tipo === 'vela') {
      var v = r.vela;
      secs.push(section('ceras', 'Ceras (mezcla)', 'water_drop', true, [
        rowsEditor(v.ceras, {
          cats: ['cera'], qty: 'pct', qtyLabel: 'Porcentaje', suffix: '%', aria: 'Cera',
          mk: function (arr) { return { insumoId: null, pct: arr.length ? pctRest(arr, 'pct') : 100 }; },
          empty: 'Añade al menos una cera. Si usas una sola, 100%.',
          sum: function (el) {
            var s = 0; v.ceras.forEach(function (x) { s += Number(x.pct) || 0; });
            var ok = Math.abs(s - 100) < 0.01;
            el.className = 'cal-sum ' + (v.ceras.length ? (ok ? 'ok' : 'bad') : '');
            el.textContent = v.ceras.length ? 'Suma: ' + fnum(s, 1) + '%' + (ok ? ' ✓' : ' (debe sumar 100%)') : '';
          }
        })
      ]));
      secs.push(section('envase', 'Envase, molde y peso de cera', 'inventory_2', true, [
        h('div', { class: 'cal-grid2' },
          selField('Envase (vaso, lata, frasco)', ['envase'], v, 'envaseId'),
          selField('Molde', ['molde'], v, 'moldeId')),
        h('div', { class: 'cal-grid2' },
          numField('Llenado del envase', v, 'llenadoPct', { suffix: '%', hint: 'Porcentaje de la capacidad que llenas' }),
          numField('Gramos de cera por unidad (manual)', v, 'pesoCeraG', { nullable: true, suffix: 'g', placeholder: 'Automático', hint: 'Déjalo vacío para calcularlo del envase o molde' }))
      ]));
      secs.push(section('fragancia', 'Fragancia', 'spa', true, [
        h('div', { class: 'cal-grid2' },
          selField('Fragancia', ['fragancia'], v, 'fraganciaId'),
          numField('Fragancia sobre el peso de cera', v, 'fraganciaPct', { suffix: '%', hint: 'Típico en soya 6–10%' }))
      ]));
      secs.push(section('colorantes', 'Colorantes', 'palette', false, [
        rowsEditor(v.colorantes, { cats: ['colorante'], qty: 'cantidad', qtyLabel: 'Cantidad', aria: 'Colorante', mk: function () { return { insumoId: null, cantidad: 1 }; }, empty: 'Sin colorante.' })
      ]));
      secs.push(section('mechas', 'Mechas', 'local_fire_department', true, [
        rowsEditor(v.mechas, { cats: ['mecha'], qty: 'cantidad', qtyLabel: 'Cantidad', aria: 'Mecha', mk: function () { return { insumoId: null, cantidad: 1 }; }, empty: 'Añade la mecha por unidad.' })
      ]));
    } else {
      var j = r.jabon;
      secs.push(section('metodo', 'Método', 'science', true, [
        wrapField('Método de elaboración', (function () {
          var s = h('select', { class: 'ci-input select-botanic', 'aria-label': 'Método' },
            h('option', { value: 'frio' }, 'Proceso en frío (soda cáustica)'),
            h('option', { value: 'glicerina' }, 'Base de glicerina (melt & pour)'));
          s.value = j.metodo;
          s.addEventListener('change', function () { j.metodo = s.value; touch(); buildForm(); });
          return s;
        })())
      ]));
      if (j.metodo === 'glicerina') {
        secs.push(section('bases', 'Base de glicerina (por lote)', 'water_drop', true, [
          rowsEditor(j.bases, { cats: ['base'], qty: 'g', qtyLabel: 'Gramos', suffix: 'g', aria: 'Base', mk: function () { return { insumoId: null, g: 500 }; }, empty: 'Añade la base y sus gramos por lote.' })
        ]));
      } else {
        secs.push(section('aceites', 'Aceites y mantecas (por lote)', 'water_drop', true, [
          rowsEditor(j.aceites, { cats: ['aceite'], qty: 'g', qtyLabel: 'Gramos', suffix: 'g', aria: 'Aceite', mk: function () { return { insumoId: null, g: 100 }; }, empty: 'Añade los aceites con sus gramos por lote.' })
        ]));
        secs.push(section('lejia', 'Lejía (soda y agua)', 'experiment', true, [
          selField('Soda cáustica', ['soda'], j, 'sodaId'),
          h('div', { class: 'cal-grid2' },
            numField('Superengrasado', j, 'superGrasaPct', { suffix: '%', hint: 'Típico 5%' }),
            numField('Agua (% del peso de aceites)', j, 'aguaPct', { suffix: '%', hint: 'Típico 30–35%' })),
          h('div', { class: 'cal-hint' }, 'La soda y el agua se calculan solas y las verás en «Datos técnicos».')
        ]));
      }
      secs.push(section('fragancia', 'Fragancia', 'spa', true, [
        h('div', { class: 'cal-grid2' },
          selField('Fragancia / aceite esencial', ['fragancia'], j, 'fraganciaId'),
          numField('Fragancia sobre el peso de aceites/base', j, 'fraganciaPct', { suffix: '%' }))
      ]));
      secs.push(section('aditivos', 'Aditivos (por lote)', 'eco', false, [
        rowsEditor(j.aditivos, { cats: ['aditivo', 'colorante', 'otro'], qty: 'g', qtyLabel: 'Gramos', suffix: 'g', aria: 'Aditivo', mk: function () { return { insumoId: null, g: 10 }; }, empty: 'Arcilla, avena, flores, colorantes...' })
      ]));
      secs.push(section('molde', 'Molde', 'grid_view', false, [
        h('div', { class: 'cal-grid2' },
          selField('Molde', ['molde'], j, 'moldeId'),
          numField('Usos del molde', j, 'moldeUsos', { nullable: true, placeholder: 'Según insumo', hint: 'Para amortizar su costo' }))
      ]));
      secs.push(section('curado', 'Curado', 'schedule', false, [
        h('div', { class: 'cal-grid2' },
          numField('Pérdida de peso en curado', j, 'mermaCuradoPct', { suffix: '%' }),
          numField('Semanas de curado', j, 'semanasCurado', { hint: 'Capital inmovilizado: ten paciencia al vender' }))
      ]));
    }

    secs.push(section('extras', 'Empaque y extras (por unidad)', 'redeem', false, [
      rowsEditor(r.extras, { cats: ['empaque', 'otro'], qty: 'cantidad', qtyLabel: 'Cantidad', aria: 'Extra', mk: function () { return { insumoId: null, cantidad: 1 }; }, empty: 'Caja, bolsa, etiqueta, cinta...' })
    ]));
    secs.push(section('trabajo', 'Tiempo y merma', 'timer', true, [
      h('div', { class: 'cal-grid2' },
        numField('Tu trabajo por lote', r, 'manoObraMin', { suffix: 'min', hint: 'Preparar, verter, empacar y limpiar' }),
        numField('Energía por lote', r, 'energiaMin', { suffix: 'min', hint: 'Tiempo con gas/electricidad encendidos' }),
        numField('Merma de esta receta', r, 'mermaPct', { nullable: true, suffix: '%', placeholder: 'Ajustes: ' + (st.mermaPct != null ? st.mermaPct : ''), hint: 'Vacío = usa Ajustes' }))
    ]));
    secs.push(section('costosExtra', 'Otros costos', 'receipt_long', false, [costosExtraEditor(r.costosExtra)]));

    secs.forEach(function (s) { f.appendChild(s); });
    window.scrollTo(0, scrollY);
  }

  /* ---------- cabecera ---------- */
  function renderHead() {
    var r = S.rec, hd = S.headEl;
    hd.textContent = '';
    var saved = isSaved();
    var title = h('h2', null, saved ? 'Editando receta' : 'Receta nueva');
    if (S.dirty) title.appendChild(h('span', { class: 'cal-chip-dirty' }, 'Sin guardar'));
    function seg(tipo, label, ic) {
      return h('button', { type: 'button', 'aria-pressed': r.tipo === tipo ? 'true' : 'false', onclick: function () { switchTipo(tipo); } }, icon(ic), label);
    }
    hd.appendChild(h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, title,
      h('div', { class: 'cal-seg', role: 'group', 'aria-label': 'Tipo de producto' }, seg('vela', 'Vela', 'local_fire_department'), seg('jabon', 'Jabón', 'soap'))));
    hd.appendChild(h('div', { class: 'cal-actions' },
      h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: function () { nueva(r.tipo); } }, icon('note_add'), ' Nueva'),
      saved ? h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: function () { save(true); } }, icon('content_copy'), ' Guardar como nueva') : null,
      h('button', { type: 'button', class: 'ci-btn ci-btn-primary', onclick: function () { save(false); } }, icon('save'), ' Guardar')));
  }

  function switchTipo(tipo) {
    if (S.rec.tipo === tipo) return;
    askDiscard().then(function (ok) { if (ok) setRec(blank(tipo)); });
  }
  function askDiscard() {
    if (!S.dirty) return Promise.resolve(true);
    return confirmDialog('Tienes cambios sin guardar en esta receta. ¿Descartarlos?');
  }
  function setRec(r) {
    S.rec = ensure(r); S.dirty = false;
    renderHead(); buildForm(); recalc();
    window.scrollTo(0, 0);
  }
  function nueva(tipo) {
    return askDiscard().then(function (ok) { if (ok) setRec(blank(tipo || (S.rec && S.rec.tipo) || 'vela')); return ok; });
  }

  function save(asNew) {
    var r = S.rec;
    if (!String(r.nombre || '').trim()) {
      toast('Ponle un nombre a la receta antes de guardar', 'error');
      var d = document.getElementById('cal-sec-basico');
      if (d) { d.setAttribute('open', ''); var i = d.querySelector('input'); if (i) i.focus(); }
      return;
    }
    var now = new Date().toISOString();
    var copy = clone(r);
    var existed = isSaved();
    if (asNew || !copy.id) { copy.id = uid(); copy.creado = now; }
    else if (!existed) copy.creado = copy.creado || now;
    copy.actualizado = now;
    var saved;
    try { saved = CI.store.saveReceta(copy) || copy; }
    catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); return; }
    S.rec = ensure(clone(saved)); S.dirty = false;
    renderHead();
    toast(asNew ? 'Guardada como receta nueva' : 'Receta guardada');
  }

  function load(recetaId) {
    var r = CI.store.getReceta(recetaId);
    if (!r) { toast('No se encontró la receta', 'error'); return Promise.resolve(false); }
    if (S.rec && S.rec.id === recetaId && !S.dirty) { S.open = S.open; return Promise.resolve(true); }
    return askDiscard().then(function (ok) { if (ok) setRec(clone(r)); return ok; });
  }

  /* ---------- panel de resultado ---------- */
  var GRP = {
    materiales: ['Materiales', '#5d5e38'], extras: ['Empaque y extras', '#8b8c5a'], manoObra: ['Mano de obra', '#c3a66a'],
    energia: ['Energía', '#725b27'], indirectos: ['Indirectos', '#79776c'], merma: ['Merma', '#ba1a1a']
  };
  var GRP_ORDER = ['materiales', 'extras', 'manoObra', 'energia', 'indirectos', 'merma'];

  function calc() {
    try { return CI.calc.calcular(S.rec, byId(), settings()); }
    catch (e) { return { ok: false, advertencias: [{ nivel: 'error', texto: 'Error de cálculo: ' + e.message }] }; }
  }
  var recalcSoon = debounce(function () { recalc(); }, 120);

  function recalc() {
    S.res = calc();
    renderPanel(S.res);
  }

  function renderPanel(res) {
    var c = res.costos, p = res.precio || {}, d = p.detal || {}, m = p.mayorista || {}, st = settings();
    var html = '';
    if (!c) {
      html = '<div class="cal-empty">Completa la receta para ver el resultado.</div>' + warnHtml(res.advertencias);
      S.panelEl.innerHTML = html; renderBar(null); return;
    }
    var un = res.unidades || S.rec.unidadesPorLote || 1;
    var nota = [];
    if (st.aplicarComision) nota.push('comisión');
    if (st.aplicarIva) nota.push('IVA');

    html += '<div class="cal-hero"><div class="cal-lab">Precio sugerido detal</div><div class="cal-big">' + money(d.final) + '</div>' +
      '<div class="cal-sub">Mayorista: <b>' + money(m.final) + '</b></div>' +
      (nota.length ? '<div class="cal-sub" style="font-size:12px;opacity:.8">Incluye ' + nota.join(' e ') + '</div>' : '') + '</div>';

    html += '<div class="cal-stats">' +
      stat('Costo por unidad', money(c.totalUnidad), 'Lote: ' + money(c.totalLote) + ' · ' + fnum(un, 0) + ' u') +
      stat('Punto de equilibrio', money(p.minimo != null ? p.minimo : c.totalUnidad), 'Por debajo pierdes') +
      stat('Utilidad detal', money(d.utilidadUnidad), 'Margen real ' + fpct(d.margenRealPct) + ' · Recargo ' + fpct(d.recargoRealPct)) +
      stat('Utilidad mayorista', money(m.utilidadUnidad), 'Margen real ' + fpct(m.margenRealPct) + ' · Recargo ' + fpct(m.recargoRealPct)) +
      '<div class="cal-stat" style="grid-column:1/-1"><span class="cal-lab">Utilidad por lote (detal)</span><b>' + money((d.utilidadUnidad || 0) * un) + '</b></div></div>';

    var a = p.actual;
    if (a && a.precio != null) {
      var diff = (a.precio || 0) - (d.final || 0);
      var lbl = { ok: 'Saludable', bajo: 'Margen bajo', perdida: 'Pierdes dinero' }[a.estado] || '';
      html += '<div><h3 class="cal-h">Tu precio actual</h3><div class="cal-stat"><b>' + money(a.precio) +
        ' <span class="cal-tag ' + esc(a.estado) + '">' + esc(lbl) + '</span></b><small>Utilidad ' + money(a.utilidadUnidad) + ' · margen ' + fpct(a.margenRealPct) +
        '<br>' + (diff === 0 ? 'Igual al sugerido' : (diff < 0 ? 'Estás ' + money(-diff) + ' por debajo del sugerido' : 'Estás ' + money(diff) + ' por encima del sugerido')) + '</small></div></div>';
    }

    // desglose por grupo (por unidad)
    var tot = {}, sum = 0;
    (res.lineas || []).forEach(function (l) { tot[l.grupo] = (tot[l.grupo] || 0) + (l.costoUnidad || 0); sum += (l.costoUnidad || 0); });
    html += '<div><h3 class="cal-h">Desglose por unidad</h3>';
    GRP_ORDER.forEach(function (g) {
      var v = tot[g] || 0; if (!v) return;
      var pc = sum > 0 ? v / sum * 100 : 0;
      html += '<div class="cal-bar-row"><span>' + GRP[g][0] + '</span><div class="cal-track" role="img" aria-label="' + GRP[g][0] + ' ' + Math.round(pc) + '%"><div class="cal-fill" style="width:' + pc.toFixed(1) + '%;background:' + GRP[g][1] + '"></div></div><span>' + money(v) + ' <small style="color:#79776c">' + Math.round(pc) + '%</small></span></div>';
    });
    html += '</div>';

    if (res.lineas && res.lineas.length) {
      html += '<details class="cal-det"><summary>Ver detalle de costos</summary><table><thead><tr><th>Concepto</th><th>Cant.</th><th>Lote</th><th>Unidad</th></tr></thead><tbody>';
      res.lineas.forEach(function (l) {
        html += '<tr><td>' + esc(l.concepto) + '</td><td>' + (l.cantidad != null ? fnum(l.cantidad, 1) + ' ' + esc(l.unidad || '') : '') + '</td><td>' + money(l.costoLote) + '</td><td>' + money(l.costoUnidad) + '</td></tr>';
      });
      html += '</tbody></table></details>';
    }

    html += tecnicoHtml(res.tecnico || {}, un);
    html += warnHtml(res.advertencias);
    S.panelEl.innerHTML = html;
    renderBar(res);
  }

  function stat(l, big, small) { return '<div class="cal-stat"><span class="cal-lab">' + l + '</span><b>' + big + '</b><small>' + small + '</small></div>'; }

  function tecnicoHtml(t, un) {
    var rows = [], all = byId();
    function row(k, v) { rows.push('<dt>' + k + '</dt><dd>' + v + '</dd>'); }
    if (t.vela) {
      var v = t.vela;
      (v.cerasG || []).forEach(function (x) { var i = all[x.insumoId]; row('Cera: ' + esc(i ? i.nombre : '—'), fnum(x.g, 1) + ' g'); });
      row('Cera total por vela', fnum(v.cerasTotalGUnidad, 1) + ' g');
      row('Fragancia por vela', fnum(v.fraganciaGUnidad, 1) + ' g');
      row('Peso por vela', fnum(v.pesoUnidadG, 1) + ' g');
      row('Cera total del lote', fnum((v.cerasTotalGUnidad || 0) * un, 0) + ' g');
      row('Fragancia total del lote', fnum((v.fraganciaGUnidad || 0) * un, 0) + ' g');
    }
    if (t.jabon) {
      var j = t.jabon;
      if (j.aceitesG != null) row('Aceites / base', fnum(j.aceitesG, 0) + ' g');
      if (j.naohG != null) row('Soda cáustica (NaOH)', fnum(j.naohG, 1) + ' g');
      if (j.aguaG != null) row('Agua', fnum(j.aguaG, 1) + ' g');
      if (j.superGrasaPct != null) row('Superengrasado', fnum(j.superGrasaPct, 1) + '%');
      if (j.crudoG != null) row('Peso crudo del lote', fnum(j.crudoG, 0) + ' g');
      if (j.curadoG != null) row('Peso curado del lote', fnum(j.curadoG, 0) + ' g');
      if (j.pesoBarraG != null) row('Peso por barra curada', fnum(j.pesoBarraG, 1) + ' g');
    }
    if (!rows.length) return '';
    return '<div><h3 class="cal-h">Datos técnicos</h3><dl class="cal-tec">' + rows.join('') + '</dl></div>';
  }

  function warnHtml(list) {
    if (!list || !list.length) return '';
    var ord = { error: 0, aviso: 1, info: 2 };
    var ic = { error: 'error', aviso: 'warning', info: 'info' };
    var s = '<div><h3 class="cal-h">Advertencias</h3>';
    list.slice().sort(function (a, b) { return (ord[a.nivel] || 0) - (ord[b.nivel] || 0); }).forEach(function (w) {
      var n = ic[w.nivel] ? w.nivel : 'info';
      s += '<div class="cal-warn ' + n + '"><span class="material-symbols-outlined" aria-hidden="true">' + ic[n] + '</span><span>' + esc(w.texto) + '</span></div>';
    });
    return s + '</div>';
  }

  function renderBar(res) {
    var b = S.barEl; b.textContent = '';
    var p = res && res.precio, d = p && p.detal, m = p && p.mayorista;
    b.appendChild(h('div', null, h('div', { class: 'p' }, d ? money(d.final) : '—'),
      h('small', null, 'Detal' + (m ? ' · Mayorista ' + money(m.final) : ''))));
    b.appendChild(h('div', { class: 'cal-actions' },
      h('button', { type: 'button', class: 'ci-btn ci-btn-ghost', onclick: function () { S.panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, icon('bar_chart'), ' Desglose'),
      h('button', { type: 'button', class: 'ci-btn ci-btn-primary', onclick: function () { save(false); } }, icon('save'), ' Guardar')));
  }

  /* ---------- API pública ---------- */
  function onStore(ev) {
    if (!ev || ev.tipo === 'recetas') { if (S.mounted) renderHead(); return; }
    if (isVisible()) refreshAll(); else S.stale = true;
  }
  function refreshAll() {
    S.stale = false;
    if (!S.rec) return;
    buildForm(); recalc();
  }

  CI.ui.calculadora = {
    mount: function (el) {
      injectStyle();
      S.root = el; el.textContent = '';
      S.headEl = h('div', { class: 'cal-card cal-head' });
      S.formEl = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });
      S.panelEl = h('aside', { class: 'cal-card cal-panel', 'aria-label': 'Resultado', 'aria-live': 'polite' });
      S.barEl = h('div', { class: 'cal-bottom' });
      el.appendChild(h('div', { class: 'cal-wrap' }, h('div', { class: 'cal-main' }, S.headEl, S.formEl), S.panelEl));
      el.appendChild(S.barEl);
      S.rec = blank('vela'); S.dirty = false; S.mounted = true;
      renderHead(); buildForm(); recalc();
      if (CI.store.on) CI.store.on(onStore);
    },
    onShow: function (params) {
      if (!S.mounted) return;
      if (params && params.recetaId) { load(params.recetaId); return; }
      if (S.stale) refreshAll(); else renderHead();
    },
    load: load,
    nueva: nueva
  };
})();
