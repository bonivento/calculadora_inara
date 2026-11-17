/* CI.cloud — Supabase: inicio de sesión, equipo compartido, sincronización y tiempo real.
   El store sigue siendo síncrono (caché local); aquí se suben los cambios por diferencias y se aplican los remotos. */
(function () {
  'use strict';
  window.CI = window.CI || {};

  var cfg = CI.config || {};
  var sb = null, me = null, teamId = null, rol = null, teamName = '';
  var snap = { insumos: {}, recetas: {}, ajustes: null };
  var pushing = false, again = false, timer = null, retryTimer = null, hookOn = false;
  var TEAM_KEY = 'ci.v1.team';

  function esc(s) { return CI.util.escapeHtml(s); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function store() { return CI.store; }

  /* ---------- estado visible ---------- */
  function setStatus(kind) {
    var el = $('#ci-sync');
    if (!el) return;
    var map = {
      ok: ['ci-chip ci-chip-ok', 'cloud_done', 'Sincronizado'],
      saving: ['ci-chip ci-chip-gold', 'sync', 'Guardando…'],
      error: ['ci-chip ci-chip-warn', 'cloud_off', 'Sin conexión · reintentando'],
      local: ['ci-chip', 'cloud_off', 'Solo en este equipo']
    };
    var m = map[kind] || map.local;
    el.className = m[0];
    el.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px" aria-hidden="true">' + m[1] + '</span><span class="hidden sm:inline">' + m[2] + '</span>';
    el.title = m[2];
  }

  function msgError(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(m)) return 'Confirma tu correo con el enlace que te enviamos y vuelve a entrar.';
    if (/User already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Usa «Entrar».';
    if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    return m;
  }

  /* ---------- pantalla de acceso ---------- */
  function overlay() {
    var o = $('#ci-auth');
    if (!o) {
      o = document.createElement('div');
      o.id = 'ci-auth';
      o.style.cssText = 'position:fixed;inset:0;z-index:100;overflow:auto;background:#fafaee;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1.25rem';
      document.body.appendChild(o);
    }
    return o;
  }

  function showBlocked(texto) {
    var o = overlay();
    o.innerHTML = '<div class="ci-card" style="max-width:26rem;width:100%;margin-top:6vh;text-align:center">' +
      '<img src="assets/brand/logo-vertical-negro.png" alt="Inara by Alma" style="height:72px;margin:0 auto 1rem">' +
      '<h1 class="font-headline text-headline-sm" style="margin-bottom:.5rem">Acceso pendiente</h1>' +
      '<p class="ci-muted" style="margin-bottom:1.25rem">' + esc(texto) + '</p>' +
      '<button type="button" class="ci-btn ci-btn-ghost" id="ci-auth-out">Cerrar sesión</button></div>';
    $('#ci-auth-out', o).addEventListener('click', signOut);
  }

  function showLogin() {
    return new Promise(function (resolve) {
      var o = overlay(), modo = 'entrar';
      function pintar(msg, tipo) {
        o.innerHTML =
          '<form class="ci-card" id="ci-auth-form" style="max-width:26rem;width:100%;margin-top:6vh" novalidate>' +
          '<img src="assets/brand/logo-vertical-negro.png" alt="Inara by Alma" style="height:72px;margin:0 auto 1rem;display:block">' +
          '<h1 class="font-headline text-headline-sm" style="text-align:center;margin-bottom:.25rem">Calculadora de precios</h1>' +
          '<p class="ci-muted" style="text-align:center;margin-bottom:1rem">Acceso para el equipo de Inara by Alma</p>' +
          '<div class="ci-seg" role="group" aria-label="Modo" style="margin-bottom:1rem;width:100%">' +
          '<button type="button" class="ci-seg-btn' + (modo === 'entrar' ? ' is-active' : '') + '" data-modo="entrar" aria-pressed="' + (modo === 'entrar') + '" style="flex:1">Entrar</button>' +
          '<button type="button" class="ci-seg-btn' + (modo === 'crear' ? ' is-active' : '') + '" data-modo="crear" aria-pressed="' + (modo === 'crear') + '" style="flex:1">Crear cuenta</button></div>' +
          '<div class="ci-field"><label class="ci-label" for="ci-a-mail">Correo</label><input class="ci-input" id="ci-a-mail" type="email" autocomplete="email" required></div>' +
          '<div class="ci-field"><label class="ci-label" for="ci-a-pass">Contraseña</label><input class="ci-input" id="ci-a-pass" type="password" autocomplete="' + (modo === 'crear' ? 'new-password' : 'current-password') + '" minlength="6" required></div>' +
          '<div id="ci-a-msg" role="alert" class="ci-alert ci-alert-' + (tipo || 'info') + '" style="margin:.75rem 0;' + (msg ? '' : 'display:none') + '">' + esc(msg || '') + '</div>' +
          '<button type="submit" class="ci-btn ci-btn-primary" style="width:100%;justify-content:center">' + (modo === 'crear' ? 'Crear cuenta' : 'Entrar') + '</button>' +
          '<p style="text-align:center;margin-top:1rem"><button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" id="ci-a-link">Enviarme un enlace de acceso</button></p>' +
          (modo === 'crear' ? '<p class="ci-hint" style="text-align:center">Solo podrás entrar si un administrador del equipo invitó tu correo.</p>' : '') +
          '</form>';
        o.querySelectorAll('[data-modo]').forEach(function (b) {
          b.addEventListener('click', function () { modo = b.getAttribute('data-modo'); pintar(); });
        });
        $('#ci-a-link', o).addEventListener('click', enlace);
        $('#ci-auth-form', o).addEventListener('submit', enviar);
        $('#ci-a-mail', o).focus();
      }
      function vals() { return { mail: $('#ci-a-mail', o).value.trim().toLowerCase(), pass: $('#ci-a-pass', o).value }; }
      function ocupado(v) { o.querySelectorAll('button,input').forEach(function (e) { e.disabled = v; }); }

      async function enviar(ev) {
        ev.preventDefault();
        var v = vals();
        if (!v.mail || !v.pass) return pintar('Escribe tu correo y contraseña.', 'aviso');
        ocupado(true);
        try {
          var r = modo === 'crear'
            ? await sb.auth.signUp({ email: v.mail, password: v.pass, options: { emailRedirectTo: location.origin + location.pathname } })
            : await sb.auth.signInWithPassword({ email: v.mail, password: v.pass });
          if (r.error) throw r.error;
          if (r.data && r.data.session) { o.remove(); return resolve(r.data.session); }
          pintar('Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve aquí a «Entrar».', 'info');
        } catch (e) { pintar(msgError(e), 'error'); }
      }
      async function enlace() {
        var v = vals();
        if (!v.mail) return pintar('Escribe tu correo para enviarte el enlace.', 'aviso');
        ocupado(true);
        try {
          var r = await sb.auth.signInWithOtp({ email: v.mail, options: { emailRedirectTo: location.origin + location.pathname } });
          if (r.error) throw r.error;
          pintar('Listo: revisa tu correo y abre el enlace (en este mismo navegador).', 'info');
        } catch (e) { pintar(msgError(e), 'error'); }
      }
      // Si el enlace mágico abre otra pestaña/sesión, también se resuelve aquí.
      sb.auth.onAuthStateChange(function (evt, session) {
        if (session && $('#ci-auth') && evt === 'SIGNED_IN') { var x = $('#ci-auth'); if (x) x.remove(); resolve(session); }
      });
      pintar();
    });
  }

  /* ---------- sesión ---------- */
  async function signOut() {
    try { await sb.auth.signOut(); } catch (e) {}
    store()._wipeLocal();
    location.href = location.pathname;
  }

  /* ---------- carga inicial y subida por diferencias ---------- */
  function listOf(kind) { return kind === 'insumos' ? store().listInsumos() : store().listRecetas(); }

  function takeSnapshot() {
    ['insumos', 'recetas'].forEach(function (k) {
      snap[k] = {};
      listOf(k).forEach(function (x) { snap[k][x.id] = JSON.stringify(x); });
    });
    snap.ajustes = JSON.stringify(store().getSettings());
  }

  async function pull() {
    var r = await Promise.all([
      sb.from('insumos').select('id,data').eq('equipo_id', teamId),
      sb.from('recetas').select('id,data').eq('equipo_id', teamId),
      sb.from('ajustes').select('data').eq('equipo_id', teamId).maybeSingle()
    ]);
    r.forEach(function (x) { if (x.error) throw x.error; });
    var ins = r[0].data || [], rec = r[1].data || [], aj = r[2].data;
    var localTeam = store()._raw.get(TEAM_KEY);
    var remotoVacio = !ins.length && !rec.length && !aj;

    if (remotoVacio) {
      // Equipo nuevo: sube lo local (tus datos actuales o los de ejemplo).
      if (localTeam && localTeam !== teamId) store().resetDefaults(); // datos locales de otro equipo: no los mezcles
      snap = { insumos: {}, recetas: {}, ajustes: null };
    } else {
      store()._applyRemote({
        insumos: ins.map(function (x) { return Object.assign({}, x.data, { id: x.id }); }),
        recetas: rec.map(function (x) { return Object.assign({}, x.data, { id: x.id }); }),
        settings: aj ? aj.data : undefined
      });
      takeSnapshot();
      if (!aj) snap.ajustes = null; // sube los ajustes locales
    }
    store()._raw.set(TEAM_KEY, teamId);
  }

  function schedulePush(delay) {
    if (!teamId) return;
    clearTimeout(timer);
    timer = setTimeout(pushNow, delay == null ? 500 : delay);
  }

  async function pushNow() {
    if (pushing) { again = true; return; }
    pushing = true; again = false;
    setStatus('saving');
    try {
      var now = new Date().toISOString();
      for (var i = 0; i < 2; i++) {
        var kind = i === 0 ? 'insumos' : 'recetas';
        var cur = {}, up = [], del = [];
        listOf(kind).forEach(function (x) {
          var s = JSON.stringify(x); cur[x.id] = s;
          if (snap[kind][x.id] !== s) up.push(x);
        });
        Object.keys(snap[kind]).forEach(function (id) { if (!(id in cur)) del.push(id); });
        if (up.length) {
          var rows = up.map(function (x) { return { equipo_id: teamId, id: x.id, data: x, updated_at: now, updated_by: me.id }; });
          var e1 = (await sb.from(kind).upsert(rows, { onConflict: 'equipo_id,id' })).error;
          if (e1) throw e1;
          up.forEach(function (x) { snap[kind][x.id] = cur[x.id]; });
        }
        if (del.length) {
          var e2 = (await sb.from(kind).delete().eq('equipo_id', teamId).in('id', del)).error;
          if (e2) throw e2;
          del.forEach(function (id) { delete snap[kind][id]; });
        }
      }
      var st = JSON.stringify(store().getSettings());
      if (st !== snap.ajustes) {
        var e3 = (await sb.from('ajustes').upsert({ equipo_id: teamId, data: store().getSettings(), updated_at: now, updated_by: me.id }, { onConflict: 'equipo_id' })).error;
        if (e3) throw e3;
        snap.ajustes = st;
      }
      clearTimeout(retryTimer);
      setStatus('ok');
    } catch (e) {
      if (window.console) console.error('Sincronización:', e);
      setStatus('error');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(pushNow, 15000);
    } finally {
      pushing = false;
      if (again) schedulePush(100);
    }
  }

  /* ---------- tiempo real ---------- */
  function onRemote(table, p) {
    var mine = p.new && p.new.updated_by === me.id;
    if (table === 'ajustes') {
      if (mine || !p.new) return;
      store()._applyRemote({ settings: p.new.data });
      snap.ajustes = JSON.stringify(store().getSettings());
      return;
    }
    var list = listOf(table);
    if (p.eventType === 'DELETE') {
      var id = p.old && p.old.id;
      if (!id) return;
      list = list.filter(function (x) { return x.id !== id; });
      delete snap[table][id];
      var o1 = {}; o1[table] = list; store()._applyRemote(o1);
      return;
    }
    if (mine || !p.new) return;
    var item = Object.assign({}, p.new.data, { id: p.new.id });
    var found = false;
    list = list.map(function (x) { if (x.id === item.id) { found = true; return item; } return x; });
    if (!found) list.push(item);
    var o2 = {}; o2[table] = list; store()._applyRemote(o2);
    var after = listOf(table).filter(function (x) { return x.id === item.id; })[0];
    if (after) snap[table][after.id] = JSON.stringify(after);
  }

  function subscribe() {
    var ch = sb.channel('equipo-' + teamId);
    ['insumos', 'recetas', 'ajustes'].forEach(function (t) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'equipo_id=eq.' + teamId },
        function (p) { try { onRemote(t, p); } catch (e) { if (window.console) console.error(e); } });
    });
    ch.subscribe();
  }

  /* ---------- diálogo de equipo ---------- */
  function injectHeader() {
    var bar = $('.site-header > div');
    if (!bar || $('#ci-team-btn')) return;
    var box = document.createElement('div');
    box.style.cssText = 'display:flex;align-items:center;gap:.5rem;margin-left:auto';
    box.innerHTML = '<span id="ci-sync" role="status" aria-live="polite"></span>' +
      '<button type="button" id="ci-team-btn" class="ci-btn ci-btn-ghost ci-btn-sm" aria-label="Equipo y cuenta"><span class="material-symbols-outlined" style="font-size:18px" aria-hidden="true">group</span><span class="hidden sm:inline">Equipo</span></button>';
    bar.appendChild(box);
    $('#ci-team-btn').addEventListener('click', openTeam);
    setStatus(teamId ? 'ok' : 'local');
  }

  async function openTeam() {
    var dlg = $('#ci-team');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'ci-team'; dlg.className = 'ci-dialog';
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = '<div class="ci-dialog-body"><p class="ci-muted">Cargando equipo…</p></div>';
    if (!dlg.open) dlg.showModal();
    try {
      var r = await Promise.all([
        sb.from('miembros').select('user_id,email,rol').eq('equipo_id', teamId).order('created_at'),
        sb.from('invitaciones').select('email,rol').eq('equipo_id', teamId)
      ]);
      if (r[0].error) throw r[0].error;
      var miembros = r[0].data || [], inv = (r[1].data || []);
      var admin = rol === 'admin';
      var h = '<div class="ci-dialog-body"><h2 class="font-headline text-headline-sm">Equipo</h2>' +
        '<p class="ci-muted">Sesión: <strong>' + esc(me.email) + '</strong> · ' + esc(rol) + '</p>' +
        '<h3 class="ci-label" style="margin-top:1rem">Miembros</h3><ul style="list-style:none;padding:0;margin:0">';
      miembros.forEach(function (m) {
        h += '<li class="ci-row" style="justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #c9c7b9"><span>' + esc(m.email) +
          ' <span class="ci-chip">' + esc(m.rol) + '</span></span>' +
          (admin && m.user_id !== me.id ? '<button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" data-quitar="' + esc(m.user_id) + '">Quitar</button>' : '') + '</li>';
      });
      h += '</ul>';
      if (admin) {
        h += '<h3 class="ci-label" style="margin-top:1rem">Invitaciones pendientes</h3>';
        h += inv.length ? '<ul style="list-style:none;padding:0;margin:0">' + inv.map(function (i) {
          return '<li class="ci-row" style="justify-content:space-between;padding:.35rem 0"><span>' + esc(i.email) + ' <span class="ci-chip">' + esc(i.rol) + '</span></span>' +
            '<button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" data-borrar-inv="' + esc(i.email) + '">Cancelar</button></li>';
        }).join('') + '</ul>' : '<p class="ci-hint">Ninguna.</p>';
        h += '<form id="ci-inv-form" class="ci-row" style="margin-top:.75rem;gap:.5rem;flex-wrap:wrap">' +
          '<input class="ci-input" id="ci-inv-mail" type="email" placeholder="correo@ejemplo.com" required style="flex:1;min-width:12rem" aria-label="Correo a invitar">' +
          '<select class="ci-input select-botanic" id="ci-inv-rol" aria-label="Rol" style="width:auto"><option value="miembro">Miembro</option><option value="admin">Admin</option></select>' +
          '<button class="ci-btn ci-btn-primary ci-btn-sm" type="submit">Invitar</button></form>' +
          '<p class="ci-hint">La persona debe crear su cuenta con ese mismo correo; al entrar se une al equipo.</p>';
      }
      h += '<h3 class="ci-label" style="margin-top:1rem">Mi contraseña</h3>' +
        '<form id="ci-pw-form" class="ci-row" style="gap:.5rem"><input class="ci-input" id="ci-pw" type="password" minlength="6" placeholder="Nueva contraseña" autocomplete="new-password" style="flex:1" aria-label="Nueva contraseña">' +
        '<button class="ci-btn ci-btn-ghost ci-btn-sm" type="submit">Cambiar</button></form>' +
        '<div class="ci-dialog-actions"><button type="button" class="ci-btn ci-btn-ghost" id="ci-out">Cerrar sesión</button>' +
        '<button type="button" class="ci-btn ci-btn-primary" id="ci-team-close">Listo</button></div></div>';
      dlg.innerHTML = h;
      $('#ci-team-close', dlg).addEventListener('click', function () { dlg.close(); });
      $('#ci-out', dlg).addEventListener('click', signOut);
      dlg.querySelectorAll('[data-quitar]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!(await CI.util.confirmDialog('¿Quitar a esta persona del equipo?'))) return;
          var e = (await sb.from('miembros').delete().eq('equipo_id', teamId).eq('user_id', b.getAttribute('data-quitar'))).error;
          if (e) CI.util.toast(msgError(e), 'error'); else openTeam();
        });
      });
      dlg.querySelectorAll('[data-borrar-inv]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var e = (await sb.from('invitaciones').delete().eq('equipo_id', teamId).eq('email', b.getAttribute('data-borrar-inv'))).error;
          if (e) CI.util.toast(msgError(e), 'error'); else openTeam();
        });
      });
      var f = $('#ci-inv-form', dlg);
      if (f) f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var mail = $('#ci-inv-mail', dlg).value.trim().toLowerCase();
        var e = (await sb.from('invitaciones').upsert({ equipo_id: teamId, email: mail, rol: $('#ci-inv-rol', dlg).value }, { onConflict: 'equipo_id,email' })).error;
        if (e) CI.util.toast(msgError(e), 'error'); else { CI.util.toast('Invitación creada para ' + mail); openTeam(); }
      });
      $('#ci-pw-form', dlg).addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var e = (await sb.auth.updateUser({ password: $('#ci-pw', dlg).value })).error;
        if (e) CI.util.toast(msgError(e), 'error'); else { CI.util.toast('Contraseña actualizada'); $('#ci-pw', dlg).value = ''; }
      });
    } catch (e) {
      dlg.innerHTML = '<div class="ci-dialog-body"><p class="ci-alert ci-alert-error">' + esc(msgError(e)) + '</p><div class="ci-dialog-actions"><button type="button" class="ci-btn ci-btn-primary" id="ci-team-close">Cerrar</button></div></div>';
      $('#ci-team-close', dlg).addEventListener('click', function () { dlg.close(); });
    }
  }

  /* ---------- arranque ---------- */
  async function init() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseKey) {
      if (window.console) console.warn('Supabase no disponible: modo solo local.');
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    try {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) s = await showLogin();
      me = s.user;

      var eq = await sb.rpc('mi_equipo');
      if (eq.error) {
        if (/sin_invitacion/.test(eq.error.message || '')) {
          showBlocked('Tu correo (' + me.email + ') aún no está invitado a ningún equipo. Pide a un administrador que te invite con este mismo correo y vuelve a entrar.');
          return new Promise(function () {}); // no arrancar la app
        }
        throw eq.error;
      }
      teamId = eq.data;
      var m = await sb.from('miembros').select('rol').eq('equipo_id', teamId).eq('user_id', me.id).maybeSingle();
      rol = (m.data && m.data.rol) || 'miembro';
      await pull();
      store()._setSyncHook(function () { schedulePush(); });
      hookOn = true;
      subscribe();
      schedulePush(0);
      window.addEventListener('online', function () { schedulePush(0); });
      sb.auth.onAuthStateChange(function (evt) { if (evt === 'SIGNED_OUT') { store()._wipeLocal(); location.href = location.pathname; } });
      // limpiar parámetros de autenticación de la URL
      if (/access_token|refresh_token|[?&]code=/.test(location.href)) history.replaceState(null, '', location.pathname + '#calculadora');
    } catch (e) {
      if (window.console) console.error('Nube:', e);
      var cached = store()._raw.get(TEAM_KEY);
      if (me && cached) {
        // Sin red al iniciar: trabaja con la caché local y reintenta.
        teamId = cached; rol = 'miembro';
        takeSnapshot(); // lo local cuenta como ya sincronizado: solo se suben cambios nuevos (no pisa lo del equipo)
        store()._setSyncHook(function () { schedulePush(); });
        schedulePush(15000);
      } else {
        teamId = null;
        if (CI.util && CI.util.toast) setTimeout(function () { CI.util.toast('No se pudo conectar con la nube: trabajando solo en este equipo. ' + msgError(e), 'error'); }, 500);
      }
    }
    injectHeader();
    if (!teamId) setStatus('local');
  }

  CI.cloud = {
    init: init,
    signOut: signOut,
    openTeam: openTeam,
    isOnline: function () { return !!teamId; },
    syncNow: function () { return pushNow(); }
  };
})();
