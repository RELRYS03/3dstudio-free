import { buildFigurine, imageRelief } from '/generation.js';
import { catalogPage } from '/catalog.js';
import { makeViewport, readModel, shapes } from '/viewport.js';

const app = document.querySelector('#app');
const make = (tag, text, attrs = {}) => {
  const element = document.createElement(tag);
  element.textContent = text;
  for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,value);
  return element;
};
const find = id => document.getElementById(id);
const api = async (path, method = 'GET', body) => {
  const response = await fetch('/api'+path, {method, ...(body === undefined ? {} :
    {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};
function status(message, error = false) {
  const target = find('status');
  target.textContent = message;
  target.classList.toggle('error', error);
}
function button(text, action, attrs) {
  const result = make('button',text,{type:'button',...attrs});
  result.onclick = action;
  return result;
}
function login() {
  app.innerHTML = `<main class="login"><section class="card">
    <span class="brand">3dstudofree</span><h1>Entre no estúdio</h1>
    <p class="muted">Acesse os projetos e modelos 3D.</p>
    <form id="login"><label>Perfil<select name="role"><option value="viewer">Usuário</option><option value="admin">Administrador</option></select></label>
    <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="primary">Entrar</button><p id="status" class="status" role="alert"></p></form></section></main>`;
  find('login').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button');
    submit.disabled = true;
    status('Entrando…');
    try {
      await api('/login','POST',Object.fromEntries(new FormData(form)));
      const next = new URLSearchParams(location.search).get('next');
      location.replace(next && /^\/(?:studio(?:\/[a-f0-9]{24})?|admin|discover|templates|assets)$/.test(next) ? next : '/studio');
    } catch (error) {
      status(error.message,true);
      submit.disabled = false;
    }
  };
}

function header(admin) {
  const head = make('header','',{class:'top'});
  const nav = make('nav','',{'aria-label':'Navegação principal'});
  head.append(make('a','3dstudofree',{class:'brand',href:'/studio'}),nav);
  nav.append(make('a','Estúdio',{href:'/studio'}));
  nav.append(make('a','Explorar',{href:'/discover'}));
  nav.append(make('a','Modelos',{href:'/templates'}));
  nav.append(make('a','Assets',{href:'/assets'}));
  if (admin) nav.append(make('a','Administração',{href:'/admin'}));
  nav.append(make('small',admin ? 'Administrador' : 'Usuário'));
  nav.append(button('Sair',async () => {
    try { await api('/logout','POST'); location.assign('/entrar'); }
    catch (error) { status(error.message,true); }
  }));
  app.prepend(head);
}

async function adminPage() {
  const projects = await api('/admin');
  app.innerHTML = '<main class="admin"><h1>Administração</h1><p class="muted">Abra um projeto para editar ou exclua da biblioteca.</p><ul id="projects"></ul><p id="status" class="status" role="status"></p></main>';
  header(true);
  if (!projects.length) find('projects').append(make('li','Nenhum projeto salvo.'));
  for (const project of projects) {
    const row = make('li','',{class:'row'});
    row.append(make('a',project.name,{href:'/studio/'+project.id}),button('Excluir projeto',async () => {
      if (!confirm('Excluir “'+project.name+'”?')) return;
      try {
        await api('/projects/'+project.id,'DELETE');
        row.remove();
        if (!find('projects').children.length) find('projects').append(make('li','Nenhum projeto salvo.'));
        status('Projeto excluído.');
      } catch (error) { status(error.message,true); }
    },{'aria-label':'Excluir '+project.name}));
    find('projects').append(row);
  }
}

function proceduralShape(text) {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  return Object.entries({cube:/\b(cubo|caixa)\b/,sphere:/\b(esfera|bola)\b/,cylinder:/\b(cilindro|tubo)\b/,cone:/\bcone\b/,torus:/\b(anel|toro)\b/})
    .find(([, pattern]) => pattern.test(normalized))?.[0];
}

async function studio(admin) {
  let id = location.pathname.split('/')[2];
  const [projects, saved] = await Promise.all([api('/projects'), id ? api('/projects/'+id) : null]);
  const project = saved ?? {name:'Projeto sem título',objects:[],messages:[]};
  const templateId = saved ? null : new URLSearchParams(location.search).get('template');
  if (templateId) {
    const starter = {
      cube: ['Cubo de partida','cube','#a5a1ff'],
      sphere: ['Esfera de partida','sphere','#6fcbb4'],
      cylinder: ['Cilindro de partida','cylinder','#e5b66d'],
      cone: ['Cone de partida','cone','#dc8b9f'],
      torus: ['Anel de partida','torus','#8aa8e8'],
    }[templateId];
    if (starter) {
      project.name = starter[0];
      project.objects.push({id:crypto.randomUUID(),name:starter[0],shape:starter[1],color:starter[2],
        position:[0,.7,0],rotation:[0,0,0],scale:[1,1,1]});
    } else if (templateId === 'character') {
      project.name = 'Personagem estilizado';
      project.objects.push(...buildFigurine('crie um personagem azul'));
      project.messages.push({text:'Modelo inicial: personagem estilizado montado com geometria local.'});
    }
  }
  let selected = null;
  let viewport;
  let loading = false;
  let savedState = JSON.stringify(project);
  addEventListener('beforeunload', event => {
    if (JSON.stringify(project) !== savedState) event.preventDefault();
  });

  app.innerHTML = `<main class="workspace">
    <aside class="sidebar" aria-label="Projetos">
      <a href="/studio">Novo projeto</a><h2>Projetos</h2><nav id="project-list" class="list" aria-label="Projetos salvos"></nav>
    </aside>
    <section class="work" aria-label="Área de trabalho 3D">
      <div class="heading"><div><h1 id="title"></h1><p class="muted">${admin ? 'Edite a cena e salve seu projeto.' : 'Visualize e exporte modelos da biblioteca.'}</p></div>
      <div class="row"><button id="save" class="primary" ${admin ? '' : 'hidden'}>Salvar projeto</button><button id="export">Exportar OBJ</button></div></div>
      <p id="status" class="status" role="status"></p>
      <div id="viewport" class="viewport">
        <span class="view-banner">Perspectiva</span>
        <p id="empty" class="empty-view">${admin ? 'Adicione uma forma, descreva uma primitiva ou importe um modelo.' : 'Este projeto ainda está vazio.'}</p>
        <div class="view-controls"><button id="fit">Enquadrar</button><button id="minus" aria-label="Diminuir zoom">−</button><span id="zoom">100%</span><button id="plus" aria-label="Aumentar zoom">+</button></div>
      </div>
      <section class="prompt" aria-label="Assistente local de formas">
        <h2>Assistente de formas</h2><div id="messages"></div>
        <form id="prompt" ${admin ? '' : 'hidden'}><label>Descreva uma forma<input name="prompt" maxlength="300" required placeholder="Ex.: crie uma esfera"></label><div class="row"><button class="primary">Enviar</button></div></form>
        <form id="relief" ${admin ? '' : 'hidden'}><label>Imagem de referência<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label><div class="row"><button>Gerar relevo 3D</button></div></form>
      </section>
    </section>
    <aside class="inspector" aria-label="Biblioteca e propriedades">
      <section><h2>Biblioteca da cena</h2><div id="objects" class="list"></div></section>
      <section ${admin ? '' : 'hidden'}><h2>Adicionar à cena</h2>
        <form id="add"><label>Forma<select name="shape"></select></label><button>Adicionar forma</button></form>
        <p></p><form id="import"><label>Importar modelo<input name="model" type="file" accept=".obj,.glb" required></label><small>OBJ ou GLB, até 5 MB.</small><button>Importar arquivo</button></form>
      </section>
      <section id="properties" hidden><h2>Propriedades</h2><form id="edit"><label>Nome do objeto<input name="objectName" maxlength="80" required></label>
        <label>Cor<input name="color" type="color"></label><div id="transform"></div><button>Aplicar alterações</button><button id="remove" type="button">Remover objeto</button>
      </form></section>
      <section ${admin ? '' : 'hidden'}><label>Nome do projeto<input id="project-name" maxlength="80" required></label></section>
    </aside>
  </main>`;
  header(admin);
  find('title').textContent = project.name;
  find('project-name').value = project.name;
  for (const item of projects) {
    const link = make('a',item.name,{href:'/studio/'+item.id});
    if (item.id === id) link.setAttribute('aria-current','page');
    find('project-list').append(link);
  }
  if (!projects.length) find('project-list').append(make('small','Nenhum projeto salvo.'));
  for (const [key,[label]] of Object.entries(shapes)) find('add').elements.shape.append(make('option',label,{value:key}));

  function renderObjects() {
    find('empty').hidden = project.objects.length > 0 && !!viewport;
    find('objects').replaceChildren();
    if (!project.objects.length) find('objects').append(make('small','Nenhum objeto na cena.'));
    for (const item of project.objects) find('objects').append(button(item.name,() => select(item.id),{'aria-pressed':String(item.id === selected)}));
  }
  function renderMessages() {
    find('messages').replaceChildren();
    if (!project.messages.length) find('messages').append(make('p','Experimente um personagem, uma primitiva ou uma imagem de referência.',{class:'muted'}));
    for (const message of project.messages) find('messages').append(make('p', String(message?.text ?? '')));
    find('messages').scrollTop = find('messages').scrollHeight;
  }
  const transforms = {position:'Posição',rotation:'Rotação em graus',scale:'Escala'};
  for (const [key,label] of Object.entries(transforms)) {
    const group = make('div','',{class:'triple',role:'group','aria-label':label});
    for (const axis of ['X','Y','Z']) {
      const field = make('label',axis);
      field.append(make('input','',{name:key+axis,type:'number',min:key === 'scale' ? '0.01' : '-3600',max:'3600',step:'any',required:'','aria-label':label+' '+axis}));
      group.append(field);
    }
    find('transform').append(make('small',label),group);
  }
  function select(key) {
    selected = key;
    renderObjects();
    const item = project.objects.find(entry => entry.id === key);
    find('properties').hidden = !item || !admin;
    if (!item || !admin) return;
    const {elements} = find('edit');
    elements.objectName.value = item.name;
    elements.color.value = item.color;
    for (const field of Object.keys(transforms)) ['X','Y','Z'].forEach((axis,index) => {
      elements[field+axis].value = item[field][index];
    });
  }
  function newItem(shape, name) {
    return {id:crypto.randomUUID(),name,shape,color:'#a5a1ff',position:[0,.7,0],rotation:[0,0,0],scale:[1,1,1]};
  }
  function requireViewport() {
    if (!viewport) throw new Error('O visor 3D está indisponível. Verifique o suporte a WebGL.');
  }
  async function addItem(item, model) {
    requireViewport();
    if (project.objects.length >= 100) throw new Error('A cena comporta até 100 objetos.');
    await viewport.add(item,model);
    project.objects.push(item);
    select(item.id);
    viewport.focus();
  }
  renderObjects();
  renderMessages();
  if (templateId && project.objects.length) status('Modelo inicial carregado. Revise a geometria e salve o projeto.');
  try {
    viewport = makeViewport(find('viewport'),select, zoom => { find('zoom').textContent = zoom+'%'; });
    for (const item of project.objects) {
      try { await viewport.add(item); }
      catch { status('Um modelo salvo não pôde ser carregado.',true); }
    }
    if (project.objects.length) viewport.focus();
    renderObjects();
  } catch {
    find('empty').textContent = 'Visor indisponível. Verifique o suporte a WebGL.';
  }
  find('fit').onclick = () => viewport?.focus();
  find('minus').onclick = () => viewport?.zoom(1.2);
  find('plus').onclick = () => viewport?.zoom(1/1.2);
  find('export').onclick = () => {
    try {
      requireViewport();
      if (!project.objects.length) throw new Error('Adicione um objeto antes de exportar.');
      const url = URL.createObjectURL(new Blob([viewport.export()],{type:'text/plain'}));
      const link = make('a','',{href:url,download:'cena.obj'});
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
      status('Arquivo OBJ exportado.');
    } catch (error) { status(error.message,true); }
  };
  if (!admin) return;
  try {
    const engine = await api('/engine');
    if (engine.enabled) {
      const form = find('relief');
      const generate = button('Gerar volume com TripoSR', async () => {
        if (loading || !form.reportValidity()) return;
        const file = form.elements.image.files[0];
        loading = generate.disabled = true;
        status('Gerando volume com TripoSR…');
        try {
          requireViewport();
          if (file.size > 5_000_000) throw new Error('Use uma imagem de até 5 MB.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          const data = bytes.toBase64 ? bytes.toBase64() : btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
          const output = await api('/engine','POST',{mime:file.type,data});
          await addItem({...newItem('imported','Volume de '+file.name.slice(0,70)),filename:'volume.obj',source:output.source});
          status('Malha volumétrica criada.');
        } catch (error) { status(error.message,true); }
        finally { loading = generate.disabled = false; }
      });
      form.querySelector('.row').append(generate);
    }
  } catch {
    status('O motor opcional está indisponível.');
  }
  find('project-name').oninput = event => {
    project.name = event.target.value;
    find('title').textContent = project.name || 'Projeto sem título';
  };
  find('save').onclick = async () => {
    if (loading) return;
    const save = find('save');
    save.disabled = true;
    status('Salvando…');
    const snapshot = JSON.stringify(project);
    try {
      const result = await api(id ? '/projects/'+id : '/projects',id ? 'PUT' : 'POST',JSON.parse(snapshot));
      savedState = snapshot;
      status('Projeto salvo.');
      if (!id) {
        id = result.id;
        history.replaceState(null,'','/studio/'+id);
        const list = find('project-list');
        list.querySelector('small')?.remove();
        list.prepend(make('a',JSON.parse(snapshot).name,{href:'/studio/'+id,'aria-current':'page'}));
      } else {
        find('project-list').querySelector('[aria-current]').textContent = JSON.parse(snapshot).name;
      }
    } catch (error) { status(error.message,true); }
    finally { save.disabled = false; }
  };
  find('add').onsubmit = async event => {
    event.preventDefault();
    const shape = event.currentTarget.elements.shape.value;
    try { await addItem(newItem(shape,shapes[shape][0])); status('Forma adicionada.'); }
    catch (error) { status(error.message,true); }
  };
  find('prompt').onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.prompt;
    const text = input.value.trim();
    const shape = proceduralShape(text);
    const figurine = buildFigurine(text);
    if (!shape && !figurine.length) return status('Descreva um cubo, uma esfera, um cilindro, um cone ou um anel.',true);
    try {
      if (project.objects.length+figurine.length > 100) throw new Error('A cena comporta até 100 objetos.');
      if (figurine.length) {
        for (const item of figurine) await addItem(item);
        project.messages.push({text:'Você: '+text},{text:'Assistente: Personagem composto adicionado à cena.'});
        input.value = '';
        renderMessages();
        return status('Personagem criado localmente.');
      }
      await addItem(newItem(shape,shapes[shape][0]));
      project.messages.push({text:'Você: '+text},{text:'Assistente: '+'Forma adicionada: '+shapes[shape][0]+'.'});
      input.value = '';
      renderMessages();
      status('Forma criada localmente.');
    } catch (error) { status(error.message,true); }
  };
  find('relief').onsubmit = async event => {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const submit = form.querySelector('button');
    loading = submit.disabled = true;
    status('Gerando relevo…');
    try {
      const file = form.elements.image.files[0];
      const source = await imageRelief(file);
      await addItem({...newItem('imported','Relevo de '+file.name.slice(0,70)),filename:'relevo.obj',source});
      project.messages.push({text:'Imagem: '+file.name},{text:'Assistente: Relevo de malha criado a partir da luminosidade.'});
      renderMessages();
      form.reset();
      status('Relevo 3D criado.');
    } catch (error) { status(error.message,true); }
    finally { loading = submit.disabled = false; }
  };
  find('import').onsubmit = async event => {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const file = form.elements.model.files[0];
    const submit = form.querySelector('button');
    loading = submit.disabled = true;
    status('Importando modelo…');
    try {
      requireViewport();
      if (!file || !/\.(obj|glb)$/i.test(file.name) || file.size > 5_000_000) throw new Error('Use um arquivo OBJ ou GLB de até 5 MB.');
      const isGlb = /\.glb$/i.test(file.name);
      const source = isGlb ? (await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(file);
      })) : await file.text();
      let model;
      try { model = await readModel(file.name, source); }
      catch { throw new Error('Não foi possível ler a malha. Confira o formato do arquivo.'); }
      await addItem({...newItem('imported',file.name.slice(0,80)),filename:file.name,source},model);
      status('Modelo importado.');
      form.reset();
    } catch (error) { status(error.message,true); }
    finally { loading = submit.disabled = false; }
  };
  find('edit').onsubmit = event => {
    event.preventDefault();
    const item = project.objects.find(entry => entry.id === selected);
    if (!item) return;
    const {elements} = event.currentTarget;
    const name = elements.objectName.value.trim();
    if (!name) return status('Informe um nome para o objeto.',true);
    item.name = name;
    if (item.color !== elements.color.value) item.recolored = true;
    item.color = elements.color.value;
    for (const key of Object.keys(transforms)) item[key] = ['X','Y','Z'].map(axis => elements[key+axis].valueAsNumber);
    viewport?.update(item);
    renderObjects();
    status('Objeto atualizado.');
  };
  find('remove').onclick = () => {
    if (!selected) return;
    project.objects = project.objects.filter(item => item.id !== selected);
    viewport?.remove(selected);
    select(null);
    status('Objeto removido.');
  };
}

try {
  const {role} = await api('/session');
  const path = location.pathname;
  if (!role && !['/','/entrar'].includes(path)) location.replace('/entrar?next='+encodeURIComponent(path));
  else if (!role) login();
  else if (['/','/entrar'].includes(path)) location.replace('/studio');
  else if (path === '/admin') await adminPage();
  else if (['/discover','/templates','/assets'].includes(path)) {
    const mode = path.slice(1);
    await catalogPage({app,api,make,button,mode,admin:role === 'admin'});
    header(role === 'admin');
  }
  else await studio(role === 'admin');
} catch (error) {
  app.replaceChildren(make('main','',{class:'admin'}));
  app.firstChild.append(make('h1','Não foi possível abrir a página'),make('p',error.message,{role:'alert'}),make('a','Voltar ao estúdio',{href:'/studio'}));
}
