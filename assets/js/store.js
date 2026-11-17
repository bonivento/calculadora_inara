/* CI.store — persistencia en localStorage (con respaldo en memoria), migración y eventos. Agente C. */
(function () {
  'use strict';
  window.CI = window.CI || {};

  var SCHEMA = 1;
  var K = { insumos: 'ci.v1.insumos', recetas: 'ci.v1.recetas', settings: 'ci.v1.settings', meta: 'ci.v1.meta' };
  var UNIDADES = ['g', 'ml', 'un'];

  /* ---------- almacenamiento seguro ---------- */
  var mem = {};
  var useMem = false;
  function rawGet(key) {
    if (!useMem) {
      try { return window.localStorage.getItem(key); } catch (e) { useMem = true; }
    }
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
  }
  function rawSet(key, val) {
    if (!useMem) {
      try { window.localStorage.setItem(key, val); return; } catch (e) { useMem = true; }
    }
    mem[key] = val;
  }
  function readJSON(key) {
    var s = rawGet(key);
    if (s == null) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function writeJSON(key, val) { rawSet(key, JSON.stringify(val)); }

  /* ---------- utilidades ---------- */
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function n(v, def) {
    if (typeof v === 'number') return isFinite(v) ? v : def;
    if (typeof v === 'string' && v.trim() !== '') { var x = Number(v.replace(',', '.')); return isFinite(x) ? x : def; }
    return def;
  }
  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'insumo';
  }
  function genId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---------- normalización ---------- */
  function catIds() { return CI.defaults.CATEGORIAS.map(function (c) { return c.id; }); }

  function normInsumo(o) {
    if (!isObj(o)) return null;
    var nombre = String(o.nombre == null ? '' : o.nombre).trim();
    if (!nombre) return null;
    var cat = catIds().indexOf(o.categoria) >= 0 ? o.categoria : 'otro';
    var unidad = UNIDADES.indexOf(o.unidad) >= 0 ? o.unidad : CI.defaults.categoria(cat).unidad;
    var r = {
      id: o.id ? String(o.id) : '',
      categoria: cat, nombre: nombre, unidad: unidad,
      precioCompra: Math.max(0, n(o.precioCompra, 0)),
      cantidadCompra: Math.max(0, n(o.cantidadCompra, 1)),
      proveedor: String(o.proveedor || '').trim(),
      notas: String(o.notas || '').trim()
    };
    ['densidad', 'capacidadMl', 'capacidadG', 'usos', 'sapNaoh', 'pureza'].forEach(function (k) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') {
        var v = n(o[k], null);
        if (v !== null) r[k] = v;
      }
    });
    return r;
  }

  function normSettings(s) {
    var d = CI.defaults.settings();
    if (!isObj(s)) return d;
    var out = {};
    Object.keys(d).forEach(function (k) {
      var def = d[k], v = s[k];
      if (v === undefined || v === null) { out[k] = def; return; }
      if (typeof def === 'number') out[k] = n(v, def);
      else if (typeof def === 'boolean') out[k] = !!v;
      else out[k] = String(v);
    });
    if (out.metodoPrecio !== 'margen' && out.metodoPrecio !== 'recargo') out.metodoPrecio = 'margen';
    return out;
  }

  function normReceta(r) {
    if (!isObj(r)) return null;
    if (r.tipo !== 'vela' && r.tipo !== 'jabon') return null;
    var out = clone(r);
    out.id = r.id ? String(r.id) : '';
    out.nombre = String(r.nombre || 'Sin nombre');
    if (!Array.isArray(out.extras)) out.extras = [];
    if (!Array.isArray(out.costosExtra)) out.costosExtra = [];
    if (!out.creado) out.creado = nowISO();
    if (!out.actualizado) out.actualizado = out.creado;
    return out;
  }

  /* ---------- estado ---------- */
  var state = null;
  var listeners = [];

  function emit(tipo) {
    listeners.slice().forEach(function (fn) {
      try { fn({ tipo: tipo }); } catch (e) { if (window.console) console.error(e); }
    });
  }

  function seed() {
    return {
      insumos: CI.defaults.insumos(),
      recetas: CI.defaults.recetas(),
      settings: CI.defaults.settings()
    };
  }

  function persist(which) {
    var list = which ? [which] : ['insumos', 'recetas', 'settings'];
    list.forEach(function (k) { writeJSON(K[k], state[k]); });
    writeJSON(K.meta, { version: SCHEMA, seeded: true });
    if (syncHook) { try { syncHook(which || null); } catch (e) { if (window.console) console.error(e); } }
  }
  var syncHook = null;

  // Migración por versión: cada paso lleva de version v a v+1
  function migrate(data, from) {
    // v0 -> v1: normalizar todo (por si hay datos sin esquema)
    if (from < 1) {
      data.insumos = (data.insumos || []).map(normInsumo).filter(Boolean);
      data.recetas = (data.recetas || []).map(normReceta).filter(Boolean);
    }
    data.settings = normSettings(data.settings);
    return data;
  }

  function load() {
    if (state) return state;
    var meta = readJSON(K.meta);
    var ins = readJSON(K.insumos), rec = readJSON(K.recetas), set = readJSON(K.settings);
    if (!meta && ins === null && rec === null && set === null) {
      state = seed();
      persist();
      return state;
    }
    var from = meta && typeof meta.version === 'number' ? meta.version : 0;
    state = migrate({
      insumos: Array.isArray(ins) ? ins : [],
      recetas: Array.isArray(rec) ? rec : [],
      settings: set
    }, from);
    if (from !== SCHEMA) persist();
    return state;
  }

  /* ---------- referencias a insumos ---------- */
  function refsDeReceta(r) {
    var ids = [];
    function add(id) { if (id) ids.push(id); }
    function addList(l) { (l || []).forEach(function (x) { add(x && x.insumoId); }); }
    addList(r.extras);
    if (r.vela) {
      addList(r.vela.ceras); add(r.vela.envaseId); add(r.vela.moldeId); add(r.vela.fraganciaId);
      addList(r.vela.colorantes); addList(r.vela.mechas);
    }
    if (r.jabon) {
      addList(r.jabon.aceites); addList(r.jabon.bases); add(r.jabon.sodaId);
      add(r.jabon.fraganciaId); addList(r.jabon.aditivos); add(r.jabon.moldeId);
    }
    return ids;
  }

  function usadoEn(id) {
    var out = [];
    load().recetas.forEach(function (r) {
      if (refsDeReceta(r).indexOf(id) >= 0) out.push(r.nombre);
    });
    return out;
  }

  /* ---------- API ---------- */
  var store = {
    SCHEMA: SCHEMA,
    // true si localStorage no está disponible y se usa memoria (los datos se pierden al cerrar)
    isVolatile: function () { load(); return useMem; },

    getSettings: function () { return clone(load().settings); },
    saveSettings: function (patch) {
      var s = load();
      s.settings = normSettings(Object.assign({}, s.settings, patch || {}));
      persist('settings');
      emit('settings');
      return clone(s.settings);
    },

    listInsumos: function () { return clone(load().insumos); },
    getInsumo: function (id) {
      var l = load().insumos;
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return clone(l[i]);
      return null;
    },
    insumosById: function () {
      var m = {};
      load().insumos.forEach(function (i) { m[i.id] = clone(i); });
      return m;
    },
    saveInsumo: function (obj) {
      var s = load();
      var o = normInsumo(obj);
      if (!o) throw new Error('Insumo inválido: falta el nombre.');
      var l = s.insumos;
      if (!o.id) {
        var base = slug(o.nombre), id = base, k = 2;
        while (l.some(function (x) { return x.id === id; })) id = base + '-' + (k++);
        o.id = id;
      }
      var idx = -1;
      for (var i = 0; i < l.length; i++) if (l[i].id === o.id) { idx = i; break; }
      if (idx >= 0) l[idx] = o; else l.push(o);
      persist('insumos');
      emit('insumos');
      return clone(o);
    },
    usadoEn: usadoEn,
    // Mapa id -> [nombres de recetas] para todos los insumos usados
    usoMap: function () {
      var m = {};
      load().recetas.forEach(function (r) {
        refsDeReceta(r).forEach(function (id) {
          (m[id] = m[id] || []);
          if (m[id].indexOf(r.nombre) < 0) m[id].push(r.nombre);
        });
      });
      return m;
    },
    // Si está en uso y no se pasa {force:true}, NO elimina y devuelve {ok:false, usadoEn}.
    deleteInsumo: function (id, opts) {
      var s = load();
      var usado = usadoEn(id);
      if (usado.length && !(opts && opts.force)) return { ok: false, usadoEn: usado };
      var antes = s.insumos.length;
      s.insumos = s.insumos.filter(function (x) { return x.id !== id; });
      if (s.insumos.length === antes) return { ok: false, usadoEn: usado, error: 'No existe' };
      persist('insumos');
      emit('insumos');
      return { ok: true, usadoEn: usado };
    },

    listRecetas: function () { return clone(load().recetas); },
    getReceta: function (id) {
      var l = load().recetas;
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return clone(l[i]);
      return null;
    },
    saveReceta: function (obj) {
      var s = load();
      var r = clone(obj);
      if (!r.id) r.id = genId('r-');
      var now = nowISO();
      var idx = -1;
      for (var i = 0; i < s.recetas.length; i++) if (s.recetas[i].id === r.id) { idx = i; break; }
      r.creado = (idx >= 0 && s.recetas[idx].creado) || r.creado || now;
      r.actualizado = now;
      if (idx >= 0) s.recetas[idx] = r; else s.recetas.push(r);
      persist('recetas');
      emit('recetas');
      return clone(r);
    },
    deleteReceta: function (id) {
      var s = load();
      var antes = s.recetas.length;
      s.recetas = s.recetas.filter(function (r) { return r.id !== id; });
      if (s.recetas.length === antes) return { ok: false };
      persist('recetas');
      emit('recetas');
      return { ok: true };
    },
    duplicateReceta: function (id) {
      var src = store.getReceta(id);
      if (!src) return null;
      src.id = '';
      src.nombre = src.nombre + ' (copia)';
      src.creado = nowISO();
      return store.saveReceta(src);
    },
    newReceta: function (tipo) {
      var now = nowISO();
      var r = {
        id: '', tipo: tipo === 'jabon' ? 'jabon' : 'vela', nombre: '', formato: '', notas: '',
        unidadesPorLote: tipo === 'jabon' ? 10 : 6, manoObraMin: 60, energiaMin: 30,
        extras: [], costosExtra: [],
        mermaPct: null, margenDetalPct: null, margenMayoristaPct: null, precioActual: null,
        creado: now, actualizado: now
      };
      if (r.tipo === 'vela') {
        r.vela = {
          ceras: [], envaseId: null, moldeId: null, llenadoPct: 90, pesoCeraG: null,
          fraganciaId: null, fraganciaPct: 8, colorantes: [], mechas: []
        };
      } else {
        r.jabon = {
          metodo: 'frio', aceites: [], bases: [], superGrasaPct: 5, aguaPct: 33, sodaId: null,
          fraganciaId: null, fraganciaPct: 3, aditivos: [], moldeId: null, moldeUsos: null,
          mermaCuradoPct: 15, semanasCurado: 4
        };
      }
      return r;
    },

    exportAll: function () {
      var s = load();
      return JSON.stringify({
        version: SCHEMA, app: 'calculadora-inara', exportado: nowISO(),
        insumos: s.insumos, recetas: s.recetas, settings: s.settings
      }, null, 2);
    },
    // Valida todo antes de tocar los datos actuales.
    importAll: function (jsonString, opts) {
      var reemplazar = !!(opts && opts.reemplazar);
      var data;
      try { data = JSON.parse(jsonString); } catch (e) { return { ok: false, error: 'El archivo no es un JSON válido.' }; }
      if (!isObj(data)) return { ok: false, error: 'El archivo no tiene el formato esperado.' };
      if (typeof data.version === 'number' && data.version > SCHEMA) {
        return { ok: false, error: 'La copia es de una versión más nueva de la calculadora.' };
      }
      if (!Array.isArray(data.insumos) && !Array.isArray(data.recetas) && !isObj(data.settings)) {
        return { ok: false, error: 'No se encontraron insumos, recetas ni ajustes en el archivo.' };
      }
      var insumos = [], recetas = [], descartados = 0;
      (data.insumos || []).forEach(function (x) {
        var o = normInsumo(x);
        if (o && o.id) insumos.push(o); else descartados++;
      });
      (data.recetas || []).forEach(function (x) {
        var r = normReceta(x);
        if (r && r.id) recetas.push(r); else descartados++;
      });
      if (!insumos.length && !recetas.length && !isObj(data.settings)) {
        return { ok: false, error: 'No hay datos válidos para importar.' };
      }
      var s = load();
      if (reemplazar) {
        s.insumos = insumos;
        s.recetas = recetas;
        if (isObj(data.settings)) s.settings = normSettings(data.settings);
      } else {
        insumos.forEach(function (o) {
          var i = s.insumos.findIndex(function (x) { return x.id === o.id; });
          if (i >= 0) s.insumos[i] = o; else s.insumos.push(o);
        });
        recetas.forEach(function (r) {
          var i = s.recetas.findIndex(function (x) { return x.id === r.id; });
          if (i >= 0) s.recetas[i] = r; else s.recetas.push(r);
        });
        if (isObj(data.settings)) s.settings = normSettings(Object.assign({}, s.settings, data.settings));
      }
      persist();
      emit('insumos'); emit('recetas'); emit('settings');
      return { ok: true, insumos: insumos.length, recetas: recetas.length, descartados: descartados };
    },
    resetDefaults: function () {
      state = seed();
      persist();
      emit('insumos'); emit('recetas'); emit('settings');
      return { ok: true };
    },

    /* ---- ganchos para la nube (CI.cloud) ---- */
    _setSyncHook: function (fn) { syncHook = typeof fn === 'function' ? fn : null; },
    // Reemplaza datos con los del servidor SIN disparar la subida. Parcial: solo las claves presentes.
    _applyRemote: function (data) {
      var s = load();
      if (data.insumos) s.insumos = data.insumos.map(normInsumo).filter(function (x) { return x && x.id; });
      if (data.recetas) s.recetas = data.recetas.map(normReceta).filter(function (x) { return x && x.id; });
      if (data.settings) s.settings = normSettings(data.settings);
      var hook = syncHook; syncHook = null;
      try { persist(); } finally { syncHook = hook; }
      if (data.insumos) emit('insumos');
      if (data.recetas) emit('recetas');
      if (data.settings) emit('settings');
    },
    // Borra todo rastro local (al cerrar sesión en un equipo compartido).
    _wipeLocal: function () {
      [K.insumos, K.recetas, K.settings, K.meta, 'ci.v1.team'].forEach(function (k) {
        try { window.localStorage.removeItem(k); } catch (e) {}
        delete mem[k];
      });
      state = null;
    },
    _raw: { get: rawGet, set: rawSet },

    on: function (fn) { if (typeof fn === 'function' && listeners.indexOf(fn) < 0) listeners.push(fn); },
    off: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }
  };

  window.CI.store = store;
})();
