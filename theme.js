(() => {
    const root = document.documentElement;
    const storageKey = 'site-theme';
    let theme = 'light';

    try {
        if (localStorage.getItem(storageKey) === 'dark') theme = 'dark';
    } catch {}

    function applyTheme(value) {
        root.dataset.theme = value;
        document.querySelector('meta[name="theme-color"]').content =
            value === 'dark' ? '#0e0e0e' : '#ffffff';
    }

    applyTheme(theme);

    document.addEventListener('DOMContentLoaded', () => {
        const button = document.getElementById('theme-toggle');
        if (!button) return;
        const sun = document.getElementById('icon-sun');
        const moon = document.getElementById('icon-moon');

        function render() {
            const dark = root.dataset.theme === 'dark';
            sun.style.display = dark ? 'none' : 'block';
            moon.style.display = dark ? 'block' : 'none';
            button.setAttribute('aria-label', dark ? 'Use light theme' : 'Use dark theme');
        }

        render();
        button.addEventListener('click', () => {
            const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem(storageKey, next); } catch {}
            render();
        });
    });
})();
