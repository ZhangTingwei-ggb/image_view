/**
 * File-name matching & case grouping.
 *
 * The matcher is deliberately deterministic and inspectable:
 * 1. HE / IHC modality words and assay markers (HER2 / KI67 / ER / PR) are
 *    removed from the stem, along with the tile suffix.
 * 2. Files sharing the same "case root + cx/cy" tile identity are paired first.
 * 3. Remaining files fall back to longest-common-prefix and numeric signature.
 * 4. GeoJSON files are attached by exact tile identity first, then by score;
 *    a group can own one HE annotation and one IHC annotation.
 */

const IMAGE_EXTENSIONS = /\.(tiff?|tif)$/i
const GEOJSON_EXTENSIONS = /\.(geojson|json)$/i
const MODALITY_MARKER =
  /(^|[\s._-])(?:h\s*&\s*e|h_e|hes|he|ihc)(?:[\s._-]+tile)?(?=$|[\s._-])/gi
const TILE_POSITION = /cx(-?\d+)[\s._-]*cy(-?\d+)/i
// Assay / marker suffixes such as _HER2, _KI67, _ER, _PR carry digits that are
// unrelated to the case or tile number. Strip them before comparing filenames,
// otherwise "…_IHC_tile_HER2" can never pair with "…_he_tile".
const ASSAY_MARKER =
  /(^|[\s._-])(?:her[\s._-]*2|ki[\s._-]*67|pd[\s._-]*l[\s._-]*1|erbb2|egfr|ck\d+(?:[\/-]\d+)?|p53|p40|p63|er|pr|ar)(?=$|[\s._-])/gi
const TILE_ROOT =
  /^(.*?)[\s._-]*(?:(?:h\s*&\s*e|h_e|hes|he|ihc)[\s._-]*)?tile[\s._-]*cx-?\d+[\s._-]*cy-?\d+/i
const ANNOTATION_SIDE_IHC = /(^|[\s._-])ihc(?=$|[\s._-])/i
const ANNOTATION_SIDE_HE = /(^|[\s._-])(h\s*&\s*e|h_e|hes|he)(?=$|[\s._-])/i

export const FILE_ROLE = {
  HE: 'he',
  IHC: 'ihc',
  GEOJSON: 'geojson',
  UNKNOWN: 'unknown',
}

export function getExtension(path = '') {
  const match = String(path).match(IMAGE_EXTENSIONS) || String(path).match(GEOJSON_EXTENSIONS)
  return match ? match[1].toLowerCase().replace('tiff', 'tif') : ''
}

export function getBaseName(path = '') {
  return String(path).split(/[\\/]/).pop() || ''
}

export function getStem(path = '') {
  return getBaseName(path).replace(/\.[^.]+$/, '')
}

export function getDirectory(path = '') {
  const parts = String(path).split(/[\\/]/)
  parts.pop()
  return parts.join('/')
}

export function detectRole(fileName = '') {
  if (GEOJSON_EXTENSIONS.test(fileName)) return FILE_ROLE.GEOJSON
  if (!IMAGE_EXTENSIONS.test(fileName)) return FILE_ROLE.UNKNOWN

  const stem = getBaseName(fileName).replace(/\.[^.]+$/, '')
  if (ANNOTATION_SIDE_IHC.test(stem)) return FILE_ROLE.IHC
  if (ANNOTATION_SIDE_HE.test(stem)) return FILE_ROLE.HE
  return FILE_ROLE.UNKNOWN
}

/**
 * Which image side an annotation belongs to, based on its filename.
 * "…_HE.geojson" -> he, "…_IHC_HER2.geojson" -> ihc.
 */
export function getAnnotationSide(fileName = '') {
  const stem = getStem(fileName)
  if (ANNOTATION_SIDE_IHC.test(stem)) return FILE_ROLE.IHC
  if (ANNOTATION_SIDE_HE.test(stem)) return FILE_ROLE.HE
  return null
}

function stripCaseMarkers(value = '') {
  return String(value)
    .replace(MODALITY_MARKER, '$1')
    .replace(ASSAY_MARKER, '$1')
    .replace(/^[\s._-]+|[\s._-]+$/g, '')
    .replace(/[\s._-]{2,}/g, ' ')
    .trim()
}

/**
 * Remove modality words while preserving a human-readable case key.
 * HE_patient01 -> patient01
 * IHC_patient01 -> patient01
 * H&E-patient01 -> patient01
 * 2615446-1_he_tile_cx…_cy… -> 2615446-1
 */
export function getCaseKey(fileName = '') {
  const stem = getStem(fileName)
  const tileMatch = stem.match(TILE_ROOT)
  const base = tileMatch && tileMatch[1] ? tileMatch[1] : stem
  return stripCaseMarkers(base) || stem
}

/** Case root without the tile coordinates, e.g. "2615446-1". */
export function getCaseRootKey(fileName = '') {
  return getCaseKey(fileName)
}

/**
 * Stable identity of a tile: case root + coordinates.
 * Returns null for filenames that do not contain cx/cy coordinates.
 */
export function getTileIdentity(fileOrName) {
  if (!fileOrName) return null
  const fileName =
    typeof fileOrName === 'string' ? fileOrName : fileOrName.name || ''
  const tile = getTilePosition(typeof fileOrName === 'string' ? { name: fileName } : fileOrName)
  if (!tile) return null
  const root = normalizeMatchKey(getCaseKey(fileName))
  return `${root}|${tile.x}|${tile.y}`
}


export function normalizeMatchKey(value = '') {
  // Keep letters/numbers from any script (Chinese case names must still match),
  // while normalizing full-width characters and dropping separators.
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function numericSignature(value = '') {
  return (String(value).normalize('NFKC').match(/\d+/g) || [])
    .map((part) => part.replace(/^0+(?=\d)/, ''))
    .join('|')
}

/** Longest common prefix of an arbitrary number of strings. */
export function longestCommonPrefix(strings = []) {
  if (!strings.length) return ''
  const values = strings.map((value) => String(value ?? ''))
  let prefix = values[0]
  for (let i = 1; i < values.length; i += 1) {
    const current = values[i]
    let cursor = 0
    while (cursor < prefix.length && cursor < current.length && prefix[cursor] === current[cursor]) {
      cursor += 1
    }
    prefix = prefix.slice(0, cursor)
    if (!prefix) break
  }
  return prefix
}

function compatibilityScore(heFile, ihcFile) {
  const heKey = normalizeMatchKey(getCaseKey(heFile.name))
  const ihcKey = normalizeMatchKey(getCaseKey(ihcFile.name))
  if (!heKey || !ihcKey) return -100

  // When both sides carry tile coordinates, the same case root with different
  // tile positions must never be paired. Exact tile identity is handled before
  // this scorer; this guard protects the similarity fallback.
  const heTile = getTilePosition(heFile)
  const ihcTile = getTilePosition(ihcFile)
  if (heTile && ihcTile) {
    const sameTile = heTile.x === ihcTile.x && heTile.y === ihcTile.y
    if (!sameTile && heKey === ihcKey) return -100
  }

  const shared = longestCommonPrefix([heKey, ihcKey]).length
  const minLength = Math.min(heKey.length, ihcKey.length)
  const numericA = numericSignature(heKey)
  const numericB = numericSignature(ihcKey)
  const bothNumeric = Boolean(numericA && numericB)
  const numbersDisagree = bothNumeric && numericA !== numericB

  if (numbersDisagree) return -100
  const exact = heKey === ihcKey
  const contained = heKey.includes(ihcKey) || ihcKey.includes(heKey)
  const strongPrefix = shared >= Math.max(3, Math.ceil(minLength * 0.6))

  if (!exact && !contained && !strongPrefix && !(bothNumeric && shared >= 2)) {
    return -100
  }

  let score = shared * 4
  score += (shared / Math.max(1, minLength)) * 24
  if (exact) score += 80
  if (contained) score += 20
  if (bothNumeric && numericA === numericB) score += 36
  if (heTile && ihcTile && heTile.x === ihcTile.x && heTile.y === ihcTile.y) {
    score += 120
  }
  if (getDirectory(heFile.path) === getDirectory(ihcFile.path)) score += 9

  return score
}

function getTilePosition(file) {
  if (!file) return null
  const match = `${getStem(file.name)} ${file.path || ''}`.match(TILE_POSITION)
  return match ? { x: match[1], y: match[2] } : null
}

function geojsonCompatibilityScore(group, geojsonFile, side) {
  const geoKey = normalizeMatchKey(getCaseKey(geojsonFile.name))
  if (!geoKey) return -100

  const targetImage = group[side]
  const geoTile = getTilePosition(geojsonFile)
  const imageTile = getTilePosition(targetImage)

  // Same case root but another tile: reject outright so an annotation can
  // never drift onto a neighbouring slice.
  if (
    geoTile &&
    imageTile &&
    (geoTile.x !== imageTile.x || geoTile.y !== imageTile.y)
  ) {
    return -100
  }

  const candidateKeys = [
    targetImage ? getCaseKey(targetImage.name) : '',
    group.fullLabel,
  ]
    .map(normalizeMatchKey)
    .filter(Boolean)

  const geoNumbers = numericSignature(geoKey)
  let best = -100

  candidateKeys.forEach((candidate) => {
    const shared = longestCommonPrefix([candidate, geoKey]).length
    const maxLength = Math.max(candidate.length, geoKey.length)
    const minLength = Math.min(candidate.length, geoKey.length)
    const candidateNumbers = numericSignature(candidate)
    const bothNumeric = Boolean(candidateNumbers && geoNumbers)
    const numbersMatch = bothNumeric && candidateNumbers === geoNumbers
    const numbersClash = bothNumeric && candidateNumbers !== geoNumbers

    let score = shared * 4
    score += (shared / Math.max(1, maxLength)) * 18
    score += (shared / Math.max(1, minLength)) * 10
    if (candidate === geoKey) score += 100
    if (candidate.includes(geoKey) || geoKey.includes(candidate)) score += 18
    if (numbersMatch) score += 42
    if (numbersClash) score -= 36

    if (
      geoTile &&
      imageTile &&
      geoTile.x === imageTile.x &&
      geoTile.y === imageTile.y
    ) {
      score += 110
    }

    if ((group.folderPath || '') === getDirectory(geojsonFile.path)) score += 6
    best = Math.max(best, score)
  })

  return best
}

function combinationLabel(group) {
  const keys = [group.he, group.ihc]
    .filter(Boolean)
    .map((file) => getCaseKey(file.name))
    .filter(Boolean)

  if (!keys.length) return group.he?.name || group.ihc?.name || '未命名病例'
  if (keys.length === 1) return keys[0]
  if (keys[0].toLowerCase() === keys[1].toLowerCase()) return keys[0]

  const commonLength = longestCommonPrefix(
    keys.map((key) => key.toLowerCase()),
  ).length
  const common = keys[0].slice(0, commonLength).replace(/[\s._-]+$/g, '')
  return common.length >= 2 ? common : `${keys[0]} / ${keys[1]}`
}

function tileAwareLabel(group, fullLabel) {
  const image = group.he || group.ihc
  const tile = getTilePosition(image)
  if (!tile) return fullLabel

  const root = getCaseKey(image?.name) || fullLabel
  return `${root} · ${tile.x} / ${tile.y}`
}

function makeGroupId(file, index = 0) {
  const signature = `${file?.path || file?.name || 'case'}-${index}`
  let hash = 0
  for (let i = 0; i < signature.length; i += 1) {
    hash = (hash << 5) - hash + signature.charCodeAt(i)
    hash |= 0
  }
  return `case-${Math.abs(hash).toString(36)}-${index}`
}

function buildGroup(he, ihc, index) {
  const baseGroup = {
    id: makeGroupId(he || ihc, index),
    label: '',
    he: he || null,
    ihc: ihc || null,
    geojson: null,
    heGeojson: null,
    ihcGeojson: null,
    annotations: { he: null, ihc: null },
    files: [he, ihc].filter(Boolean),
    folderPath: getDirectory((he || ihc)?.path || ''),
    matchKind: he && ihc ? 'pair' : 'single',
    matchScore: 0,
  }
  baseGroup.fullLabel = combinationLabel(baseGroup)
  baseGroup.label = tileAwareLabel(baseGroup, baseGroup.fullLabel)
  return baseGroup
}

/**
 * Group prepared file records into HE / IHC / GeoJSON cases.
 * Records need at least: { id, name, path, role }.
 */
export function groupFiles(files = [], { forceSingleGroup = false } = {}) {
  const images = files.filter(
    (file) => file.role === FILE_ROLE.HE || file.role === FILE_ROLE.IHC,
  )
  const geojsonFiles = files.filter((file) => file.role === FILE_ROLE.GEOJSON)
  const heFiles = images.filter((file) => file.role === FILE_ROLE.HE)
  const ihcFiles = images.filter((file) => file.role === FILE_ROLE.IHC)
  const manualSingle =
    forceSingleGroup && heFiles.length === 1 && ihcFiles.length === 1

  const usedHe = new Set()
  const usedIhc = new Set()
  const groups = []

  if (manualSingle) {
    const group = buildGroup(heFiles[0], ihcFiles[0], 0)
    group.matchKind = 'manual'
    group.matchScore = 100
    groups.push(group)
    usedHe.add(heFiles[0].id)
    usedIhc.add(ihcFiles[0].id)
  } else {
    // Pass 1: exact tile identity (case root + cx/cy). For tiled datasets this
    // is unambiguous and must win over fuzzy filename similarity.
    const ihcByTile = new Map()
    ihcFiles.forEach((ihc) => {
      const tile = getTileIdentity(ihc)
      if (!tile) return
      if (!ihcByTile.has(tile)) ihcByTile.set(tile, [])
      ihcByTile.get(tile).push(ihc)
    })

    heFiles.forEach((he) => {
      const tile = getTileIdentity(he)
      if (!tile) return
      const candidates = ihcByTile.get(tile)
      if (!candidates?.length) return
      const ihc = candidates.find((file) => !usedIhc.has(file.id))
      if (!ihc) return
      usedHe.add(he.id)
      usedIhc.add(ihc.id)
      const group = buildGroup(he, ihc, groups.length)
      group.matchKind = 'tile'
      group.matchScore = 200
      groups.push(group)
    })

    // Pass 2: similarity fallback for files without a shared tile key.
    const pairCandidates = []
    heFiles.forEach((he) => {
      if (usedHe.has(he.id)) return
      ihcFiles.forEach((ihc) => {
        if (usedIhc.has(ihc.id)) return
        const score = compatibilityScore(he, ihc)
        if (score > 0) pairCandidates.push({ he, ihc, score })
      })
    })
    pairCandidates.sort((a, b) => b.score - a.score)

    pairCandidates.forEach(({ he, ihc, score }) => {
      if (usedHe.has(he.id) || usedIhc.has(ihc.id)) return
      usedHe.add(he.id)
      usedIhc.add(ihc.id)
      const group = buildGroup(he, ihc, groups.length)
      group.matchScore = score
      groups.push(group)
    })
  }

  heFiles.forEach((he) => {
    if (usedHe.has(he.id)) return
    usedHe.add(he.id)
    groups.push(buildGroup(he, null, groups.length))
  })

  ihcFiles.forEach((ihc) => {
    if (usedIhc.has(ihc.id)) return
    usedIhc.add(ihc.id)
    groups.push(buildGroup(null, ihc, groups.length))
  })

  const assignedGeo = new Set()

  if (manualSingle) {
    // In manual four-file mode, filenames do not need to share a prefix.
    // Respect explicit sides; otherwise fill IHC first, then HE.
    const group = groups[0]
    geojsonFiles.forEach((geo) => {
      let side = geo.annotationSide
      if (!side) {
        if (!group.annotations[FILE_ROLE.IHC]) side = FILE_ROLE.IHC
        else if (!group.annotations[FILE_ROLE.HE]) side = FILE_ROLE.HE
      }
      if (!side || !group[side] || group.annotations[side]) return
      group.annotations[side] = geo
      group[`${side}Geojson`] = geo
      group.files.push(geo)
      group.geojsonScore = 100
      assignedGeo.add(geo.id)
    })
  } else {
    // Pair GeoJSON files to their corresponding side (HE or IHC). A group can
    // own one annotation per side, e.g. HE GeoJSON + IHC GeoJSON.
    const groupsBySideTile = new Map()
    groups.forEach((group) => {
      ;[FILE_ROLE.HE, FILE_ROLE.IHC].forEach((side) => {
        const tile = getTileIdentity(group[side])
        if (!tile) return
        const key = `${side}|${tile}`
        if (!groupsBySideTile.has(key)) groupsBySideTile.set(key, [])
        groupsBySideTile.get(key).push(group)
      })
    })

    const assignGeojson = (geo, group, side, score, kind) => {
      if (!group || group.annotations[side] || assignedGeo.has(geo.id)) {
        return false
      }
      if (!group[side] && kind !== 'tile') return false
      assignedGeo.add(geo.id)
      group.annotations[side] = geo
      group.files.push(geo)
      group[`${side}Geojson`] = geo
      group.geojsonScore = Math.max(group.geojsonScore || 0, score)
      group.geojsonMatchKind = {
        ...(group.geojsonMatchKind || {}),
        [side]: kind,
      }
      return true
    }

    // Pass 1: exact tile identity + annotation side.
    geojsonFiles.forEach((geo) => {
      const tile = getTileIdentity(geo)
      if (!tile) return
      const explicitSide =
        geo.annotationSide || getAnnotationSide(geo.name) || null
      const sides = explicitSide
        ? [explicitSide]
        : [FILE_ROLE.IHC, FILE_ROLE.HE]
      sides.forEach((side) => {
        if (assignedGeo.has(geo.id)) return
        const candidates = groupsBySideTile.get(`${side}|${tile}`) || []
        const group = candidates.find(
          (candidate) => candidate[side] && !candidate.annotations[side],
        )
        if (group) {
          assignGeojson(geo, group, side, 200, 'tile')
          return
        }
        // The opposite image may exist for this tile while this modality's
        // image is missing. Keep the annotation visible on the available side.
        const oppositeSide = side === FILE_ROLE.IHC ? FILE_ROLE.HE : FILE_ROLE.IHC
        const fallback = (groupsBySideTile.get(`${oppositeSide}|${tile}`) || []).find(
          (candidate) =>
            candidate[oppositeSide] && !candidate.annotations[side],
        )
        if (fallback) assignGeojson(geo, fallback, side, 190, 'tile')
      })
    })

    // Pass 2: scored compatibility for the remaining annotation files.
    const geoAssignments = []
    geojsonFiles.forEach((geo, geoIndex) => {
      if (assignedGeo.has(geo.id)) return
      const explicitSide =
        geo.annotationSide || getAnnotationSide(geo.name) || null
      groups.forEach((group) => {
        const sides = explicitSide
          ? [explicitSide]
          : [FILE_ROLE.IHC, FILE_ROLE.HE]
        sides.forEach((side) => {
          if (!group[side] || group.annotations[side]) return
          const score = geojsonCompatibilityScore(group, geo, side)
          if (score > 26) {
            geoAssignments.push({ geo, group, side, score, geoIndex })
          }
        })
      })
    })
    geoAssignments.sort((a, b) => b.score - a.score)

    geoAssignments.forEach(({ geo, group, side, score }) => {
      assignGeojson(geo, group, side, score, 'name')
    })

    // A single case + a single annotation is unambiguous even when the names differ.
    if (groups.length === 1 && geojsonFiles.length === 1) {
      const group = groups[0]
      const unassigned = geojsonFiles[0]
      if (!assignedGeo.has(unassigned.id)) {
        const side = group.ihc ? FILE_ROLE.IHC : FILE_ROLE.HE
        if (group[side]) {
          group.annotations[side] = unassigned
          group[`${side}Geojson`] = unassigned
          group.files.push(unassigned)
          group.geojsonScore = 100
          assignedGeo.add(unassigned.id)
        }
      }
    }
  }

  groups.forEach((group) => {
    group.geojson =
      group.ihcGeojson ||
      group.heGeojson ||
      group.annotations.ihc ||
      group.annotations.he
    group.files = uniqueFiles(group.files)
    group.isManual = group.matchKind === 'manual'
    group.fullLabel = combinationLabel(group)
    group.label = tileAwareLabel(group, group.fullLabel)
    group.fileCount = group.files.length
  })

  groups.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true }))

  // A file can be copied into both he_geo/ and ihc_geo/ by mistake. Once one
  // copy is attached, identical basenames are treated as duplicates rather
  // than as unmatched annotations.
  const assignedNames = new Set(
    geojsonFiles
      .filter((file) => assignedGeo.has(file.id))
      .map((file) => file.name.toLowerCase()),
  )
  const duplicates = geojsonFiles.filter(
    (file) =>
      !assignedGeo.has(file.id) && assignedNames.has(file.name.toLowerCase()),
  )
  const duplicateIds = new Set(duplicates.map((file) => file.id))

  const unmatched = files.filter((file) => {
    if (file.role === FILE_ROLE.HE || file.role === FILE_ROLE.IHC) return false
    if (file.role === FILE_ROLE.GEOJSON) {
      return !assignedGeo.has(file.id) && !duplicateIds.has(file.id)
    }
    return true
  })

  return {
    groups,
    unmatched,
    duplicates,
    stats: {
      total: files.length,
      groups: groups.length,
      he: heFiles.length,
      ihc: ihcFiles.length,
      geojson: geojsonFiles.length,
      matchedGeojson: assignedGeo.size,
      duplicates: duplicates.length,
      pairs: groups.filter((group) => group.he && group.ihc).length,
      singles: groups.filter((group) => !group.he || !group.ihc).length,
      tilePairs: groups.filter((group) => group.matchKind === 'tile').length,
    },
  }
}

function uniqueFiles(files) {
  const seen = new Set()
  return files.filter((file) => {
    if (!file || seen.has(file.id)) return false
    seen.add(file.id)
    return true
  })
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}
