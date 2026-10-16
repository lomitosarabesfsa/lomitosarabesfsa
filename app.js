        // ============================================================
        //  CONFIGURACIÓN — Editá estos valores según tu negocio
        // ============================================================
        const CONFIG = {
            // Fuente del menú: API del admin panel (Cloudflare Worker).
            API_URL: location.hostname === 'localhost' ? 'http://localhost:8787/api/menu' : 'https://lomitos-api.gapersingula97.workers.dev/api/menu',
            WHATSAPP: "5493704218188",
            // Horarios de atención (hora local Formosa, UTC-3)
            // null = cerrado ese día. Formato: "HH:MM"
            HORARIO: {
                0: { abre: "20:00", cierra: "00:00" },      // Domingo
                1: { abre: "20:00", cierra: "00:00" },      // Lunes
                2: { abre: "20:00", cierra: "00:00" },      // Martes
                3: { abre: "20:00", cierra: "00:00" },      // Miércoles
                4: { abre: "20:00", cierra: "00:00" },      // Jueves
                5: { abre: "20:00", cierra: "01:00" },      // Viernes
                6: { abre: "20:00", cierra: "01:00" },      // Sábado
            },
            DIAS: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
            // Promos activas (editá acá o dejá vacío para ocultar el banner)
            PROMOS: [
                // { icono: "🔥", texto: "2x1 en Bebidas", descripcion: "Todos los viernes" },
                // { icono: "⭐", texto: "Nuevo: Lomito Especial BBQ", descripcion: "¡Probalo!" },
            ],
            // Galería de fotos (URLs de imágenes — dejá vacío para ocultar)
            GALLERY: [
                // { url: "https://ejemplo.com/foto1.jpg", caption: "Nuestro lomito clásico" },
                // { url: "https://ejemplo.com/foto2.jpg", caption: "Preparación artesanal" },
            ],
        };

        // ============================================================
        //  ESTADO GLOBAL
        // ============================================================
        let productosDB = [];
        let categorias = new Map(); // Map<nombre, {icono, count}>
        let carrito = [];
        let metodoEntrega = "Envío a domicilio";


        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[c]));
        }

        // ============================================================
        //  TOAST NOTIFICATIONS
        // ============================================================
        function showToast(message, type = 'success', duration = 3000) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;

            const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
            toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
            container.appendChild(toast);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => toast.classList.add('show'));
            });

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 400);
            }, duration);
        }

        // ============================================================
        //  TEMA (LIGHT/DARK)
        // ============================================================
        function loadTheme() {
            // Sin preferencia guardada se respeta la del sistema (el script del <head>
            // ya aplicó el tema antes del primer paint, así no hay flash)
            const guardado = localStorage.getItem('theme');
            const prefiereClaro = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
            const saved = guardado || (prefiereClaro ? 'light' : 'dark');
            document.documentElement.setAttribute('data-theme', saved);
            updateThemeIcon(saved);
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            updateThemeIcon(next);
        }

        function updateThemeIcon(theme) {
            const btn = document.getElementById('theme-toggle');
            btn.textContent = theme === 'dark' ? '☀️' : '🌙';
            btn.title = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
        }

        // ============================================================
        //  HORARIO ABIERTO/CERRADO
        // ============================================================
        function getFormosaTime() {
            // Hora del negocio calculada en la zona horaria de Formosa (UTC-3),
            // sin depender del reloj del dispositivo del cliente.
            try {
                const parts = new Intl.DateTimeFormat('es-AR', {
                    timeZone: 'America/Argentina/Formosa',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23'
                }).formatToParts(new Date());
                const get = (t) => {
                    const p = parts.find(part => part.type === t);
                    return p ? p.value : '';
                };
                let hora = parseInt(get('hour'), 10);
                if (isNaN(hora)) hora = 0;
                const minutos = parseInt(get('minute'), 10) || 0;
                // Día corto localizado: 'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb' (sin acentos)
                const wd = get('weekday').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const dias = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 };
                const dia = dias[wd.slice(0, 3)];
                return { dia: dia !== undefined ? dia : new Date().getDay(), hora: hora % 24, minutos };
            } catch (e) {
                // Fallback: reloj local del dispositivo
                const now = new Date();
                return { dia: now.getDay(), hora: now.getHours(), minutos: now.getMinutes() };
            }
        }

        function checkHorario() {
            const { dia, hora, minutos } = getFormosaTime();
            const horaActual = hora * 60 + minutos;

            const horario = CONFIG.HORARIO[dia];
            const badge = document.getElementById('status-badge');
            const text = document.getElementById('status-text');
            const heroCta = document.getElementById('hero-cta');

            if (!horario) {
                badge.className = 'status-badge cerrado';
                text.textContent = 'Cerrado hoy';
                heroCta.classList.add('cerrado');
                heroCta.textContent = 'Cerrado hoy';
                heroCta.setAttribute('tabindex', '-1');
                heroCta.setAttribute('aria-disabled', 'true');
                return;
            }

            const [abreH, abreM] = horario.abre.split(':').map(Number);
            const [cierraH, cierraM] = horario.cierra.split(':').map(Number);
            const abreMin = abreH * 60 + abreM;
            let cierraMin = cierraH * 60 + cierraM;

            let abierto = false;
            if (cierraMin <= abreMin) {
                // Cierra después de medianoche
                abierto = horaActual >= abreMin || horaActual < cierraMin;
            } else {
                abierto = horaActual >= abreMin && horaActual < cierraMin;
            }

            if (abierto) {
                badge.className = 'status-badge abierto';
                text.textContent = `Abierto · Cierra ${horario.cierra}hs`;
                heroCta.classList.remove('cerrado');
                heroCta.textContent = 'Hacer mi pedido';
                heroCta.href = '#menu';
                heroCta.removeAttribute('tabindex');
                heroCta.removeAttribute('aria-disabled');
            } else {
                badge.className = 'status-badge cerrado';
                text.textContent = `Cerrado · Abre ${horario.abre}hs`;
                heroCta.classList.add('cerrado');
                heroCta.textContent = `Cerrado · Abre a las ${horario.abre}`;
                heroCta.setAttribute('tabindex', '-1');
                heroCta.setAttribute('aria-disabled', 'true');
            }
        }

        function renderFooterHours() {
            const container = document.getElementById('footer-hours');
            let html = '';
            for (let i = 1; i <= 6; i++) {
                const h = CONFIG.HORARIO[i];
                html += `<div class="hours-item"><span class="day">${CONFIG.DIAS[i].substring(0, 3)}</span><span>${h ? h.abre + ' - ' + h.cierra : 'Cerrado'}</span></div>`;
            }
            const dom = CONFIG.HORARIO[0];
            html += `<div class="hours-item"><span class="day">Dom</span><span>${dom ? dom.abre + ' - ' + dom.cierra : 'Cerrado'}</span></div>`;
            container.innerHTML = html;
        }

        // ============================================================
        //  PROMOS
        // ============================================================
        function renderPromos() {
            if (!CONFIG.PROMOS || CONFIG.PROMOS.length === 0) return;
            const promo = CONFIG.PROMOS[Math.floor(Math.random() * CONFIG.PROMOS.length)];
            document.getElementById('promo-icon').textContent = promo.icono || '🔥';
            document.getElementById('promo-text').textContent = promo.texto;
            document.getElementById('promo-desc').textContent = promo.descripcion || '';
            document.getElementById('promo-banner').classList.add('visible');
        }
        function cerrarPromo() {
            document.getElementById('promo-banner').classList.remove('visible');
        }

        // ============================================================
        //  GALLERY
        // ============================================================
        function renderGallery() {
            if (!CONFIG.GALLERY || CONFIG.GALLERY.length === 0) return;
            const container = document.getElementById('gallery-scroll');
            let html = '';
            CONFIG.GALLERY.forEach(img => {
                const url = img.url || '';
                // Solo se renderizan URLs seguras (mismo sitio o https)
                if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return;
                const caption = img.caption || 'Foto';
                html += `
                    <div class="gallery-item">
                        <img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async" draggable="false">
                        ${img.caption ? `<div class="gallery-caption">${escapeHtml(img.caption)}</div>` : ''}
                    </div>
                `;
            });
            container.innerHTML = html;
            const section = document.getElementById('gallery-section');
            section.classList.add('visible');
            section.querySelectorAll('.reveal:not(.active)').forEach(el => scrollObserver.observe(el));
        }

        // ============================================================
        //  HAMBURGER MENU
        // ============================================================
        function toggleMobileMenu() {
            const menu = document.getElementById('mobile-menu');
            const hamburger = document.getElementById('hamburger');
            menu.classList.toggle('open');
            hamburger.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', menu.classList.contains('open'));
            document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
        }
        function closeMobileMenu() {
            document.getElementById('mobile-menu').classList.remove('open');
            document.getElementById('hamburger').classList.remove('active');
            document.getElementById('hamburger').setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        // ============================================================
        //  CARGAR Y PROCESAR DATOS DESDE LA API
        // ============================================================
        function procesarMenuJSON(data) {
            // Fuente: API del Worker (admin panel).
            productosDB = [];
            categorias = new Map();
            if (!data || !Array.isArray(data.categorias)) return;
            data.categorias.forEach(cat => {
                // Sólo el icono que el admin haya cargado: sin icono no dibujamos recuadro
                // (antes las 5 categorías mostraban el mismo 🍽️ de relleno)
                const icono = (cat.icono || '').trim();
                categorias.set(cat.nombre, {
                    icono, count: cat.productos.length,
                    // Campaña: si la categoría se destaca y hasta cuándo se muestra
                    promocional: !!cat.promocional,
                    temporal: !!cat.temporal,
                    desde: cat.desde || '',
                    hasta: cat.hasta || '',
                });
                cat.productos.forEach(p => {
                    productosDB.push({
                        id: 'api-' + p.id,
                        categoria: cat.nombre,
                        categoriaId: cat.id,
                        nombre: p.nombre || 'Producto',
                        descripcion: p.descripcion || '',
                        precio: Number(p.precio) || 0,
                        stock: (p.stock === undefined || p.stock === null) ? -1 : Number(p.stock),
                        imagen: p.imagen || '',
                        modifier_groups: Array.isArray(p.modifier_groups) ? p.modifier_groups : [],
                    });
                });
            });
            if (Array.isArray(data.promos)) {
                CONFIG.PROMOS = data.promos.map(x => ({ icono: x.icono, texto: x.texto, descripcion: x.descripcion }));
            }
            if (data.config && data.config.horarios) CONFIG.HORARIO = data.config.horarios;
            if (data.config && Array.isArray(data.config.galeria)) CONFIG.GALLERY = data.config.galeria;
            if (data.config && data.config.whatsapp) CONFIG.WHATSAPP = data.config.whatsapp;
            renderizarCarta();
            renderPromos();
            renderGallery();
        }

        // ============================================================
        //  RENDERIZADO DE LA CARTA (todo el menú a la vista)
        // ============================================================
        let cartaEventSent = false; // ver_carta solo una vez por carga (caché + red = 1 evento)

        function slugify(texto, fallback) {
            const slug = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            return slug || fallback;
        }

        function renderizarCarta() {
            const container = document.getElementById('carta-container');
            const chipsBar = document.getElementById('carta-chips');
            container.innerHTML = '';
            // Vaciamos SÓLO el carril de chips: vaciar la barra entera destruía
            // las flechas de desplazamiento y el listener que las gobernaba
            let chipsScroll = chipsBar ? chipsBar.querySelector('.carta-chips-scroll') : null;
            if (chipsScroll) chipsScroll.innerHTML = '';
            else if (chipsBar) chipsBar.innerHTML = '';

            if (categorias.size === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px 0;">No hay productos disponibles por ahora. Volvé más tarde 👋</p>';
                if (chipsBar) chipsBar.style.display = 'none';
                return;
            }
            if (chipsBar) chipsBar.style.display = '';

            if (!cartaEventSent) {
                cartaEventSent = true;
                trackEvent('ver_carta', { categorias: categorias.size, productos: productosDB.length });
            }

            if (!chipsScroll) {
                chipsScroll = document.createElement('div');
                chipsScroll.className = 'carta-chips-scroll';
                chipsScroll.id = 'carta-chips-scroll';
                const flechaDer = chipsBar ? chipsBar.querySelector('#nav-arrow-right') : null;
                if (flechaDer) chipsBar.insertBefore(chipsScroll, flechaDer);
                else if (chipsBar) chipsBar.appendChild(chipsScroll);
            }
            // El carril también puede venir del HTML (esqueletos): rol y etiqueta
            // se aseguran siempre, no sólo cuando lo creamos nosotros
            chipsScroll.setAttribute('role', 'group');
            chipsScroll.setAttribute('aria-label', 'Categorías del menú');

            // Chip "Todos" (sin filtro): se ven todas las categorías apiladas
            const chipTodos = document.createElement('button');
            chipTodos.type = 'button';
            chipTodos.className = 'carta-chip active';
            chipTodos.setAttribute('aria-pressed', 'true');
            chipTodos.dataset.todos = '';
            chipTodos.setAttribute('aria-label', 'Ver todas las categorías');
            chipTodos.innerHTML = `Todos`;
            chipTodos.addEventListener('click', () => verTodos());
            chipsScroll.appendChild(chipTodos);

            let index = 0;
            categorias.forEach((data, cat) => {
                const prods = productosDB.filter(p => p.categoria === cat);
                if (prods.length === 0) return;

                const id = 'carta-' + slugify(cat, 'seccion-' + index);
                // Categoría de campaña: se destaca y, si vence, muestra cronómetro
                const esPromo = !!data.promocional;
                const vence = (data.temporal && data.hasta && Number.isFinite(Date.parse(data.hasta)))
                    ? data.hasta : '';

                // Chip de filtro (barra sticky): al tocarlo solo se ve esa categoría
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = esPromo ? 'carta-chip carta-chip-promo' : 'carta-chip';
                chip.setAttribute('aria-pressed', 'false');
                chip.dataset.target = id;
                chip.setAttribute('aria-label', `Ver categoría ${cat}`);
                chip.innerHTML = esPromo ? `🔥 ${escapeHtml(cat)}` : `${escapeHtml(cat)}`;
                chip.addEventListener('click', () => irACategoria(id, cat, chip));
                chipsScroll.appendChild(chip);

                // Sección del menú (one-page: todo visible)
                const section = document.createElement('section');
                section.className = `carta-section reveal active stagger-${(index % 3) + 1}${esPromo ? ' carta-section-promo' : ''}`;
                section.id = id;
                section.setAttribute('aria-labelledby', `carta-titulo-${index}`);
                if (vence) section.dataset.hasta = vence;
                const iconoHTML = data.icono
                    ? `<span class="carta-section-icon" aria-hidden="true">${escapeHtml(data.icono)}</span>`
                    : '';
                const badgeHTML = esPromo ? '<span class="carta-promo-badge">🔥 Promo</span>' : '';
                const countdownHTML = vence
                    ? `<span class="carta-countdown" data-hasta="${escapeHtml(vence)}" title="Termina el ${escapeHtml(vence.slice(0, 10))}">⏳ <span class="cd-label">Termina en</span> <span class="cd-valor"></span></span>`
                    : '';
                // H3: las categorías viven dentro de la sección "Nuestro Menú" (H2),
                // y los productos son H4 (antes se saltaba el nivel H3)
                section.innerHTML = `
                    <div class="carta-section-header">
                        ${iconoHTML}
                        <h3 class="carta-section-title" id="carta-titulo-${index}">${escapeHtml(cat)}</h3>
                        ${badgeHTML}
                        ${countdownHTML}
                        <span class="carta-section-count">${prods.length} ${prods.length === 1 ? 'opción' : 'opciones'}</span>
                    </div>
                    <div class="carta-productos"></div>
                `;

                const filas = section.querySelector('.carta-productos');
                prods.forEach(prod => {
                    filas.appendChild(crearFilaProducto(prod, false));
                });

                container.appendChild(section);
                index++;
            });

            iniciarScrollSpy();
            initFlechasChips();
            iniciarCountdowns();
        }

        // ============================================================
        //  CRONÓMETRO DE LAS CATEGORÍAS TEMPORALES
        //  La API ya no manda las vencidas; esto cubre a quien dejó la página
        //  abierta cuando la promoción se termina.
        // ============================================================
        let countdownTimer = null;

        function formatoRestante(ms) {
            const s = Math.max(0, Math.floor(ms / 1000));
            const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
            const m = Math.floor((s % 3600) / 60), seg = s % 60;
            if (d > 0) return `${d}d ${h}h ${m}m`;
            if (h > 0) return `${h}h ${m}m ${seg}s`;
            return `${m}m ${seg}s`;
        }

        function iniciarCountdowns() {
            if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
            if (!document.querySelector('#carta-container .carta-countdown')) return;
            tickCountdowns();
            countdownTimer = setInterval(tickCountdowns, 1000);
        }

        function tickCountdowns() {
            const ahora = Date.now();
            let vencida = false;
            document.querySelectorAll('#carta-container .carta-countdown').forEach(el => {
                const t = Date.parse(el.dataset.hasta);
                if (!Number.isFinite(t)) return;
                const resta = t - ahora;
                const valor = el.querySelector('.cd-valor');
                if (valor) valor.textContent = formatoRestante(resta);
                el.classList.toggle('por-vencer', resta <= 3600000); // última hora
                if (resta <= 0) vencida = true;
            });
            if (vencida) quitarCategoriasVencidas();
        }

        // La promo terminó: se va del menú y del carrito, sin recargar la página
        function quitarCategoriasVencidas() {
            const ahora = Date.now();
            let cambio = false;
            [...categorias.keys()].forEach(nombre => {
                const datos = categorias.get(nombre);
                const t = Date.parse(datos.hasta || '');
                if (!Number.isFinite(t) || t > ahora) return;
                categorias.delete(nombre);
                productosDB = productosDB.filter(p => p.categoria !== nombre);
                cambio = true;
            });
            if (!cambio) return;
            filtroCategoria = null;
            renderizarCarta();
            reconciliarCarrito();
        }

        // Filtro de categorías: null = todas visibles, 'carta-...' = solo esa categoría
        let filtroCategoria = null;

        // Única fuente de verdad del chip iluminado: clase + estado accesible.
        // Antes el estado activo sólo existía como color, así que un lector de
        // pantalla no podía saber qué categoría estaba filtrada.
        function activarChip(chip) {
            document.querySelectorAll('#carta-chips .carta-chip').forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
            });
            if (chip) {
                chip.classList.add('active');
                chip.setAttribute('aria-pressed', 'true');
            }
        }

        // Muestra una sección con entrada suave (fade + desliz sutil)
        function mostrarSeccion(s, animar) {
            s.style.display = '';
            if (!animar) return;
            s.classList.remove('filtro-in');
            void s.offsetWidth; // fuerza reflow para reiniciar la animación al re-mostrar
            s.classList.add('filtro-in');
        }

        // Filtro: muestra SOLO la categoría seleccionada, oculta el resto
        function irACategoria(id, nombre, chip) {
            const seccion = document.getElementById(id);
            if (!seccion) return;
            // Si la categoría ya estaba filtrada, el toque vuelve a "Todos" (toggle)
            if (filtroCategoria === id) {
                // Re-toque sobre la categoría ya filtrada: vuelve a "Todos"
                verTodos();
                return;
            }
            filtroCategoria = id;
            document.querySelectorAll('#carta-container .carta-section').forEach(s => {
                if (s.id === id) mostrarSeccion(s, true);
                else s.style.display = 'none';
            });
            activarChip(chip);
            seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
            trackEvent('ver_categoria', { categoria: nombre });
        }

        // Sin filtro: todas las categorías visibles de nuevo.
        // El chip iluminado vuelve a ser "Todos": antes quedaba marcada la categoría
        // que acababas de tocar, o sea la barra decía "Bebidas" mostrando todo el menú.
        function verTodos() {
            filtroCategoria = null;
            document.querySelectorAll('#carta-container .carta-section').forEach(s => mostrarSeccion(s, true));
            activarChip(document.querySelector('#carta-chips .carta-chip[data-todos]'));
            const primera = document.querySelector('#carta-container .carta-section');
            if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'start' });
            trackEvent('ver_carta', { filtro: 'todos' });
        }

        // Scroll-spy con IntersectionObserver (sin jank de eventos scroll)
        let cartaObserver = null;
        let cartaScrollListener = null;
        let cartaSpyRafId = null; // throttle del fallback de scroll (1 vez por frame)

        function iniciarScrollSpy() {
            if (cartaObserver) cartaObserver.disconnect();
            const chips = document.querySelectorAll('#carta-chips .carta-chip');
            const secciones = document.querySelectorAll('#carta-container .carta-section');
            if (!chips.length || !secciones.length) return;
            const chipTodos = document.querySelector('#carta-chips .carta-chip[data-todos]');

            const chipPorSeccion = {};
            chips.forEach(c => { chipPorSeccion[c.dataset.target] = c; });

            cartaObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const chip = chipPorSeccion[entry.target.id];
                    if (!chip) return;
                    // Sin filtro y en el inicio del menú (primera sección) → se ilumina "Todos"
                    if (!filtroCategoria && chipTodos && entry.target === secciones[0]) {
                        activarChip(chipTodos);
                        return;
                    }
                    activarChip(chip);
                    // Centra el chip dentro de la barra manipulando scrollLeft directamente:
                    // scrollIntoView puede provocar saltos/bloqueos de scroll de página
                    // en Android cuando se dispara durante un gesto lento
                    const chipsScroll = document.querySelector('.carta-chips-scroll');
                    if (chipsScroll) {
                        const rect = chipsScroll.getBoundingClientRect();
                        const chipRect = chip.getBoundingClientRect();
                        chipsScroll.scrollLeft += (chipRect.left - rect.left) - (rect.width / 2 - chipRect.width / 2);
                    }
                });
            // Franja activa en píxeles: justo debajo del nav fijo + chips sticky (~135px)
            }, { rootMargin: '-135px 0px -75% 0px', threshold: 0 });

            secciones.forEach(s => cartaObserver.observe(s));

            // Fallback de scroll: iluminar "Todos" al volver al inicio del menú
            // y el último chip al llegar al final de la carta
            if (!cartaScrollListener) {
                cartaScrollListener = () => {
                    if (filtroCategoria) return; // con un filtro activo el chip no cambia solo
                    // Inicio del menú: la primera sección está por encima de la franja activa
                    if (secciones.length && chipTodos) {
                        const top = secciones[0].getBoundingClientRect().top;
                        if (top >= -80 && !chipTodos.classList.contains('active')) {
                            activarChip(chipTodos);
                            return;
                        }
                    }
                    const ultimo = chips[chips.length - 1];
                    const container = document.getElementById('carta-container');
                    if (!ultimo || !container || ultimo.classList.contains('active')) return;
                    if (container.getBoundingClientRect().bottom <= window.innerHeight + 4) {
                        activarChip(ultimo);
                    }
                };
                // Throttle con rAF: el fallback hace lecturas de layout
                // (getBoundingClientRect); correrlo en cada evento frena móviles
                window.addEventListener('scroll', () => {
                    if (cartaSpyRafId !== null) return;
                    cartaSpyRafId = requestAnimationFrame(() => {
                        cartaSpyRafId = null;
                        cartaScrollListener();
                    });
                }, { passive: true });
            }
        }

        // ============================================================
        //  FILA DE PRODUCTO (compartida por carta y búsqueda)
        // ============================================================
        function crearFilaProducto(prod, mostrarCategoria) {
            const agotado = prod.stock === 0;
            const fila = document.createElement('div');
            fila.className = 'producto-fila' + (agotado ? ' agotado' : '');
            fila.dataset.prodId = prod.id;

            let stockHTML = '';
            if (agotado) stockHTML = '<span class="stock-badge agotado">⛔ Agotado</span>';
            else if (prod.stock > 0 && prod.stock <= 5) stockHTML = `<span class="stock-badge pocas">🔥 Últimas ${prod.stock}</span>`;
            else if (prod.stock > 5) stockHTML = '<span class="stock-badge disponible">✓ Disponible</span>';

            const imgHTML = prod.imagen
                ? `<div class="producto-fila-img-wrapper" data-action="modal-producto" data-prod-id="${prod.id}" style="position: relative; cursor: pointer; flex-shrink: 0;" aria-label="Ver detalles de ${escapeHtml(prod.nombre)}">
                       <img class="producto-fila-img" src="${escapeHtml(prod.imagen)}" alt="${escapeHtml(prod.nombre)}" onerror="this.classList.add('img-error')" loading="lazy">
                       <div class="img-zoom-hint" style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.6); color: white; border-radius: 50%; padding: 4px; display: flex; backdrop-filter: blur(2px);">
                           <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                       </div>
                   </div>`
                : '';

            const catHTML = mostrarCategoria
                ? `<span class="producto-fila-cat">${escapeHtml(prod.categoria)}</span>`
                : '';

            fila.innerHTML = `
                ${imgHTML}
                <div class="producto-fila-info" aria-label="Ver detalles de ${escapeHtml(prod.nombre)}">
                    <div class="producto-fila-titulo">
                        <h4>${escapeHtml(prod.nombre)}</h4>
                        ${catHTML}
                        ${stockHTML}
                    </div>
                    ${prod.descripcion ? `<p class="producto-fila-desc">${escapeHtml(prod.descripcion)}</p>` : ''}
                    <p class="producto-fila-precio">$${prod.precio.toLocaleString('es-AR')}</p>
                </div>
                <button class="producto-fila-add" data-action="bottom-sheet" data-prod-id="${prod.id}" ${agotado ? 'disabled' : ''} aria-label="Agregar ${escapeHtml(prod.nombre)} al pedido" title="Agregar al pedido">+</button>
            `;
            return fila;
        }



        // ============================================================
        //  ACCESIBILIDAD: FOCO Y TECLADO
        // ============================================================
        let lastFocusedElement = null;

        function guardarFoco() {
            lastFocusedElement = document.activeElement;
        }

        function restaurarFoco() {
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
                lastFocusedElement.focus();
            }
            lastFocusedElement = null;
        }

        function trapFocus(container, e) {
            if (e.key !== 'Tab') return;
            // Solo elementos realmente visibles (descarta el paso del carrito oculto con display:none)
            const focusables = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
                .filter(el => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }

        // ============================================================
        //  MODALES
        // ============================================================
        function cerrarTodo() {
            document.getElementById('cart-sidebar').classList.remove('open');
            document.getElementById('ui-overlay').classList.remove('open');
            cerrarModalProducto();
            document.body.style.overflow = '';
            restaurarFoco();
        }

        // ============================================================
        //  CARRITO
        // ============================================================
        function toggleCart() {
            const sidebar = document.getElementById('cart-sidebar');
            const overlay = document.getElementById('ui-overlay');
            if (sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                overlay.classList.remove('open');
                document.body.style.overflow = '';
                restaurarFoco();
            } else {
                sidebar.classList.add('open');
                overlay.classList.add('open');
                document.body.style.overflow = 'hidden';
                guardarFoco();
                const closeBtn = sidebar.querySelector('.close-btn');
                if (closeBtn) closeBtn.focus();
            }
        }

        function seleccionarMetodo(metodo) {
            metodoEntrega = metodo;
            const campoDireccion = document.getElementById('campo-direccion');
            if (campoDireccion) {
                campoDireccion.style.display = metodo === 'Retiro en local' ? 'none' : 'block';
            }
            actualizarBotonPaso();
        }

        function irACheckout() {
            if (carrito.length === 0) {
                showToast('Tu carrito está vacío.', 'warning');
                return;
            }
            trackEvent('iniciar_checkout', { items: carrito.length });
            document.getElementById('step-1').classList.remove('active');
            document.getElementById('step-2').classList.add('active');
            document.getElementById('cart-title').textContent = "Finalizar Pedido";
            irAPaso(1);
        }

        function volverAlCarrito() {
            document.getElementById('step-2').classList.remove('active');
            document.getElementById('step-1').classList.add('active');
            document.getElementById('cart-title').textContent = "Tu Pedido";
        }

        // ============================================================
        //  CHECKOUT WIZARD: 3 etapas con marcadores de progreso
        //  (patrón adaptado del demo: 1 Recibís → 2 Pagás → 3 Confirmás)
        // ============================================================
        let pasoCheckout = 1;
        let pagoCheckout = '';

        function irAPaso(n) {
            pasoCheckout = n;
            document.querySelectorAll('#step-2 .checkout-paso').forEach(p => {
                p.classList.toggle('active', Number(p.dataset.paso) === n);
            });
            document.querySelectorAll('#checkout-progress .checkout-step').forEach(s => {
                const cs = Number(s.dataset.cs);
                s.classList.toggle('done', cs < n);
                s.classList.toggle('active', cs === n);
            });
            const anuncio = document.getElementById('paso-announce');
            if (anuncio) anuncio.textContent = `Paso ${n} de 3`;
            const btnAtras = document.getElementById('btn-paso-atras');
            const btnSiguiente = document.getElementById('btn-paso-siguiente');
            const btnEnviar = document.getElementById('btn-enviar-pedido');
            if (btnAtras) btnAtras.hidden = n === 1;
            if (btnSiguiente) btnSiguiente.hidden = n === 3;
            if (btnEnviar) btnEnviar.hidden = n !== 3;
            if (n === 3) renderResumenCheckout();
            actualizarBotonPaso();
            const body = document.querySelector('#step-2 .step-body');
            if (body) body.scrollTop = 0;
        }

        // Cada etapa se valida antes de habilitar "Continuar" / "Enviar"
        function paso1Valido() {
            if (metodoEntrega === 'Retiro en local') return true;
            const dir = (document.getElementById('form-direccion').value || '').trim();
            return dir.length > 0;
        }

        function actualizarBotonPaso() {
            const btnSiguiente = document.getElementById('btn-paso-siguiente');
            const btnEnviar = document.getElementById('btn-enviar-pedido');
            if (pasoCheckout === 1 && btnSiguiente) {
                btnSiguiente.disabled = !paso1Valido();
            } else if (pasoCheckout === 2 && btnSiguiente) {
                btnSiguiente.disabled = !pagoCheckout;
            } else if (pasoCheckout === 3 && btnEnviar) {
                const nombre = (document.getElementById('form-nombre').value || '').trim();
                btnEnviar.disabled = !nombre;
            }
        }

        function renderResumenCheckout() {
            const cont = document.getElementById('resumen-checkout');
            if (!cont) return;
            if (carrito.length === 0) {
                cont.innerHTML = '';
                return;
            }
            let html = '';
            let total = 0;
            carrito.forEach(item => {
                const subtotal = calcularSubtotalItem(item);
                total += subtotal;
                const mods = item.modificadores || item.adicionales || [];
                let nombre = `${item.cantidad}x ${escapeHtml(item.nombre)}`;
                if (mods.length > 0) {
                    nombre += `<br><span class="resumen-mods">+ ${mods.map(m => escapeHtml(m.nombre)).join(', ')}</span>`;
                }
                html += `<div class="summary-row"><span class="summary-item">${nombre}</span><span class="summary-val">$${subtotal.toLocaleString('es-AR')}</span></div>`;
            });
            html += `<div class="summary-row total"><span>Total</span><span>$${total.toLocaleString('es-AR')}</span></div>`;
            html += `<div class="summary-row summary-meta"><span>Entrega</span><span>${escapeHtml(metodoEntrega)}</span></div>`;
            html += `<div class="summary-row summary-meta"><span>Pago</span><span>${pagoCheckout ? escapeHtml(pagoCheckout) : '—'}</span></div>`;
            cont.innerHTML = html;
        }

        // Restablece el wizard a su estado inicial (tras enviar un pedido)
        function resetearCheckout() {
            metodoEntrega = 'Envío a domicilio';
            pagoCheckout = '';
            document.querySelectorAll('#step-2 input[name="entrega"], #step-2 input[name="pago"]').forEach(r => {
                r.checked = false;
                const card = r.closest('.option-card');
                if (card) card.classList.remove('checked');
            });
            const envio = document.querySelector('#step-2 input[name="entrega"][value="Envío a domicilio"]');
            if (envio) {
                envio.checked = true;
                const card = envio.closest('.option-card');
                if (card) card.classList.add('checked');
            }
            ['form-nombre', 'form-direccion', 'form-barrio', 'form-dpto', 'form-notas'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const campoDireccion = document.getElementById('campo-direccion');
            if (campoDireccion) campoDireccion.style.display = 'block';
            irAPaso(1);
        }

        // Bindings del wizard (tarjetas de opción + validación en vivo)
        function inicializarCheckoutWizard() {
            document.querySelectorAll('#step-2 input[name="entrega"]').forEach(input => {
                input.addEventListener('change', () => {
                    const group = input.closest('.opciones-cards');
                    if (group) group.querySelectorAll('.option-card').forEach(c => c.classList.remove('checked'));
                    const card = input.closest('.option-card');
                    if (card) card.classList.add('checked');
                    seleccionarMetodo(input.value);
                });
            });
            document.querySelectorAll('#step-2 input[name="pago"]').forEach(input => {
                input.addEventListener('change', () => {
                    document.querySelectorAll('#step-2 input[name="pago"]').forEach(r => {
                        const card = r.closest('.option-card');
                        if (card) card.classList.toggle('checked', r.checked);
                    });
                    pagoCheckout = input.value;
                    actualizarBotonPaso();
                });
            });
            // Validación en vivo de los campos que habilitan el botón
            ['form-direccion', 'form-nombre'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', actualizarBotonPaso);
            });
            irAPaso(1);
        }

        // Feedback al agregar: pulso limpio del contador del carrito
        function pulsoCarrito() {
            const cartBadge = document.getElementById('cart-count-badge');
            if (!cartBadge) return;
            cartBadge.style.transition = 'transform 0.15s';
            cartBadge.style.transform = 'scale(1.45)';
            setTimeout(() => cartBadge.style.transform = 'scale(1)', 200);
        }

        // agregarAlCarrito ya no se usa directamente (el bottom sheet lo reemplaza)
        // Se mantiene por si se llama desde otro contexto
        function agregarAlCarrito() {}

        function modificarCantidad(clave, delta) {
            const index = carrito.findIndex(item => (item.clave || item.id) === clave);
            if (index > -1) {
                // Check stock limit when increasing
                if (delta > 0) {
                    const prod = productosDB.find(p => p.id === carrito[index].id);
                    if (prod && prod.stock > 0 && carrito[index].cantidad >= prod.stock) {
                        showToast(`Stock máximo: ${prod.stock} unidades`, 'warning');
                        return;
                    }
                }
                carrito[index].cantidad += delta;
                if (carrito[index].cantidad <= 0) carrito.splice(index, 1);
                actualizarCarrito();
                guardarCarrito();
            }
        }

        function calcularSubtotalItem(item) {
            let extras = 0;
            const mods = item.modificadores || item.adicionales || [];
            extras = mods.reduce((sum, m) => sum + (m.price_delta || m.precio || 0), 0);
            return (item.precio + extras) * item.cantidad;
        }

        function actualizarCarrito() {
            const container = document.getElementById('cart-items');
            const badge = document.getElementById('cart-count-badge');
            const totalEl = document.getElementById('cart-total-price');

            container.innerHTML = '';
            let total = 0;
            let cantidadItems = 0;

            if (carrito.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 50px;">Tu pedido está vacío</p>';
            } else {
                carrito.forEach(item => {
                    const subtotal = calcularSubtotalItem(item);
                    total += subtotal;
                    cantidadItems += item.cantidad;

                    const div = document.createElement('div');
                    div.className = 'cart-item';
                    const claveSegura = String(item.clave || item.id);
                    const nombreSeguro = escapeHtml(item.nombre);
                    const mods = item.modificadores || item.adicionales || [];
                    let extrasHTML = '';
                    if (mods.length > 0) {
                        extrasHTML = '<p style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">' +
                            mods.map(m => '+ ' + escapeHtml(m.nombre) + ' <span style="color:var(--tertiary)">$' + Number(m.price_delta || m.precio || 0).toLocaleString('es-AR') + '</span>').join('<br>') + '</p>';
                    }
                    div.innerHTML = `
                        <div class="cart-item-info">
                            <h4>${nombreSeguro}</h4>
                            ${extrasHTML}
                            <p>$${subtotal.toLocaleString('es-AR')}</p>
                        </div>
                        <div class="cart-item-controls">
                            <button class="qty-btn" aria-label="Quitar uno de ${nombreSeguro}" data-action="qty" data-clave="${escapeHtml(claveSegura)}" data-delta="-1">-</button>
                            <span>${item.cantidad}</span>
                            <button class="qty-btn" aria-label="Agregar uno de ${nombreSeguro}" data-action="qty" data-clave="${escapeHtml(claveSegura)}" data-delta="1">+</button>
                        </div>
                    `;
                    container.appendChild(div);
                });
            }

            badge.innerText = cantidadItems;
            totalEl.innerText = '$' + total.toLocaleString('es-AR');
        }

        // ============================================================
        //  PERSISTENCIA DEL CARRITO (localStorage)
        // ============================================================
        function guardarCarrito() {
            localStorage.setItem('lomitos_carrito', JSON.stringify(carrito));
        }

        function cargarCarrito() {
            try {
                const saved = localStorage.getItem('lomitos_carrito');
                if (saved) {
                    carrito = JSON.parse(saved);
                    actualizarCarrito();
                }
            } catch (e) {
                console.warn('Error loading cart:', e);
                carrito = [];
            }
        }

        function reconciliarCarrito() {
            if (!carrito.length) return;
            let cambiado = false;
            const removidos = [];

            carrito = carrito.filter(item => {
                const prod = productosDB.find(p => p.id === item.id);
                if (!prod || prod.stock === 0) {
                    removidos.push(item.nombre);
                    cambiado = true;
                    return false;
                }
                return true;
            });

            carrito.forEach(item => {
                const prod = productosDB.find(p => p.id === item.id);
                if (!prod) return;
                if (prod.nombre !== item.nombre || prod.precio !== item.precio) cambiado = true;
                item.nombre = prod.nombre;
                item.descripcion = prod.descripcion;
                item.imagen = prod.imagen;
                item.precio = prod.precio;
                // Reconstruir clave estable (modificadores pueden haber cambiado)
                const mods = item.modificadores || item.adicionales || [];
                const modIds = Array.isArray(mods) ? mods.map(m => m.id).sort().join(',') : '';
                item.clave = modIds ? item.id + '+m' + modIds : item.id;
                if (prod.stock > 0 && item.cantidad > prod.stock) {
                    item.cantidad = prod.stock;
                    cambiado = true;
                }
            });

            if (cambiado) {
                actualizarCarrito();
                guardarCarrito();
                if (removidos.length) {
                    showToast(`Se actualizó tu pedido: ${removidos.join(', ')} ya no está disponible.`, 'warning');
                }
            }
        }

        // ============================================================
        //  COMPARTIR PEDIDO
        // ============================================================
        function compartirPedido() {
            if (carrito.length === 0) {
                showToast('Tu pedido está vacío.', 'warning');
                return;
            }

            let texto = '🌯 *Mi pedido de Lomitos Árabes FSA*\n\n';
            let total = 0;
            carrito.forEach(item => {
                const subtotal = calcularSubtotalItem(item);
                total += subtotal;
                let linea = `• ${item.cantidad}x ${item.nombre}`;
                const mods = item.modificadores || item.adicionales || [];
                if (mods.length > 0) {
                    linea += ` (+${mods.map(m => m.nombre).join(', ')})`;
                }
                linea += ` — $${subtotal.toLocaleString('es-AR')}\n`;
                texto += linea;
            });
            texto += `\n💰 *Total: $${total.toLocaleString('es-AR')}*`;
            texto += `\n\n📱 Pedí en: https://lomitosarabesfsa.pages.dev`;

            if (navigator.share) {
                navigator.share({ title: 'Mi Pedido', text: texto }).catch(() => { });
            } else {
                navigator.clipboard.writeText(texto).then(() => {
                    showToast('Pedido copiado al portapapeles', 'success');
                }).catch(() => {
                    showToast('No se pudo copiar', 'error');
                });
            }
        }

        // ============================================================
        //  ANALYTICS: EVENTOS DEL EMBUDO DE PEDIDO
        // ============================================================
        function trackEvent(nombre, params) {
            if (typeof gtag === 'function') {
                gtag('event', nombre, params || {});
            }
        }

        // ============================================================
        //  CARGA DEL MENÚ RESISTENTE A FALLOS DE RED
        //  La carta es la razón de ser del sitio: un corte de red, un
        //  webview de Instagram o un error pasajero de la API no deben
        //  dejar al comensal con la pantalla muerta. Por eso: timeout,
        //  reintentos y el último menú bueno guardado como respaldo.
        // ============================================================
        const MENU_CACHE_KEY = 'lomitos_menu_cache';
        const MENU_CACHE_TTL = 12 * 60 * 60 * 1000;   // 12 h
        const MENU_TIMEOUT_MS = 8000;                 // ni colgado ni eterno
        const MENU_INTENTOS = 3;

        function guardarMenuCache(data) {
            try {
                localStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
            } catch (e) { /* modo privado o cuota llena: no es crítico */ }
        }

        function leerMenuCache() {
            try {
                const cache = JSON.parse(localStorage.getItem(MENU_CACHE_KEY) || 'null');
                if (!cache || !cache.data || !Array.isArray(cache.data.categorias)) return null;
                if (Date.now() - cache.t > MENU_CACHE_TTL) return null;
                return cache.data;
            } catch (e) { return null; }
        }

        // Un intento contra la API, con corte por timeout: en mobile una
        // conexión que se cuelga no debe dejar el esqueleto para siempre.
        async function pedirMenu() {
            const ctrl = new AbortController();
            const corte = setTimeout(() => ctrl.abort(), MENU_TIMEOUT_MS);
            try {
                const res = await fetch(CONFIG.API_URL, { cache: 'no-store', signal: ctrl.signal });
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                return await res.json();
            } finally {
                clearTimeout(corte);
            }
        }

        // Con reintentos: devuelve true si la carta quedó en pantalla.
        async function cargarMenu() {
            for (let intento = 1; intento <= MENU_INTENTOS; intento++) {
                try {
                    const data = await pedirMenu();
                    procesarMenuJSON(data);
                    guardarMenuCache(data);
                    return true;
                } catch (error) {
                    console.error('Error al cargar productos (intento ' + intento + '/' + MENU_INTENTOS + '):', error);
                    if (intento < MENU_INTENTOS) await new Promise(r => setTimeout(r, 600 * intento));
                }
            }
            return false;
        }

        // Respaldo: el último menú que sí llegó, en vez de una pantalla muerta.
        function mostrarMenuGuardado() {
            const respaldo = leerMenuCache();
            if (!respaldo) return false;
            procesarMenuJSON(respaldo);
            showToast('Sin conexión con el menú: te mostramos el último guardado.', 'info', 5000);
            return true;
        }

        function mostrarErrorMenu() {
            const container = document.getElementById('carta-container');
            if (!container) return;
            // Sin menú, la barra de chips se queda con los placeholders
            // grises: mejor ocultarla para que el estado se vea intencional.
            const chipsBar = document.getElementById('carta-chips');
            if (chipsBar) chipsBar.style.display = 'none';
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center; width: 100%; padding: 40px 0 12px;">'
                + 'No pudimos cargar el menú. Revisá tu conexión e intentá otra vez.</p>'
                + '<button type="button" id="btn-reintentar-menu" style="display: block; margin: 0 auto 40px; padding: 12px 26px; border: 0; border-radius: 999px; background: var(--primary); color: #121212; font-weight: 700; cursor: pointer;">Reintentar</button>';
            const btn = document.getElementById('btn-reintentar-menu');
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                btn.textContent = 'Cargando…';
                if (await cargarMenu()) { reconciliarCarrito(); return; }
                if (mostrarMenuGuardado()) { reconciliarCarrito(); return; }
                btn.disabled = false;
                btn.textContent = 'Reintentar';
            });
        }


        // ============================================================
        //  ENVIAR PEDIDO POR WHATSAPP
        // ============================================================
        // Abre WhatsApp de forma confiable también dentro de los webviews
        // (Instagram/Facebook), donde window.open puede ser bloqueado en
        // silencio y el cliente queda trabado en "Confirmar y Enviar".
        function abrirWhatsApp(url) {
            const webview = /Instagram|FBAN|FBAV|FB_IAB|Line\//i.test(navigator.userAgent || '');
            if (!webview) {
                let win = null;
                try { win = window.open(url, '_blank', 'noopener'); } catch (e) { win = null; }
                if (win) return true;
            }
            // Webview o popup bloqueado: navegación real (la disparó el click
            // del usuario, así que el navegador no la bloquea).
            window.location.href = url;
            return true;
        }

        function enviarPedidoWhatsApp() {
            const nombre = (document.getElementById('form-nombre').value || '').trim();
            const direccion = (document.getElementById('form-direccion').value || '').trim();
            const barrio = (document.getElementById('form-barrio').value || '').trim();
            const dpto = (document.getElementById('form-dpto').value || '').trim();
            const notas = (document.getElementById('form-notas').value || '').trim();

            if (!nombre) {
                showToast('Por favor, ingresá tu nombre.', 'warning');
                return;
            }
            if (metodoEntrega === 'Envío a domicilio' && !direccion) {
                showToast('Por favor, ingresá tu dirección.', 'warning');
                return;
            }
            if (!pagoCheckout) {
                showToast('Elegí un método de pago.', 'warning');
                return;
            }

            let mensaje = `*NUEVO PEDIDO - LOMITOS ÁRABES FSA*\n`;
            mensaje += `----------------------------------\n`;
            mensaje += `*Cliente:* ${nombre}\n`;
            mensaje += `*Pedido para:* ${metodoEntrega}\n`;

            if (metodoEntrega === 'Envío a domicilio') {
                mensaje += `*Dirección:* ${direccion}\n`;
                if (barrio) mensaje += `*Barrio:* ${barrio}\n`;
                if (dpto) mensaje += `*Depto:* ${dpto}\n`;
            }

            mensaje += `*Método de pago:* ${pagoCheckout}\n`;
            if (notas) mensaje += `*Notas:* ${notas}\n`;

        mensaje += `----------------------------------\n`;
        mensaje += `*DETALLE DEL PEDIDO:*\n`;            let total = 0;
            carrito.forEach(item => {
                const subtotal = calcularSubtotalItem(item);
                total += subtotal;
                mensaje += `- ${item.cantidad}x ${item.nombre}`;
                const mods = item.modificadores || item.adicionales || [];
                if (mods.length > 0) {
                    const extras = mods.map(m => m.nombre).join(', ');
                    mensaje += ` (+${extras})`;
                }
                mensaje += ` ($${subtotal})\n`;
            });

            mensaje += `----------------------------------\n`;
            mensaje += `*TOTAL: $${total.toLocaleString('es-AR')}*`;

            const url = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
            abrirWhatsApp(url);
            trackEvent('pedido_enviado', { total: total, items: carrito.length, metodo: metodoEntrega });

            // Clear cart after sending
            showToast('¡Pedido enviado! Revisá WhatsApp.', 'success', 4000);
            carrito = [];
            actualizarCarrito();
            guardarCarrito();
            cerrarTodo();

            // Reset form
            volverAlCarrito();
            resetearCheckout();
        }

        // ============================================================
        //  ANIMATIONS & SCROLL
        // ============================================================
        const scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    scrollObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        // Parallax + navbar on scroll (throttle con rAF: 1 actualización por frame,
        // evita trabajo de main-thread en cada evento durante el fling en móvil)
        let scrollRafId = null;
        const _parallaxBg = document.getElementById('parallax-bg');
        const _nav = document.getElementById('navbar');
        const _hero = document.getElementById('inicio');
        const _heroHeight = _hero ? _hero.offsetHeight : 600;
        const actualizarScrollUI = () => {
            scrollRafId = null;
            const scrolled = window.scrollY;
            // Solo mover parallax si el hero aún es visible (evita trabajo inútil en secciones lejanas)
            if (_parallaxBg && scrolled < _heroHeight) {
                _parallaxBg.style.transform = `translateY(${scrolled * 0.4}px) scale(1.1)`;
            }

            if (_nav) _nav.style.boxShadow = scrolled > 50 ? '0 10px 30px rgba(0,0,0,0.5)' : 'none';
        };
        window.addEventListener('scroll', () => {
            if (scrollRafId === null) scrollRafId = requestAnimationFrame(actualizarScrollUI);
        }, { passive: true });

        // ============================================================
        //  INIT
        // ============================================================
        document.addEventListener('DOMContentLoaded', async () => {
            // Theme
            loadTheme();

            // Horario
            checkHorario();
            setInterval(checkHorario, 60000); // update every minute
            renderFooterHours();

            // Footer year
            document.getElementById('footer-year').textContent = new Date().getFullYear();

            // Promos
            renderPromos();

            // Gallery
            renderGallery();

            // Observe reveal elements
            document.querySelectorAll('.reveal').forEach(el => scrollObserver.observe(el));

            // Load cart from localStorage
            cargarCarrito();

            // Checkout wizard: tarjetas de opción y marcadores de etapas
            inicializarCheckoutWizard();

            // Accesibilidad: cierre con ESC y foco atrapado dentro de los modales
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                if (document.getElementById('cart-sidebar').classList.contains('open')) {
                    toggleCart();
                }
                if (document.getElementById('mobile-menu').classList.contains('open')) {
                    closeMobileMenu();
                }
            });
            document.getElementById('cart-sidebar').addEventListener('keydown', (e) => trapFocus(e.currentTarget, e));
            document.querySelector('.cart-floating-btn').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleCart();
                }
            });

            // Load menu from API: reintentos + respaldo del último menú bueno
            if (await cargarMenu()) {
                reconciliarCarrito();
            } else if (mostrarMenuGuardado()) {
                reconciliarCarrito();
            } else {
                mostrarErrorMenu();
            }
        });
        // ============================================================
        //  MODAL DE DETALLES (solo imagen + descripción)
        //  CRIT-3: Recibe objeto product directamente (sin JSON en onclick)
        // ============================================================
        function abrirModalProducto(prod) {
            if (!prod) return;
            document.getElementById('product-modal-img').src = prod.imagen || '';
            document.getElementById('product-modal-img').style.display = prod.imagen ? 'block' : 'none';
            document.getElementById('product-modal-title').textContent = prod.nombre || '';
            document.getElementById('product-modal-desc').textContent = prod.descripcion || '';
            document.getElementById('product-modal-price').textContent = prod.precio ? '$' + prod.precio.toLocaleString('es-AR') : '';
            document.getElementById('product-modal-overlay').classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function cerrarModalProducto() {
            document.getElementById('product-modal-overlay').classList.remove('open');
            document.body.style.overflow = '';
        }

        // ============================================================
        //  BOTTOM SHEET DE PERSONALIZACIÓN
        // ============================================================
        let bsProducto = null;       // producto actual en el sheet
        let bsSeleccion = new Map(); // group_id → Set<option_id> para multiple, option_id para single

        function abrirBottomSheet(idProducto) {
            const prod = productosDB.find(p => p.id === idProducto);
            if (!prod || prod.stock === 0) return;
            bsProducto = prod;
            bsSeleccion = new Map();

            document.getElementById('bs-product-name').textContent = prod.nombre;
            document.getElementById('bs-product-desc').textContent = prod.descripcion || '';

            const body = document.getElementById('bs-body');
            const groups = Array.isArray(prod.modifier_groups) ? prod.modifier_groups : [];

            if (groups.length === 0) {
                // Sin grupos: agregar directo al carrito
                agregarAlCarritoDirecto(prod);
                return;
            }

            body.innerHTML = '';
            groups.forEach(g => {
                const div = document.createElement('div');
                div.className = 'bs-group';
                div.dataset.groupId = g.id;

                const badgeClass = g.required ? 'required' : 'optional';
                const badgeText = g.required ? 'Obligatorio' : 'Opcional';
                let constraintText = '';
                if (g.selection_type === 'multiple' && g.max_seleccion < 99) {
                    constraintText = `Elegí hasta ${g.max_seleccion}`;
                }
                if (g.selection_type === 'multiple' && g.min_seleccion > 0) {
                    constraintText += constraintText ? ` · Mínimo ${g.min_seleccion}` : `Mínimo ${g.min_seleccion}`;
                }

                div.innerHTML = `
                    <div class="bs-group-header">
                        <span class="bs-group-name">${escapeHtml(g.nombre)}</span>
                        <span class="bs-group-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    ${constraintText ? `<div class="bs-group-constraint">${constraintText}</div>` : ''}
                `;

                const isSingle = g.selection_type === 'single';
                if (isSingle) bsSeleccion.set(g.id, null);
                else bsSeleccion.set(g.id, new Set());

                (g.options || []).forEach(opt => {
                    const optDiv = document.createElement('div');
                    optDiv.className = 'bs-option';
                    optDiv.dataset.groupId = g.id;
                    optDiv.dataset.optionId = opt.id;
                    optDiv.dataset.priceDelta = opt.price_delta;

                    const indicator = isSingle ? 'bs-radio' : 'bs-checkbox';
                    const priceText = opt.price_delta > 0
                        ? `+$${Number(opt.price_delta).toLocaleString('es-AR')}`
                        : 'Gratis';
                    const priceClass = opt.price_delta > 0 ? '' : 'free';

                    optDiv.setAttribute('role', isSingle ? 'radio' : 'checkbox');
                    optDiv.setAttribute('aria-checked', 'false');
                    optDiv.setAttribute('tabindex', '0');

                    optDiv.innerHTML = `
                        <div class="bs-option-left">
                            <div class="${indicator}"></div>
                            <span class="bs-option-name">${escapeHtml(opt.nombre)}</span>
                        </div>
                        <span class="bs-option-price ${priceClass}">${priceText}</span>
                    `;

                    optDiv.addEventListener('click', () => toggleBsOption(g, opt, optDiv, isSingle));
                    optDiv.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleBsOption(g, opt, optDiv, isSingle);
                        }
                    });
                    div.appendChild(optDiv);
                });

                body.appendChild(div);
            });

            actualizarBsTotal();
            document.getElementById('bs-overlay').classList.add('open');
            document.getElementById('bs-sheet').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        // ── Validación de grupos obligatorios ─────────────────────────
        // Mínimo exigido: si el grupo es obligatorio, al menos 1 (o su
        // min_seleccion explícito si es mayor).
        function minimoRequerido(group) {
            if (!group.required) return 0;
            return Math.max(1, Number(group.min_seleccion) || 0);
        }

        function cantidadElegida(group, val) {
            if (group.selection_type === 'single') return val ? 1 : 0;
            return val && typeof val.size === 'number' ? val.size : 0;
        }

        function grupoIncompleto(group, val) {
            return cantidadElegida(group, val) < minimoRequerido(group);
        }

        // No deshabilitamos "Agregar" (un botón muerto es el clásico "me
        // trabé"): al intentar agregar sin completar, resaltamos el grupo.
        function resaltarGruposFaltantes(groups) {
            groups.forEach(g => {
                const div = document.querySelector(`.bs-group[data-group-id="${g.id}"]`);
                if (!div) return;
                div.classList.add('bs-group-missing');
                div.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            });
        }

        // Limpia el resaltado apenas el cliente completa el grupo
        function validarBsBoton() {
            if (!bsProducto) return;
            const groups = Array.isArray(bsProducto.modifier_groups) ? bsProducto.modifier_groups : [];
            bsSeleccion.forEach((val, groupId) => {
                const group = groups.find(g => g.id === groupId);
                if (!group) return;
                const div = document.querySelector(`.bs-group[data-group-id="${group.id}"]`);
                if (div && !grupoIncompleto(group, val)) div.classList.remove('bs-group-missing');
            });
        }

        function toggleBsOption(group, option, optDiv, isSingle) {
            if (isSingle) {
                // Deseleccionar la anterior
                const anteriorId = bsSeleccion.get(group.id);
                if (anteriorId && anteriorId !== option.id) {
                    const elAnt = document.querySelector(`.bs-option[data-group-id="${group.id}"][data-option-id="${anteriorId}"]`);
                    if (elAnt) {
                        elAnt.classList.remove('selected');
                        elAnt.setAttribute('aria-checked', 'false');
                    }
                }
                // Si ya está seleccionada y es opcional (min 0), permitir deseleccionar
                // Solo se puede deseleccionar si el grupo no es obligatorio
                if (anteriorId === option.id && !group.required) {
                    bsSeleccion.set(group.id, null);
                    optDiv.classList.remove('selected');
                    optDiv.setAttribute('aria-checked', 'false');
                } else {
                    bsSeleccion.set(group.id, option.id);
                    optDiv.classList.add('selected');
                    optDiv.setAttribute('aria-checked', 'true');
                }
            } else {
                const sel = bsSeleccion.get(group.id);
                if (sel.has(option.id)) {
                    sel.delete(option.id);
                    optDiv.classList.remove('selected');
                    optDiv.setAttribute('aria-checked', 'false');
                } else {
                    // El API manda max_seleccion (antes se leía max_selections,
                    // que no existe: el máximo nunca se aplicaba)
                    const maxSel = Number(group.max_seleccion) || 0;
                    if (maxSel > 0 && maxSel < 99 && sel.size >= maxSel) {
                        showToast(`Máximo ${maxSel} ${maxSel === 1 ? 'opción permitida' : 'opciones permitidas'}`, 'warning');
                        return;
                    }
                    sel.add(option.id);
                    optDiv.classList.add('selected');
                    optDiv.setAttribute('aria-checked', 'true');
                }
            }
            actualizarBsTotal();
            validarBsBoton();
        }

        function actualizarBsTotal() {
            if (!bsProducto) return;
            let total = bsProducto.precio || 0;
            bsSeleccion.forEach((val, groupId) => {
                const group = bsProducto.modifier_groups.find(g => g.id === groupId);
                if (!group) return;
                if (group.selection_type === 'single') {
                    if (val) {
                        const opt = group.options.find(o => o.id === val);
                        if (opt) total += opt.price_delta;
                    }
                } else {
                    val.forEach(optId => {
                        const opt = group.options.find(o => o.id === optId);
                        if (opt) total += opt.price_delta;
                    });
                }
            });
            const btn = document.getElementById('bs-add-btn');
            btn.innerHTML = `<span>Agregar · $${total.toLocaleString('es-AR')}</span>`;
        }

        function agregarDesdeBottomSheet() {
            if (!bsProducto) return;
            // Recolectar selecciones y detectar grupos obligatorios sin completar
            const seleccionadas = [];
            const faltantes = [];
            bsSeleccion.forEach((val, groupId) => {
                const group = bsProducto.modifier_groups.find(g => g.id === groupId);
                if (!group) return;
                const opciones = Array.isArray(group.options) ? group.options : [];

                if (grupoIncompleto(group, val)) { faltantes.push(group); return; }

                if (group.selection_type === 'single') {
                    if (val) {
                        const opt = opciones.find(o => o.id === val);
                        if (opt) seleccionadas.push({ group_id: groupId, group_nombre: group.nombre, id: opt.id, nombre: opt.nombre, price_delta: opt.price_delta });
                    }
                } else {
                    val.forEach(optId => {
                        const opt = opciones.find(o => o.id === optId);
                        if (opt) seleccionadas.push({ group_id: groupId, group_nombre: group.nombre, id: opt.id, nombre: opt.nombre, price_delta: opt.price_delta });
                    });
                }
            });

            // Falta un grupo obligatorio: NO se agrega. Avisamos y resaltamos,
            // así el cliente ve qué tiene que elegir en vez de quedar trabado.
            if (faltantes.length) {
                resaltarGruposFaltantes(faltantes);
                const g = faltantes[0];
                showToast(g.selection_type === 'single'
                    ? `Elegí una opción en "${g.nombre}"`
                    : `Elegí al menos ${minimoRequerido(g)} en "${g.nombre}"`, 'warning');
                return;
            }

            // Clave estable: id + ids de opciones seleccionadas ordenadas
            const clave = seleccionadas.length > 0
                ? bsProducto.id + '+m' + seleccionadas.map(s => s.id).sort().join(',')
                : bsProducto.id;

            const index = carrito.findIndex(item => item.clave === clave);
            if (bsProducto.stock > 0 && index > -1 && carrito[index].cantidad >= bsProducto.stock) {
                showToast(`Solo quedan ${bsProducto.stock} unidades de ${bsProducto.nombre}.`, 'warning');
                cerrarBottomSheet();
                return;
            }

            if (index > -1) {
                carrito[index].cantidad += 1;
            } else {
                carrito.push({
                    clave,
                    id: bsProducto.id,
                    categoria: bsProducto.categoria,
                    nombre: bsProducto.nombre,
                    descripcion: bsProducto.descripcion,
                    precio: bsProducto.precio,
                    imagen: bsProducto.imagen,
                    stock: bsProducto.stock,
                    cantidad: 1,
                    modificadores: seleccionadas,
                });
            }

            actualizarCarrito();
            guardarCarrito();
            trackEvent('agregar_al_carrito', { product: bsProducto.nombre, price: bsProducto.precio });
            pulsoCarrito();
            showToast(`${bsProducto.nombre} agregado al pedido`, 'success', 2000);
            cerrarBottomSheet();
        }

        function cerrarBottomSheet() {
            document.getElementById('bs-sheet').classList.remove('open');
            document.getElementById('bs-overlay').classList.remove('open');
            document.body.style.overflow = '';
            bsProducto = null;
            bsSeleccion = new Map();
        }

        // Arrastrar para cerrar (swipe down)
        (function() {
            const sheet = document.getElementById('bs-sheet');
            let startY = 0, currentY = 0, isDragging = false;
            sheet.addEventListener('touchstart', e => {
                if (e.target.closest('.bs-body') && document.querySelector('.bs-body').scrollTop > 0) return;
                startY = e.touches[0].clientY;
                isDragging = true;
                sheet.style.transition = 'none';
            }, { passive: true });
            sheet.addEventListener('touchmove', e => {
                if (!isDragging) return;
                currentY = e.touches[0].clientY - startY;
                if (currentY > 0) sheet.style.transform = `translateY(${currentY}px)`;
            }, { passive: true });
            sheet.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                sheet.style.transition = '';
                if (currentY > 100) cerrarBottomSheet();
                else sheet.style.transform = '';
                currentY = 0;
            }, { passive: true });
        })();

        // Función para productos sin modifier groups (agregar directo)
        function agregarAlCarritoDirecto(prod) {
            const clave = prod.id;
            const index = carrito.findIndex(item => item.clave === clave);
            if (prod.stock > 0 && index > -1 && carrito[index].cantidad >= prod.stock) {
                showToast(`Solo quedan ${prod.stock} unidades de ${prod.nombre}.`, 'warning');
                return;
            }
            if (index > -1) {
                carrito[index].cantidad += 1;
            } else {
                carrito.push({
                    clave, id: prod.id, categoria: prod.categoria, nombre: prod.nombre,
                    descripcion: prod.descripcion, precio: prod.precio, imagen: prod.imagen,
                    stock: prod.stock, cantidad: 1, modificadores: [],
                });
            }
            actualizarCarrito();
            guardarCarrito();
            trackEvent('agregar_al_carrito', { product: prod.nombre, price: prod.precio });
            pulsoCarrito();
            showToast(`${prod.nombre} agregado al pedido`, 'success', 2000);
        }

        function scrollChips(dir) {
            const container = document.getElementById('carta-chips-scroll');
            if(container) {
                const scrollAmount = window.innerWidth * 0.6;
                container.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
            }
        }

        // Flechas del carril de chips: visibles sólo si hay algo que desplazar.
        // Los elementos se consultan en cada llamada porque el carril se re-renderiza
        // con el menú (antes se enganchaban una vez sobre nodos que luego se destruían).
        function initFlechasChips() {
            const scrollContainer = document.getElementById('carta-chips-scroll');
            const leftArrow = document.getElementById('nav-arrow-left');
            const rightArrow = document.getElementById('nav-arrow-right');
            if (!scrollContainer || !leftArrow || !rightArrow) return;

            const updateArrows = () => {
                // Sin desborde no hay nada que desplazar: se ocultan las dos
                const ocultas = scrollContainer.scrollWidth - scrollContainer.clientWidth <= 4;
                leftArrow.classList.toggle('hidden', ocultas || scrollContainer.scrollLeft <= 5);
                rightArrow.classList.toggle('hidden', ocultas || scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth - 5);
            };
            if (!scrollContainer.dataset.flechasListas) {
                scrollContainer.dataset.flechasListas = '1';
                scrollContainer.addEventListener('scroll', updateArrows, { passive: true });
                window.addEventListener('resize', updateArrows, { passive: true });
                window.addEventListener('load', updateArrows);
            }
            updateArrows();
        }

        document.addEventListener('DOMContentLoaded', () => {
            initFlechasChips();

            // Dynamically measure navbar height and set CSS variable
            // so .carta-chips sticky top never overlaps with the nav
            const navbar = document.getElementById('navbar');
            if (navbar) {
                const syncNavHeight = () => {
                    const h = navbar.getBoundingClientRect().height;
                    document.documentElement.style.setProperty('--nav-height', h + 'px');
                };
                syncNavHeight();
                window.addEventListener('resize', syncNavHeight, {passive: true});
                window.addEventListener('load', syncNavHeight);
            }
        });

        // Also run immediately in case DOMContentLoaded already fired
        (function() {
            const nav = document.getElementById('navbar');
            if (nav) {
                const h = nav.getBoundingClientRect().height;
                document.documentElement.style.setProperty('--nav-height', h + 'px');
            }
            // Safety net: re-measure after a brief delay (fonts/images may shift height)
            setTimeout(function() {
                const nav2 = document.getElementById('navbar');
                if (nav2) {
                    const h2 = nav2.getBoundingClientRect().height;
                    document.documentElement.style.setProperty('--nav-height', h2 + 'px');
                }
            }, 1000);
        })();

        // ============================================================
        //  EVENT DELEGATION: captura de acciones sin onclick inline
        //  CRIT-3: elimina vector XSS del encodeURIComponent(JSON.stringify)
        //  NICE-11: migra todos los onclick inline a listener central
        // ============================================================
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;

            switch (action) {
                // --- Acciones de producto ---
                case 'modal-producto': {
                    const prodId = target.dataset.prodId;
                    const prod = productosDB.find(p => p.id === prodId);
                    if (prod) abrirModalProducto(prod);
                    break;
                }
                case 'bottom-sheet': {
                    const prodId = target.dataset.prodId;
                    abrirBottomSheet(prodId);
                    break;
                }
                case 'qty': {
                    const clave = target.dataset.clave;
                    const delta = parseInt(target.dataset.delta, 10);
                    modificarCantidad(clave, delta);
                    break;
                }
                // --- Navegación y UI ---
                case 'scroll-chips': {
                    const dir = parseInt(target.dataset.dir, 10);
                    scrollChips(dir);
                    break;
                }
                case 'cerrar-todo':
                    cerrarTodo();
                    break;
                case 'cerrar-modal-producto':
                case 'cerrar-modal-producto-overlay':
                    cerrarModalProducto();
                    break;
                case 'cerrar-modal-producto-btn':
                    cerrarModalProducto();
                    break;
                case 'toggle-cart':
                    toggleCart();
                    break;
                case 'cerrar-bottom-sheet':
                    cerrarBottomSheet();
                    break;
                case 'agregar-bottom-sheet':
                    agregarDesdeBottomSheet();
                    break;
                case 'toggle-theme':
                    toggleTheme();
                    break;
                case 'toggle-mobile-menu':
                    toggleMobileMenu();
                    break;
                case 'close-mobile-menu':
                    closeMobileMenu();
                    break;
                case 'cerrar-promo':
                    cerrarPromo();
                    break;
                // --- Carrito y checkout ---
                case 'siguiente-paso':
                    if (pasoCheckout < 3) irAPaso(pasoCheckout + 1);
                    break;
                case 'paso-atras':
                    if (pasoCheckout > 1) irAPaso(pasoCheckout - 1);
                    break;
                case 'compartir-pedido':
                    compartirPedido();
                    break;
                case 'ir-checkout':
                    irACheckout();
                    break;
                case 'volver-carrito':
                    volverAlCarrito();
                    break;
                case 'enviar-whatsapp':
                    enviarPedidoWhatsApp();
                    break;
            }
        });


        // Listener para keydown en mobile-menu links (Enter/Space)
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'close-mobile-menu') {
                e.preventDefault();
                closeMobileMenu();
            }
        });

        // ============================================================
        //  PWA: PROMPT DE ACTUALIZACIÓN (NICE-12)
        //  Cuando el SW detecta una nueva versión, muestra un banner
        //  para que el usuario recargue y obtenga los cambios.
        // ============================================================
        let deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                showToast('¡Nueva versión disponible! Recargando…', 'info', 2000);
                setTimeout(() => location.reload(), 1500);
            });

            // Detectar cuando hay un SW esperando activarse
            navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
                // Chequeamos sw.js en cada carga (sin caché HTTP) para detectar
                // una versión nueva del sitio lo antes posible.
                Promise.resolve(reg.update()).catch(() => {});
                if (reg.waiting) showUpdateBanner(reg);
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(reg);
                        }
                    });
                });
            }).catch(err => {
                console.log('SW registration failed:', err);
            });

            function showUpdateBanner(reg) {
                showToast('Hay una nueva versión. Tocá para actualizar.', 'info', 5000);
                document.addEventListener('click', function handler() {
                    if (reg.waiting) reg.waiting.skipWaiting();
                    document.removeEventListener('click', handler);
                }, { once: true });
            }
        }
