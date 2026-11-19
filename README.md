# 3dstudofree

Estúdio independente para criar, editar e compartilhar uma biblioteca local de cenas 3D. A interface em português tem tema escuro com acentos lilás, navegação por projetos, visor 3D e painel de propriedades.

## Análise e escopo

A página de referência apresenta um agente com projetos, chat, anexos, biblioteca de assets e controles de visualização. O HTML público entrega JavaScript e folhas de estilo via CDN. Na extração da tela inicial, não havia imagens ou fontes pré-carregadas identificáveis. A resposta inicial não permite confirmar os serviços de geração, o banco de dados ou os fluxos de edição do original. Este projeto implementa os fluxos do estúdio com HTML, CSS, tipografia do sistema e processamento 3D no navegador.

A revisão estática via REA 6.8.0 analisou o bundle público `21ebvdh1_6od6.js` (evidência `ev_00cce1de4013fb490fa078df5a93df26192c93445bb94087f5e08914f11d2638`). A inspeção de outros bundles públicos encontrou referências a geração por texto e por imagem. A implementação, os pesos e a infraestrutura da inferência do original permaneceram fora da evidência observada.

## Executar

Requisitos: Node.js 24 ou superior e npm.

```sh
npm ci
```

Defina as variáveis `ADMIN_PASSWORD` e `VIEWER_PASSWORD` com senhas distintas. Você pode exportá-las no ambiente ou criar um arquivo local `.env`, ignorado pelo Git. Em Bash, esta opção evita registrar os valores no histórico:

```sh
read -rsp 'Senha de administrador: ' ADMIN_PASSWORD; echo
read -rsp 'Senha de usuário: ' VIEWER_PASSWORD; echo
export ADMIN_PASSWORD VIEWER_PASSWORD
npm start
```

Abra http://127.0.0.1:3000. O SQLite integrado ao Node cria o banco em `.data/`. Use `STUDIO_DATA_DIR` para escolher outro diretório e `PORT` para mudar a porta. O servidor usa loopback por padrão. Em implantação remota, coloque-o atrás de HTTPS e configure `SECURE_COOKIE=1`.

## Fluxos

- `/entrar`: entrada por perfil e encerramento de sessão na navegação.
- `/studio`: cena vazia, biblioteca e projetos salvos. O administrador pode criar e salvar.
- `/studio/<id>`: acesso direto à cena persistida. O usuário comum pode visualizar e exportar projetos.
- `/admin`: lista administrativa com navegação para edição e exclusão confirmada.

O administrador pode criar primitivas, editar nome, cor, posição, rotação e escala, remover objetos e importar OBJ ou GLB autocontido de até 5 MB. O visor suporta órbita, seleção, enquadramento e zoom. A exportação OBJ inclui geometria e transformações. Texturas, materiais e animações ficam fora do formato exportado.

## Substituições locais

- O assistente procedural cria primitivas e personagens compostos. A ferramenta de imagem cria um relevo exportável pela luminosidade. Pedidos de escultura livre retornam uma orientação.
- A biblioteca, cenas e sessões usam SQLite local. Os projetos salvos são visíveis a quem tem acesso ao estúdio. Os dois perfis usam senhas compartilhadas por função.
- O editor usa Three.js servido pelo próprio servidor, com geometria e iluminação locais. Arquivos GLB com dependências externas ou que requerem decodificadores adicionais ficam fora do escopo.
- A aplicação funciona em tempo de execução sem serviços externos.

## Testes

Com Python e Chromium disponíveis, instale o Playwright para Python se necessário e execute:

```sh
python -m pip install playwright
npm test
```

Os testes usam um banco e credenciais descartáveis. A suíte abre Chromium em desktop e celular, valida login, permissões, navegação, edição, persistência, importação, download, feedback, layout e logout.

## Motor aberto opcional para gerar volume

Para gerar uma malha volumétrica a partir de uma imagem, instale o [TripoSR](https://github.com/VAST-AI-Research/TripoSR) e seus pesos conforme o repositório oficial. Use um ambiente Python próprio para as dependências do motor. Em seguida, configure o servidor local:

```sh
export TRIPOSR_DIR=/caminho/para/TripoSR
export TRIPOSR_PYTHON=/caminho/para/venv/bin/python
export TRIPOSR_DEVICE=cpu
npm start
```

Administradores verão **Gerar volume com TripoSR** abaixo do campo de imagem. Em uma instalação compatível, use `TRIPOSR_DEVICE=cuda:0` para aceleração. A primeira execução pode buscar os pesos públicos. A geração roda no servidor local, processa um trabalho por vez e importa o resultado OBJ no editor. O relevo por luminosidade e o personagem por primitivas são ferramentas separadas que rodam no próprio navegador. A prévia hospedada oferece essas ferramentas locais, pois o runtime de hospedagem não executa o processo Python do TripoSR.
