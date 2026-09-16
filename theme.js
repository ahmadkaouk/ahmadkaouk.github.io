(() => {
    const root = document.documentElement;
    const storageKey = 'site-theme';
    let theme = 'light';
    try { if (localStorage.getItem(storageKey) === 'dark') theme = 'dark'; } catch {}

    function applyTheme(value) {
        root.dataset.theme = value;
        document.querySelector('meta[name="theme-color"]').content = value === 'dark' ? '#111111' : '#fafafa';
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.setAttribute('aria-label', value === 'dark' ? 'Use light theme' : 'Use dark theme');
            button.setAttribute('aria-pressed', String(value === 'dark'));
        }
    }
    applyTheme(theme);
    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(root.dataset.theme);
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try { localStorage.setItem(storageKey, next); } catch {}
        });
    });
})();
