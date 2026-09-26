document.querySelectorAll('[data-modo]').forEach((b) => {
  b.addEventListener('click', () => {
    b.disabled = true;
    window.electronAPI.elegirModo(b.dataset.modo);
  });
});
