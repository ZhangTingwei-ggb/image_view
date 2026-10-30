const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
])

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateGeometry(geometry, featureIndex = 0) {
  if (!isPlainObject(geometry)) {
    throw new Error(`第 ${featureIndex + 1} 个 Feature 缺少有效的 geometry`)
  }
  if (!GEOMETRY_TYPES.has(geometry.type)) {
    throw new Error(`不支持的 GeoJSON 几何类型：${geometry.type || '未知'}`)
  }
  if (geometry.type === 'GeometryCollection' && !Array.isArray(geometry.geometries)) {
    throw new Error(`第 ${featureIndex + 1} 个 GeometryCollection 缺少 geometries`)
  }
}

/**
 * Normalize bare geometry / Feature / FeatureCollection inputs into a
 * FeatureCollection while preserving properties and foreign members.
 */
export function normalizeGeoJSON(input) {
  if (!isPlainObject(input)) {
    throw new Error('GeoJSON 根节点必须是一个对象')
  }

  let featureCollection

  if (input.type === 'FeatureCollection') {
    if (!Array.isArray(input.features)) {
      throw new Error('FeatureCollection 缺少 features 数组')
    }
    input.features.forEach((feature, index) => {
      if (!isPlainObject(feature) || feature.type !== 'Feature') {
        throw new Error(`features[${index}] 不是合法的 GeoJSON Feature`)
      }
      if (feature.geometry !== null) validateGeometry(feature.geometry, index)
    })
    featureCollection = { ...input, features: input.features }
  } else if (input.type === 'Feature') {
    if (input.geometry !== null) validateGeometry(input.geometry)
    featureCollection = {
      type: 'FeatureCollection',
      features: [input],
    }
  } else if (GEOMETRY_TYPES.has(input.type)) {
    validateGeometry(input)
    featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: input,
        },
      ],
    }
  } else {
    throw new Error('不是可识别的 GeoJSON（需要 FeatureCollection、Feature 或 Geometry）')
  }

  return featureCollection
}

export function countGeoJSONFeatures(data) {
  return Array.isArray(data?.features) ? data.features.length : 0
}

function walkPositions(coordinates, visitor) {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    visitor(coordinates)
    return
  }
  coordinates.forEach((child) => walkPositions(child, visitor))
}

function walkGeometry(geometry, visitor) {
  if (!geometry) return
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries?.forEach((child) => walkGeometry(child, visitor))
    return
  }
  walkPositions(geometry.coordinates, visitor)
}

export function getGeoJSONBounds(data) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }

  data?.features?.forEach((feature) => {
    walkGeometry(feature.geometry, ([x, y]) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      bounds.minX = Math.min(bounds.minX, x)
      bounds.minY = Math.min(bounds.minY, y)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.maxY = Math.max(bounds.maxY, y)
    })
  })

  if (!Number.isFinite(bounds.minX)) return null
  return bounds
}

function shiftCoordinates(coordinates, offsetX, offsetY) {
  if (!Array.isArray(coordinates)) return coordinates
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return [
      coordinates[0] + offsetX,
      coordinates[1] + offsetY,
      ...coordinates.slice(2),
    ]
  }
  return coordinates.map((child) => shiftCoordinates(child, offsetX, offsetY))
}

function shiftGeometry(geometry, offsetX, offsetY) {
  if (!geometry) return geometry
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries?.map((child) =>
        shiftGeometry(child, offsetX, offsetY),
      ),
    }
  }
  return {
    ...geometry,
    coordinates: shiftCoordinates(geometry.coordinates, offsetX, offsetY),
  }
}

/**
 * Return a deep-copied GeoJSON with all positions shifted by offsetX / offsetY.
 * The coordinate space is the source image pixel space; export this shape
 * directly so the downloaded file keeps the original coordinate convention.
 */
export function translateGeoJSON(data, offsetX = 0, offsetY = 0) {
  if (!data) return null
  const clone =
    typeof structuredClone === 'function'
      ? structuredClone(data)
      : JSON.parse(JSON.stringify(data))

  const x = Number(offsetX) || 0
  const y = Number(offsetY) || 0

  return {
    ...clone,
    features: clone.features?.map((feature) => ({
      ...feature,
      geometry: shiftGeometry(feature.geometry, x, y),
    })),
  }
}

/**
 * Convert source-image coordinates to Leaflet GeoJSON [lng, lat] coordinates.
 * Pathology annotations use a top-left origin with y growing downward; Leaflet
 * CRS.Simple uses y growing upward, so every y is flipped exactly once here:
 *
 *   leafletLat = imageHeight - imageY
 */
export function toLeafletGeoJSON(
  data,
  { offsetX = 0, offsetY = 0, imageHeight = 0 } = {},
) {
  const translated = translateGeoJSON(data, offsetX, offsetY)
  if (!translated) return translated

  const flipGeometry = (geometry) => {
    if (!geometry) return geometry
    if (geometry.type === 'GeometryCollection') {
      return {
        ...geometry,
        geometries: geometry.geometries?.map(flipGeometry),
      }
    }

    const flipPosition = (position) => {
      if (!Array.isArray(position)) return position
      if (typeof position[0] === 'number' && typeof position[1] === 'number') {
        return [position[0], imageHeight - position[1], ...position.slice(2)]
      }
      return position.map(flipPosition)
    }

    return {
      ...geometry,
      coordinates: flipPosition(geometry.coordinates),
    }
  }

  return {
    ...translated,
    features: translated.features?.map((feature) => ({
      ...feature,
      geometry: flipGeometry(feature.geometry),
    })),
  }
}

export function cloneGeoJSON(data) {
  if (!data) return null
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : JSON.parse(JSON.stringify(data))
}

export function ensureGeoJSONExtension(fileName = 'annotations.geojson') {
  return /\.geojson$/i.test(fileName) ? fileName : `${fileName.replace(/\.[^.]+$/, '')}.geojson`
}

export function getRegisteredFileName(fileName = 'annotations.geojson') {
  const base = ensureGeoJSONExtension(fileName).replace(/\.geojson$/i, '')
  return `${base}_registered.geojson`
}

export function downloadGeoJSON(data, fileName, offsetX = 0, offsetY = 0) {
  const translated = translateGeoJSON(data, offsetX, offsetY)
  if (!translated) throw new Error('当前病例没有可导出的 GeoJSON 标注')

  const outputName = getRegisteredFileName(fileName)
  const serialized = JSON.stringify(translated, null, 2)
  const blob = new Blob([serialized], { type: 'application/geo+json;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = outputName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
  return outputName
}
