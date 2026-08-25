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
            const saved = localStorage.getItem('theme') || 'dark';
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
                const icono = cat.icono || '🍽️';
                categorias.set(cat.nombre, { icono, count: cat.productos.length });
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
            if (chipsBar) chipsBar.innerHTML = '';

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

            const chipsScroll = document.createElement('div');
            chipsScroll.className = 'carta-chips-scroll';
            chipsScroll.setAttribute('aria-label', 'Categorías del menú');

            // Chip "Todos" (sin filtro): se ven todas las categorías apiladas
            const chipTodos = document.createElement('button');
            chipTodos.type = 'button';
            chipTodos.className = 'carta-chip active';
            chipTodos.dataset.todos = '';
            chipTodos.setAttribute('aria-label', 'Ver todas las categorías');
            chipTodos.innerHTML = `Todos`;
            chipTodos.addEventListener('click', () => verTodos(chipTodos));
            chipsScroll.appendChild(chipTodos);

            let index = 0;
            categorias.forEach((data, cat) => {
                const prods = productosDB.filter(p => p.categoria === cat);
                if (prods.length === 0) return;

                const id = 'carta-' + slugify(cat, 'seccion-' + index);

                // Chip de filtro (barra sticky): al tocarlo solo se ve esa categoría
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'carta-chip';
                chip.dataset.target = id;
                chip.setAttribute('aria-label', `Ver categoría ${cat}`);
                chip.innerHTML = `${escapeHtml(cat)}`;
                chip.addEventListener('click', () => irACategoria(id, cat, chip));
                chipsScroll.appendChild(chip);

                // Sección del menú (one-page: todo visible)
                const section = document.createElement('section');
                section.className = `carta-section reveal active stagger-${(index % 3) + 1}`;
                section.id = id;
                section.setAttribute('aria-labelledby', `carta-titulo-${index}`);
                section.innerHTML = `
                    <div class="carta-section-header">
                        <span class="carta-section-icon" aria-hidden="true">${escapeHtml(data.icono)}</span>
                        <h2 class="carta-section-title" id="carta-titulo-${index}">${escapeHtml(cat)}</h2>
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

            if (chipsBar) chipsBar.appendChild(chipsScroll);
            iniciarScrollSpy();
        }

        // Filtro de categorías: null = todas visibles, 'carta-...' = solo esa categoría
        let filtroCategoria = null;

        function activarChip(chip) {
            document.querySelectorAll('#carta-chips .carta-chip').forEach(c => c.classList.remove('active'));
            if (chip) chip.classList.add('active');
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
            if (filtroCategoria === id && chip) {
                verTodos(chip);
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

        // Sin filtro: todas las categorías visibles de nuevo
        function verTodos(chip) {
            filtroCategoria = null;
            document.querySelectorAll('#carta-container .carta-section').forEach(s => mostrarSeccion(s, true));
            activarChip(chip);
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
                    chips.forEach(c => c.classList.remove('active'));
                    // Sin filtro y en el inicio del menú (primera sección) → se ilumina "Todos"
                    if (!filtroCategoria && chipTodos && entry.target === secciones[0]) {
                        chipTodos.classList.add('active');
                        return;
                    }
                    chip.classList.add('active');
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
                            chips.forEach(c => c.classList.remove('active'));
                            chipTodos.classList.add('active');
                            return;
                        }
                    }
                    const ultimo = chips[chips.length - 1];
                    const container = document.getElementById('carta-container');
                    if (!ultimo || !container || ultimo.classList.contains('active')) return;
                    if (container.getBoundingClientRect().bottom <= window.innerHeight + 4) {
                        chips.forEach(c => c.classList.remove('active'));
                        ultimo.classList.add('active');
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

        function seleccionarMetodo(metodo, btn) {
            metodoEntrega = metodo;
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const campoDireccion = document.getElementById('campo-direccion');
            campoDireccion.style.display = metodo === 'Retiro en local' ? 'none' : 'block';
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
        }

        function volverAlCarrito() {
            document.getElementById('step-2').classList.remove('active');
            document.getElementById('step-1').classList.add('active');
            document.getElementById('cart-title').textContent = "Tu Pedido";
        }

        function toggleVuelto() {
            const pago = document.getElementById('form-pago').value;
            document.getElementById('campo-vuelto').style.display = pago === 'Efectivo' ? 'block' : 'none';
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
                    const claveSegura = String(item.clave || item.id).replace(/[^a-z0-9+,]/gi, '');
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
        //  CACHE DEL MENÚ (localStorage con TTL)
        //  Muestra el menú al instante en visitas siguientes y resiste
        //  a redes lentas o navegadores embebidos (Instagram/Facebook).
        // ============================================================


        // ============================================================
        //  ENVIAR PEDIDO POR WHATSAPP
        // ============================================================
        function enviarPedidoWhatsApp() {
            const nombre = document.getElementById('form-nombre').value.trim();
            const telefono = document.getElementById('form-telefono').value.trim();
            const direccion = document.getElementById('form-direccion').value.trim();
            const barrio = document.getElementById('form-barrio').value.trim();
            const dpto = document.getElementById('form-dpto').value.trim();
            const pago = document.getElementById('form-pago').value;
            const vuelto = document.getElementById('form-vuelto').value.trim();
            const notas = document.getElementById('form-notas').value.trim();

            if (!nombre) {
                showToast('Por favor, ingresá tu nombre.', 'warning');
                return;
            }
            if (!telefono) {
                showToast('Por favor, ingresá tu teléfono.', 'warning');
                return;
            }
            if (metodoEntrega === 'Envío a domicilio' && !direccion) {
                showToast('Por favor, ingresá tu dirección.', 'warning');
                return;
            }
            if (pago === 'Efectivo' && vuelto && !/^\d+$/.test(vuelto)) {
                showToast('El monto con el que pagás debe ser un número entero.', 'warning');
                return;
            }

            let mensaje = `*NUEVO PEDIDO - LOMITOS ÁRABES FSA*\n`;
            mensaje += `----------------------------------\n`;
            mensaje += `*Cliente:* ${nombre}\n`;
            mensaje += `*Teléfono:* ${telefono}\n`;
            mensaje += `*Pedido para:* ${metodoEntrega}\n`;

            if (metodoEntrega === 'Envío a domicilio') {
                mensaje += `*Dirección:* ${direccion}\n`;
                if (barrio) mensaje += `*Barrio:* ${barrio}\n`;
                if (dpto) mensaje += `*Depto:* ${dpto}\n`;
            }

            mensaje += `*Método de pago:* ${pago}\n`;
            if (pago === 'Efectivo' && vuelto) mensaje += `*Paga con:* $${vuelto}\n`;
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
            window.open(url, '_blank');
            trackEvent('pedido_enviado', { total: total, items: carrito.length, metodo: metodoEntrega });

            // Clear cart after sending
            showToast('¡Pedido enviado! Revisá WhatsApp.', 'success', 4000);
            carrito = [];
            actualizarCarrito();
            guardarCarrito();
            cerrarTodo();

            // Reset form
            volverAlCarrito();
            document.getElementById('form-nombre').value = '';
            document.getElementById('form-telefono').value = '';
            document.getElementById('form-direccion').value = '';
            document.getElementById('form-barrio').value = '';
            document.getElementById('form-dpto').value = '';
            document.getElementById('form-notas').value = '';
            document.getElementById('form-vuelto').value = '';
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

            // Load menu from API
            try {
                const response = await fetch(CONFIG.API_URL, { cache: "no-store" });
                if (!response.ok) throw new Error("HTTP error " + response.status);
                procesarMenuJSON(await response.json());
                reconciliarCarrito();
            } catch (error) {
                console.error("Error al cargar productos:", error);
                if (!productosDB.length) {
                    document.getElementById('carta-container').innerHTML = '<p style="color: #ef4444; text-align: center; width: 100%; padding: 40px 0;">Error al cargar el menú. Por favor actualiza la página.</p>';
                }
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

                    optDiv.innerHTML = `
                        <div class="bs-option-left">
                            <div class="${indicator}"></div>
                            <span class="bs-option-name">${escapeHtml(opt.nombre)}</span>
                        </div>
                        <span class="bs-option-price ${priceClass}">${priceText}</span>
                    `;

                    optDiv.addEventListener('click', () => toggleBsOption(g, opt, optDiv, isSingle));
                    div.appendChild(optDiv);
                });

                body.appendChild(div);
            });

            actualizarBsTotal();
            document.getElementById('bs-overlay').classList.add('open');
            document.getElementById('bs-sheet').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function toggleBsOption(group, option, optDiv, isSingle) {
            if (isSingle) {
                // Deseleccionar la anterior
                const prev = bsSeleccion.get(group.id);
                if (prev) {
                    const prevDiv = document.querySelector(`.bs-option[data-option-id="${prev}"]`);
                    if (prevDiv) prevDiv.classList.remove('selected');
                }
                if (bsSeleccion.get(group.id) === option.id) {
                    bsSeleccion.set(group.id, null);
                    optDiv.classList.remove('selected');
                } else {
                    bsSeleccion.set(group.id, option.id);
                    optDiv.classList.add('selected');
                }
            } else {
                const set = bsSeleccion.get(group.id);
                if (set.has(option.id)) {
                    set.delete(option.id);
                    optDiv.classList.remove('selected');
                } else {
                    if (set.size >= group.max_seleccion) {
                        showToast(`Máximo ${group.max_seleccion} opciones en "${group.nombre}"`, 'warning');
                        return;
                    }
                    set.add(option.id);
                    optDiv.classList.add('selected');
                }
            }
            actualizarBsTotal();
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
            // Recolectar selecciones
            const seleccionadas = [];
            bsSeleccion.forEach((val, groupId) => {
                const group = bsProducto.modifier_groups.find(g => g.id === groupId);
                if (!group) return;
                if (group.selection_type === 'single') {
                    if (val) {
                        const opt = group.options.find(o => o.id === val);
                        if (opt) seleccionadas.push({ group_id: groupId, group_nombre: group.nombre, id: opt.id, nombre: opt.nombre, price_delta: opt.price_delta });
                    }
                } else {
                    // Validar mínimo
                    if (group.required && val.size < group.min_seleccion) {
                        showToast(`Elegí al menos ${group.min_seleccion} en "${group.nombre}"`, 'warning');
                        return;
                    }
                    val.forEach(optId => {
                        const opt = group.options.find(o => o.id === optId);
                        if (opt) seleccionadas.push({ group_id: groupId, group_nombre: group.nombre, id: opt.id, nombre: opt.nombre, price_delta: opt.price_delta });
                    });
                }
            });

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

        // Detect scroll position to hide/show arrows
        document.addEventListener('DOMContentLoaded', () => {
            const scrollContainer = document.getElementById('carta-chips-scroll');
            const leftArrow = document.getElementById('nav-arrow-left');
            const rightArrow = document.getElementById('nav-arrow-right');
            
            if(scrollContainer && leftArrow && rightArrow) {
                const updateArrows = () => {
                    leftArrow.classList.toggle('hidden', scrollContainer.scrollLeft <= 5);
                    rightArrow.classList.toggle('hidden', scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth - 5);
                };
                
                scrollContainer.addEventListener('scroll', updateArrows, {passive: true});
                window.addEventListener('resize', updateArrows, {passive: true});
                
                // Init after slight delay to ensure elements are rendered
                setTimeout(updateArrows, 500);
            }

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
                case 'seleccionar-metodo': {
                    const metodo = target.dataset.metodo === 'envio' ? 'Envío a domicilio' : 'Retiro en local';
                    seleccionarMetodo(metodo, target);
                    break;
                }
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

        // Listener para eventos change (toggle-vuelto)
        document.addEventListener('change', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            if (target.dataset.action === 'toggle-vuelto') {
                toggleVuelto();
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
            navigator.serviceWorker.register('./sw.js').then((reg) => {
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
