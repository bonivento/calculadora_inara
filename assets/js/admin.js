/* CI.admin — panel de equipo: miembros, roles, invitaciones, actividad y cuenta.
   Los permisos reales los aplican las políticas RLS (supabase/002_admin.sql); esto es solo la interfaz. */
(function () {
  'use strict';
  window.CI = window.CI || {};

  var ROLES = { admin: 'Administrador', miembro: 'Editor', lector: 'Solo lectura' };
  var TABLAS = { insumos: 'Insumo', recetas: 'Receta', ajustes: 'Ajustes', miembros: 'Miembro' };
  var OPS = { INSERT: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó' };

  var c = null, tab = 'miembros', dlg = null;

  function esc(s) { return CI.util.escapeHtml(s == null ? '' : String(s)); }
  function $(sel, root) { return (root || dlg).querySelector(sel); }
  function fecha(x) {
    if (!x) return '—';
    try { return new Date(x).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return x; }
  }
  function err(e) {
    var m = (e && e.message) || '';
    if (/ultimo_admin/.test(m)) return 'Debe quedar al menos un administrador activo en el equipo.';
    if (/solo_admin/.test(m)) return 'Solo un administrador puede hacer esto.';
    return c.msgError(e);
  }
  function opcionesRol(sel) {
    return Object.keys(ROLES).map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + ROLES[k] + '</option>';
    }).join('');
  }
  function rolChip(r) {
    return '<span class="ci-chip ' + (r === 'admin' ? 'ci-chip-gold' : r === 'lector' ? '' : 'ci-chip-ok') + '">' + esc(ROLES[r] || r) + '</span>';
  }

  function shell(body) {
    var admin = c.rol === 'admin';
    var tabs = [['miembros', 'Miembros']];
    if (admin) tabs.push(['invitaciones', 'Invitaciones'], ['actividad', 'Actividad']);
    tabs.push(['cuenta', 'Mi cuenta']);
    var h = '<div class="ci-dialog-body" style="gap:1rem">' +
      '<div class="ci-row" style="justify-content:space-between"><h2 class="font-headline text-headline-sm">Equipo y permisos</h2>' +
      '<button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" data-cerrar aria-label="Cerrar">Cerrar</button></div>' +
      '<div class="ci-seg" role="tablist" style="flex-wrap:wrap">' +
      tabs.map(function (t) {
        return '<button type="button" role="tab" class="ci-seg-btn' + (t[0] === tab ? ' is-active' : '') + '" aria-selected="' + (t[0] === tab) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div>' + body + '</div>';
    dlg.innerHTML = h;
    dlg.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); });
    });
    $('[data-cerrar]').addEventListener('click', function () { dlg.close(); });
  }

  function leyenda() {
    return '<details class="ci-card ci-card-flat" style="padding:.75rem 1rem"><summary style="cursor:pointer" class="ci-label">¿Qué puede hacer cada rol?</summary>' +
      '<div class="ci-table-wrap" style="margin-top:.5rem"><table class="ci-table"><thead><tr><th>Permiso</th><th>Administrador</th><th>Editor</th><th>Solo lectura</th></tr></thead><tbody>' +
      '<tr><td>Ver insumos, recetas y ajustes; calcular precios</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>' +
      '<tr><td>Crear y editar insumos, recetas y ajustes</td><td>Sí</td><td>Sí</td><td>No</td></tr>' +
      '<tr><td>Invitar, cambiar roles, desactivar y quitar personas</td><td>Sí</td><td>No</td><td>No</td></tr>' +
      '<tr><td>Ver último acceso y registro de actividad</td><td>Sí</td><td>No</td><td>No</td></tr>' +
      '</tbody></table></div></details>';
  }

  /* ---------- pestañas ---------- */
  async function vMiembros() {
    var admin = c.rol === 'admin', rows;
    if (admin) {
      var r = await c.sb.rpc('equipo_miembros', { e: c.teamId });
      if (r.error) throw r.error;
      rows = r.data || [];
    } else {
      var q = await c.sb.from('miembros').select('user_id,email,rol,activo').eq('equipo_id', c.teamId).order('created_at');
      if (q.error) throw q.error;
      rows = q.data || [];
    }
    var h = leyenda() + '<div class="ci-table-wrap"><table class="ci-table"><thead><tr><th>Correo</th><th>Rol</th><th>Estado</th>' +
      (admin ? '<th>Último acceso</th><th></th>' : '') + '</tr></thead><tbody>';
    rows.forEach(function (m) {
      var yo = m.user_id === c.me.id;
      h += '<tr><td>' + esc(m.email) + (yo ? ' <span class="ci-chip">tú</span>' : '') + '</td><td>';
      h += admin
        ? '<select class="ci-input select-botanic" style="min-width:9rem" data-rol="' + esc(m.user_id) + '" aria-label="Rol de ' + esc(m.email) + '"' + (yo ? ' disabled' : '') + '>' + opcionesRol(m.rol) + '</select>'
        : rolChip(m.rol);
      h += '</td><td>' + (m.activo ? '<span class="ci-chip ci-chip-ok">Activo</span>' : '<span class="ci-chip ci-chip-error">Desactivado</span>') + '</td>';
      if (admin) {
        h += '<td>' + esc(fecha(m.ultimo_acceso)) + '</td><td style="white-space:nowrap">' +
          (yo ? '' : '<button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" data-activo="' + esc(m.user_id) + '" data-valor="' + (m.activo ? '0' : '1') + '">' + (m.activo ? 'Desactivar' : 'Activar') + '</button> ' +
            '<button type="button" class="ci-btn ci-btn-danger ci-btn-sm" data-quitar="' + esc(m.user_id) + '" data-mail="' + esc(m.email) + '">Quitar</button>') + '</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if (admin) h += '<p class="ci-hint">Desactivar bloquea el acceso al instante pero conserva a la persona en la lista. «Quitar» la saca del equipo (necesitará una invitación nueva). Para borrar la cuenta por completo usa Supabase → Authentication → Users.</p>';
    shell(h);
    if (!admin) return;

    dlg.querySelectorAll('[data-rol]').forEach(function (s) {
      s.addEventListener('change', async function () {
        var res = await c.sb.from('miembros').update({ rol: s.value }).eq('equipo_id', c.teamId).eq('user_id', s.getAttribute('data-rol')).select();
        if (res.error || !res.data || !res.data.length) CI.util.toast(res.error ? err(res.error) : 'No se pudo cambiar el rol.', 'error');
        else CI.util.toast('Rol actualizado');
        render();
      });
    });
    dlg.querySelectorAll('[data-activo]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var activar = b.getAttribute('data-valor') === '1';
        if (!activar && !(await CI.util.confirmDialog('¿Desactivar a esta persona? Perderá el acceso de inmediato.'))) return;
        var res = await c.sb.from('miembros').update({ activo: activar }).eq('equipo_id', c.teamId).eq('user_id', b.getAttribute('data-activo')).select();
        if (res.error || !res.data || !res.data.length) CI.util.toast(res.error ? err(res.error) : 'No se pudo actualizar.', 'error');
        else CI.util.toast(activar ? 'Cuenta activada' : 'Cuenta desactivada');
        render();
      });
    });
    dlg.querySelectorAll('[data-quitar]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!(await CI.util.confirmDialog('¿Quitar a ' + b.getAttribute('data-mail') + ' del equipo?'))) return;
        var res = await c.sb.from('miembros').delete().eq('equipo_id', c.teamId).eq('user_id', b.getAttribute('data-quitar')).select();
        if (res.error || !res.data || !res.data.length) CI.util.toast(res.error ? err(res.error) : 'No se pudo quitar.', 'error');
        else CI.util.toast('Persona quitada del equipo');
        render();
      });
    });
  }

  async function vInvitaciones() {
    var r = await c.sb.from('invitaciones').select('email,rol,created_at').eq('equipo_id', c.teamId).order('created_at');
    if (r.error) throw r.error;
    var inv = r.data || [];
    var h = '<div>' + (inv.length ? '<div class="ci-table-wrap"><table class="ci-table"><thead><tr><th>Correo</th><th>Rol</th><th>Creada</th><th></th></tr></thead><tbody>' +
      inv.map(function (i) {
        return '<tr><td>' + esc(i.email) + '</td><td>' + rolChip(i.rol) + '</td><td>' + esc(fecha(i.created_at)) +
          '</td><td><button type="button" class="ci-btn ci-btn-ghost ci-btn-sm" data-borrar-inv="' + esc(i.email) + '">Cancelar</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ci-muted">No hay invitaciones pendientes.</p>') + '</div>' +
      '<form id="ci-inv-form" class="ci-row" style="gap:.5rem;flex-wrap:wrap">' +
      '<input class="ci-input" id="ci-inv-mail" type="email" placeholder="correo@ejemplo.com" required style="flex:1;min-width:12rem" aria-label="Correo a invitar">' +
      '<select class="ci-input select-botanic" id="ci-inv-rol" aria-label="Rol" style="width:auto">' + opcionesRol('miembro') + '</select>' +
      '<button class="ci-btn ci-btn-primary ci-btn-sm" type="submit">Invitar</button></form>' +
      '<p class="ci-hint">La persona debe crear su cuenta con ese mismo correo; al entrar se une al equipo con el rol elegido.</p>';
    shell(h);
    dlg.querySelectorAll('[data-borrar-inv]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var e = (await c.sb.from('invitaciones').delete().eq('equipo_id', c.teamId).eq('email', b.getAttribute('data-borrar-inv'))).error;
        if (e) CI.util.toast(err(e), 'error'); render();
      });
    });
    $('#ci-inv-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var mail = $('#ci-inv-mail').value.trim().toLowerCase();
      var e = (await c.sb.from('invitaciones').upsert({ equipo_id: c.teamId, email: mail, rol: $('#ci-inv-rol').value }, { onConflict: 'equipo_id,email' })).error;
      if (e) CI.util.toast(err(e), 'error'); else CI.util.toast('Invitación creada para ' + mail);
      render();
    });
  }

  async function vActividad() {
    var r = await c.sb.from('auditoria').select('at,email,tabla,op,resumen').eq('equipo_id', c.teamId).order('at', { ascending: false }).limit(100);
    if (r.error) throw r.error;
    var rows = r.data || [];
    var h = '<p class="ci-hint">Últimos 100 movimientos del equipo.</p>' + (rows.length ?
      '<div class="ci-table-wrap" style="max-height:50vh;overflow:auto"><table class="ci-table"><thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead><tbody>' +
      rows.map(function (a) {
        return '<tr><td>' + esc(fecha(a.at)) + '</td><td>' + esc(a.email || '—') + '</td><td>' + esc((OPS[a.op] || a.op) + ' · ' + (TABLAS[a.tabla] || a.tabla)) + '</td><td>' + esc(a.resumen || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="ci-muted">Aún no hay actividad registrada.</p>');
    shell(h);
  }

  function vCuenta() {
    var h = '<p>Sesión: <strong>' + esc(c.me.email) + '</strong> · ' + rolChip(c.rol) + '</p>' +
      '<form id="ci-pw-form" class="ci-row" style="gap:.5rem;flex-wrap:wrap"><input class="ci-input" id="ci-pw" type="password" minlength="6" placeholder="Nueva contraseña" autocomplete="new-password" style="flex:1;min-width:12rem" aria-label="Nueva contraseña">' +
      '<button class="ci-btn ci-btn-ghost ci-btn-sm" type="submit">Cambiar contraseña</button></form>' +
      '<div class="ci-dialog-actions"><button type="button" class="ci-btn ci-btn-ghost" id="ci-out">Cerrar sesión</button></div>';
    shell(h);
    $('#ci-out').addEventListener('click', c.signOut);
    $('#ci-pw-form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var e = (await c.sb.auth.updateUser({ password: $('#ci-pw').value })).error;
      if (e) CI.util.toast(c.msgError(e), 'error'); else { CI.util.toast('Contraseña actualizada'); $('#ci-pw').value = ''; }
    });
  }

  async function render() {
    try {
      if (tab === 'miembros') await vMiembros();
      else if (tab === 'invitaciones') await vInvitaciones();
      else if (tab === 'actividad') await vActividad();
      else vCuenta();
    } catch (e) {
      shell('<p class="ci-alert ci-alert-error" role="alert">' + esc(err(e)) + '</p>');
    }
  }

  CI.admin = {
    open: function (ctx) {
      c = ctx;
      if (!c.teamId) { CI.util.toast('Estás trabajando sin conexión a la nube.', 'error'); return; }
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'ci-admin'; dlg.className = 'ci-dialog';
        dlg.style.cssText = 'width:min(56rem,96vw);max-width:96vw';
        dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
        document.body.appendChild(dlg);
      }
      tab = 'miembros';
      dlg.innerHTML = '<div class="ci-dialog-body"><p class="ci-muted">Cargando…</p></div>';
      if (!dlg.open) dlg.showModal();
      render();
    }
  };
})();
