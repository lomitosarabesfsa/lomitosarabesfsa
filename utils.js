// ============================================================
//  UTILIDADES COMPARTIDAS (NICE-9: eliminar código duplicado)
//  Usado por el frontend público (app.js) y el panel admin.
// ============================================================

/**
 * Escapa HTML para prevenir XSS cuando se inserta contenido dinámico.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Formatea un número como moneda argentina.
 * @param {number} num
 * @returns {string}
 */
export function formatPrice(num) {
  return '$' + Number(num).toLocaleString('es-AR');
}

/**
 * Sanitiza un string para usarlo como slug de URL.
 * @param {string} texto
 * @param {string} fallback
 * @returns {string}
 */
export function slugify(texto, fallback) {
  const slug = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}
