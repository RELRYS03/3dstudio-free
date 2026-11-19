import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = process.env.TRIPOSR_DIR && resolve(process.env.TRIPOSR_DIR);
const extensions = {'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp'};
let busy = false;
export const hasEngine = Boolean(root);

function fail(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function generateMesh(input) {
  if (!hasEngine) throw fail('Motor TripoSR indisponível. Configure TRIPOSR_DIR no servidor.', 503);
  if (busy) throw fail('Já existe uma geração em andamento. Tente novamente em instantes.', 429);
  const extension = Object.hasOwn(extensions,input?.mime) && extensions[input.mime];
  if (!extension || typeof input.data !== 'string' || input.data.length > 6_666_668 ||
      !/^[a-z0-9+/]+={0,2}$/i.test(input.data)) {
    throw fail('Envie uma imagem PNG, JPEG ou WebP de até 5 MB.',400);
  }
  const image = Buffer.from(input.data,'base64');
  const signatures = {
    png: image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    jpg: image.subarray(0,3).equals(Buffer.from([255,216,255])),
    webp: image.toString('ascii',0,4) === 'RIFF' && image.toString('ascii',8,12) === 'WEBP',
  };
  if (!signatures[extension] || image.length > 5_000_000) throw fail('Imagem inválida.',400);
  let job;
  busy = true;
  try {
    job = await mkdtemp(join(tmpdir(),'3dstudio-mesh-'));
    const source = join(job,'reference.'+extension);
    await writeFile(source,image);
    await run(process.env.TRIPOSR_PYTHON || 'python', [
      join(root,'run.py'), source, '--device', process.env.TRIPOSR_DEVICE || 'cpu',
      '--output-dir', job, '--model-save-format', 'obj',
      '--mc-resolution', '128',
    ], { cwd:root, timeout:300_000, maxBuffer:4_000_000 });
    const output = join(job,'0','mesh.obj');
    if ((await stat(output)).size > 5_000_000) throw fail('A malha excede 5 MB.',413);
    return await readFile(output,'utf8');
  } catch (error) {
    if (error.status) throw error;
    console.error('TripoSR falhou:', error.code || error.name);
    throw fail('O motor não conseguiu gerar a malha. Confira a instalação e os recursos do servidor.', 502);
  } finally {
    try { if (job) await rm(job,{recursive:true,force:true}); }
    finally { busy = false; }
  }
}
