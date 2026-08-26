(() => {
  'use strict';
  const menuBtn = document.querySelector('[data-mobile-menu]');
  const nav = document.querySelector('[data-nav]');
  menuBtn?.addEventListener('click', () => nav?.classList.toggle('is-open'));
  document.querySelectorAll('[data-current-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();
