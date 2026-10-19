// Extension pages follow the system light/dark setting (the in-page reader has its own theme setting).
document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
