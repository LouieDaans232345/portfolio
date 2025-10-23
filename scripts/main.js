/* Minimal interactivity and micro-animations for the site */
(function () {
    // Add a class to <html> indicating JS is active so CSS can enable JS-only styles
    try { document.documentElement.classList.add('js'); } catch (e) { /* noop */ }
    // Global guard: while false, modal.open() will be ignored. This prevents accidental
    // opens during bfcache restores or early synthetic events. It will be set true
    // after initialization completes.
    try { window.__modalsInitComplete = false; } catch (e) { /* noop */ }
    // Suppress any user click-triggered openings for a short window immediately after load
    // to avoid cross-page "ghost clicks" landing on controls as the new page paints.
    try { window.__suppressClicksUntilTS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 500; } catch (e) { /* noop */ }
    // Mark modal panels as temporarily inert to avoid any focus or click restoring
    // into them during bfcache restores. We'll remove this guard when init finishes.
    try {
        document.querySelectorAll && document.querySelectorAll('.modal .modal__panel').forEach(p => {
            p.setAttribute('data-init-guard', 'true');
            // Ensure hidden from AT and non-JS restores until ready
            p.setAttribute('aria-hidden', 'true');
            p.setAttribute('tabindex', '-1');
        });
    } catch (e) { /* noop */ }
    // ---------- Small utilities ----------
    /**
     * Return focusable elements inside a container (used by modals for focus-trap).
     */
    function getFocusable(container) {
        return Array.from(container.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));
    }

    /**
     * Apply a fixed-position box style to an element based on a DOMRect-like object.
     */
    function setFixedBox(el, rectLike) {
        Object.assign(el.style, {
            position: 'fixed',
            left: rectLike.left + 'px',
            top: rectLike.top + 'px',
            width: rectLike.width + 'px',
            height: rectLike.height + 'px',
            margin: '0',
            zIndex: '1000',
        });
    }

    /**
     * Create open/close handlers for a modal element with overlay, close button, ESC, and focus trap.
     */
    function createModal(modalEl) {
        const overlay = modalEl.querySelector('.modal__overlay');
        // Select the visual close button specifically so clicks on the X work.
        const closeBtn = modalEl.querySelector('.modal__close');
        const panel = modalEl.querySelector('.modal__panel');

        let lastFocus = null;
        let keyHandler = null;

        function onKeydown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                api.close();
                return;
            }
            if (e.key === 'Tab') {
                const focusables = getFocusable(panel);
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
        }

        const api = {
            open() {
                // Defensive: ignore attempts to open modals during early initialization
                // or when triggered by non-user actions (bfcache restores can replay events).
                if (window.__modalsInitComplete === false) return;
                // Also ignore opens during the initial click-suppression window (ghost-click guard)
                try {
                    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                    if (typeof window.__suppressClicksUntilTS === 'number' && now < window.__suppressClicksUntilTS) return;
                } catch (e) { /* noop */ }
                lastFocus = document.activeElement;
                modalEl.classList.add('is-open');
                modalEl.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
                const focusables = getFocusable(panel);
                if (focusables.length) focusables[0].focus();
                keyHandler = onKeydown;
                document.addEventListener('keydown', keyHandler);
            },
            close() {
                modalEl.classList.remove('is-open');
                modalEl.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
                if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
            },
            panel,
        };

        // Wire static close interactions once
        if (overlay) overlay.addEventListener('click', api.close);
        if (closeBtn) closeBtn.addEventListener('click', api.close);

        return api;
    }

    // ---------- Page fades ----------
    // Fade-in for any page using .prefade on <body>
    if (document.body.classList.contains('prefade')) {
        requestAnimationFrame(() => document.body.classList.remove('prefade'));
    }

    // ---------- Shared arrow entrance (cross-page handoff) ----------
    (function sharedEntrance() {
        const handoffRaw = sessionStorage.getItem('arrowExit');
        if (!handoffRaw) return;
        sessionStorage.removeItem('arrowExit');

        const data = JSON.parse(handoffRaw);
        const isPortfolio = !!document.querySelector('.topbar');
        const targetEl = isPortfolio
            ? document.querySelector('.home__go--corner')
            : document.querySelector('.home__go');

        if (!targetEl) return;

        const targetRect = targetEl.getBoundingClientRect();
        // Hide real target during the merge
        targetEl.style.visibility = 'hidden';

        const fly = document.createElement('a');
        fly.className = 'home__go';
        fly.setAttribute('aria-hidden', 'true');
        fly.textContent = data.char || (isPortfolio ? '<' : '>');

        // Initial position comes from stored exit (or target fallback)
        setFixedBox(fly, {
            left: (data.x ?? targetRect.left),
            top: (data.y ?? targetRect.top),
            width: (data.w ?? targetRect.width),
            height: (data.h ?? targetRect.height),
        });
        fly.style.transform = `rotate(${data.rot ?? 0}deg)`;
        document.body.appendChild(fly);

        // Fly into the real target
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fly.style.left = targetRect.left + 'px';
                fly.style.top = targetRect.top + 'px';
                fly.style.transform = 'rotate(0deg)';
            });
        });

        const finish = () => {
            targetEl.style.visibility = '';
            fly.remove();
        };
        fly.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, 700); // fallback
    })();

    // ---------- Arrow click: cross-page animation & handoff ----------
    const go = document.querySelector('.home__go');
    if (go) {
        const isPortfolio = !!document.querySelector('.topbar');
        go.addEventListener('click', (e) => {
            e.preventDefault();
            const href = go.getAttribute('href');

            const rect = go.getBoundingClientRect();
            document.body.classList.add('leaving');

            // Read CSS custom props for geometry
            const rootStyles = getComputedStyle(document.documentElement);
            const padVar = rootStyles.getPropertyValue('--corner-pad').trim() || '16px';
            const pad = parseFloat(padVar);

            if (!isPortfolio) {
                // HOME -> PORTFOLIO: clone arrow, fly to viewport corner, store coords for next page
                const fly = go.cloneNode(true);
                fly.setAttribute('aria-hidden', 'true');
                setFixedBox(fly, rect);
                fly.style.transform = 'rotate(0deg)';
                document.body.appendChild(fly);
                go.style.visibility = 'hidden';

                const finalX = pad;
                const finalY = pad;

                // Save for entrance on the portfolio page
                sessionStorage.setItem('arrowExit', JSON.stringify({
                    x: finalX,
                    y: finalY,
                    w: rect.width,
                    h: rect.height,
                    char: '<',
                }));

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        fly.style.color = 'var(--ink)'; // force black
                        fly.style.left = finalX + 'px';
                        fly.style.top = finalY + 'px';
                        fly.style.transform = 'rotate(180deg)';
                    });
                });

                const done = () => { window.location.href = href; };
                let navigated = false;
                fly.addEventListener('transitionend', (ev) => {
                    if ((ev.propertyName === 'top' || ev.propertyName === 'transform') && !navigated) {
                        navigated = true;
                        done();
                    }
                }, { once: true });
                setTimeout(() => { if (!navigated) done(); }, 700);
            } else {
                // PORTFOLIO -> HOME: fly toward the home center target, store coords for next page
                setFixedBox(go, rect);
                go.style.transform = 'rotate(0deg)';

                // Compute the home center Y from CSS var; X = 50vw
                const yVar = rootStyles.getPropertyValue('--home-center-y').trim() || '4vh';
                const yPx = yVar.endsWith('vh') ? (parseFloat(yVar) / 100) * window.innerHeight
                    : yVar.endsWith('px') ? parseFloat(yVar) : 0.125 * window.innerHeight;

                const targetLeft = (window.innerWidth * 0.50) - (rect.width / 2);
                const targetTop = yPx - (rect.height / 2);

                // Save for entrance on the home page
                sessionStorage.setItem('arrowExit', JSON.stringify({
                    x: Math.max(pad, targetLeft),
                    y: Math.max(pad, targetTop),
                    w: rect.width,
                    h: rect.height,
                    char: '>',
                }));

                const done = () => { window.location.href = href; };
                let navigated = false;
                go.addEventListener('transitionend', (ev) => {
                    if ((ev.propertyName === 'top' || ev.propertyName === 'transform') && !navigated) {
                        navigated = true;
                        done();
                    }
                }, { once: true });
                setTimeout(() => { if (!navigated) done(); }, 700);
            }
        });
    }

    // ---------- Scatter drawings: blue-noise centers + light relaxation ----------
    function setupScatter() {
        const container = document.querySelector('.doodles.scatter');
        if (!container) return;

        const items = Array.from(container.querySelectorAll('.doodle'));
        if (!items.length) return;

        // Avoid initial flash: mark as not ready until first positioning completes
        container.classList.remove('is-ready');

        function place() {
            // Dimensions: width from container; height = viewport minus header
            const rect = container.getBoundingClientRect();
            const header = document.querySelector('.topbar');
            const headerRect = header ? header.getBoundingClientRect() : { bottom: 0 };
            const viewportH = window.innerHeight || document.documentElement.clientHeight || 800;
            const H = Math.max(320, viewportH - headerRect.bottom - 16);
            const W = Math.max(320, rect.width);

            // Ensure the container reserves enough space so items can fill the page vertically
            container.style.height = H + 'px';

            // Tunables
            const PAD = 20;      // inner padding from edges
            const TARGET_SAMPLES = Math.min(1200, Math.max(300, items.length * 80)); // dense backdrop
            const RELAX_ITERS = 2; // light Lloyd relaxation

            // Pre-measure sizes for safe boundaries using computed styles (stable before image load)
            const sizes = items.map(btn => {
                const img = btn.querySelector('img');
                const cs = img ? getComputedStyle(img) : null;
                const w = Math.max(60, parseFloat(cs?.width) || 120);
                // Height may be auto before the image loads; treat as square to keep spacing consistent
                const h = w;
                return { w, h };
            });
            const maxHalf = sizes.reduce((m, s) => Math.max(m, Math.max(s.w, s.h) / 2), 0);

            // Domain the centers can live in
            const minX = PAD + maxHalf;
            const minY = PAD + maxHalf;
            const maxX = W - (PAD + maxHalf);
            const maxY = H - (PAD + maxHalf);
            const domainW = Math.max(10, maxX - minX);
            const domainH = Math.max(10, maxY - minY);
            const area = domainW * domainH;

            const N = items.length;

            // 1) Generate a dense background of blue-noise samples via Poisson-disc
            // Estimate r so we get roughly TARGET_SAMPLES points: count ≈ 0.6 * area / (pi r^2)
            function rForCount(count) {
                return Math.sqrt((0.6 * area) / (Math.PI * Math.max(1, count)));
            }
            let baseR = rForCount(TARGET_SAMPLES);
            let samples = poissonDisk(domainW, domainH, baseR, 30);
            // If too few, shrink r and retry a couple of times
            let tries = 0;
            while (samples.length < N * 6 && tries++ < 3) {
                baseR *= 0.8;
                samples = poissonDisk(domainW, domainH, baseR, 30);
            }

            // Map samples into absolute coords
            for (let s of samples) { s.x += minX; s.y += minY; }

            // 2) Pick N centers using greedy farthest-point sampling for global coverage
            const centers = [];
            if (samples.length) {
                const first = samples[Math.floor(Math.random() * samples.length)];
                centers.push({ x: first.x, y: first.y });
            } else {
                // Degenerate fallback: spread along domain diagonally
                for (let i = 0; i < N; i++) centers.push({ x: minX + (i + 0.5) * domainW / N, y: minY + (i + 0.5) * domainH / N });
            }
            while (centers.length < N && samples.length) {
                let best = null;
                let bestDist = -1;
                for (const p of samples) {
                    let dmin = Infinity;
                    for (const c of centers) {
                        const dx = p.x - c.x, dy = p.y - c.y;
                        const d = dx * dx + dy * dy;
                        if (d < dmin) dmin = d;
                    }
                    if (dmin > bestDist) { bestDist = dmin; best = p; }
                }
                if (best) centers.push({ x: best.x, y: best.y });
                else break;
            }

            // 3) Light Lloyd relaxation against dense samples to balance clusters
            for (let iter = 0; iter < RELAX_ITERS; iter++) {
                const acc = centers.map(() => ({ x: 0, y: 0, n: 0 }));
                for (const p of samples) {
                    let k = 0;
                    let dmin = Infinity;
                    for (let i = 0; i < centers.length; i++) {
                        const c = centers[i];
                        const dx = p.x - c.x, dy = p.y - c.y;
                        const d = dx * dx + dy * dy;
                        if (d < dmin) { dmin = d; k = i; }
                    }
                    acc[k].x += p.x; acc[k].y += p.y; acc[k].n++;
                }
                for (let i = 0; i < centers.length; i++) {
                    if (acc[i].n > 0) {
                        centers[i].x = Math.min(Math.max(acc[i].x / acc[i].n, minX), maxX);
                        centers[i].y = Math.min(Math.max(acc[i].y / acc[i].n, minY), maxY);
                    }
                }
            }

            // 4) Assign centers to items and position
            for (let i = 0; i < N; i++) {
                const c = centers[i % centers.length];
                const { w, h } = sizes[i];
                const left = Math.min(Math.max(c.x - w / 2, PAD), W - PAD - w);
                const top = Math.min(Math.max(c.y - h / 2, PAD), H - PAD - h);
                const btn = items[i];
                btn.style.left = `${left}px`;
                btn.style.top = `${top}px`;
            }
        }

        // Bridson's Poisson-disc sampling in rectangle [0..w] x [0..h]
        function poissonDisk(w, h, r, k = 30) {
            const cellSize = r / Math.SQRT2;
            const gridW = Math.ceil(w / cellSize);
            const gridH = Math.ceil(h / cellSize);
            const grid = new Array(gridW * gridH).fill(null);
            const samples = [];
            const active = [];

            function gridIndex(x, y) { return y * gridW + x; }
            function inBounds(p) { return p.x >= 0 && p.x < w && p.y >= 0 && p.y < h; }
            function fits(p) {
                const gx = Math.floor(p.x / cellSize), gy = Math.floor(p.y / cellSize);
                const i0 = Math.max(0, gx - 2), i1 = Math.min(gridW - 1, gx + 2);
                const j0 = Math.max(0, gy - 2), j1 = Math.min(gridH - 1, gy + 2);
                for (let j = j0; j <= j1; j++) {
                    for (let i = i0; i <= i1; i++) {
                        const sIdx = grid[gridIndex(i, j)];
                        if (sIdx != null) {
                            const s = samples[sIdx];
                            if (Math.hypot(p.x - s.x, p.y - s.y) < r) return false;
                        }
                    }
                }
                return true;
            }
            function addSample(p) {
                samples.push(p); active.push(p);
                const gx = Math.floor(p.x / cellSize), gy = Math.floor(p.y / cellSize);
                grid[gridIndex(gx, gy)] = samples.length - 1;
            }
            // seed
            addSample({ x: Math.random() * w, y: Math.random() * h });
            while (active.length) {
                const idx = Math.floor(Math.random() * active.length);
                const s = active[idx];
                let found = false;
                for (let t = 0; t < k; t++) {
                    const ang = Math.random() * Math.PI * 2;
                    const rad = r * (1 + Math.random()); // [r,2r)
                    const p = { x: s.x + Math.cos(ang) * rad, y: s.y + Math.sin(ang) * rad };
                    if (inBounds(p) && fits(p)) { addSample(p); found = true; break; }
                }
                if (!found) active.splice(idx, 1);
            }
            return samples;
        }

        // Single placement after first paint; debounce resizes
        let scheduled = false;
        let initialDone = false;
        function runPlace() {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => {
                scheduled = false;
                place();
                if (!initialDone) {
                    container.classList.add('is-ready'); // reveal once
                    initialDone = true;
                }
            }, 80);
        }

        // Wait one frame to ensure CSS has applied, then position once
        requestAnimationFrame(() => runPlace());
        // Re-position on resize
        window.addEventListener('resize', runPlace);
    }

    // ---------- Project modal ----------
    const projectModalEl = document.getElementById('modal');
    if (projectModalEl) {
        const modal = createModal(projectModalEl);
        const titleEl = document.getElementById('modal-title');
        const descEl = document.getElementById('modal-description');
        const whyEl = document.getElementById('modal-why');
        const skillsEl = document.getElementById('modal-skills');
        const linkEl = document.getElementById('modal-link');
        // Visible section label headings
        const descLabelEl = document.getElementById('modal-description-label');
        const whyLabelEl = document.getElementById('modal-why-label');
        const skillsLabelEl = document.getElementById('modal-skills-label');

        // Delegate clicks to dynamically injected doodles
        const doodles = document.getElementById('doodles');
        if (doodles) {
            doodles.addEventListener('click', (e) => {
                // Only respond to real user clicks (ignore synthetic events/page restores)
                if (e && e.isTrusted === false) return;
                // Guard against ghost clicks during navigation hand-off
                try {
                    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                    if (window.__modalsInitComplete === false) return;
                    if (typeof window.__suppressClicksUntilTS === 'number' && now < window.__suppressClicksUntilTS) return;
                } catch (err) { /* noop */ }
                const btn = e.target.closest('.doodle');
                if (!btn || !doodles.contains(btn)) return;
                // Populate content from data-attributes
                titleEl.textContent = btn.dataset.title || 'Untitled project';
                const desc = btn.dataset.description || '';
                const why = btn.dataset.why || '';
                const skills = btn.dataset.skills || '';
                if (descEl) descEl.textContent = desc;
                if (whyEl) whyEl.textContent = why;
                // Render skills as tags
                function clearSkills() {
                    while (skillsEl && skillsEl.firstChild) skillsEl.removeChild(skillsEl.firstChild);
                }
                clearSkills();
                if (skillsEl && skills) {
                    // Accept comma-separated string or array-like string
                    const parts = Array.isArray(btn.dataset.skills) ? btn.dataset.skills : String(skills).split(',').map(s => s.trim()).filter(Boolean);
                    parts.forEach(part => {
                        const span = document.createElement('span');
                        span.className = 'skill-tag';
                        span.textContent = part;
                        skillsEl.appendChild(span);
                    });
                }
                // Toggle headings when fields are empty
                if (descLabelEl) descLabelEl.style.display = desc ? '' : 'none';
                if (descEl) descEl.style.display = desc ? '' : 'none';
                if (whyLabelEl) whyLabelEl.style.display = why ? '' : 'none';
                if (whyEl) whyEl.style.display = why ? '' : 'none';
                const hasSkills = skills && skillsEl && skillsEl.children.length > 0;
                if (skillsLabelEl) skillsLabelEl.style.display = hasSkills ? '' : 'none';
                if (skillsEl) skillsEl.style.display = hasSkills ? '' : 'none';
                const link = (btn.dataset.link || '').trim();
                const noLink = !link || link === '#';
                if (!noLink) {
                    linkEl.href = link;
                    linkEl.style.display = '';
                    linkEl.classList.remove('is-disabled');
                    linkEl.removeAttribute('aria-disabled');
                    linkEl.textContent = 'Open project';
                } else {
                    // Show a disabled "Coming soon" button when there's no real link
                    linkEl.removeAttribute('href');
                    linkEl.style.display = '';
                    linkEl.classList.add('is-disabled');
                    linkEl.setAttribute('aria-disabled', 'true');
                    linkEl.textContent = 'Coming soon';
                }
                modal.open();
            });
        }
    }

    // ---------- Contact modal ----------
    const contactModalEl = document.getElementById('contact-modal');
    const contactLink = document.getElementById('contact-link');
    if (contactModalEl && contactLink) {
        const modal = createModal(contactModalEl);
        contactLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Protect against synthetic events or bfcache restores triggering the modal
            if (e && e.isTrusted === false) return;
            // Ghost-click guard: ignore clicks for a short window after navigation/paint
            try {
                const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (window.__modalsInitComplete === false) return;
                if (typeof window.__suppressClicksUntilTS === 'number' && now < window.__suppressClicksUntilTS) return;
            } catch (err) { /* noop */ }
            modal.open();
        });
    }

    // ---------- Load projects from JSON and render ----------
    async function loadProjects() {
        const container = document.getElementById('doodles');
        if (!container) return;
        try {
            const res = await fetch('assets/data/projects.json', { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch projects.json');
            const projects = await res.json();
            // Build buttons
            const frag = document.createDocumentFragment();
            projects.forEach((p, idx) => {
                const btn = document.createElement('button');
                btn.className = 'doodle';
                btn.type = 'button';
                btn.setAttribute('aria-haspopup', 'dialog');
                // Data for modal
                if (p.title) btn.dataset.title = p.title;
                if (p.description) btn.dataset.description = p.description;
                if (p.why) btn.dataset.why = p.why;
                if (p.link) btn.dataset.link = p.link;
                if (p.anim) btn.dataset.anim = p.anim;
                // Support skills as either array or string in data
                if (Array.isArray(p.skills)) {
                    btn.dataset.skills = p.skills.join(', ');
                } else if (typeof p.skills === 'string') {
                    btn.dataset.skills = p.skills;
                }

                const img = document.createElement('img');
                img.src = p.image || '';
                img.alt = p.title ? `Project drawing — ${p.title}` : `Project drawing ${idx + 1}`;
                btn.appendChild(img);
                frag.appendChild(btn);
            });
            container.innerHTML = '';
            container.appendChild(frag);
            // Now that items exist, set up scatter
            setupScatter();
        } catch (err) {
            // If loading fails, leave container as-is (possibly empty)
            // Optionally log to console for debugging
            console.warn('[projects] load failed:', err);
        }
    }

    // Kick off project loading on pages that have the container
    if (document.getElementById('doodles')) {
        loadProjects();
    }
    // Mark modals ready after a short delay — lets the browser settle any restored
    // event replay or focus during page navigation. Slightly longer to avoid ghost clicks.
    setTimeout(() => {
        try {
            window.__modalsInitComplete = true;
            // End the global click suppression window if still active
            window.__suppressClicksUntilTS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - 1;
            // Remove init guard from modal panels
            document.querySelectorAll('.modal .modal__panel[data-init-guard]').forEach(p => {
                p.removeAttribute('data-init-guard');
                p.removeAttribute('aria-hidden');
                p.removeAttribute('tabindex');
            });
        } catch (e) { }
    }, 450);
})();
