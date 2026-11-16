/* CI.ui.ajustes — vista de ajustes (agente C).
   API: mount(containerEl), onShow(). Guarda cada campo al cambiarlo. */
(function () {
  'use strict';
  window.CI = window.CI || {};
  CI.ui = CI.ui || {};

  var root = null, saving = false;

  function esc(s) {
    if (CI.util && CI.util.escapeHtml) return CI.util.escapeHtml(s == null ? '' : String(s));
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // tipo: money | pct | text | check | select
  var SECCIONES = [
    { titulo: 'Tu negocio', icon: 'storefront', campos: [
      { k: 'nombreNegocio', tipo: 'text', label: 'Nombre del negocio', help: 'Aparece en las listas de precios que copies o exportes.' }
    ] },
    { titulo: 'Tu tiempo y tu taller', icon: 'schedule',
      intro: 'Tu trabajo y la energía también cuestan, aunque no los pagues en efectivo. Si no los cuentas, estás regalando tu tiempo.',
      campos: [
        { k: 'manoObraHora', tipo: 'money', suf: 'COP / hora', label: 'Mano de obra (tu hora de trabajo)',
          help: 'Cuánto vale una hora de tu trabajo: preparar, derretir, verter, empacar y limpiar. ¡Págate a ti misma! Un punto de partida es el salario mínimo por hora más una ganancia por tu oficio.' },
        { k: 'energiaHora', tipo: 'money', suf: 'COP / hora', label: 'Energía del taller',
          help: 'Gas o electricidad que gastas por cada hora que estás produciendo (estufa, olla de baño maría, calentador).' }
      ] },
    { titulo: 'Costos generales', icon: 'receipt_long', campos: [
      { k: 'indirectosPct', tipo: 'pct', suf: '%', label: 'Costos indirectos',
        help: 'Lo que cuesta tener el negocio funcionando aunque no vendas: alquiler, servicios, internet, publicidad y desgaste de equipos. Se suma como porcentaje sobre materiales, mano de obra y energía. Típico: 5–15 %.' },
      { k: 'mermaPct', tipo: 'pct', suf: '%', label: 'Merma por defecto',
        help: 'Pérdida de materiales por derrames, velas que fallan, pruebas y sobrantes. Se calcula sobre materiales y empaque. Típico: 2–5 %. Cada receta puede tener su propia merma.' }
    ] },
    { titulo: 'Precio de venta', icon: 'sell', campos: [
      { k: 'metodoPrecio', tipo: 'select', label: 'Cómo calcular el precio',
        opciones: [['margen', 'Margen (utilidad sobre el precio)'], ['recargo', 'Recargo (utilidad sobre el costo)']],
        help: '__metodo__' },
      { k: 'margenDetalPct', tipo: 'pct', suf: '%', label: 'Utilidad deseada — detal',
        help: 'La ganancia que quieres cuando vendes al cliente final. Con margen, 50 % significa que la mitad del precio es ganancia.' },
      { k: 'margenMayoristaPct', tipo: 'pct', suf: '%', label: 'Utilidad deseada — mayorista',
        help: 'Ganancia al vender por volumen (tiendas, regalos corporativos). Suele ser menor que la de detal porque vendes más cantidad.' },
      { k: 'redondeoA', tipo: 'money', suf: 'COP', label: 'Redondear precio hacia arriba a múltiplos de',
        help: 'Hace que el precio sea fácil de cobrar, por ejemplo 500 convierte $27.340 en $27.500. Usa 0 para no redondear.' }
    ] },
    { titulo: 'Venta en línea (comisión)', icon: 'credit_card', campos: [
      { k: 'aplicarComision', tipo: 'check', label: 'Incluir comisión de pasarela o marketplace en el precio',
        help: 'Actívalo si cobras con Wompi, MercadoPago, etc. El precio sube para que la comisión no se coma tu utilidad.' },
      { k: 'comisionPct', tipo: 'pct', suf: '%', label: 'Comisión (%)', help: 'Porcentaje que cobra la plataforma por cada venta.' },
      { k: 'comisionFija', tipo: 'money', suf: 'COP', label: 'Comisión fija por venta', help: 'Monto fijo adicional por transacción, si la plataforma lo cobra.' }
    ] },
    { titulo: 'IVA', icon: 'percent', campos: [
      { k: 'aplicarIva', tipo: 'check', label: 'Soy responsable de IVA (sumarlo al precio)',
        help: 'Actívalo solo si estás obligada a cobrar IVA. La utilidad se calcula siempre sobre el precio sin IVA, porque ese impuesto no es tuyo.' },
      { k: 'ivaPct', tipo: 'pct', suf: '%', label: 'Tarifa de IVA', help: 'En Colombia la tarifa general es 19 %.' }
    ] }
  ];

  function metodoHelp(m) {
    var ej = 'Ejemplo con costo de $10.000 y utilidad de 50 %: ';
    return 'Margen: el 50 % es la parte del precio que queda de ganancia (precio $20.000). Recargo: se suma 50 % al costo (precio $15.000). ' +
      'El margen es más seguro para no vender muy barato. ' + (m === 'margen' ? 'Ahora usas margen.' : 'Ahora usas recargo.');
  }

  function fieldHtml(f, v, s) {
    var id = 'aj-' + f.k, h = id + '-h';
    var help = f.help === '__metodo__' ? metodoHelp(s.metodoPrecio) : f.help;
    var helpHtml = '<p class="text-body-sm text-on-surface-variant mt-1" id="' + h + '"' + (f.help === '__metodo__' ? ' data-metodo-help' : '') + '>' + esc(help) + '</p>';
    if (f.tipo === 'check') {
      return '<div class="py-1"><label class="flex items-start gap-3 cursor-pointer" for="' + id + '">' +
        '<input id="' + id + '" data-k="' + f.k + '" data-t="check" type="checkbox" class="mt-1 h-5 w-5 accent-[#5d5e38]"' + (v ? ' checked' : '') + ' aria-describedby="' + h + '">' +
        '<span class="font-body font-medium text-body-md text-on-surface">' + esc(f.label) + '</span></label>' +
        '<div class="pl-8">' + helpHtml + '</div></div>';
    }
    var input;
    if (f.tipo === 'select') {
      input = '<select id="' + id + '" data-k="' + f.k + '" data-t="select" class="ci-input select-botanic" aria-describedby="' + h + '">' +
        f.opciones.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (f.tipo === 'text') {
      input = '<input id="' + id + '" data-k="' + f.k + '" data-t="text" type="text" maxlength="60" class="ci-input" value="' + esc(v) + '" aria-describedby="' + h + '">';
    } else {
      var shown = String(v).replace('.', ',');
      input = '<div class="flex items-center gap-2"><input id="' + id + '" data-k="' + f.k + '" data-t="' + f.tipo + '" type="text" inputmode="decimal" class="ci-input" value="' + esc(shown) + '" aria-describedby="' + h + '">' +
        '<span class="text-body-sm text-on-surface-variant whitespace-nowrap">' + esc(f.suf || '') + '</span></div>';
    }
    return '<div><label class="ci-label" for="' + id + '">' + esc(f.label) + '</label>' + input + helpHtml + '</div>';
  }

  function render() {
    var s = CI.store.getSettings();
    var html = '<div class="max-w-3xl mx-auto px-margin-mobile md:px-8 py-6">' +
      '<h2 class="font-headline text-headline-md text-on-surface">Ajustes</h2>' +
      '<p class="text-body-sm text-on-surface-variant mb-1">Estos valores se usan en todas tus recetas. Los cambios se guardan solos.</p>' +
      '<p id="aj-status" class="text-label-md font-label uppercase text-secondary h-5 mb-3" role="status" aria-live="polite"></p>';
    if (CI.store.isVolatile()) {
      html += '<div class="rounded-xl bg-secondary-container text-on-secondary-container px-4 py-3 mb-4 text-body-sm" role="alert">' +
        'Tu navegador no permite guardar datos en este dispositivo: lo que cambies se perderá al cerrar la página. Exporta una copia de seguridad antes de salir.</div>';
    }
    SECCIONES.forEach(function (sec) {
      html += '<section class="ci-card p-5 mb-4"><h3 class="flex items-center gap-2 font-headline text-headline-sm text-primary mb-1">' +
        '<span class="material-symbols-outlined" aria-hidden="true">' + sec.icon + '</span>' + esc(sec.titulo) + '</h3>' +
        (sec.intro ? '<p class="text-body-sm text-on-surface-variant mb-3">' + esc(sec.intro) + '</p>' : '') +
        '<div class="grid gap-4 mt-3">' + sec.campos.map(function (f) { return fieldHtml(f, s[f.k], s); }).join('') + '</div></section>';
    });
    html += '<section class="ci-card p-5 mb-4"><h3 class="flex items-center gap-2 font-headline text-headline-sm text-primary mb-1">' +
      '<span class="material-symbols-outlined" aria-hidden="true">database</span>Tus datos</h3>' +
      '<p class="text-body-sm text-on-surface-variant mb-4">Todo se guarda solo en este navegador. Descarga una copia de seguridad de vez en cuando, o para llevarte tus datos a otro dispositivo.</p>' +
      '<div class="grid gap-4">' +
        '<div><button type="button" class="ci-btn ci-btn-primary" data-act="export"><span class="material-symbols-outlined" aria-hidden="true">download</span> Exportar copia (JSON)</button></div>' +
        '<div class="grid gap-2 sm:grid-cols-[1fr_auto] items-end">' +
          '<div><label class="ci-label" for="aj-modo">Al importar una copia</label>' +
          '<select id="aj-modo" class="ci-input select-botanic"><option value="combinar">Combinar con lo que ya tengo</option><option value="reemplazar">Reemplazar todo</option></select></div>' +
          '<div><button type="button" class="ci-btn ci-btn-ghost" data-act="import"><span class="material-symbols-outlined" aria-hidden="true">upload</span> Importar copia</button>' +
          '<input id="aj-file" type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-label="Archivo de copia de seguridad"></div>' +
        '</div>' +
        '<div class="border-t border-outline-variant pt-4"><p class="text-body-sm text-on-surface-variant mb-2">Vuelve a los insumos, recetas y ajustes de ejemplo. Perderás todo lo que hayas creado o modificado.</p>' +
        '<button type="button" class="ci-btn ci-btn-ghost text-error" data-act="reset"><span class="material-symbols-outlined" aria-hidden="true">restart_alt</span> Restablecer datos de ejemplo</button></div>' +
      '</div></section></div>';
    root.innerHTML = html;
  }

  var statusTimer = null;
  function status(msg) {
    var el = root.querySelector('#aj-status');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.textContent = ''; }, 2000);
  }

  function findField(k) {
    for (var i = 0; i < SECCIONES.length; i++)
      for (var j = 0; j < SECCIONES[i].campos.length; j++)
        if (SECCIONES[i].campos[j].k === k) return SECCIONES[i].campos[j];
    return null;
  }

  function onChange(e) {
    var inp = e.target;
    var k = inp.getAttribute && inp.getAttribute('data-k');
    if (!k) return;
    var t = inp.getAttribute('data-t'), cur = CI.store.getSettings(), v;
    if (t === 'check') v = inp.checked;
    else if (t === 'text' || t === 'select') v = inp.value.trim();
    else {
      v = CI.util.num(inp.value, cur[k]);
      if (v < 0) v = 0;
      if (t === 'pct' && v > 100) v = 100;
      // con método margen, 100 % haría el precio infinito
      if (t === 'pct' && /^margen/.test(k) && v >= 100) v = 99;
      if (k === 'comisionPct' && v >= 100) v = 99;
      inp.value = String(v).replace('.', ',');
    }
    if (t === 'text' && v === '') { v = CI.defaults.SETTINGS[k]; inp.value = v; }
    saving = true;
    try { CI.store.saveSettings((function (o) { o[k] = v; return o; })({})); } finally { saving = false; }
    if (k === 'metodoPrecio') {
      var h = root.querySelector('[data-metodo-help]');
      if (h) h.textContent = metodoHelp(v);
    }
    status('Guardado');
  }

  function doExport() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var name = 'calculadora-inara-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
    CI.util.download(name, CI.store.exportAll(), 'application/json');
    CI.util.toast('Copia exportada');
  }

  function doImport(file) {
    if (!file) return;
    var reemplazar = root.querySelector('#aj-modo').value === 'reemplazar';
    var fr = new FileReader();
    fr.onerror = function () { CI.util.toast('No se pudo leer el archivo', 'error'); };
    fr.onload = function () {
      var run = function () {
        var r = CI.store.importAll(String(fr.result), { reemplazar: reemplazar });
        if (r.ok) {
          CI.util.toast('Importado: ' + r.insumos + ' insumos y ' + r.recetas + ' recetas' + (r.descartados ? ' (' + r.descartados + ' omitidos por datos inválidos)' : ''));
        } else CI.util.toast(r.error || 'No se pudo importar', 'error');
      };
      if (reemplazar) {
        CI.util.confirmDialog('Se reemplazarán todos tus insumos, recetas y ajustes actuales por los del archivo. ¿Continuar?').then(function (ok) { if (ok) run(); });
      } else run();
    };
    fr.readAsText(file);
  }

  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'export') doExport();
    else if (a === 'import') root.querySelector('#aj-file').click();
    else if (a === 'reset') {
      CI.util.confirmDialog('Se borrarán tus insumos, recetas y ajustes y se cargarán los datos de ejemplo. Esta acción no se puede deshacer. ¿Continuar?').then(function (ok) {
        if (!ok) return;
        CI.store.resetDefaults();
        CI.util.toast('Datos de ejemplo restablecidos');
      });
    }
  }

  CI.ui.ajustes = {
    mount: function (el) {
      root = el;
      render();
      root.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'aj-file') {
          doImport(e.target.files && e.target.files[0]);
          e.target.value = '';
          return;
        }
        onChange(e);
      });
      root.addEventListener('click', onClick);
      CI.store.on(function (ev) { if (ev.tipo === 'settings' && !saving) render(); });
    },
    onShow: function () { if (root) render(); }
  };
})();
