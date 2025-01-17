import path from 'node:path'
import type { Plugin } from 'vite'
import type { SourceMapInput } from 'rollup'
import MagicString from 'magic-string'
import { cleanUrl, parseRequest } from '../utils'

const nodeWorkerAssetUrlRE = /__VITE_NODE_WORKER_ASSET__([a-z\d]{8})__/g

/**
 * Resolve `?nodeWorker` import and automatically generate `Worker` wrapper.
 */
export default function workerPlugin(): Plugin {
  let sourcemap: boolean | 'inline' | 'hidden' = false
  return {
    name: 'vite:node-worker',
    apply: 'build',
    enforce: 'pre',
    configResolved(config): void {
      sourcemap = config.build.sourcemap
    },
    resolveId(id, importer): string | void {
      const query = parseRequest(id)
      if (query && typeof query.nodeWorker === 'string') {
        return id + `&importer=${importer}`
      }
    },
    load(id): string | void {
      const query = parseRequest(id)
      if (query && typeof query.nodeWorker === 'string' && typeof query.importer === 'string') {
        const cleanPath = cleanUrl(id)
        const hash = this.emitFile({
          type: 'chunk',
          id: cleanPath,
          importer: query.importer
        })
        const assetRefId = `__VITE_NODE_WORKER_ASSET__${hash}__`
        return `
        import { Worker } from 'node:worker_threads';
        export default function (options) { return new Worker(require.resolve(${assetRefId}), options); }`
      }
    },
    renderChunk(code, chunk): { code: string; map: SourceMapInput } | null {
      if (code.match(nodeWorkerAssetUrlRE)) {
        let match: RegExpExecArray | null
        const s = new MagicString(code)

        while ((match = nodeWorkerAssetUrlRE.exec(code))) {
          const [full, hash] = match
          const filename = this.getFileName(hash)
          let outputFilepath = path.posix.relative(path.dirname(chunk.fileName), filename)
          if (!outputFilepath.startsWith('.')) {
            outputFilepath = './' + outputFilepath
          }
          const replacement = JSON.stringify(outputFilepath)
          s.overwrite(match.index, match.index + full.length, replacement, {
            contentOnly: true
          })
        }

        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: true }) : null
        }
      }

      return null
    }
  }
}
