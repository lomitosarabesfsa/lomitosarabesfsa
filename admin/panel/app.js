const API_BASE = location.hostname === 'localhost' ? 'http://localhost:8787' : 'https://lomitos-api.gapersingula97.workers.dev';
let token = localStorage.getItem('lomitos_admin_token') || '';
let productos = [], categorias = [], promos = [], horarios = {}, galeria = [], modifierGroups = [];
let editandoId = null, editandoGroupId = null, editandoOptionId = null, urlSubida = '';

// ============================================================
//  UTILIDADES
// ============================================================
function $(id) { return document.getElementById(id); }
function toast(msg, error = false) {
  const t = $('toast'); t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2500);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
//  API con manejo de errores por endpoint + token expirado
// ============================================================
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: {}, cache: 'no-store' };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== null) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, opts);
  // Token expirado o inválido → forzar re-login
  if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

function showSectionError(sectionId, msg) {
  const el = $('err-' + sectionId);
  if (el) el.innerHTML = `<div class="section-error"><strong>Error cargando ${sectionId}</strong>${escapeHtml(msg)}</div>`;
}
function clearSectionError(sectionId) {
  const el = $('err-' + sectionId);
  if (el) el.innerHTML = '';
}

// Loading state: desactivar botón mientras se procesa
async function withLoading(btnId, fn) {
  const btn = $(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try { await fn(); }
  finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.original || btn.textContent.replace('Guardando...',''); } }
}

// ============================================================
//  LOGIN
// ============================================================
function init() { if (token) mostrarApp(); else $('login').style.display = 'block'; }
async function doLogin() {
  $('login-error').style.display = 'none';
  const btn = $('login-btn'); btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const r = await fetch(API_BASE + '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('login-user').value, clave: $('login-pass').value }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    token = data.token; localStorage.setItem('lomitos_admin_token', token); mostrarApp();
  } catch (e) { $('login-error').textContent = e.message; $('login-error').style.display = 'block'; }
  finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
}
function logout() { token = ''; localStorage.removeItem('lomitos_admin_token'); location.reload(); }
async function mostrarApp() {
  $('login').style.display = 'none'; $('app').style.display = 'block';
  $('user-label').textContent = 'Admin'; await cargarTodo();
}

// ============================================================
//  TABS
// ============================================================
function showTab(nombre) {
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === nombre));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + nombre));
}

// ============================================================
//  CARGAR DATOS — con errores por endpoint
// ============================================================
async function cargarTodo() {
  const endpoints = [
    { key: 'productos',    path: '/api/admin/productos',        var: v => productos = v },
    { key: 'categorias',   path: '/api/admin/categorias',       var: v => categorias = v },
    { key: 'promos',       path: '/api/admin/promos',           var: v => promos = v },
    { key: 'config',       path: '/api/admin/config',           var: v => { horarios = v.horarios || {}; galeria = v.galeria || []; $('config-whatsapp').value = v.whatsapp || ''; } },
    { key: 'modifiers',    path: '/api/admin/modifier-groups',  var: v => modifierGroups = v },
  ];
  for (const ep of endpoints) {
    try {
      clearSectionError(ep.key);
      const data = await api(ep.path);
      ep.var(data);
    } catch (e) {
      if (e.message === 'Sesión expirada') return;
      showSectionError(ep.key, e.message);
    }
  }
  renderProductos(); renderCategorias(); renderPromos(); renderHorarios(); renderGaleria(); renderModifierGroups();
}

// ============================================================
//  PRODUCTOS — con búsqueda + toggle activo + orden
// ============================================================
function renderProductos() {
  const cont = $('lista-productos');
  const q = ($('search-productos')?.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filtered = q ? productos.filter(p => p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) : productos;
  if (!filtered.length) { cont.innerHTML = `<p class="empty">${q ? 'Sin resultados para "' + escapeHtml(q) + '"' : 'Todavía no hay productos.'}</p>`; return; }
  cont.innerHTML = '';
  filtered.forEach(p => {
    const cat = categorias.find(c => c.id === p.categoria_id);
    const stock = p.stock;
    const stockBadge = stock === 0 ? '<span class="badge err">AGOTADO</span>' : stock > 0 && stock <= 5 ? `<span class="badge warn">ÚLTIMAS ${stock}</span>` : stock > 5 ? '<span class="badge ok">OK</span>' : '';
    const activeBadge = p.activo ? '' : '<span class="badge off">INACTIVO</span>';
    const div = document.createElement('div'); div.className = 'card';
    div.innerHTML = `
      ${p.imagen ? `<img src="${escapeHtml(p.imagen)}" onerror="this.style.display='none'" alt="">` : '<img src="" style="display:none" alt="">'}
      <div class="info">
        <h3>${escapeHtml(p.nombre)} ${stockBadge} ${activeBadge}</h3>
        <div class="meta">${escapeHtml(cat ? cat.nombre : 'Sin cat.')}${p.stock !== -1 ? ' · Stock: ' + p.stock : ''} · Orden: ${p.orden || 0}</div>
        <div class="price">$${Number(p.precio).toLocaleString('es-AR')}</div>
      </div>
      <div class="actions">
        <button class="btn-mini" data-action="toggle-activo-producto" data-id="${p.id}" data-activo="${p.activo}" title="${p.activo ? 'Desactivar' : 'Activar'}">${p.activo ? '🟢' : '⚪'}</button>
        <button class="btn-mini" data-action="abrir-producto" data-id="${p.id}">Editar</button>
        <button class="btn-mini danger" data-action="eliminar-producto" data-id="${p.id}">Borrar</button>
      </div>`;
    cont.appendChild(div);
  });
}

async function toggleActivoProducto(id, actual) {
  try {
    await api('/api/admin/productos/' + id, 'PUT', { ...productos.find(p=>p.id===id), activo: actual ? 0 : 1 });
    toast(actual ? 'Producto desactivado' : 'Producto activado');
    await cargarTodo();
  } catch (e) { toast(e.message, true); }
}

function abrirProducto(id = null) {
  editandoId = id; urlSubida = '';
  const m = $('modal-content');
  let nombre='', catId='', desc='', precio=0, stock=-1, imagen='', activo=1, orden=0;
  if (id) {
    const p = productos.find(x => x.id === id);
    if (!p) return;
    nombre=p.nombre; catId=p.categoria_id; desc=p.descripcion; precio=p.precio; stock=p.stock; imagen=p.imagen; activo=p.activo; orden=p.orden||0;
    if (imagen) urlSubida = imagen;
  }
  const catOpts = categorias.map(c => `<option value="${c.id}" ${catId==c.id?'selected':''}>${escapeHtml(c.nombre)}</option>`).join('');
  m.innerHTML = `
    <h3>${id ? 'Editar producto' : 'Nuevo producto'}</h3>
    <div class="field"><label>Nombre *</label><input type="text" id="p-nombre" value="${escapeHtml(nombre)}"></div>
    <div class="field-row">
      <div class="field"><label>Categoría</label><select id="p-categoria">${catOpts}</select></div>
      <div class="field"><label>Orden</label><input type="number" id="p-orden" value="${orden}" min="0"></div>
    </div>
    <div class="field"><label>Descripción</label><textarea id="p-descripcion" rows="2">${escapeHtml(desc)}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Precio ($)</label><input type="number" id="p-precio" value="${precio}" step="0.01" min="0"></div>
      <div class="field"><label>Stock (-1 = sin control)</label><input type="number" id="p-stock" value="${stock}"></div>
    </div>
    <div class="field"><label>Foto</label>
      <input type="file" id="p-file" accept="image/*" onchange="subirFotoProducto(this.files)">
      ${imagen ? `<img id="img-preview" src="${escapeHtml(imagen)}" style="display:block" alt="">` : '<img id="img-preview" alt="">'}
      <span style="color:var(--muted);font-size:.8rem" id="p-img-url">${imagen ? '✅ Foto actual' : ''}</span>
    </div>
    <div class="field"><label><input type="checkbox" id="p-activo" ${activo?'checked':''}> Activo (visible en el menú)</label></div>
    <div class="actions">
      <button class="btn-ghost" data-action="cerrar-modal">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-producto" data-action="guardar-producto">Guardar</button>
    </div>`;
  $('overlay').classList.add('open');
}
async function subirFotoProducto(files) {
  const file = files[0]; if (!file) return;
  const base64 = await fileABase64(file);
  const prev = $('img-preview'); if (prev) { prev.src = URL.createObjectURL(file); prev.style.display = 'block'; }
  try {
    const r = await api('/api/admin/imagen', 'POST', { filename: file.name, data: base64, contentType: file.type });
    urlSubida = r.url;
    const lbl = $('p-img-url'); if (lbl) lbl.textContent = '✅ Foto subida: ' + r.key;
  } catch (e) { toast('Error al subir foto: ' + e.message, true); }
}
async function guardarProducto() {
  const body = {
    categoria_id: parseInt($('p-categoria').value, 10), nombre: $('p-nombre').value.trim(),
    descripcion: $('p-descripcion').value.trim(), precio: parseFloat($('p-precio').value) || 0,
    stock: parseInt($('p-stock').value, 10), imagen: urlSubida,
    activo: $('p-activo').checked ? 1 : 0, orden: parseInt($('p-orden').value, 10) || 0,
  };
  if (!body.nombre) { toast('El nombre es obligatorio', true); return; }
  await withLoading('btn-guardar-producto', async () => {
    if (editandoId) await api('/api/admin/productos/' + editandoId, 'PUT', body);
    else await api('/api/admin/productos', 'POST', body);
    toast('Producto guardado ✓'); cerrarModal(); await cargarTodo();
  });
}
async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try { await api('/api/admin/productos/' + id, 'DELETE'); toast('Producto eliminado'); await cargarTodo(); }
  catch (e) { toast(e.message, true); }
}

// ============================================================
//  CATEGORÍAS — CRUD completo (crear, editar, eliminar)
// ============================================================
function renderCategorias() {
  const cont = $('lista-categorias');
  if (!categorias.length) { cont.innerHTML = '<p class="empty">Sin categorías.</p>'; return; }
  cont.innerHTML = '';
  categorias.forEach(c => {
    const n = productos.filter(p => p.categoria_id === c.id).length;
    const div = document.createElement('div'); div.className = 'card';
    div.innerHTML = `<div style="font-size:1.6rem">${escapeHtml(c.icono)}</div>
      <div class="info"><h3>${escapeHtml(c.nombre)}</h3><div class="meta">${n} producto(s) · Orden: ${c.orden || 0}</div></div>
      <div class="actions">
        <button class="btn-mini" data-action="abrir-categoria" data-id="${c.id}">Editar</button>
        <button class="btn-mini danger" data-action="eliminar-categoria" data-id="${c.id}">Borrar</button>
      </div>`;
    cont.appendChild(div);
  });
}

function abrirCategoria(id = null) {
  let nombre='', icono='🍽️', orden=0;
  if (id) {
    const c = categorias.find(x => x.id === id);
    if (!c) return;
    nombre=c.nombre; icono=c.icono; orden=c.orden||0;
  }
  const m = $('modal-content');
  m.innerHTML = `
    <h3>${id ? 'Editar categoría' : 'Nueva categoría'}</h3>
    <div class="field"><label>Nombre *</label><input type="text" id="cat-nombre" value="${escapeHtml(nombre)}"></div>
    <div class="field-row">
      <div class="field"><label>Icono (emoji)</label><input type="text" id="cat-icono" value="${escapeHtml(icono)}" maxlength="4"></div>
      <div class="field"><label>Orden</label><input type="number" id="cat-orden" value="${orden}" min="0"></div>
    </div>
    <div class="actions">
      <button class="btn-ghost" data-action="cerrar-modal">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-cat" data-action="guardar-categoria" data-id="${id}">Guardar</button>
    </div>`;
  $('overlay').classList.add('open');
  $('cat-nombre').focus();
}

async function guardarCategoria(id) {
  const body = { nombre: $('cat-nombre').value.trim(), icono: $('cat-icono').value.trim() || '🍽️', orden: parseInt($('cat-orden').value,10)||0 };
  if (!body.nombre) { toast('El nombre es obligatorio', true); return; }
  await withLoading('btn-guardar-cat', async () => {
    if (id) await api('/api/admin/categorias/' + id, 'PUT', body);
    else await api('/api/admin/categorias', 'POST', body);
    toast('Categoría guardada ✓'); cerrarModal(); await cargarTodo();
  });
}

async function eliminarCategoria(id) {
  if (!confirm('¿Eliminar esta categoría y TODOS sus productos?')) return;
  try { await api('/api/admin/categorias/' + id, 'DELETE'); toast('Categoría eliminada'); await cargarTodo(); }
  catch (e) { toast(e.message, true); }
}

// ============================================================
//  MODIFIER GROUPS — con opciones inline
// ============================================================
function renderModifierGroups() {
  const cont = $('lista-modifiers');
  if (!modifierGroups.length) { cont.innerHTML = '<p class="empty">Sin grupos. Creá uno para ofrecer extras en el menú.</p>'; return; }
  cont.innerHTML = '';
  modifierGroups.forEach(g => {
    const tipo = g.producto_id ? `Prod: ${escapeHtml(g.producto_nombre||'?')}` : `Cat: ${escapeHtml(g.categoria_nombre||'?')}`;
    const badge = g.activo ? '<span class="badge ok">ACTIVO</span>' : '<span class="badge err">INACTIVO</span>';
    const selType = g.selection_type === 'single' ? '🔘 Única' : '☑️ Múltiple';
    const options = Array.isArray(g.options) ? g.options : [];
    const card = document.createElement('div'); card.className = 'mg-card';
    card.innerHTML = `
      <div class="mg-card-header">
        <div class="info">
          <h3>${escapeHtml(g.nombre)} ${badge}</h3>
          <div class="meta">${tipo} · ${selType}${g.required ? ' · Obligatorio' : ''}</div>
        </div>
        <div class="actions">
          <button class="btn-mini" data-action="abrir-modifier-group" data-id="${g.id}">Editar</button>
          <button class="btn-mini danger" data-action="eliminar-modifier-group" data-id="${g.id}">Borrar</button>
        </div>
      </div>
      <div class="mg-card-options">
        ${options.map(o => `
          <div class="mg-opt-row" id="opt-row-${o.id}">
            <span class="opt-name">${escapeHtml(o.nombre)}</span>
            <span class="opt-price">${o.price_delta > 0 ? '+$' + Number(o.price_delta).toLocaleString('es-AR') : 'Gratis'}</span>
            <div class="opt-actions">
              <button class="btn-mini" data-action="editar-option-inline" data-group-id="${g.id}" data-option-id="${o.id}">✏️</button>
              <button class="btn-mini danger" data-action="eliminar-modifier-option" data-group-id="${g.id}" data-option-id="${o.id}">✕</button>
            </div>
          </div>`).join('')}
        <div class="mg-opt-add" data-action="editar-option-inline" data-group-id="${g.id}"><span>＋ Agregar opción</span></div>
      </div>`;
    cont.appendChild(card);
  });
}

function editarOptionInline(groupId, optionId) {
  const g = modifierGroups.find(x => x.id === groupId); if (!g) return;
  let nombre='', price=0;
  if (optionId) { const opt=(g.options||[]).find(o=>o.id===optionId); if(!opt) return; nombre=opt.nombre; price=opt.price_delta||0; }
  if (optionId) {
    const row = document.getElementById('opt-row-'+optionId);
    if (row) {
      row.innerHTML = `<div class="mg-opt-edit"><input name="opt-name" value="${escapeHtml(nombre)}" placeholder="Nombre"><input name="opt-price" type="number" value="${price}" placeholder="$0" min="0" step="100"></div>
        <button class="btn-mini" data-action="guardar-option-inline" data-group-id="${groupId}" data-option-id="${optionId}">💾</button>
        <button class="btn-mini" data-action="render-modifiers">Cancelar</button>`;
      row.querySelector('input[name="opt-name"]').focus();
    }
  } else {
    document.querySelectorAll('.mg-card').forEach(c => {
      const addBtn = c.querySelector('.mg-opt-add');
      if (addBtn && addBtn.getAttribute('onclick')?.includes(`(${groupId},null)`)) {
        const newRow = document.createElement('div'); newRow.className = 'mg-opt-row'; newRow.style.background = 'rgba(245,124,0,.05)';
        newRow.innerHTML = `<div class="mg-opt-edit"><input name="opt-name" value="" placeholder="Nombre de la opción"><input name="opt-price" type="number" value="0" placeholder="$0" min="0" step="100"></div>
          <button class="btn-mini" data-action="guardar-option-inline" data-group-id="${groupId}" data-option-id="null">💾</button>
          <button class="btn-mini" data-action="render-modifiers">Cancelar</button>`;
        addBtn.parentNode.insertBefore(newRow, addBtn);
        newRow.querySelector('input[name="opt-name"]').focus();
      }
    });
  }
}

async function guardarOptionInline(groupId, optionId, btn) {
  const row = btn.closest('.mg-opt-row');
  const nombre = row.querySelector('input[name="opt-name"]').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', true); return; }
  const body = { group_id: groupId, nombre, price_delta: parseFloat(row.querySelector('input[name="opt-price"]').value)||0, orden: 0, activo: 1 };
  btn.disabled = true;
  try {
    if (optionId) await api('/api/admin/modifier-options/' + optionId, 'PUT', body);
    else await api('/api/admin/modifier-options', 'POST', body);
    toast('Opción guardada ✓'); await cargarTodo();
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
}

function abrirModifierGroup(id = null) {
  editandoGroupId = id;
  let nombre='', selectionType='multiple', required=false, minSel=0, maxSel=99, productoId='', categoriaId='', activo=true, orden=0;
  if (id) {
    const g = modifierGroups.find(x=>x.id===id); if(!g) return;
    nombre=g.nombre; selectionType=g.selection_type||'multiple'; required=!!g.required;
    minSel=g.min_seleccion||0; maxSel=g.max_seleccion||99;
    productoId=g.producto_id||''; categoriaId=g.categoria_id||'';
    activo=!!g.activo; orden=g.orden||0;
  }
  const prodOpts = categorias.map(c => productos.filter(p=>p.categoria_id===c.id).map(p => `<option value="${p.id}" ${productoId==p.id?'selected':''}>${escapeHtml(c.nombre)} → ${escapeHtml(p.nombre)}</option>`).join('')).join('');
  const catOpts = categorias.map(c => `<option value="${c.id}" ${categoriaId==c.id?'selected':''}>${escapeHtml(c.nombre)}</option>`).join('');
  const m = $('modal-content');
  m.innerHTML = `
    <h3>${id ? 'Editar grupo' : 'Nuevo grupo'}</h3>
    <div class="field"><label>Nombre *</label><input type="text" id="mg-nombre" value="${escapeHtml(nombre)}"></div>
    <div class="field-row">
      <div class="field"><label>Tipo</label><select id="mg-seltype"><option value="multiple" ${selectionType==='multiple'?'selected':''}>Múltiple</option><option value="single" ${selectionType==='single'?'selected':''}>Única</option></select></div>
      <div class="field"><label>Orden</label><input type="number" id="mg-orden" value="${orden}" min="0"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Mín selecciones</label><input type="number" id="mg-min" value="${minSel}" min="0"></div>
      <div class="field"><label>Máx selecciones</label><input type="number" id="mg-max" value="${maxSel}" min="1"></div>
    </div>
    <div class="field"><label><input type="checkbox" id="mg-required" ${required?'checked':''}> Obligatorio</label></div>
    <div class="field"><label>Asociar a producto</label><select id="mg-producto"><option value="">— Ninguno —</option>${prodOpts}</select></div>
    <div class="field"><label>Asociar a categoría</label><select id="mg-categoria"><option value="">— Ninguna —</option>${catOpts}</select></div>
    <div class="field"><label><input type="checkbox" id="mg-activo" ${activo?'checked':''}> Activo</label></div>
    <div class="actions">
      <button class="btn-ghost" data-action="cerrar-modal">Cancelar</button>
      <button class="btn-primary" id="btn-guardar-mg" data-action="guardar-modifier-group">Guardar</button>
    </div>`;
  $('overlay').classList.add('open');
}
async function guardarModifierGroup() {
  const body = {
    nombre: $('mg-nombre').value.trim(), selection_type: $('mg-seltype').value, required: $('mg-required').checked,
    min_seleccion: parseInt($('mg-min').value,10)||0, max_seleccion: parseInt($('mg-max').value,10)||99,
    producto_id: $('mg-producto').value ? parseInt($('mg-producto').value,10) : null,
    categoria_id: $('mg-categoria').value ? parseInt($('mg-categoria').value,10) : null,
    orden: parseInt($('mg-orden').value,10)||0, activo: $('mg-activo').checked ? 1 : 0,
  };
  if (!body.nombre) { toast('El nombre es obligatorio', true); return; }
  await withLoading('btn-guardar-mg', async () => {
    if (editandoGroupId) await api('/api/admin/modifier-groups/' + editandoGroupId, 'PUT', body);
    else await api('/api/admin/modifier-groups', 'POST', body);
    toast('Grupo guardado ✓'); cerrarModal(); await cargarTodo();
  });
}
async function eliminarModifierGroup(id) {
  if (!confirm('¿Eliminar este grupo y TODAS sus opciones?')) return;
  try { await api('/api/admin/modifier-groups/' + id, 'DELETE'); toast('Grupo eliminado'); await cargarTodo(); }
  catch (e) { toast(e.message, true); }
}
async function eliminarModifierOption(groupId, optionId) {
  if (!confirm('¿Eliminar esta opción?')) return;
  try { await api('/api/admin/modifier-options/' + optionId, 'DELETE'); toast('Opción eliminada'); await cargarTodo(); }
  catch (e) { toast(e.message, true); }
}

// ============================================================
//  PROMOS — con campo descripcion
// ============================================================
function renderPromos() {
  const cont = $('lista-promos');
  if (!promos.length) { cont.innerHTML = '<p class="empty">Sin promos.</p>'; return; }
  cont.innerHTML = '';
  promos.forEach((p, i) => {
    const div = document.createElement('div'); div.className = 'card';
    div.style.flexDirection = 'column'; div.style.alignItems = 'stretch';
    div.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <input type="checkbox" ${p.activa?'checked':''} onchange="promos[${i}].activa=this.checked" title="Activa">
        <input style="width:48px;text-align:center;background:var(--surface2);border:none;border-radius:8px;padding:6px;color:var(--text)" value="${escapeHtml(p.icono)}" oninput="promos[${i}].icono=this.value" placeholder="🔥">
        <input style="flex:1;min-width:120px;background:var(--surface2);border:none;border-radius:8px;padding:8px;color:var(--text)" value="${escapeHtml(p.texto)}" placeholder="Texto de la promo" oninput="promos[${i}].texto=this.value">
        <button class="btn-mini danger" data-action="remove-promo" data-index="${i}">Quitar</button>
      </div>
      <div style="margin-top:8px">
        <input style="width:100%;background:var(--surface2);border:none;border-radius:8px;padding:8px;color:var(--text);font-size:.85rem" value="${escapeHtml(p.descripcion||'')}" placeholder="Descripción (opcional)" oninput="promos[${i}].descripcion=this.value">
      </div>`;
    cont.appendChild(div);
  });
}
function agregarPromo() { promos.push({activa:true,icono:'🔥',texto:'',descripcion:''}); renderPromos(); }
async function guardarPromos() {
  await withLoading('btn-guardar-promos', async () => {
    await api('/api/admin/promos','PUT',{promos}); toast('Promos guardadas ✓');
  });
}

// ============================================================
//  HORARIOS
// ============================================================
function renderHorarios() {
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const cont = $('lista-horarios'); cont.innerHTML = '';
  dias.forEach((nombre, i) => {
    const h = horarios[i]; const cerrado = !h;
    const div = document.createElement('div'); div.className = 'horario-row';
    div.innerHTML = `<span class="dia">${nombre}</span>
      <input type="time" value="${h?h.abre:''}" data-dia="${i}" data-tipo="abre" ${cerrado?'disabled':''}>
      <input type="time" value="${h?h.cierra:''}" data-dia="${i}" data-tipo="cierra" ${cerrado?'disabled':''}>
      <label class="cerrado-chk"><input type="checkbox" ${cerrado?'checked':''} onchange="toggleCerrado(${i},this.checked)"> Cerrado</label>`;
    cont.appendChild(div);
  });
}
function toggleCerrado(dia, cerrado) {
  const a = document.querySelector(`input[data-dia="${dia}"][data-tipo="abre"]`);
  const c = document.querySelector(`input[data-dia="${dia}"][data-tipo="cierra"]`);
  a.disabled = c.disabled = cerrado;
  if (cerrado) delete horarios[dia]; else horarios[dia] = {abre:a.value||'20:00',cierra:c.value||'00:00'};
}
async function guardarHorarios() {
  document.querySelectorAll('.horario-row').forEach(row => {
    const dia = parseInt(row.querySelector('input[data-tipo="abre"]').dataset.dia,10);
    if (row.querySelector('input[type="checkbox"]').checked) { delete horarios[dia]; return; }
    horarios[dia] = { abre: row.querySelector('input[data-tipo="abre"]').value||'20:00', cierra: row.querySelector('input[data-tipo="cierra"]').value||'00:00' };
  });
  await withLoading('btn-guardar-horarios', async () => {
    await api('/api/admin/config','PUT',{horarios}); toast('Horarios guardados ✓');
  });
}

// ============================================================
//  GALERÍA
// ============================================================
function renderGaleria() {
  const cont = $('lista-galeria');
  if (!galeria.length) { cont.innerHTML = '<p class="empty">Sin fotos.</p>'; return; }
  cont.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'galeria-grid';
  galeria.forEach((g, i) => {
    const div = document.createElement('div'); div.className = 'galeria-item';
    div.innerHTML = `<img src="${escapeHtml(g.url)}" alt=""><button class="rm" data-action="remove-galeria" data-index="${i}">✕</button>`;
    grid.appendChild(div);
  });
  cont.appendChild(grid);
}
async function subirGaleria(files) {
  for (const file of files) {
    try { const r = await api('/api/admin/imagen','POST',{filename:file.name,data:await fileABase64(file),contentType:file.type}); galeria.push({url:r.url,caption:''}); }
    catch(e){ toast('Error: '+e.message,true); }
  }
  renderGaleria();
}
async function guardarGaleria() {
  await withLoading('btn-guardar-galeria', async () => {
    await api('/api/admin/config','PUT',{galeria}); toast('Galería guardada ✓');
  });
}

// ============================================================
//  CONFIG
// ============================================================
async function guardarConfig() {
  await withLoading('btn-guardar-config', async () => {
    await api('/api/admin/config','PUT',{whatsapp:$('config-whatsapp').value.trim()}); toast('Configuración guardada ✓');
  });
}

// ============================================================
//  HELPERS
// ============================================================
function cerrarModal() { $('overlay').classList.remove('open'); }
function fileABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}
$('overlay').addEventListener('click', e => { if (e.target === $('overlay')) cerrarModal(); });

// ============================================================
//  EVENT DELEGATION: captura de acciones sin onclick inline
//  NICE-11: migra todos los onclick inline a listener central
// ============================================================
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case 'do-login':
      doLogin();
      break;
    case 'show-tab':
      showTab(target.dataset.tab);
      break;
    case 'logout':
      logout();
      break;
    case 'abrir-producto':
      abrirProducto();
      break;
    case 'abrir-categoria':
      abrirCategoria();
      break;
    case 'abrir-modifier-group':
      abrirModifierGroup();
      break;
    case 'agregar-promo':
      agregarPromo();
      break;
    case 'guardar-promos':
      guardarPromos();
      break;
    case 'guardar-horarios':
      guardarHorarios();
      break;
    case 'upload-galeria':
      document.getElementById('file-galeria').click();
      break;
    case 'guardar-galeria':
      guardarGaleria();
      break;
    case 'guardar-config':
      guardarConfig();
      break;
    case 'cerrar-modal':
      cerrarModal();
      break;
    case 'toggle-activo-producto':
      toggleActivoProducto(parseInt(target.dataset.id), parseInt(target.dataset.activo));
      break;
    case 'abrir-producto':
      abrirProducto(target.dataset.id ? parseInt(target.dataset.id) : null);
      break;
    case 'eliminar-producto':
      eliminarProducto(parseInt(target.dataset.id));
      break;
    case 'guardar-producto':
      guardarProducto();
      break;
    case 'abrir-categoria':
      abrirCategoria(target.dataset.id ? parseInt(target.dataset.id) : null);
      break;
    case 'eliminar-categoria':
      eliminarCategoria(parseInt(target.dataset.id));
      break;
    case 'guardar-categoria':
      guardarCategoria(target.dataset.id ? parseInt(target.dataset.id) : null);
      break;
    case 'eliminar-modifier-group':
      eliminarModifierGroup(parseInt(target.dataset.id));
      break;
    case 'guardar-modifier-group':
      guardarModifierGroup();
      break;
    case 'editar-option-inline':
      editarOptionInline(parseInt(target.dataset.groupId), target.dataset.optionId ? parseInt(target.dataset.optionId) : null);
      break;
    case 'eliminar-modifier-option':
      eliminarModifierOption(parseInt(target.dataset.groupId), parseInt(target.dataset.optionId));
      break;
    case 'guardar-option-inline':
      guardarOptionInline(parseInt(target.dataset.groupId), target.dataset.optionId === 'null' ? null : parseInt(target.dataset.optionId), target);
      break;
    case 'render-modifiers':
      renderModifierGroups();
      break;
    case 'remove-promo':
      promos.splice(parseInt(target.dataset.index), 1);
      renderPromos();
      break;
    case 'remove-galeria':
      galeria.splice(parseInt(target.dataset.index), 1);
      renderGaleria();
      break;
  }
});

init();
