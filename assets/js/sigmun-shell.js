(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const projects = window.SIGMUN_PROJECTS || [];
  const sidebar = document.getElementById('portalSidebar');
  const shell = document.querySelector('.portal-shell');
  const frame = document.getElementById('moduleFrame');
  const select = document.getElementById('projectSelect');
  const desc = document.getElementById('projectDescription');
  const title = document.getElementById('moduleTitle');
  const subtitle = document.getElementById('moduleSubtitle');
  const moduleButtons = [...document.querySelectorAll('[data-module]')];
  let module = params.get('view') === 'dashboard' ? 'dashboard' : 'visor';
  let projectId = params.get('project') || (module === 'dashboard' ? 'indicadores' : 'territorio');

  const typeFor = () => module === 'dashboard' ? 'dashboard' : 'map';
  const listFor = () => projects.filter(p => p.type === typeFor());
  const currentProject = () => projects.find(p => p.id === projectId) || listFor()[0];

  function renderSelect() {
    const list = listFor();
    if (!list.some(p => p.id === projectId)) projectId = list[0]?.id || '';
    select.innerHTML = list.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${p.title}</option>`).join('');
  }
  function loadModule(push = true) {
    renderSelect();
    const p = currentProject();
    if (p) projectId = p.id;
    const target = module === 'dashboard' ? `dashboard.html?project=${encodeURIComponent(projectId)}&embed=1` : `visor.html?project=${encodeURIComponent(projectId)}&embed=1`;
    frame.src = target;
    desc.textContent = p?.description || (module === 'dashboard' ? 'Consulta indicadores y series de información.' : 'Explora información territorial municipal.');
    title.textContent = module === 'dashboard' ? 'Indicadores y estadística' : 'Visor geográfico';
    subtitle.textContent = p?.title || 'SIGmun Delicias';
    moduleButtons.forEach(b => b.classList.toggle('active', b.dataset.module === module));
    if (push) {
      const url = new URL(location.href);
      url.searchParams.set('view', module);
      url.searchParams.set('project', projectId);
      history.replaceState({}, '', url);
    }
  }
  moduleButtons.forEach(btn => btn.addEventListener('click', () => {
    module = btn.dataset.module;
    projectId = module === 'dashboard' ? 'indicadores' : 'territorio';
    loadModule();
  }));
  select.addEventListener('change', () => { projectId = select.value; loadModule(); });
  document.getElementById('openStandalone').addEventListener('click', () => {
    const target = module === 'dashboard' ? `dashboard.html?project=${encodeURIComponent(projectId)}` : `visor.html?project=${encodeURIComponent(projectId)}`;
    window.open(target, '_blank', 'noopener');
  });
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    if (innerWidth <= 800) sidebar.classList.toggle('mobile-open');
    else { sidebar.classList.toggle('collapsed'); shell.classList.toggle('sidebar-collapsed'); }
  });
  loadModule(false);
})();
