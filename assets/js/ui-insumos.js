/* CI.ui.insumos — vista de insumos (agente C).
   API: mount(containerEl), onShow(params?), openNew(categoriaId?), openEdit(id).
   params de onShow: { nuevo:true, categoria:'cera' } abre el diálogo de nuevo insumo. */
(function () {
  'use strict';
  window.CI = window.CI || {};
  CI.ui = CI.ui || {};

  var root = null, dlg = null;
  var st = { q: '', cat: 'todas' };

  /* ---------- helpers ---------- */
  function esc(s) {
    if (CI.util && CI.util.escapeHtml) return CI.util.escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, d) { return CI.util.num(v, d); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function fmtN(n, max) { return Number(n).toLocaleString('es-CO', { maximumFractionDigits: max == null ? 2 : max }); }
  function fmtUnitCost(n) {
    var d = n >= 100 ? 0 : n >= 10 ? 1 : n >= 1 ? 2 : 3;
    return '$' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }
  function costoUnit(i) {
    var c = Number(i.cantidadCompra);
    return c > 0 ? Number(i.precioCompra) / c : 0;
  }
  function cats() { return CI.defaults.CATEGORIAS; }
  function catOf(id) { return CI.defaults.categoria(id); }
  function unitLabel(u) { return u === 'un' ? 'unidad' : u; }

  // Campos extra por categoría
  var EXTRAS = {
    cera: [{ k: 'densidad', label: 'Densidad (g/ml)', ph: '0,9', def: 0.9, hint: 'Sirve para convertir ml del envase a gramos de cera. Soya ≈ 0,9.' }],
    envase: [
      { k: 'capacidadMl', label: 'Capacidad (ml de cera al ras)', ph: '240', hint: 'Lo que cabe lleno hasta el borde. Un vaso de 8 oz ≈ 240 ml.' },
      { k: 'usos', label: 'Usos del envase', ph: '1', def: 1, hint: '1 = se vende con la vela (costo completo). Si es reutilizable, pon cuántas veces lo usarás.' }
    ],
    molde: [
      { k: 'capacidadG', label: 'Capacidad (g de cera o jabón)', ph: '180', hint: 'Gramos que caben en el molde.' },
      { k: 'usos', label: 'Usos de vida útil', ph: '100', def: 100, hint: 'El costo del molde se reparte entre estos usos.' }
    ],
    aceite: [{ k: 'sapNaoh', label: 'Índice SAP (g de NaOH por g de aceite)', ph: '0,183', hint: 'Ej.: coco 0,183 · oliva 0,134 · palma 0,141 · ricino 0,128.' }],
    soda: [{ k: 'pureza', label: 'Pureza (%)', ph: '98', def: 98, hint: 'Pureza indicada en el empaque, normalmente 95–99 %.' }]
  };

  function extraChips(i) {
    var c = [];
    if (i.densidad != null) c.push('Densidad ' + fmtN(i.densidad) + ' g/ml');
    if (i.capacidadMl != null) c.push(fmtN(i.capacidadMl, 0) + ' ml');
    if (i.capacidadG != null) c.push(fmtN(i.capacidadG, 0) + ' g');
    if (i.usos != null && (i.categoria === 'molde' || i.categoria === 'envase')) c.push(fmtN(i.usos, 0) + (Number(i.usos) === 1 ? ' uso' : ' usos'));
    if (i.sapNaoh != null) c.push('SAP ' + fmtN(i.sapNaoh, 4));
    if (i.pureza != null) c.push('Pureza ' + fmtN(i.pureza, 1) + ' %');
    return c;
  }

  function injectStyle() {
    if (document.getElementById('ins-style')) return;
    var s = document.createElement('style');
    s.id = 'ins-style';
    s.textContent =
      '.ins-dialog{border:0;padding:0;border-radius:.5rem;max-width:min(36rem,calc(100vw - 1.5rem));width:100%;background:#fafaee;color:#1a1c15;box-shadow:0 18px 40px -16px rgba(30,32,25,.35);max-height:calc(100vh - 2rem)}' +
      '.ins-dialog::backdrop{background:rgba(26,28,21,.45)}' +
      '.ins-chip-on{background:#5d5e38 !important;color:#fff !important;border-color:#5d5e38 !important}' +
      '.ins-cost{font-variant-numeric:tabular-nums}';
    document.head.appendChild(s);
  }

  /* ---------- lista ---------- */
  function skeleton() {
    root.innerHTML =
      '<div class="max-w-6xl mx-auto px-margin-mobile md:px-8 py-6">' +
      '<div class="flex flex-wrap items-end justify-between gap-3 mb-5">' +
        '<div><h2 class="font-headline text-headline-md text-on-surface">Insumos</h2>' +
        '<p class="text-body-sm text-on-surface-variant max-w-xl">Tu lista de materiales con su precio de compra. El costo por gramo, ml o unidad se calcula solo y alimenta todas tus recetas.</p></div>' +
        '<button type="button" class="ci-btn ci-btn-primary" data-act="nuevo"><span class="material-symbols-outlined" aria-hidden="true">add</span> Nuevo insumo</button>' +
      '</div>' +
      '<div class="mb-3"><label class="ci-label" for="ins-q">Buscar</label>' +
        '<input id="ins-q" type="search" class="ci-input" placeholder="Nombre, proveedor o categoría" autocomplete="off"></div>' +
      '<div id="ins-chips" class="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4" role="group" aria-label="Filtrar por categoría"></div>' +
      '<div id="ins-list" aria-live="polite"></div>' +
      '</div>';
    root.querySelector('#ins-q').addEventListener('input', CI.util.debounce(function (e) {
      st.q = e.target.value; renderList();
    }, 120));
    root.addEventListener('click', onClick);
  }

  function filtered() {
    var q = norm(st.q).trim();
    return CI.store.listInsumos().filter(function (i) {
      if (st.cat !== 'todas' && i.categoria !== st.cat) return false;
      if (!q) return true;
      var hay = norm([i.nombre, i.proveedor, i.notas, catOf(i.categoria).label].join(' '));
      return q.split(/\s+/).every(function (t) { return hay.indexOf(t) >= 0; });
    });
  }

  function renderChips(all) {
    var counts = {};
    all.forEach(function (i) { counts[i.categoria] = (counts[i.categoria] || 0) + 1; });
    var html = chip('todas', 'Todas', all.length);
    cats().forEach(function (c) { if (counts[c.id]) html += chip(c.id, c.label.replace(/ \(.*\)$/, ''), counts[c.id]); });
    root.querySelector('#ins-chips').innerHTML = html;
  }
  function chip(id, label, n) {
    var on = st.cat === id;
    return '<button type="button" class="ci-chip shrink-0 whitespace-nowrap' + (on ? ' ins-chip-on' : '') + '" data-act="cat" data-cat="' + id +
      '" aria-pressed="' + on + '">' + esc(label) + ' <span class="opacity-70">' + n + '</span></button>';
  }

  function card(i, uso) {
    var cu = costoUnit(i), c = catOf(i.categoria);
    var chips = extraChips(i).map(function (t) {
      return '<span class="ci-chip text-label-sm">' + esc(t) + '</span>';
    }).join(' ');
    var kg = (i.unidad === 'g' || i.unidad === 'ml')
      ? '<span class="text-body-sm text-on-surface-variant"> · ' + fmtUnitCost(cu * 1000) + ' / ' + (i.unidad === 'g' ? 'kg' : 'litro') + '</span>' : '';
    var enUso = uso && uso.length
      ? '<span class="inline-flex items-center gap-1 text-label-sm font-label uppercase text-secondary" title="' + esc('Usado en: ' + uso.join(', ')) + '">' +
        '<span class="material-symbols-outlined text-[14px]" aria-hidden="true">link</span>En ' + uso.length + (uso.length === 1 ? ' receta' : ' recetas') + '</span>' : '';
    return '<article class="ci-card p-4 flex flex-col gap-2" data-id="' + esc(i.id) + '">' +
      '<div class="flex items-start gap-3">' +
        '<span class="material-symbols-outlined text-primary mt-0.5" aria-hidden="true">' + esc(c.icon) + '</span>' +
        '<div class="min-w-0 flex-1"><h3 class="font-body font-semibold text-body-md text-on-surface leading-snug break-words">' + esc(i.nombre) + '</h3>' +
        '<p class="text-body-sm text-on-surface-variant">' + esc(i.proveedor || 'Sin proveedor') + '</p></div>' +
      '</div>' +
      '<p class="text-body-sm text-on-surface-variant">Compra: ' + CI.util.fmtCOP(i.precioCompra) + ' por ' + fmtN(i.cantidadCompra) + ' ' + esc(unitLabel(i.unidad)) + '</p>' +
      '<p class="ins-cost"><span class="font-headline text-headline-sm text-primary">' + fmtUnitCost(cu) + '</span>' +
        '<span class="text-body-sm text-on-surface-variant"> / ' + esc(unitLabel(i.unidad)) + '</span>' + kg + '</p>' +
      (chips ? '<div class="flex flex-wrap gap-1">' + chips + '</div>' : '') +
      (enUso ? '<div>' + enUso + '</div>' : '') +
      '<div class="flex gap-2 mt-auto pt-2">' +
        '<button type="button" class="ci-btn ci-btn-ghost flex-1" data-act="editar" data-id="' + esc(i.id) + '" aria-label="Editar ' + esc(i.nombre) + '"><span class="material-symbols-outlined" aria-hidden="true">edit</span> Editar</button>' +
        '<button type="button" class="ci-btn ci-btn-ghost" data-act="eliminar" data-id="' + esc(i.id) + '" aria-label="Eliminar ' + esc(i.nombre) + '"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>' +
      '</div></article>';
  }

  function renderList() {
    if (!root) return;
    var all = CI.store.listInsumos();
    if (st.cat !== 'todas' && !all.some(function (i) { return i.categoria === st.cat; })) st.cat = 'todas';
    renderChips(all);
    var items = filtered();
    var box = root.querySelector('#ins-list');
    if (!items.length) {
      box.innerHTML = '<div class="ci-card p-8 text-center text-on-surface-variant">' +
        '<span class="material-symbols-outlined text-[40px] text-gold" aria-hidden="true">inventory_2</span>' +
        '<p class="mt-2">' + (all.length ? 'Ningún insumo coincide con tu búsqueda.' : 'Aún no tienes insumos. Crea el primero.') + '</p></div>';
      return;
    }
    var uso = CI.store.usoMap();
    var html = '';
    cats().forEach(function (c) {
      var grp = items.filter(function (i) { return i.categoria === c.id; })
        .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
      if (!grp.length) return;
      html += '<section class="mb-6" aria-label="' + esc(c.label) + '">' +
        '<h3 class="font-label text-label-lg uppercase text-secondary mb-2">' + esc(c.label) + '</h3>' +
        '<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">' + grp.map(function (i) { return card(i, uso[i.id]); }).join('') + '</div></section>';
    });
    box.innerHTML = html;
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    var act = b.getAttribute('data-act');
    if (act === 'nuevo') openNew(st.cat !== 'todas' ? st.cat : null);
    else if (act === 'editar') openEdit(b.getAttribute('data-id'));
    else if (act === 'eliminar') eliminar(b.getAttribute('data-id'));
    else if (act === 'cat') { st.cat = b.getAttribute('data-cat'); renderList(); }
  }

  function eliminar(id) {
    var i = CI.store.getInsumo(id);
    if (!i) return;
    var uso = CI.store.usadoEn(id);
    var msg = uso.length
      ? '«' + i.nombre + '» se usa en: ' + uso.join(', ') + '. Si lo eliminas, esas recetas quedarán con un insumo faltante y su costo saldrá incompleto. ¿Eliminar de todos modos?'
      : '¿Eliminar «' + i.nombre + '»? Esta acción no se puede deshacer.';
    CI.util.confirmDialog(msg).then(function (ok) {
      if (!ok) return;
      var r = CI.store.deleteInsumo(id, { force: true });
      if (r.ok) CI.util.toast('Insumo eliminado');
      else CI.util.toast('No se pudo eliminar', 'error');
    });
  }

  /* ---------- diálogo ---------- */
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'ins-dialog';
    dlg.setAttribute('aria-labelledby', 'ins-dlg-title');
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    return dlg;
  }

  function fieldHtml(id, label, inner, hint) {
    return '<div><label class="ci-label" for="' + id + '">' + label + '</label>' + inner +
      (hint ? '<p class="text-body-sm text-on-surface-variant mt-1" id="' + id + '-h">' + hint + '</p>' : '') + '</div>';
  }

  function extrasHtml(cat, vals) {
    var defs = EXTRAS[cat] || [];
    return defs.map(function (f) {
      var v = vals[f.k] != null ? vals[f.k] : (f.def != null ? f.def : '');
      return fieldHtml('ins-x-' + f.k, esc(f.label),
        '<input id="ins-x-' + f.k + '" data-extra="' + f.k + '" type="text" inputmode="decimal" class="ci-input" placeholder="' + esc(f.ph) + '" value="' + esc(v === '' ? '' : String(v).replace('.', ',')) + '" aria-describedby="ins-x-' + f.k + '-h">',
        esc(f.hint));
    }).join('');
  }

  function openDialog(orig, presetCat) {
    var d = ensureDialog();
    var isNew = !orig;
    var cat = (orig && orig.categoria) || presetCat || 'cera';
    var o = orig || { categoria: cat, unidad: catOf(cat).unidad, precioCompra: '', cantidadCompra: '' };
    var catOpts = cats().map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === cat ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('');
    var uniOpts = [['g', 'gramos (g)'], ['ml', 'mililitros (ml)'], ['un', 'unidades']].map(function (u) {
      return '<option value="' + u[0] + '"' + (u[0] === o.unidad ? ' selected' : '') + '>' + u[1] + '</option>';
    }).join('');
    d.innerHTML =
      '<form method="dialog" id="ins-form" novalidate class="flex flex-col max-h-[inherit]">' +
      '<div class="px-5 pt-5 pb-2 flex items-center justify-between gap-3">' +
        '<h3 id="ins-dlg-title" class="font-headline text-headline-sm">' + (isNew ? 'Nuevo insumo' : 'Editar insumo') + '</h3>' +
        '<button type="button" class="ci-btn ci-btn-ghost" data-close aria-label="Cerrar"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>' +
      '</div>' +
      '<div class="px-5 pb-2 overflow-y-auto grid gap-3 grid-cols-1 sm:grid-cols-2">' +
        '<div class="sm:col-span-2">' + fieldHtml('ins-f-nombre', 'Nombre', '<input id="ins-f-nombre" type="text" class="ci-input" maxlength="80" required value="' + esc(o.nombre || '') + '" placeholder="Ej.: Cera de soya GW 464">') + '</div>' +
        fieldHtml('ins-f-cat', 'Categoría', '<select id="ins-f-cat" class="ci-input select-botanic">' + catOpts + '</select>') +
        fieldHtml('ins-f-uni', 'Unidad de medida', '<select id="ins-f-uni" class="ci-input select-botanic">' + uniOpts + '</select>') +
        fieldHtml('ins-f-precio', 'Precio de compra (COP)', '<input id="ins-f-precio" type="text" inputmode="decimal" class="ci-input" value="' + esc(o.precioCompra === '' ? '' : String(o.precioCompra)) + '" placeholder="38000">', 'Lo que pagaste por el paquete completo.') +
        fieldHtml('ins-f-cant', 'Cantidad que trae', '<input id="ins-f-cant" type="text" inputmode="decimal" class="ci-input" value="' + esc(o.cantidadCompra === '' ? '' : String(o.cantidadCompra)) + '" placeholder="1000">', 'En la unidad elegida (1 kg = 1000 g).') +
        '<div class="sm:col-span-2 rounded-xl bg-surface-container-low px-4 py-3" aria-live="polite">' +
          '<span class="font-label text-label-md uppercase text-on-surface-variant">Costo unitario</span> ' +
          '<span id="ins-preview" class="font-headline text-headline-sm text-primary ins-cost"></span></div>' +
        '<div id="ins-extras" class="sm:col-span-2 grid gap-3 grid-cols-1 sm:grid-cols-2">' + extrasHtml(cat, o) + '</div>' +
        '<div class="sm:col-span-2">' + fieldHtml('ins-f-prov', 'Proveedor (opcional)', '<input id="ins-f-prov" type="text" class="ci-input" maxlength="80" value="' + esc(o.proveedor || '') + '">') + '</div>' +
        '<div class="sm:col-span-2">' + fieldHtml('ins-f-notas', 'Notas (opcional)', '<textarea id="ins-f-notas" rows="2" class="ci-input" maxlength="300">' + esc(o.notas || '') + '</textarea>') + '</div>' +
        '<p id="ins-err" class="sm:col-span-2 text-body-sm text-error" role="alert" hidden></p>' +
      '</div>' +
      '<div class="px-5 py-4 flex justify-end gap-2 border-t border-outline-variant">' +
        '<button type="button" class="ci-btn ci-btn-ghost" data-close>Cancelar</button>' +
        '<button type="submit" class="ci-btn ci-btn-primary">' + (isNew ? 'Crear insumo' : 'Guardar cambios') + '</button>' +
      '</div></form>';

    var $ = function (s) { return d.querySelector(s); };
    var form = $('#ins-form');
    var extrasBox = $('#ins-extras');

    function curExtras() {
      var v = {};
      extrasBox.querySelectorAll('[data-extra]').forEach(function (inp) { v[inp.getAttribute('data-extra')] = inp.value.trim() === '' ? null : num(inp.value, null); });
      return v;
    }
    function preview() {
      var p = num($('#ins-f-precio').value, 0), c = num($('#ins-f-cant').value, 0), u = $('#ins-f-uni').value;
      $('#ins-preview').textContent = c > 0 ? fmtUnitCost(p / c) + ' / ' + unitLabel(u) : 'Falta la cantidad';
    }
    $('#ins-f-cat').addEventListener('change', function (e) {
      var prev = curExtras();
      var newCat = e.target.value;
      extrasBox.innerHTML = extrasHtml(newCat, {});
      extrasBox.querySelectorAll('[data-extra]').forEach(function (inp) {
        var k = inp.getAttribute('data-extra');
        if (prev[k] != null) inp.value = String(prev[k]).replace('.', ',');
      });
      if (isNew) $('#ins-f-uni').value = catOf(newCat).unidad;
      preview();
    });
    ['#ins-f-precio', '#ins-f-cant'].forEach(function (s) { $(s).addEventListener('input', preview); });
    $('#ins-f-uni').addEventListener('change', preview);
    d.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { d.close(); }); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = $('#ins-err');
      function fail(m, focusSel) { err.textContent = m; err.hidden = false; if (focusSel) $(focusSel).focus(); }
      var nombre = $('#ins-f-nombre').value.trim();
      var precio = num($('#ins-f-precio').value, NaN), cant = num($('#ins-f-cant').value, NaN);
      if (!nombre) return fail('Escribe un nombre para el insumo.', '#ins-f-nombre');
      if (!isFinite(precio) || precio < 0 || $('#ins-f-precio').value.trim() === '') return fail('Escribe el precio de compra (puede ser 0 si aún no lo sabes).', '#ins-f-precio');
      if (!isFinite(cant) || cant <= 0) return fail('La cantidad debe ser mayor que 0.', '#ins-f-cant');
      var obj = {
        id: orig ? orig.id : '',
        categoria: $('#ins-f-cat').value, nombre: nombre, unidad: $('#ins-f-uni').value,
        precioCompra: precio, cantidadCompra: cant,
        proveedor: $('#ins-f-prov').value.trim(), notas: $('#ins-f-notas').value.trim()
      };
      var ex = curExtras();
      Object.keys(ex).forEach(function (k) { if (ex[k] != null && isFinite(ex[k])) obj[k] = ex[k]; });
      try {
        var saved = CI.store.saveInsumo(obj);
        d.close();
        CI.util.toast(isNew ? 'Insumo creado' : 'Cambios guardados');
        if (isNew && CI.ui.insumos._onCreated) CI.ui.insumos._onCreated(saved);
      } catch (ex2) {
        fail(ex2.message || 'No se pudo guardar.');
      }
    });

    preview();
    if (!d.open) d.showModal();
    $('#ins-f-nombre').focus();
  }

  function openNew(cat) { openDialog(null, cat); }
  function openEdit(id) {
    var i = CI.store.getInsumo(id);
    if (i) openDialog(i);
  }

  /* ---------- API pública ---------- */
  CI.ui.insumos = {
    mount: function (el) {
      root = el;
      injectStyle();
      skeleton();
      renderList();
      CI.store.on(function (ev) {
        if (ev.tipo === 'insumos' || ev.tipo === 'recetas') renderList();
      });
    },
    onShow: function (params) {
      if (!root) return;
      renderList();
      if (params && params.nuevo) openNew(params.categoria || null);
    },
    openNew: openNew,
    openEdit: openEdit
  };
})();
