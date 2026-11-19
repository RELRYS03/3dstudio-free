# 3dstudofree

Estúdio independente para criar, editar e compartilhar uma biblioteca local de cenas 3D. A interface em português tem tema escuro com acentos lilás, navegação por projetos, visor 3D e painel de propriedades.

## Análise e escopo

A página de referência apresenta um agente com projetos, chat, anexos, biblioteca de assets e controles de visualização. O HTML público entrega JavaScript e folhas de estilo via CDN. Na extração da tela inicial, não havia imagens ou fontes pré-carregadas identificáveis. A resposta inicial não permite confirmar os serviços de geração, o banco de dados ou os fluxos de edição do original. Este projeto implementa os fluxos do estúdio com HTML, CSS, tipografia do sistema e processamento 3D no navegador.

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

- A geração de 3D via serviço de IA foi substituída por um assistente procedural que reconhece cubo, esfera, cilindro, cone e anel. Ele oferece criação imediata de primitivas; pedidos livres de escultura retornam uma orientação.
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
