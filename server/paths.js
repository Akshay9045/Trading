// Where the server keeps its files: instrument cache, candle history, paper account,
// order brackets. Locally `.cache/` in the project; on Railway set DATA_DIR to the
// mounted volume (e.g. /data) so they survive redeploys.
import path from 'path'

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.cache')

export const dataPath = (...parts) => path.join(DATA_DIR, ...parts)
