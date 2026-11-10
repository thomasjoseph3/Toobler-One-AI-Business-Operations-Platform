// Runs before the page is drawn: applies the theme the person chose last time (light or dark). With nothing saved, or
// "system", the page follows the device setting through CSS alone. Storage can be blocked, so every access is guarded.
(function applySavedTheme() {
  try {
    const savedTheme = window.localStorage.getItem('toobler-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  } catch (storageError) {
    /* storage is blocked: follow the device setting */
  }
})();
