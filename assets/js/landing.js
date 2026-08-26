(() => {
  'use strict';
  const grid = document.getElementById('projectGrid');
  const filter = document.getElementById('projectFilter');
  const search = document.getElementById('projectSearch');
  if (!grid) return;

  const render = () => {
    const mode = filter?.value || 'all';
    const term = (search?.value || '').trim().toLowerCase();
    const items = (window.SIGMUN_PROJECTS || []).filter((p) => {
      const typeMatch = mode === 'all' || p.type === mode;
      const haystack = `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase();
      return typeMatch && (!term || haystack.includes(term));
    });

    grid.innerHTML = items.map((p) => `
      <article class="project-card" data-accent="${p.accent}">
        <div class="project-card__top">
          <div class="project-icon"><i class="bi ${p.icon}"></i></div>
          <span class="status-pill">${p.status}</span>
        </div>
        <div class="project-eyebrow">${p.eyebrow}</div>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
        <div class="tag-row">${p.tags.map((tag) => `<span>${tag}</span>`).join('')}</div>
        <a class="project-link" href="${p.href}">Abrir proyecto <i class="bi bi-arrow-up-right"></i></a>
      </article>
    `).join('') || '<div class="empty-card"><i class="bi bi-search"></i><h3>Sin coincidencias</h3><p>Prueba con otra palabra o categoría.</p></div>';
  };

  filter?.addEventListener('change', render);
  search?.addEventListener('input', render);
  render();
})();
