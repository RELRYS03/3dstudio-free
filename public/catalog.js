const templates = [
  {id:'cube',name:'Cubo de partida',description:'Uma malha simples para testar proporções, escala, cor e exportação.',category:'Objetos',glyph:'◇'},
  {id:'sphere',name:'Esfera',description:'Geometria arredondada para começar uma peça ou estudar volumes.',category:'Objetos',glyph:'●'},
  {id:'cylinder',name:'Cilindro',description:'Base para suportes, colunas, pés e formas cilíndricas.',category:'Objetos',glyph:'▯'},
  {id:'cone',name:'Cone',description:'Volume cônico para protótipos e composições geométricas.',category:'Objetos',glyph:'△'},
  {id:'torus',name:'Anel',description:'Geometria em anel para argolas e estudos de forma.',category:'Objetos',glyph:'◎'},
  {id:'character',name:'Personagem estilizado',description:'Personagem composto por peças geométricas locais. Não é uma geração por IA.',category:'Personagens',glyph:'♙'},
];

function shapeCategory(shape) {
  if (shape === 'imported') return 'Importados';
  if (['sphere','cube','cylinder','cone','torus'].includes(shape)) return 'Objetos';
  return 'Outros';
}

function card({title,description,category,glyph,action,label,disabled=false}) {
  const article = document.createElement('article');
  article.className = 'catalog-card';
  const top = document.createElement('div');
  top.className = 'catalog-card-top';
  const icon = document.createElement('span');
  icon.className = 'catalog-glyph';
  icon.setAttribute('aria-hidden','true');
  icon.textContent = glyph || '◇';
  top.append(icon);
  const body = document.createElement('div');
  body.className = 'catalog-card-body';
  const meta = document.createElement('div');
  meta.className = 'catalog-meta';
  const tag = document.createElement('span');
  tag.className = 'catalog-tag';
  tag.textContent = category;
  meta.append(tag);
  const heading = document.createElement('h2');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = description;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click',action);
  body.append(meta,heading,copy,button);
  article.append(top,body);
  return article;
}

export async function catalogPage({app,api,make,button,mode,admin}) {
  const projects = await api('/assets');
  const assets = projects.flatMap(project => project.objects.map(object => ({
    ...object,projectId:project.id,projectName:project.name,category:shapeCategory(object.shape),
  })));
  const templatesOnly = mode === 'templates';
  const assetsOnly = mode === 'assets';
  const title = templatesOnly ? 'Modelos iniciais' : assetsOnly ? 'Biblioteca de assets' : 'Explorar';
  const description = templatesOnly
    ? 'Comece com geometrias que o estúdio realmente sabe criar e editar. São pontos de partida locais, não resultados de um serviço generativo.'
    : assetsOnly
      ? 'Modelos que já existem nos projetos deste estúdio. Abra um projeto para continuar a edição ou exportação.'
      : 'Explore os modelos dos seus projetos e use uma base local para iniciar uma nova criação.';
  app.innerHTML = `
    <main class="catalog-page">
      <section class="catalog-hero">
        <div><h1>${title}</h1><p>${description}</p></div>
        <div class="row">
          <a class="catalog-tag" href="/discover">Explorar</a>
          <a class="catalog-tag" href="/templates">Modelos iniciais</a>
          <a class="catalog-tag" href="/assets">Assets</a>
        </div>
      </section>
      <div class="catalog-tools">
        <input id="catalog-search" type="search" placeholder="Buscar por nome, projeto ou tipo..." aria-label="Buscar assets e modelos">
        <span class="muted" id="catalog-count"></span>
      </div>
      <div class="catalog-filters" id="catalog-filters" aria-label="Filtros de categoria"></div>
      <div class="catalog-section-title"><h2 id="catalog-section-heading"></h2></div>
      <section class="catalog-grid" id="catalog-grid" aria-live="polite"></section>
      <p class="catalog-note">Estado real: esta biblioteca é local ao projeto e à instalação. Não está conectada à comunidade pública do Meshy nem a um serviço externo de geração 3D.</p>
    </main>`;
  const grid = document.getElementById('catalog-grid');
  const search = document.getElementById('catalog-search');
  const filters = document.getElementById('catalog-filters');
  const count = document.getElementById('catalog-count');
  const sectionHeading = document.getElementById('catalog-section-heading');
  let category = 'Todos';
  const source = templatesOnly ? templates : assetsOnly ? assets : [...assets,...templates];
  const categories = ['Todos',...new Set(source.map(item => item.category))];
  for (const value of categories) {
    const chip = button(value,() => { category=value; update(); },{'aria-pressed':String(category===value)});
    chip.addEventListener('click',() => {
      for (const element of filters.querySelectorAll('button')) element.setAttribute('aria-pressed',String(element.textContent===category));
    });
    filters.append(chip);
  }
  function update() {
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const shown = source.filter(item => {
      const matchesCategory = category === 'Todos' || item.category === category;
      const searchable = [item.name,item.description,item.projectName,item.filename,item.category,item.shape].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      return matchesCategory && searchable.includes(query);
    });
    grid.replaceChildren();
    sectionHeading.textContent = templatesOnly ? 'Comece por uma geometria disponível' : assetsOnly ? 'Assets dos projetos' : 'Itens encontrados';
    count.textContent = `${shown.length} item(ns)`;
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'catalog-empty';
      empty.textContent = query ? 'Nenhum item corresponde à busca. Ajuste o termo ou o filtro.' : 'Ainda não há modelos nesta seção. Crie um modelo inicial ou salve um projeto no estúdio.';
      grid.append(empty);
      return;
    }
    for (const item of shown) {
      const isTemplate = templates.includes(item);
      if (isTemplate) {
        grid.append(card({
          title:item.name,description:item.description,category:item.category,glyph:item.glyph,
          label:admin ? 'Abrir no estúdio' : 'Indisponível para visualização',
          disabled:!admin,
          action:() => { location.assign('/studio?template='+encodeURIComponent(item.id)); },
        }));
      } else {
        const glyph = item.shape === 'sphere' ? '●' : item.shape === 'cube' ? '◇' : item.shape === 'cylinder' ? '▯' : item.shape === 'cone' ? '△' : item.shape === 'torus' ? '◎' : '⬡';
        grid.append(card({
          title:item.name || item.filename || 'Asset sem nome',
          description:`Projeto: ${item.projectName}. Tipo: ${item.filename || item.shape || 'malha'}.`,
          category:item.category,glyph,label:'Abrir projeto',
          action:() => location.assign('/studio/'+item.projectId),
        }));
      }
    }
  }
  search.addEventListener('input',update);
  update();
}
