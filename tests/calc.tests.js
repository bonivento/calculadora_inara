/* Pruebas mínimas del motor (sin librerías). Valores calculados a mano. */
(function () {
  'use strict';
  var results = [];
  function t(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, msg: e && e.message ? e.message : String(e) }); }
  }
  function eq(a, b, label) { if (a !== b) throw new Error((label || 'eq') + ': esperado ' + b + ', obtenido ' + a); }
  function near(a, b, tol, label) {
    if (typeof a !== 'number' || !isFinite(a) || Math.abs(a - b) > (tol === undefined ? 0.05 : tol))
      throw new Error((label || 'near') + ': esperado ~' + b + ', obtenido ' + a);
  }
  function truthy(v, label) { if (!v) throw new Error(label || 'se esperaba verdadero'); }

  var C = window.CI && window.CI.calc;
  var S = { manoObraHora: 12000, energiaHora: 2500, indirectosPct: 10, mermaPct: 3, metodoPrecio: 'margen',
            margenDetalPct: 50, margenMayoristaPct: 30, redondeoA: 500, comisionPct: 3.4, comisionFija: 900,
            aplicarComision: false, ivaPct: 19, aplicarIva: false };
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  var I = {
    soya:   { id: 'soya', categoria: 'cera', nombre: 'Cera de soya', unidad: 'g', precioCompra: 38000, cantidadCompra: 1000, densidad: 0.9 },
    parafina: { id: 'parafina', categoria: 'cera', nombre: 'Parafina', unidad: 'g', precioCompra: 12000, cantidadCompra: 1000, densidad: 0.9 },
    frag:   { id: 'frag', categoria: 'fragancia', nombre: 'Fragancia', unidad: 'g', precioCompra: 60000, cantidadCompra: 500 },
    vaso:   { id: 'vaso', categoria: 'envase', nombre: 'Vaso 8oz', unidad: 'un', precioCompra: 3000, cantidadCompra: 1, capacidadMl: 240, usos: 1 },
    mecha:  { id: 'mecha', categoria: 'mecha', nombre: 'Mecha', unidad: 'un', precioCompra: 10000, cantidadCompra: 100 },
    caja:   { id: 'caja', categoria: 'empaque', nombre: 'Caja', unidad: 'un', precioCompra: 1500, cantidadCompra: 1 },
    etiq:   { id: 'etiq', categoria: 'empaque', nombre: 'Etiqueta', unidad: 'un', precioCompra: 200, cantidadCompra: 1 },
    molde:  { id: 'molde', categoria: 'molde', nombre: 'Molde pilar', unidad: 'un', precioCompra: 30000, cantidadCompra: 1, capacidadG: 200, usos: 100 },
    coco:   { id: 'coco', categoria: 'aceite', nombre: 'Aceite de coco', unidad: 'g', precioCompra: 10000, cantidadCompra: 1000, sapNaoh: 0.183 },
    oliva:  { id: 'oliva', categoria: 'aceite', nombre: 'Aceite de oliva', unidad: 'g', precioCompra: 20000, cantidadCompra: 1000, sapNaoh: 0.134 },
    soda:   { id: 'soda', categoria: 'soda', nombre: 'Soda', unidad: 'g', precioCompra: 15000, cantidadCompra: 1000, pureza: 98 },
    arcilla:{ id: 'arcilla', categoria: 'aditivo', nombre: 'Arcilla', unidad: 'g', precioCompra: 10000, cantidadCompra: 500 }
  };

  function velaVaso() {
    return { tipo: 'vela', nombre: 'Vela vaso', unidadesPorLote: 6, manoObraMin: 90, energiaMin: 60,
      extras: [{ insumoId: 'caja', cantidad: 1 }, { insumoId: 'etiq', cantidad: 1 }], costosExtra: [],
      mermaPct: null, margenDetalPct: null, margenMayoristaPct: null, precioActual: null,
      vela: { ceras: [{ insumoId: 'soya', pct: 100 }], envaseId: 'vaso', moldeId: null, llenadoPct: 90, pesoCeraG: null,
              fraganciaId: 'frag', fraganciaPct: 8, colorantes: [], mechas: [{ insumoId: 'mecha', cantidad: 1 }] } };
  }

  t('helpers: costoUnitarioInsumo y redondear', function () {
    near(C.costoUnitarioInsumo(I.soya), 38, 1e-9);
    eq(C.costoUnitarioInsumo(null), 0);
    eq(C.redondear(39361.76, 500), 39500);
    eq(C.redondear(39500, 500), 39500);
    eq(C.redondear(1234.4, 0), 1234);
  });

  t('helpers: precioDesdeCosto margen vs recargo', function () {
    near(C.precioDesdeCosto(100, 50, 'margen'), 200, 1e-9);
    near(C.precioDesdeCosto(100, 50, 'recargo'), 150, 1e-9);
    eq(C.precioDesdeCosto(100, 100, 'margen'), null);
  });

  t('Ejemplo 1: vela en vaso (costos)', function () {
    var r = C.calcular(velaVaso(), I, S);
    near(C.pesoCeraUnidad(velaVaso(), I), 194.4, 1e-6, 'pesoCera');
    near(r.tecnico.vela.fraganciaGUnidad, 15.552, 1e-6, 'fragancia g');
    near(r.costos.materialesLote, 74120.64, 0.01, 'materiales');
    near(r.costos.extrasLote, 10200, 0.01, 'extras');
    near(r.costos.mermaLote, 2529.6192, 0.01, 'merma');
    near(r.costos.manoObraLote, 18000, 0.01, 'mano obra');
    near(r.costos.energiaLote, 2500, 0.01, 'energia');
    near(r.costos.indirectosLote, 10735.026, 0.01, 'indirectos');
    near(r.costos.totalLote, 118085.285, 0.01, 'total lote');
    near(r.costos.totalUnidad, 19680.881, 0.01, 'total unidad');
    eq(r.ok, true, 'ok');
  });

  t('Ejemplo 1: vela en vaso (precios)', function () {
    var r = C.calcular(velaVaso(), I, S);
    near(r.precio.detal.base, 39361.76, 0.01, 'base detal');
    eq(r.precio.detal.final, 39500, 'final detal');
    near(r.precio.detal.utilidadUnidad, 19819.12, 0.01, 'utilidad');
    near(r.precio.detal.margenRealPct, 50.17, 0.01, 'margen real');
    eq(r.precio.mayorista.final, 28500, 'final mayorista');
    near(r.precio.minimo, r.costos.totalUnidad, 1e-9, 'minimo');
  });

  t('Con comisión e IVA: conComision, conIva y utilidad real', function () {
    var s = copy(S); s.aplicarComision = true; s.aplicarIva = true;
    var r = C.calcular(velaVaso(), I, s);
    var cc = (39361.7617 + 900) / (1 - 0.034);
    near(r.precio.detal.conComision, cc, 0.5, 'conComision');
    near(r.precio.detal.conIva, cc * 1.19, 0.5, 'conIva');
    eq(r.precio.detal.final % 500, 0, 'redondeo');
    truthy(r.precio.detal.final >= r.precio.detal.conIva, 'final >= conIva');
    var sinIva = r.precio.detal.final / 1.19;
    near(r.precio.detal.utilidadUnidad, sinIva - (sinIva * 0.034 + 900) - r.costos.totalUnidad, 0.01, 'utilidad');
  });

  t('Método recargo', function () {
    var s = copy(S); s.metodoPrecio = 'recargo';
    var r = C.calcular(velaVaso(), I, s);
    near(r.precio.detal.base, 19680.881 * 1.5, 0.05);
    eq(r.precio.metodo, 'recargo');
  });

  t('Ejemplo 2: vela en molde con mezcla de ceras 70/30', function () {
    var rec = { tipo: 'vela', unidadesPorLote: 4, manoObraMin: 60, energiaMin: 30, extras: [], costosExtra: [],
      vela: { ceras: [{ insumoId: 'soya', pct: 70 }, { insumoId: 'parafina', pct: 30 }], envaseId: null, moldeId: 'molde',
              llenadoPct: 90, pesoCeraG: null, fraganciaId: 'frag', fraganciaPct: 6, colorantes: [], mechas: [{ insumoId: 'mecha', cantidad: 1 }] } };
    var r = C.calcular(rec, I, S);
    near(r.tecnico.vela.cerasTotalGUnidad, 200, 1e-9, 'peso');
    near(r.tecnico.vela.cerasG[0].g, 140, 1e-9);
    near(r.tecnico.vela.cerasG[1].g, 60, 1e-9);
    near(r.tecnico.vela.fraganciaGUnidad, 12, 1e-9);
    near(r.costos.materialesLote, 31520, 0.01, 'materiales'); // (5320+720+1440+300+100)*4
    near(r.costos.mermaLote, 945.6, 0.01, 'merma');
    near(r.costos.manoObraLote, 12000, 0.01);
    near(r.costos.energiaLote, 1250, 0.01);
    near(r.costos.indirectosLote, 4571.56, 0.01, 'indirectos');
    near(r.costos.totalLote, 50287.16, 0.01, 'total lote');
    near(r.costos.totalUnidad, 12571.79, 0.01, 'total unidad');
    eq(r.precio.detal.final, 25500, 'detal');
  });

  function jabonFrio() {
    return { tipo: 'jabon', unidadesPorLote: 10, manoObraMin: 120, energiaMin: 30, extras: [], costosExtra: [],
      jabon: { metodo: 'frio', aceites: [{ insumoId: 'coco', g: 300 }, { insumoId: 'oliva', g: 700 }], bases: [],
               superGrasaPct: 5, aguaPct: 33, sodaId: 'soda', fraganciaId: 'frag', fraganciaPct: 3,
               aditivos: [{ insumoId: 'arcilla', g: 50 }], moldeId: null, moldeUsos: null, mermaCuradoPct: 15, semanasCurado: 4 } };
  }

  t('Ejemplo 3: jabón en frío (lejía)', function () {
    var l = C.calcularLejia(jabonFrio().jabon.aceites, I, 5, 33, 98);
    near(l.naohG, 144.148, 0.001, 'naoh');   // (54.9+93.8)*0.95/0.98
    near(l.aguaG, 330, 1e-9, 'agua');
    near(l.aceitesG, 1000, 1e-9);
  });

  t('Ejemplo 3: jabón en frío (costos y pesos)', function () {
    var r = C.calcular(jabonFrio(), I, S);
    var j = r.tecnico.jabon;
    near(j.crudoG, 1554.148, 0.01, 'crudo');
    near(j.curadoG, 1321.026, 0.01, 'curado');
    near(j.pesoBarraG, 132.1026, 0.01, 'barra');
    near(r.costos.materialesLote, 23762.219, 0.02, 'materiales'); // 17000+2162.22+3600+1000
    near(r.costos.mermaLote, 712.867, 0.01, 'merma');
    near(r.costos.indirectosLote, 4972.509, 0.01, 'indirectos');
    near(r.costos.totalLote, 54697.595, 0.02, 'total lote');
    near(r.costos.totalUnidad, 5469.76, 0.01, 'total unidad');
    eq(r.precio.detal.final, 11000, 'detal');
  });

  t('Jabón en frío sin soda: advertencia de error', function () {
    var rec = jabonFrio(); rec.jabon.sodaId = null;
    var r = C.calcular(rec, I, S);
    eq(r.ok, false);
    truthy(r.advertencias.some(function (a) { return a.nivel === 'error' && /soda/i.test(a.texto); }), 'aviso soda');
  });

  t('Jabón de glicerina sin curado', function () {
    var rec = { tipo: 'jabon', unidadesPorLote: 5, manoObraMin: 30, energiaMin: 10, extras: [], costosExtra: [],
      jabon: { metodo: 'glicerina', aceites: [], bases: [{ insumoId: 'arcilla', g: 500 }], fraganciaPct: 0, aditivos: [], mermaCuradoPct: 15 } };
    var r = C.calcular(rec, I, S);
    near(r.tecnico.jabon.crudoG, 500, 1e-9);
    near(r.tecnico.jabon.curadoG, 500, 1e-9);
    near(r.tecnico.jabon.pesoBarraG, 100, 1e-9);
    near(r.costos.materialesLote, 10000, 0.01);
  });

  t('Advertencias: fragancia 11% aviso, 13% error; mezcla != 100; sin mecha', function () {
    var a = velaVaso(); a.vela.fraganciaPct = 11;
    var ra = C.calcular(a, I, S);
    truthy(ra.advertencias.some(function (x) { return x.nivel === 'aviso' && /10%/.test(x.texto); }), 'aviso 10%');
    eq(ra.ok, true);
    var b = velaVaso(); b.vela.fraganciaPct = 13; b.vela.mechas = []; b.vela.ceras = [{ insumoId: 'soya', pct: 80 }];
    var rb = C.calcular(b, I, S);
    eq(rb.ok, false);
    truthy(rb.advertencias.some(function (x) { return /mecha/i.test(x.texto); }), 'sin mecha');
    truthy(rb.advertencias.some(function (x) { return /80/.test(x.texto); }), 'mezcla');
  });

  t('Comparación con precio actual', function () {
    var a = velaVaso(); a.precioActual = 15000;
    eq(C.calcular(a, I, S).precio.actual.estado, 'perdida');
    a.precioActual = 25000; // margen ~21%
    eq(C.calcular(a, I, S).precio.actual.estado, 'bajo');
    a.precioActual = 45000;
    var r = C.calcular(a, I, S);
    eq(r.precio.actual.estado, 'ok');
    near(r.precio.actual.utilidadUnidad, 45000 - 19680.881, 0.01);
  });

  t('Robustez: margen >= 100 con método margen no da Infinity', function () {
    var a = velaVaso(); a.margenDetalPct = 100;
    var r = C.calcular(a, I, S);
    eq(isFinite(r.precio.detal.final), true, 'finito');
    eq(r.precio.detal.final, 0);
    eq(r.ok, false);
    truthy(r.advertencias.some(function (x) { return x.nivel === 'error'; }));
  });

  t('Robustez: entradas nulas, vacías, strings y NaN', function () {
    [undefined, null, {}, [], 5, 'x', { tipo: 'jabon' }, { tipo: 'vela', vela: {} }].forEach(function (inp) {
      var r = C.calcular(inp, undefined, undefined);
      truthy(r && typeof r.ok === 'boolean' && Array.isArray(r.advertencias), 'forma');
      eq(isFinite(r.costos.totalUnidad), true, 'totalUnidad finito');
    });
    var a = velaVaso();
    a.unidadesPorLote = '0'; a.manoObraMin = 'abc'; a.vela.fraganciaPct = '8,5'; a.mermaPct = NaN;
    var r = C.calcular(a, I, { manoObraHora: '12.000', margenDetalPct: '50' });
    eq(isFinite(r.costos.totalUnidad) && isFinite(r.precio.detal.final), true);
    eq(r.unidades, 1);
    near(r.tecnico.vela.fraganciaGUnidad, 194.4 * 0.085, 1e-6);
  });

  t('Insumo inexistente o con precio 0 solo advierte', function () {
    var a = velaVaso(); a.vela.fraganciaId = 'no-existe';
    var r = C.calcular(a, I, S);
    truthy(r.advertencias.some(function (x) { return /no encontrado/i.test(x.texto); }));
    var i2 = copy(I); i2.mecha.precioCompra = 0;
    var r2 = C.calcular(velaVaso(), i2, S);
    truthy(r2.advertencias.some(function (x) { return /precio 0/.test(x.texto); }));
  });

  t('costosExtra por lote y por unidad', function () {
    var a = velaVaso(); a.costosExtra = [{ concepto: 'Flete', monto: 6000, porLote: true }, { concepto: 'Cinta', monto: 100, porLote: false }];
    var r = C.calcular(a, I, S);
    near(r.costos.extrasLote, 10200 + 6000 + 600, 0.01);
  });

  // ---------- render ----------
  var fails = results.filter(function (x) { return !x.ok; }).length;
  var ul = document.getElementById('lista');
  results.forEach(function (x) {
    var li = document.createElement('li');
    li.className = x.ok ? 'pass' : 'fail';
    li.textContent = (x.ok ? 'OK  ' : 'FALLA  ') + x.name;
    if (!x.ok) { var sm = document.createElement('small'); sm.textContent = x.msg; li.appendChild(sm); }
    ul.appendChild(li);
  });
  var res = document.getElementById('resumen');
  res.className = fails ? 'fail' : 'ok';
  res.textContent = fails ? fails + ' de ' + results.length + ' pruebas fallan' : 'Todas las pruebas pasan (' + results.length + ')';
  document.title = (fails ? 'FALLA' : 'OK') + ' - tests motor';
})();
