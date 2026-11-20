import { copyFile, cp, mkdir, readdir, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'public/document-assets')
await mkdir(output, { recursive: true })
await build({ entryPoints: [path.join(root, 'node_modules/@paddleocr/paddleocr-js/dist/index.mjs')],
  outfile: path.join(output, 'paddle.mjs'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  external: ['fs', 'path', 'crypto'], logLevel: 'warning' })
await copyFile(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), path.join(output, 'pdf.worker.min.mjs'))
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(root, 'node_modules/pdfjs-dist', folder), path.join(output, folder), { recursive: true })
}
await mkdir(path.join(output, 'ort'), { recursive: true })
for (const name of await readdir(path.join(root, 'node_modules/onnxruntime-web/dist'))) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) await copyFile(path.join(root, 'node_modules/onnxruntime-web/dist', name), path.join(output, 'ort', name))
}
const paddleAssets = path.join(root, 'node_modules/@paddleocr/paddleocr-js/dist/assets')
const worker = (await readdir(paddleAssets)).find(name => /^worker-entry-.*\.js$/.test(name))
if (!worker) throw new Error('PaddleOCR worker is missing.')
await copyFile(path.join(paddleAssets, worker), path.join(output, 'ocr-worker.js'))
// Download only official model weights. Documents never leave the local application.
for (const name of ['PP-OCRv6_small_det', 'PP-OCRv6_small_rec']) {
  const target = path.join(output, `${name}.tar`)
  try { await access(target); continue } catch {}
  const url = `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${name}_onnx_infer.tar`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${name}. Retry npm run documents:assets.`)
  const { writeFile, rename } = await import('node:fs/promises')
  await writeFile(target + '.partial', new Uint8Array(await response.arrayBuffer()))
  await rename(target + '.partial', target)
}
console.log('PDF and PaddleOCR assets are ready.')
