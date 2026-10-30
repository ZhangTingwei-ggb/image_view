import { getExtension, FILE_ROLE } from './grouping'
import { inferAnnotationSide, inferImageRole } from './files'

export const IMPORT_SLOT_KEYS = {
  HE_IMAGES: 'heImages',
  HE_GEOJSON: 'heGeojson',
  IHC_IMAGES: 'ihcImages',
  IHC_GEOJSON: 'ihcGeojson',
}

async function readFileEntry(entry, path) {
  const file = await new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
  return [{ file, path }]
}

async function walkEntry(entry, prefix, output) {
  if (!entry) return
  const path = `${prefix}${entry.name}`
  if (entry.isFile) {
    output.push(...(await readFileEntry(entry, path)))
    return
  }
  if (!entry.isDirectory) return

  const reader = entry.createReader()
  while (true) {
    const batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (!batch.length) break
    for (const child of batch) {
      await walkEntry(child, `${path}/`, output)
    }
  }
}

/**
 * Read files and directories from a drop event. Paths are kept relative to the
 * dragged top-level item so the import dialog can preserve case folders.
 */
export async function collectDroppedEntries(dataTransfer) {
  const items = Array.from(dataTransfer?.items || [])
  const flattenedFiles = Array.from(dataTransfer?.files || [])
  const output = []
  const supportsEntries = items.some(
    (item) => typeof item.webkitGetAsEntry === 'function',
  )
  // DataTransfer may be invalidated once the drop handler yields. Capture all
  // entries synchronously before traversing any of them asynchronously.
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => (supportsEntries ? item.webkitGetAsEntry?.() : null))

  if (supportsEntries) {
    for (const entry of entries) {
      if (!entry) continue
      await walkEntry(entry, '', output)
    }
  }

  // Some browsers expose webkitGetAsEntry but return null for synthetic or
  // inaccessible items. Fall back to the flattened FileList.
  if (!output.length) {
    flattenedFiles.forEach((file) => {
      output.push({
        file,
        path: file.webkitRelativePath || file.name,
      })
    })
  }

  const seen = new Set()
  return output.filter((entry) => {
    const key = `${entry.path}:${entry.file.size}:${entry.file.lastModified}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function classifyImportEntry(entry) {
  const file = entry?.file
  if (!file) return null
  const path = entry.path || file.webkitRelativePath || file.name
  const extension = getExtension(file.name)
  const pathAwareFile = {
    name: file.name,
    webkitRelativePath: path,
  }

  if (extension === 'geojson') {
    const side = inferAnnotationSide(pathAwareFile)
    if (side === FILE_ROLE.HE) return IMPORT_SLOT_KEYS.HE_GEOJSON
    if (side === FILE_ROLE.IHC) return IMPORT_SLOT_KEYS.IHC_GEOJSON
    return null
  }

  if (extension === 'tif') {
    const role = inferImageRole(pathAwareFile)
    if (role === FILE_ROLE.HE) return IMPORT_SLOT_KEYS.HE_IMAGES
    if (role === FILE_ROLE.IHC) return IMPORT_SLOT_KEYS.IHC_IMAGES
    return null
  }

  return null
}

export function splitEntriesByRole(entries) {
  const slots = Object.fromEntries(
    Object.values(IMPORT_SLOT_KEYS).map((key) => [key, []]),
  )
  const unclassified = []

  entries.forEach((entry) => {
    const key = classifyImportEntry(entry)
    if (key) slots[key].push(entry)
    else unclassified.push(entry)
  })

  return { slots, unclassified }
}

export function getSelectionLabel(entries = []) {
  if (!entries.length) return ''
  const dirs = entries.map((entry) =>
    String(entry.path || entry.file?.name || '')
      .split('/')
      .slice(0, -1),
  )
  let common = dirs[0] || []
  for (let index = 1; index < dirs.length; index += 1) {
    let cursor = 0
    while (
      cursor < common.length &&
      cursor < dirs[index].length &&
      common[cursor] === dirs[index][cursor]
    ) {
      cursor += 1
    }
    common = common.slice(0, cursor)
    if (!common.length) break
  }
  if (common.length) return common[common.length - 1]
  const firstDir = dirs[0] || []
  if (firstDir.length) return firstDir[firstDir.length - 1]
  return entries.length === 1 ? entries[0].file?.name || '单文件' : '多个文件'
}
