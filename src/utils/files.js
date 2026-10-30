import {
  getExtension,
  getBaseName,
  getStem,
  getDirectory,
  detectRole,
  getAnnotationSide,
  FILE_ROLE,
} from './grouping'
import { normalizeGeoJSON } from './geojson'

const SUPPORTED_EXTENSIONS = new Set(['tif', 'geojson'])
const SIDE_TOKEN = '(h\\s*&\\s*e|h_e|hes|he|ihc)'
const IMAGE_ROLE_SEGMENT = new RegExp(
  `^(?:images?[_.-]?)?${SIDE_TOKEN}(?:[_.-]?(?:all|images?|tiles?|wsi|raw))?$`,
  'i',
)
const ANNOTATION_SIDE_SEGMENT = new RegExp(
  `^${SIDE_TOKEN}(?:[_.-]?(?:geo|geojson|annotations?|rois?))?(?:[_.-]?all)?$`,
  'i',
)
const REVERSED_ANNOTATION_SIDE_SEGMENT = new RegExp(
  `^(?:geo|geojson|annotations?|rois?)[_.-]?${SIDE_TOKEN}(?:[_.-]?all)?$`,
  'i',
)
const sideOf = (token) => (/^ihc/i.test(token) ? FILE_ROLE.IHC : FILE_ROLE.HE)

export function isSupportedFile(file) {
  return SUPPORTED_EXTENSIONS.has(getExtension(file?.name || ''))
}

export function getDatasetFolderName(files) {
  const relativePath = files.find((file) => file.webkitRelativePath)?.webkitRelativePath
  if (relativePath) return relativePath.split('/')[0]
  return '本地切片数据集'
}

function pathSegments(filePath = '') {
  return String(filePath)
    .split(/[\\/]/)
    .filter(Boolean)
}

/** Role from the nearest explicit he/ or ihc/ directory, then filename. */
export function inferImageRole(file) {
  const dirs = pathSegments(file.webkitRelativePath || file.name).slice(0, -1)
  for (let index = dirs.length - 1; index >= 0; index -= 1) {
    const segment = dirs[index]
    const match = segment.match(IMAGE_ROLE_SEGMENT)
    if (match) return sideOf(match[1])
  }
  return detectRole(file.name)
}

/** Detect whether a GeoJSON belongs to the HE or IHC side. */
export function inferAnnotationSide(file) {
  const relativePath = file.webkitRelativePath || file.name
  const segments = pathSegments(relativePath)
  const dirs = segments.slice(0, -1)

  for (let index = dirs.length - 1; index >= 0; index -= 1) {
    const segment = dirs[index]
    const direct = segment.match(ANNOTATION_SIDE_SEGMENT)
    if (direct) return sideOf(direct[1])
    const reversed = segment.match(REVERSED_ANNOTATION_SIDE_SEGMENT)
    if (reversed) return sideOf(reversed[1])
  }

  // Filenames such as "…_mpp0.5_HE.geojson" or "…_IHC_HER2.geojson".
  const filenameSide = getAnnotationSide(file.name)
  if (filenameSide) return filenameSide

  const stem = getStem(file.name)
  if (/[_\-.\s]ihc$/i.test(stem)) return FILE_ROLE.IHC
  if (/[_\-.\s](h\s*&\s*e|h_e|hes|he)$/i.test(stem)) return FILE_ROLE.HE
  if (/^ihc[_\-.\s]/i.test(stem)) return FILE_ROLE.IHC
  if (/^(h\s*&\s*e|h_e|hes|he)[_\-.\s]/i.test(stem)) return FILE_ROLE.HE
  return null
}

function makeId(file, index, role, path) {
  return `${index}-${role}-${path}-${file.size}`
}

function makePreparedFile(
  file,
  index,
  role,
  annotationSide = null,
  path = file.webkitRelativePath || file.name,
) {
  return {
    id: makeId(file, index, role, path),
    name: file.name,
    path,
    size: file.size,
    role,
    annotationSide: role === FILE_ROLE.GEOJSON ? annotationSide : null,
    image: null,
    geojson: null,
    error: null,
    file,
  }
}

function normalizeEntry(entry) {
  if (typeof File !== 'undefined' && entry instanceof File) {
    return { file: entry }
  }
  return entry
}

/**
 * Scan a folder's FileList or an array of explicit { file, role, annotationSide }
 * entries. Image decoding and GeoJSON parsing are intentionally deferred until
 * a case is opened, which keeps large tiled datasets responsive.
 */
export async function prepareFiles(fileList, { onProgress } = {}) {
  const entries = Array.from(fileList || [])
    .map(normalizeEntry)
    .filter((entry) => entry?.file && isSupportedFile(entry.file))
    .sort((a, b) =>
      (a.path || a.file.webkitRelativePath || a.file.name).localeCompare(
        b.path || b.file.webkitRelativePath || b.file.name,
        'zh-CN',
        { numeric: true },
      ),
    )

  const files = []
  const errors = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const file = entry.file
    const extension = getExtension(file.name)
    const inferredRole =
      extension === 'geojson' ? FILE_ROLE.GEOJSON : inferImageRole(file)
    const role = entry.role || inferredRole
    const annotationSide =
      role === FILE_ROLE.GEOJSON
        ? entry.annotationSide || inferAnnotationSide(file)
        : null

    const path =
      entry.path || file.webkitRelativePath || file.name
    const record = makePreparedFile(
      file,
      index,
      role,
      annotationSide,
      path,
    )
    files.push(record)

    onProgress?.({
      processed: index + 1,
      total: entries.length,
      fileName: file.name,
      stage:
        role === FILE_ROLE.GEOJSON
          ? '正在整理标测数据'
          : '正在整理切片目录',
    })

    // Yield once per file so the import progress UI can repaint.
    if (index % 8 === 7) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return { files, errors }
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('无法生成切片预览图像'))),
      'image/png',
    )
  })
}

function fillImageData(raster, width, height) {
  const pixelCount = width * height
  const channels = raster.length / Math.max(1, pixelCount)
  const rgba = new Uint8ClampedArray(pixelCount * 4)

  if (channels >= 4) {
    rgba.set(raster.subarray(0, pixelCount * 4))
    return rgba
  }

  if (channels >= 3) {
    for (let index = 0; index < pixelCount; index += 1) {
      const source = index * channels
      const target = index * 4
      rgba[target] = raster[source]
      rgba[target + 1] = raster[source + 1]
      rgba[target + 2] = raster[source + 2]
      rgba[target + 3] = 255
    }
    return rgba
  }

  for (let index = 0; index < pixelCount; index += 1) {
    const value = raster[index * channels]
    const target = index * 4
    rgba[target] = value
    rgba[target + 1] = value
    rgba[target + 2] = value
    rgba[target + 3] = 255
  }
  return rgba
}

async function decodeWithGeoTIFF(file) {
  const { fromArrayBuffer } = await import('geotiff')
  const buffer = await file.arrayBuffer()
  const tiff = await fromArrayBuffer(buffer)
  const frameCount = await tiff.getImageCount()

  let image = null
  let largestArea = -1
  for (let index = 0; index < frameCount; index += 1) {
    const candidate = await tiff.getImage(index)
    const area = candidate.getWidth() * candidate.getHeight()
    if (area > largestArea) {
      image = candidate
      largestArea = area
    }
  }

  if (!image) throw new Error('TIFF 中没有可读取的图像帧')

  const width = image.getWidth()
  const height = image.getHeight()
  if (!width || !height) throw new Error('TIFF 图像尺寸无效')

  // Very large single-frame images get a resampled data URL. The GeoJSON world
  // space still uses the original dimensions instead of the preview size.
  const MAX_PREVIEW_EDGE = 6000
  const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height))
  const previewWidth = Math.max(1, Math.round(width * scale))
  const previewHeight = Math.max(1, Math.round(height * scale))
  const raster = await image.readRGB({
    interleave: true,
    width: previewWidth,
    height: previewHeight,
    resampleMethod: 'bilinear',
  })

  if (!raster?.length) throw new Error('TIFF 像素数据为空')

  const rgba = fillImageData(raster, previewWidth, previewHeight)
  const canvas = document.createElement('canvas')
  canvas.width = previewWidth
  canvas.height = previewHeight

  try {
    const context = canvas.getContext('2d', { alpha: false })
    context.putImageData(
      new ImageData(rgba, previewWidth, previewHeight),
      0,
      0,
    )
    const blob = await canvasToBlob(canvas)
    return {
      url: URL.createObjectURL(blob),
      width,
      height,
      previewWidth,
      previewHeight,
      frameCount,
      isPreview: previewWidth !== width || previewHeight !== height,
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

async function decodeWithUTIF(file) {
  const UTIFModule = await import('utif')
  const UTIF = UTIFModule.default || UTIFModule
  const buffer = await file.arrayBuffer()
  const ifds = UTIF.decode(buffer)

  if (!ifds?.length) throw new Error('TIFF 中没有可读取的图像帧')

  const ifd = ifds.reduce((largest, candidate) => {
    const area = (candidate.width || 0) * (candidate.height || 0)
    const largestArea = (largest.width || 0) * (largest.height || 0)
    return area > largestArea ? candidate : largest
  }, ifds[0])

  UTIF.decodeImage(buffer, ifd)
  const rgba = UTIF.toRGBA8(ifd)
  const width = ifd.width
  const height = ifd.height
  if (!rgba?.length || !width || !height) {
    throw new Error('TIFF 图像帧解码失败或尺寸无效')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  try {
    const context = canvas.getContext('2d', { alpha: false })
    context.putImageData(
      new ImageData(new Uint8ClampedArray(rgba), width, height),
      0,
      0,
    )
    const blob = await canvasToBlob(canvas)
    return {
      url: URL.createObjectURL(blob),
      width,
      height,
      previewWidth: width,
      previewHeight: height,
      frameCount: ifds.length,
      isPreview: false,
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** Decode a TIFF (including BigTIFF) into a browser-displayable object URL. */
export async function decodeTiffFile(file) {
  let primaryError
  try {
    return await decodeWithGeoTIFF(file)
  } catch (error) {
    primaryError = error
  }

  try {
    return await decodeWithUTIF(file)
  } catch (fallbackError) {
    const primaryMessage =
      primaryError instanceof Error ? primaryError.message : String(primaryError)
    throw new Error(`TIFF 解码失败：${primaryMessage}`)
  }
}

/** Parse one GeoJSON file on demand. */
export async function parseGeoJSONFile(file) {
  const text = await file.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`GeoJSON 语法错误：${error.message}`)
  }
  return normalizeGeoJSON(parsed)
}

export function describeFile(file) {
  if (!file) return ''
  return getBaseName(file.path) || getBaseName(file.name)
}

export { FILE_ROLE, getDirectory }
