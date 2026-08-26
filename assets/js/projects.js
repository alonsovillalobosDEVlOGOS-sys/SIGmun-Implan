window.SIGMUN_PROJECTS = [
  {
    id: 'territorio',
    title: 'Visor Territorial',
    eyebrow: 'SIG base',
    description: 'Consulta información territorial de Delicias, explora temas por ubicación y analiza elementos directamente sobre el mapa.',
    icon: 'bi-map',
    accent: 'blue',
    type: 'map',
    status: 'Disponible',
    href: 'sigmun.html?view=visor&project=territorio',
    tags: ['GeoJSON', 'KML/KMZ', 'CSV/XLSX']
  },
  {
    id: 'obras',
    title: 'Infraestructura y Obra Pública',
    eyebrow: 'Proyecto temático',
    description: 'Consulta inversión, avance físico, ubicación y cobertura territorial de proyectos de infraestructura y obra pública.',
    icon: 'bi-cone-striped',
    accent: 'orange',
    type: 'map',
    status: 'Plantilla lista',
    href: 'sigmun.html?view=visor&project=obras',
    tags: ['Obra pública', 'Inversión', 'Avance']
  },
  {
    id: 'urbano',
    title: 'Desarrollo Urbano',
    eyebrow: 'Proyecto temático',
    description: 'Consulta planeación, zonificación, reservas, polígonos y crecimiento urbano del municipio.',
    icon: 'bi-buildings',
    accent: 'green',
    type: 'map',
    status: 'Plantilla lista',
    href: 'sigmun.html?view=visor&project=urbano',
    tags: ['Planeación', 'Zonificación', 'Polígonos']
  },
  {
    id: 'movilidad',
    title: 'Movilidad y Vialidades',
    eyebrow: 'Proyecto temático',
    description: 'Explora corredores, aforos, rutas, condiciones de la red vial e información relacionada con la movilidad.',
    icon: 'bi-sign-turn-right',
    accent: 'blue',
    type: 'map',
    status: 'Plantilla lista',
    href: 'sigmun.html?view=visor&project=movilidad',
    tags: ['Aforos', 'Vialidades', 'Rutas']
  },
  {
    id: 'equipamiento',
    title: 'Equipamiento y Servicios',
    eyebrow: 'Proyecto temático',
    description: 'Localiza espacios públicos, escuelas, servicios, infraestructura y equipamientos de interés municipal.',
    icon: 'bi-geo-alt',
    accent: 'green',
    type: 'map',
    status: 'Plantilla lista',
    href: 'sigmun.html?view=visor&project=equipamiento',
    tags: ['Equipamiento', 'Cobertura', 'Servicios']
  },
  {
    id: 'indicadores',
    title: 'Indicadores de Delicias',
    eyebrow: 'Estadística',
    description: 'Consulta indicadores municipales, comparativos, tendencias y estadísticas para dar seguimiento a Delicias.',
    icon: 'bi-bar-chart-line',
    accent: 'orange',
    type: 'dashboard',
    status: 'Disponible',
    href: 'sigmun.html?view=dashboard&project=indicadores',
    tags: ['Gráficas', 'KPIs', 'Google Sheets']
  },
  {
    id: 'competitividad',
    title: 'Competitividad Urbana',
    eyebrow: 'Estadística',
    description: 'Consulta la evolución de indicadores económicos, urbanos, sociales e institucionales relevantes para la competitividad.',
    icon: 'bi-graph-up-arrow',
    accent: 'blue',
    type: 'dashboard',
    status: 'Plantilla lista',
    href: 'sigmun.html?view=dashboard&project=competitividad',
    tags: ['Series', 'Comparativos', 'Benchmark']
  },
  {
    id: 'datos',
    title: 'Laboratorio de Datos Abiertos',
    eyebrow: 'Datos',
    description: 'Espacio de consulta y análisis para conjuntos de información municipal y datos de interés público.',
    icon: 'bi-database-check',
    accent: 'green',
    type: 'dashboard',
    status: 'Disponible',
    href: 'sigmun.html?view=dashboard&project=datos',
    tags: ['CSV/XLSX', 'JSON', 'Apps Script']
  }
];

window.SIGMUN_PROJECT_CONFIG = {
  territorio: {
    title: 'Visor Territorial',
    subtitle: 'Exploración geográfica municipal',
    center: [28.1908, -105.4701],
    zoom: 13,
    dataSources: []
  },
  obras: {
    title: 'Infraestructura y Obra Pública',
    subtitle: 'Localización, inversión y avance de proyectos',
    center: [28.1908, -105.4701],
    zoom: 13,
    dataSources: []
  },
  urbano: {
    title: 'Desarrollo Urbano',
    subtitle: 'Planeación, zonificación y crecimiento',
    center: [28.1908, -105.4701],
    zoom: 13,
    dataSources: []
  },
  movilidad: {
    title: 'Movilidad y Vialidades',
    subtitle: 'Red vial, aforos, rutas e incidentes',
    center: [28.1908, -105.4701],
    zoom: 13,
    dataSources: []
  },
  equipamiento: {
    title: 'Equipamiento y Servicios',
    subtitle: 'Cobertura territorial de infraestructura y servicios',
    center: [28.1908, -105.4701],
    zoom: 13,
    dataSources: []
  }
};
