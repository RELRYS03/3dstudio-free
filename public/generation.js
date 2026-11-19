const part = (name, shape, color, position, scale, rotation = [0,0,0]) => ({
  id:crypto.randomUUID(), name, shape, color, position, scale, rotation,
});

export function buildFigurine(prompt) {
  const text = prompt.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  if (!/\b(boneco|boneca|personagem|figura|robo|menino|menina)\b/.test(text)) return [];
  const robot = /\brobo\b/.test(text);
  const skin = robot ? '#bccadd' : '#eab086';
  const shirt = Object.entries({verde:'#429775',vermelh:'#c94d65',rosa:'#f393bd',azul:'#555cdf',amarel:'#e6be57'})
    .find(([color]) => text.includes(color))?.[1] || '#7b68dc';
  const pieces = [
    part('Pedestal','cylinder','#342c4a',[0,.1,0],[1.9,.18,1.9]),
    part('Tronco','sphere',shirt,[0,1.34,0],[.67,.7,.4]),
    part('Cabeça',robot?'cube':'sphere',skin,[0,2.13,0],[.75,.73,.68]),
  ];
  if (!robot) pieces.push(part('Cabelo','sphere','#352537',[0,2.44,-.08],[.74,.35,.67]));
  for (const side of [-1,1]) {
    pieces.push(
      part('Olho','sphere','#232535',[.145*side,2.18,.416],[.075,.09,.052]),
      part('Braço','cylinder',skin,[.51*side,1.31,0],[.17,.49,.17],[0,0,13*side]),
      part('Perna','cylinder','#394775',[.19*side,.62,0],[.28,.61,.29]),
      part('Sapato','sphere','#e8ebf6',[.19*side,.24,.12],[.27,.17,.39]),
    );
  }
  return pieces;
}

export async function imageRelief(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5_000_000) {
    throw new Error('Use uma imagem PNG, JPEG ou WebP de até 5 MB.');
  }
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Não foi possível abrir esta imagem.'); }
  const w = Math.max(2, Math.round(72 * bitmap.width / Math.max(bitmap.width,bitmap.height)));
  const h = Math.max(2, Math.round(72 * bitmap.height / Math.max(bitmap.width,bitmap.height)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap,0,0,w,h);
  bitmap.close();
  const pixels = context.getImageData(0,0,w,h).data;
  const lines = ['o Relevo'];
  const point = (x,y) => y*w+x+1;
  const plane = w*h;
  const size = Math.max(w,h);
  for (const back of [false,true]) for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const i = (point(x,y)-1)*4;
    const luminance = (pixels[i]*.2126 + pixels[i+1]*.7152 + pixels[i+2]*.0722)/255;
    const depth = .08 + (1-luminance)*pixels[i+3]/255*.34;
    lines.push(`v ${(x-(w-1)/2)*2/size} ${((h-1)/2-y)*2/size} ${back ? 0 : depth}`);
  }
  for (let y=0;y<h-1;y++) for (let x=0;x<w-1;x++) {
    const a=point(x,y), b=point(x+1,y), c=point(x+1,y+1), d=point(x,y+1);
    lines.push(`f ${a} ${d} ${c} ${b}`,`f ${a+plane} ${b+plane} ${c+plane} ${d+plane}`);
  }
  const edge = [];
  for (let x=0;x<w;x++) edge.push(point(x,0));
  for (let y=1;y<h;y++) edge.push(point(w-1,y));
  for (let x=w-2;x>=0;x--) edge.push(point(x,h-1));
  for (let y=h-2;y>0;y--) edge.push(point(0,y));
  for (let i=0;i<edge.length;i++) {
    const a=edge[i], b=edge[(i+1)%edge.length];
    lines.push(`f ${a} ${b} ${b+plane} ${a+plane}`);
  }
  return lines.join('\n');
}
