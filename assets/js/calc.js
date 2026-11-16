/* Motor de cálculo de costos y precios — Inara by Alma.
 * Script clásico, sin DOM. Define window.CI.calc. Nunca lanza excepciones. */
(function (root) {
  'use strict';
  var CI = root.CI = root.CI || {};

  // ---------- utilidades ----------
  function num(v, def) {
    if (def === undefined) def = 0;
    if (typeof v === 'number') return isFinite(v) ? v : def;
    if (typeof v === 'string') {
      var s = v.replace(/[\s$%]/g, '');
      if (s === '' || s === '-' ) return def;
      var c = s.indexOf(','), d = s.indexOf('.');
      if (c >= 0 && d >= 0) {
        if (c > d) s = s.replace(/\./g, '').replace(',', '.');   // 1.234,5
        else s = s.replace(/,/g, '');                              // 1,234.5
      } else if (c >= 0) {
        s = s.replace(',', '.');
      } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
        s = s.replace(/\./g, '');                                  // 12.000 (es-CO miles)
      }
      var n = parseFloat(s);
      return isFinite(n) ? n : def;
    }
    return def;
  }
  // número o null (para overrides opcionales)
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = num(v, NaN);
    return isFinite(n) ? n : null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }

  var DEF_SETTINGS = {
    manoObraHora: 12000, energiaHora: 2500, indirectosPct: 10, mermaPct: 3,
    metodoPrecio: 'margen', margenDetalPct: 50, margenMayoristaPct: 30, redondeoA: 500,
    comisionPct: 3.4, comisionFija: 900, aplicarComision: false, ivaPct: 19, aplicarIva: false
  };

  function normSettings(s) {
    s = s || {};
    var o = {};
    for (var k in DEF_SETTINGS) {
      if (typeof DEF_SETTINGS[k] === 'number') o[k] = num(s[k], DEF_SETTINGS[k]);
    }
    o.metodoPrecio = s.metodoPrecio === 'recargo' ? 'recargo' : 'margen';
    o.aplicarComision = s.aplicarComision === true || s.aplicarComision === 'true';
    o.aplicarIva = s.aplicarIva === true || s.aplicarIva === 'true';
    return o;
  }

  function costoUnitarioInsumo(ins) {
    if (!ins) return 0;
    var cant = num(ins.cantidadCompra, 0), precio = num(ins.precioCompra, 0);
    return cant > 0 ? precio / cant : 0;
  }

  function redondear(valor, paso) {
    var v = num(valor, 0), p = num(paso, 0);
    if (p > 0) return Math.ceil(v / p - 1e-9) * p;
    return Math.round(v);
  }

  // Precio base desde costo. Devuelve null si el margen es >= 100% (método margen).
  function precioDesdeCosto(costo, margenPct, metodo) {
    var c = num(costo, 0), m = num(margenPct, 0) / 100;
    if (metodo === 'recargo') return Math.max(0, c * (1 + m));
    if (m >= 1) return null;
    return Math.max(0, c / (1 - m));
  }

  function densidadMezcla(ceras, byId) {
    var sum = 0, acc = 0;
    arr(ceras).forEach(function (c) {
      var p = num(c && c.pct, 0);
      if (p <= 0) return;
      var ins = byId && byId[c.insumoId];
      var d = ins ? num(ins.densidad, 0.9) : 0.9;
      if (d <= 0) d = 0.9;
      sum += p; acc += p * d;
    });
    return sum > 0 ? acc / sum : 0.9;
  }

  function pesoCeraUnidad(receta, byId) {
    try {
      var v = receta && receta.vela;
      if (!v) return 0;
      byId = byId || {};
      var manual = numOrNull(v.pesoCeraG);
      if (manual !== null && manual > 0) return manual;
      var env = v.envaseId ? byId[v.envaseId] : null;
      if (env && num(env.capacidadMl, 0) > 0) {
        var llen = numOrNull(v.llenadoPct); if (llen === null) llen = 90;
        return num(env.capacidadMl, 0) * llen / 100 * densidadMezcla(v.ceras, byId);
      }
      var mol = v.moldeId ? byId[v.moldeId] : null;
      if (mol && num(mol.capacidadG, 0) > 0) return num(mol.capacidadG, 0);
      return 0;
    } catch (e) { return 0; }
  }

  function calcularLejia(aceites, byId, superGrasaPct, aguaPct, pureza) {
    byId = byId || {};
    var aceitesG = 0, sap = 0, faltan = [];
    arr(aceites).forEach(function (a) {
      var g = num(a && a.g, 0);
      if (g <= 0) return;
      var ins = byId[a.insumoId];
      aceitesG += g;
      var s = ins ? num(ins.sapNaoh, 0) : 0;
      if (s <= 0) faltan.push(ins ? ins.nombre : '(insumo no encontrado)');
      sap += g * s;
    });
    var sg = num(superGrasaPct, 0);
    var pu = num(pureza, 100); if (pu <= 0 || pu > 100) pu = 100;
    return {
      naohG: sap * (1 - sg / 100) / (pu / 100),
      aguaG: num(aguaPct, 0) / 100 * aceitesG,
      aceitesG: aceitesG,
      sinSap: faltan
    };
  }

  // ---------- precio ----------
  function calcPrecio(costo, margenPct, s, adv, etiqueta, actualPrice) {
    var out = { margenPct: margenPct, base: 0, conComision: 0, conIva: 0, final: 0, comision: 0,
                precioSinIva: 0, utilidadUnidad: 0, margenRealPct: 0, recargoRealPct: 0 };
    var base = precioDesdeCosto(costo, margenPct, s.metodoPrecio);
    if (base === null) {
      adv.push({ nivel: 'error', texto: 'Margen ' + etiqueta + ' de ' + margenPct + '% no es válido con el método margen (debe ser menor a 100%). Usa recargo o baja el margen.' });
      return out;
    }
    out.base = base;
    var cc = base, comOk = s.aplicarComision;
    if (comOk) {
      if (s.comisionPct >= 100) {
        adv.push({ nivel: 'error', texto: 'La comisión porcentual debe ser menor a 100%.' });
        comOk = false;
      } else {
        cc = (base + s.comisionFija) / (1 - s.comisionPct / 100);
      }
    }
    out.conComision = cc;
    out.conIva = s.aplicarIva ? cc * (1 + s.ivaPct / 100) : cc;
    out.final = redondear(out.conIva, s.redondeoA);
    fillReal(out, out.final, costo, s, comOk);
    return out;
  }

  // calcula utilidad/margen reales sobre un precio al cliente
  function fillReal(out, precio, costo, s, comOk) {
    var sinIva = s.aplicarIva ? precio / (1 + s.ivaPct / 100) : precio;
    var com = (comOk && s.aplicarComision) ? sinIva * s.comisionPct / 100 + s.comisionFija : 0;
    out.precioSinIva = sinIva;
    out.comision = com;
    out.utilidadUnidad = sinIva - com - costo;
    out.margenRealPct = sinIva > 0 ? out.utilidadUnidad / sinIva * 100 : 0;
    out.recargoRealPct = costo > 0 ? out.utilidadUnidad / costo * 100 : 0;
    return out;
  }

  // ---------- resultado vacío ----------
  function vacio() {
    return {
      ok: false, unidades: 1, lineas: [],
      costos: { materialesLote: 0, extrasLote: 0, manoObraLote: 0, energiaLote: 0, mermaLote: 0, indirectosLote: 0, totalLote: 0,
                materialesUnidad: 0, extrasUnidad: 0, manoObraUnidad: 0, energiaUnidad: 0, indirectosUnidad: 0, mermaUnidad: 0, totalUnidad: 0 },
      tecnico: {},
      precio: { metodo: 'margen', detal: calcPrecioVacio(), mayorista: calcPrecioVacio(), minimo: 0 },
      advertencias: []
    };
  }
  function calcPrecioVacio() {
    return { base: 0, conComision: 0, conIva: 0, final: 0, comision: 0, precioSinIva: 0, utilidadUnidad: 0, margenRealPct: 0, recargoRealPct: 0 };
  }

  // ---------- cálculo principal ----------
  function calcular(receta, byId, settings) {
    var res = vacio();
    try {
      return calcularInterno(receta, byId || {}, settings, res);
    } catch (e) {
      res.ok = false;
      res.advertencias.push({ nivel: 'error', texto: 'No se pudo calcular: ' + (e && e.message ? e.message : 'error desconocido') });
      return res;
    }
  }

  function calcularInterno(r, byId, settings, res) {
    var s = normSettings(settings);
    var adv = res.advertencias;
    var lineas = res.lineas;
    if (!r || typeof r !== 'object') {
      adv.push({ nivel: 'error', texto: 'Receta vacía.' });
      return res;
    }
    var unidades = num(r.unidadesPorLote, 0);
    if (unidades <= 0) {
      adv.push({ nivel: 'error', texto: 'Las unidades por lote deben ser mayores a 0 (se usó 1 para calcular).' });
      unidades = 1;
    }
    res.unidades = unidades;

    var avisoPrecio0 = {};
    function insumo(id, rol) {
      if (!id) return null;
      var ins = byId[id];
      if (!ins) { adv.push({ nivel: 'aviso', texto: 'Insumo no encontrado (' + rol + '); se cuenta como costo 0.' }); return null; }
      if (num(ins.precioCompra, 0) <= 0 && !avisoPrecio0[id]) {
        avisoPrecio0[id] = true;
        adv.push({ nivel: 'aviso', texto: 'El insumo «' + ins.nombre + '» tiene precio 0; revisa Insumos.' });
      }
      return ins;
    }
    var matLote = 0;
    // agrega una línea de materiales. cantLote en unidad del insumo; factor divide el costo (amortización)
    function mat(ins, cantLote, concepto, factor, unidadTxt) {
      var cu = costoUnitarioInsumo(ins) / (factor || 1);
      var costoLote = cantLote * cu;
      matLote += costoLote;
      lineas.push({ grupo: 'materiales', concepto: concepto || (ins && ins.nombre) || 'Insumo', cantidad: cantLote,
        unidad: unidadTxt || (ins && ins.unidad) || '', costoLote: costoLote, costoUnidad: costoLote / unidades,
        categoria: ins ? ins.categoria : undefined });
      return costoLote;
    }

    var tipo = r.tipo === 'jabon' ? 'jabon' : 'vela';
    if (r.tipo !== 'vela' && r.tipo !== 'jabon') adv.push({ nivel: 'aviso', texto: 'Tipo de receta desconocido; se calculó como vela.' });

    // ===== VELA =====
    if (tipo === 'vela') {
      var v = r.vela || {};
      var tv = { cerasG: [], cerasTotalGUnidad: 0, fraganciaGUnidad: 0, pesoUnidadG: 0, densidadMezcla: 0 };
      var ceras = arr(v.ceras).filter(function (c) { return c && c.insumoId; });
      var sumPct = 0;
      ceras.forEach(function (c) { sumPct += Math.max(0, num(c.pct, 0)); });
      var peso = pesoCeraUnidad(r, byId);
      tv.cerasTotalGUnidad = peso;
      tv.densidadMezcla = densidadMezcla(ceras, byId);

      if (ceras.length === 0 || sumPct <= 0) {
        adv.push({ nivel: 'aviso', texto: 'No has definido la cera (o los porcentajes de la mezcla están en 0).' });
      } else {
        if (Math.abs(sumPct - 100) > 0.01) adv.push({ nivel: 'aviso', texto: 'La mezcla de ceras suma ' + (Math.round(sumPct * 10) / 10) + '% (debería ser 100%); se normalizó para calcular.' });
        ceras.forEach(function (c) {
          var p = Math.max(0, num(c.pct, 0));
          if (p <= 0) return;
          var ins = insumo(c.insumoId, 'cera');
          var gU = peso * p / sumPct;
          tv.cerasG.push({ insumoId: c.insumoId, g: gU });
          mat(ins, gU * unidades, ins ? ins.nombre : 'Cera', 1, 'g');
        });
      }
      if (peso <= 0) adv.push({ nivel: 'aviso', texto: 'No se puede determinar el peso de cera: elige envase o molde, o escribe el peso manual.' });

      // fragancia
      var fPct = numOrNull(v.fraganciaPct); if (fPct === null) fPct = 0;
      var fG = peso * fPct / 100;
      tv.fraganciaGUnidad = fG;
      if (fPct > 12) adv.push({ nivel: 'error', texto: 'Fragancia al ' + fPct + '%: excede el 12%, es crítico (riesgo de sudado, mala combustión e incluso incendio).' });
      else if (fPct > 10) adv.push({ nivel: 'aviso', texto: 'Fragancia al ' + fPct + '%: supera el 10%; el límite típico en soya es 6–10%.' });
      if (v.fraganciaId) {
        var fi = insumo(v.fraganciaId, 'fragancia');
        if (fG > 0) mat(fi, fG * unidades, fi ? fi.nombre : 'Fragancia', 1, 'g');
      } else if (fPct > 0) {
        adv.push({ nivel: 'info', texto: 'Hay % de fragancia pero no elegiste una fragancia; no se suma su costo.' });
      }
      tv.pesoUnidadG = peso + fG;

      arr(v.colorantes).forEach(function (c) {
        if (!c || !c.insumoId) return;
        var q = num(c.cantidad, 0); if (q <= 0) return;
        var ins = insumo(c.insumoId, 'colorante');
        mat(ins, q * unidades, ins ? ins.nombre : 'Colorante');
      });
      var mechas = arr(v.mechas).filter(function (m) { return m && m.insumoId && num(m.cantidad, 0) > 0; });
      if (mechas.length === 0) adv.push({ nivel: 'aviso', texto: 'La vela no tiene mecha.' });
      mechas.forEach(function (m) {
        var ins = insumo(m.insumoId, 'mecha');
        mat(ins, num(m.cantidad, 0) * unidades, ins ? ins.nombre : 'Mecha');
      });

      // envase (amortizado si usos>1; por defecto 1 = un solo uso)
      if (v.envaseId) {
        var env = insumo(v.envaseId, 'envase');
        var usosE = Math.max(1, num(env && env.usos, 1));
        mat(env, unidades, env ? env.nombre : 'Envase', usosE, 'un');
      }
      if (v.moldeId) {
        var mol = insumo(v.moldeId, 'molde');
        var usosM = Math.max(1, num(mol && mol.usos, 100));
        mat(mol, unidades, (mol ? mol.nombre : 'Molde') + ' (amortizado)', usosM, 'un');
      }
      res.tecnico.vela = tv;
    }

    // ===== JABÓN =====
    if (tipo === 'jabon') {
      var j = r.jabon || {};
      var metodo = j.metodo === 'glicerina' ? 'glicerina' : 'frio';
      var tj = { metodo: metodo, naohG: 0, aguaG: 0, aceitesG: 0, basesG: 0, fraganciaG: 0, aditivosG: 0,
                 crudoG: 0, curadoG: 0, pesoBarraG: 0, superGrasaPct: 0, aguaPct: 0, mermaCuradoPct: 0, semanasCurado: 0 };
      var baseG = 0;
      if (metodo === 'frio') {
        var aceites = arr(j.aceites).filter(function (a) { return a && a.insumoId && num(a.g, 0) > 0; });
        var sg = numOrNull(j.superGrasaPct); if (sg === null) sg = 5;
        var aguaPct = numOrNull(j.aguaPct); if (aguaPct === null) aguaPct = 33;
        var soda = j.sodaId ? insumo(j.sodaId, 'soda') : null;
        var pureza = soda ? num(soda.pureza, 100) : 100;
        var lej = calcularLejia(aceites, byId, sg, aguaPct, pureza);
        aceites.forEach(function (a) {
          var ins = insumo(a.insumoId, 'aceite');
          mat(ins, num(a.g, 0), ins ? ins.nombre : 'Aceite', 1, 'g');
        });
        tj.aceitesG = lej.aceitesG; tj.naohG = lej.naohG; tj.aguaG = lej.aguaG;
        tj.superGrasaPct = sg; tj.aguaPct = aguaPct; tj.pureza = pureza;
        baseG = lej.aceitesG;
        if (aceites.length === 0) adv.push({ nivel: 'aviso', texto: 'No has agregado aceites ni mantecas.' });
        if (!j.sodaId) adv.push({ nivel: 'error', texto: 'Falta elegir la soda cáustica para el método en frío (no se cuenta su costo).' });
        else if (soda) mat(soda, lej.naohG, soda.nombre, 1, 'g');
        lej.sinSap.forEach(function (n) { adv.push({ nivel: 'aviso', texto: 'El aceite «' + n + '» no tiene índice de saponificación (sapNaoh); la soda calculada queda corta.' }); });
        if (sg < 0 || sg > 10) adv.push({ nivel: 'aviso', texto: 'Superengrasado de ' + sg + '%: lo habitual es 3–8% (negativo deja jabón corrosivo).' });
        if (aguaPct < 25 || aguaPct > 40) adv.push({ nivel: 'aviso', texto: 'Agua al ' + aguaPct + '% del peso de aceites: fuera del rango típico 25–40%.' });
      } else {
        var bases = arr(j.bases).filter(function (b) { return b && b.insumoId && num(b.g, 0) > 0; });
        bases.forEach(function (b) {
          var ins = insumo(b.insumoId, 'base');
          baseG += num(b.g, 0);
          mat(ins, num(b.g, 0), ins ? ins.nombre : 'Base', 1, 'g');
        });
        tj.basesG = baseG;
        if (bases.length === 0) adv.push({ nivel: 'aviso', texto: 'No has agregado la base de glicerina.' });
      }
      // fragancia (sobre aceites o base)
      var jf = numOrNull(j.fraganciaPct); if (jf === null) jf = 0;
      var jfG = baseG * jf / 100;
      tj.fraganciaG = jfG;
      if (jf > 5) adv.push({ nivel: 'aviso', texto: 'Fragancia al ' + jf + '% en jabón: lo típico es 2–5%.' });
      if (j.fraganciaId) {
        var jfi = insumo(j.fraganciaId, 'fragancia');
        if (jfG > 0) mat(jfi, jfG, jfi ? jfi.nombre : 'Fragancia', 1, 'g');
      }
      var adG = 0;
      arr(j.aditivos).forEach(function (a) {
        if (!a || !a.insumoId) return;
        var g = num(a.g, 0); if (g <= 0) return;
        var ins = insumo(a.insumoId, 'aditivo');
        adG += g;
        mat(ins, g, ins ? ins.nombre : 'Aditivo', 1, 'g');
      });
      tj.aditivosG = adG;
      if (j.moldeId) {
        var mj = insumo(j.moldeId, 'molde');
        var uj = numOrNull(j.moldeUsos);
        var usosJ = Math.max(1, uj !== null && uj > 0 ? uj : num(mj && mj.usos, 100));
        mat(mj, 1, (mj ? mj.nombre : 'Molde') + ' (amortizado)', usosJ, 'un');
      }
      // pesos
      var crudo = baseG + tj.naohG + tj.aguaG + jfG + adG;
      var mc = numOrNull(j.mermaCuradoPct); if (mc === null) mc = metodo === 'frio' ? 15 : 0;
      if (metodo === 'glicerina') mc = 0;
      tj.crudoG = crudo;
      tj.mermaCuradoPct = mc;
      tj.semanasCurado = num(j.semanasCurado, 0);
      tj.curadoG = crudo * (1 - mc / 100);
      tj.pesoBarraG = tj.curadoG / unidades;
      res.tecnico.jabon = tj;
    }

    // ===== extras (por unidad) y costos libres =====
    var extrasLote = 0;
    arr(r.extras).forEach(function (e) {
      if (!e || !e.insumoId) return;
      var q = num(e.cantidad, 0); if (q <= 0) return;
      var ins = insumo(e.insumoId, 'extra');
      var cl = q * unidades * costoUnitarioInsumo(ins);
      extrasLote += cl;
      lineas.push({ grupo: 'extras', concepto: ins ? ins.nombre : 'Extra', cantidad: q * unidades, unidad: ins ? ins.unidad : '',
        costoLote: cl, costoUnidad: cl / unidades, categoria: ins ? ins.categoria : undefined });
    });
    arr(r.costosExtra).forEach(function (c) {
      if (!c) return;
      var m = num(c.monto, 0); if (m === 0) return;
      var cl = (c.porLote === true || c.porLote === 'true') ? m : m * unidades;
      extrasLote += cl;
      lineas.push({ grupo: 'extras', concepto: c.concepto || 'Costo extra', costoLote: cl, costoUnidad: cl / unidades });
    });

    // ===== merma, mano de obra, energía, indirectos =====
    var mermaPct = numOrNull(r.mermaPct); if (mermaPct === null) mermaPct = s.mermaPct;
    var mermaLote = (matLote + extrasLote) * mermaPct / 100;
    if (mermaLote !== 0) lineas.push({ grupo: 'merma', concepto: 'Merma (' + mermaPct + '%)', costoLote: mermaLote, costoUnidad: mermaLote / unidades });

    var moMin = Math.max(0, num(r.manoObraMin, 0));
    var manoObraLote = moMin / 60 * s.manoObraHora;
    if (moMin <= 0 || s.manoObraHora <= 0) adv.push({ nivel: 'aviso', texto: 'La mano de obra es 0: no te estás pagando tu tiempo.' });
    lineas.push({ grupo: 'manoObra', concepto: 'Mano de obra', cantidad: moMin, unidad: 'min', costoLote: manoObraLote, costoUnidad: manoObraLote / unidades });

    var enMin = Math.max(0, num(r.energiaMin, 0));
    var energiaLote = enMin / 60 * s.energiaHora;
    lineas.push({ grupo: 'energia', concepto: 'Energía / gas', cantidad: enMin, unidad: 'min', costoLote: energiaLote, costoUnidad: energiaLote / unidades });

    var indirectosLote = (matLote + extrasLote + mermaLote + manoObraLote + energiaLote) * s.indirectosPct / 100;
    lineas.push({ grupo: 'indirectos', concepto: 'Costos indirectos (' + s.indirectosPct + '%)', costoLote: indirectosLote, costoUnidad: indirectosLote / unidades });

    var totalLote = matLote + extrasLote + mermaLote + manoObraLote + energiaLote + indirectosLote;
    res.costos = {
      materialesLote: matLote, extrasLote: extrasLote, manoObraLote: manoObraLote, energiaLote: energiaLote,
      mermaLote: mermaLote, indirectosLote: indirectosLote, totalLote: totalLote,
      materialesUnidad: matLote / unidades, extrasUnidad: extrasLote / unidades, manoObraUnidad: manoObraLote / unidades,
      energiaUnidad: energiaLote / unidades, indirectosUnidad: indirectosLote / unidades, mermaUnidad: mermaLote / unidades,
      totalUnidad: totalLote / unidades
    };
    var costoU = res.costos.totalUnidad;

    // ===== precio =====
    var mD = numOrNull(r.margenDetalPct); if (mD === null) mD = s.margenDetalPct;
    var mM = numOrNull(r.margenMayoristaPct); if (mM === null) mM = s.margenMayoristaPct;
    res.precio = {
      metodo: s.metodoPrecio,
      detal: calcPrecio(costoU, mD, s, adv, 'detal'),
      mayorista: calcPrecio(costoU, mM, s, adv, 'mayorista'),
      minimo: costoU
    };
    var pa = numOrNull(r.precioActual);
    if (pa !== null && pa > 0) {
      var act = { precio: pa };
      fillReal(act, pa, costoU, s, true);
      var objetivo = s.metodoPrecio === 'recargo' ? act.recargoRealPct : act.margenRealPct;
      act.estado = act.utilidadUnidad < 0 ? 'perdida' : (objetivo < mD - 1e-9 ? 'bajo' : 'ok');
      res.precio.actual = act;
      if (act.utilidadUnidad < 0) adv.push({ nivel: 'error', texto: 'Tu precio actual (' + Math.round(pa) + ') está por debajo del costo: vendes a pérdida.' });
      else if (act.estado === 'bajo') adv.push({ nivel: 'aviso', texto: 'Tu precio actual deja un margen menor al deseado para detal.' });
    }

    res.ok = !adv.some(function (a) { return a.nivel === 'error'; });
    return res;
  }

  CI.calc = {
    calcular: calcular,
    costoUnitarioInsumo: costoUnitarioInsumo,
    pesoCeraUnidad: pesoCeraUnidad,
    calcularLejia: calcularLejia,
    redondear: redondear,
    precioDesdeCosto: precioDesdeCosto,
    num: num
  };
})(typeof window !== 'undefined' ? window : this);
