import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public', 'demo')
const dataDir = path.join(root, 'src', 'data')
fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })

const WIDTH = 1000
const HEIGHT = 1000

function mulberry32(seed) {
  let value = seed >>> 0
  return function random() {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function round(value) {
  return Math.round(value * 100) / 100
}

function polarPath({ cx, cy, rx, ry, phase, points = 44, jitter = 0.03, random }) {
  const coords = []
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2
    const wave =
      1 +
      0.075 * Math.sin(angle * 3 + phase) +
      0.04 * Math.sin(angle * 7 - phase * 0.8) +
      0.024 * Math.sin(angle * 13 + phase * 1.7) +
      (random() - 0.5) * jitter
    coords.push({
      x: cx + Math.cos(angle) * rx * wave,
      y: cy + Math.sin(angle) * ry * wave,
    })
  }
  return coords
}

function linePath(points) {
  return `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ')} Z`
}

function tissueRadius(angle, phase) {
  return (
    1 +
    0.075 * Math.sin(angle * 3 + phase) +
    0.04 * Math.sin(angle * 7 - phase * 0.8) +
    0.024 * Math.sin(angle * 13 + phase * 1.7)
  )
}

function insideTissue(x, y, shape, margin = 0.96) {
  const nx = (x - shape.cx) / shape.rx
  const ny = (y - shape.cy) / shape.ry
  const radius = Math.sqrt(nx * nx + ny * ny)
  const angle = Math.atan2(ny, nx)
  return radius < tissueRadius(angle, shape.phase) * margin
}

function ellipse(x, y, rx, ry, fill, opacity = 1, extra = '') {
  return `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(rx)}" ry="${round(ry)}" fill="${fill}" opacity="${round(opacity * 100) / 100}"${extra ? ` ${extra}` : ''}/>`
}

function createTreatment(caseConfig) {
  const random = mulberry32(caseConfig.seed)
  const shape = {
    cx: caseConfig.cx ?? 500,
    cy: caseConfig.cy ?? 500,
    rx: caseConfig.rx ?? 438,
    ry: caseConfig.ry ?? 421,
    phase: caseConfig.phase ?? 0.6,
  }
  const tissuePoints = polarPath({ ...shape, random, points: 64, jitter: 0.012 })

  const tumours = caseConfig.tumors.map((tumor) => {
    const points = polarPath({
      cx: tumor.x,
      cy: tumor.y,
      rx: tumor.rx,
      ry: tumor.ry,
      phase: tumor.phase,
      points: 26,
      jitter: 0.045,
      random,
    })
    return { ...tumor, points }
  })

  const cells = []
  let attempts = 0
  while (cells.length < 1850 && attempts < 7000) {
    attempts += 1
    const x = shape.cx + (random() * 2 - 1) * shape.rx * 1.02
    const y = shape.cy + (random() * 2 - 1) * shape.ry * 1.02
    if (!insideTissue(x, y, shape, 0.94)) continue

    const tumorIndex = tumours.findIndex((tumor) =>
      insideTissue(x, y, { cx: tumor.x, cy: tumor.y, rx: tumor.rx, ry: tumor.ry, phase: tumor.phase }, 0.94),
    )
    cells.push({
      x,
      y,
      rx: 1.6 + random() * 4.8,
      ry: 1.2 + random() * 3.8,
      angle: random() * 360,
      tumorIndex,
      tone: random(),
    })
  }

  const stroma = []
  for (let i = 0; i < 8; i += 1) {
    let x = shape.cx + (random() * 2 - 1) * shape.rx * 0.7
    let y = shape.cy + (random() * 2 - 1) * shape.ry * 0.7
    let angle = random() * Math.PI * 2
    const points = [{ x, y }]
    for (let j = 0; j < 80; j += 1) {
      angle += (random() - 0.5) * 0.36
      x += Math.cos(angle) * (8 + random() * 9)
      y += Math.sin(angle) * (8 + random() * 9)
      if (!insideTissue(x, y, shape, 0.92)) break
      points.push({ x, y })
    }
    stroma.push(points)
  }

  const clearings = []
  for (let i = 0; i < 24; i += 1) {
    const angle = random() * Math.PI * 2
    const radius = Math.sqrt(random()) * 0.82
    const x = shape.cx + Math.cos(angle) * shape.rx * radius
    const y = shape.cy + Math.sin(angle) * shape.ry * radius
    if (!insideTissue(x, y, shape, 0.9)) continue
    clearings.push({
      x,
      y,
      rx: 7 + random() * 22,
      ry: 5 + random() * 16,
      angle: random() * 180,
    })
  }

  const scale = 56 + random() * 74
  return { random, shape, tissuePoints, tumours, cells, stroma, clearings, scale }
}

function tumorMarkup(treatment, palette, modality) {
  return treatment.tumours
    .map((tumor, index) => {
      const path = linePath(tumor.points)
      const inner = tumor.points
        .map((point, pointIndex) => {
          const factor = 0.76 + ((pointIndex * 17) % 11) / 100
          return {
            x: tumor.x + (point.x - tumor.x) * factor,
            y: tumor.y + (point.y - tumor.y) * factor,
          }
        })
      const saturated = modality === 'ihc' ? palette.dabStrong : palette.lesionStrong
      const soft = modality === 'ihc' ? palette.dabSoft : palette.lesionSoft
      return `
        <g>
          <path d="${path}" fill="${soft}" opacity="${modality === 'ihc' ? 0.52 : 0.36}" filter="url(#softBlur)" />
          <path d="${linePath(inner)}" fill="${saturated}" opacity="${modality === 'ihc' ? 0.32 : 0.16}" filter="url(#softBlur)" />
          <path d="${path}" fill="none" stroke="${saturated}" stroke-width="${modality === 'ihc' ? 5 : 3}" opacity="0.16" />
          ${tumor.labels?.includes(index) ? `<text x="${round(tumor.x)}" y="${round(tumor.y)}" fill="${saturated}" font-size="10" font-family="monospace" opacity="0.32" text-anchor="middle">T${index + 1}</text>` : ''}
        </g>`
    })
    .join('\n')
}

function cellMarkup(treatment, palette, modality) {
  const { cells } = treatment
  return cells
    .map((cell) => {
      let fill
      let opacity
      let rx = cell.rx
      let ry = cell.ry
      if (modality === 'ihc') {
        if (cell.tumorIndex >= 0) {
          fill = cell.tone > 0.62 ? palette.dabCell : palette.nucleusIHC
          opacity = cell.tone > 0.58 ? 0.62 : 0.68
          rx *= 1.12
          ry *= 1.12
        } else {
          fill = cell.tone > 0.9 ? palette.stromaCell : palette.nucleusIHC
          opacity = 0.42 + cell.tone * 0.18
        }
      } else if (cell.tumorIndex >= 0) {
        fill = cell.tone > 0.47 ? palette.nucleusHE : palette.cytoHE
        opacity = cell.tone > 0.47 ? 0.66 : 0.36
      } else {
        fill = cell.tone > 0.58 ? palette.nucleusHELight : palette.cytoHE
        opacity = 0.42 + cell.tone * 0.28
      }
      return `<ellipse cx="${round(cell.x)}" cy="${round(cell.y)}" rx="${round(rx)}" ry="${round(ry)}" transform="rotate(${round(cell.angle)} ${round(cell.x)} ${round(cell.y)})" fill="${fill}" opacity="${round(opacity * 100) / 100}"/>`
    })
    .join('\n')
}

function createSVG(modality, caseConfig) {
  const treatment = createTreatment(caseConfig)
  const palette =
    modality === 'ihc'
      ? {
          background: '#f3eee5',
          backgroundGlow: '#fffaf1',
          tissue: '#d9c6ac',
          tissueDeep: '#b78e63',
          stroma: '#9c764e',
          stromaLight: '#c6a071',
          dabSoft: '#b5794b',
          dabStrong: '#794821',
          dabCell: '#a56537',
          nucleusIHC: '#526885',
          stromaCell: '#7d5738',
          teal: '#7a8eaa',
        }
      : {
          background: '#f3ede9',
          backgroundGlow: '#fffaf6',
          tissue: '#e7b8c8',
          tissueDeep: '#cc8fa7',
          stroma: '#b67593',
          stromaLight: '#d59db4',
          lesionSoft: '#9f5b91',
          lesionStrong: '#67355f',
          nucleusHE: '#4b2654',
          nucleusHELight: '#7c4b82',
          cytoHE: '#e7a8bd',
          teal: '#9f849b',
        }

  const tissuePath = linePath(treatment.tissuePoints)
  const softStainColor = modality === 'ihc' ? palette.dabSoft : palette.lesionSoft
  const clearings = treatment.clearings
    .map(
      (hole) =>
        `<g transform="rotate(${round(hole.angle)} ${round(hole.x)} ${round(hole.y)})"><ellipse cx="${round(hole.x)}" cy="${round(hole.y)}" rx="${round(hole.rx)}" ry="${round(hole.ry)}" fill="${palette.backgroundGlow}" opacity="0.9"/><ellipse cx="${round(hole.x)}" cy="${round(hole.y)}" rx="${round(hole.rx)}" ry="${round(hole.ry)}" fill="none" stroke="${palette.tissueDeep}" stroke-width="1.3" opacity="0.22"/></g>`,
    )
    .join('\n')

  const stroma = treatment.stroma
    .filter((points) => points.length > 3)
    .map(
      (points) =>
        `<path d="${points.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(' ')}" fill="none" stroke="${palette.stromaLight}" stroke-width="${modality === 'ihc' ? 1.2 : 1.8}" opacity="${modality === 'ihc' ? 0.3 : 0.24}"/>`,
    )
    .join('\n')

  const nucleiSheen = Array.from({ length: 17 }, () => {
    const x = 100 + treatment.random() * 800
    const y = 100 + treatment.random() * 800
    return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(30 + treatment.random() * 90)}" fill="${modality === 'ihc' ? '#ffffff' : '#fff4f5'}" opacity="0.035"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <radialGradient id="slideBackground" cx="48%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${palette.backgroundGlow}"/>
      <stop offset="62%" stop-color="${palette.background}"/>
      <stop offset="100%" stop-color="#e6ddd2"/>
    </radialGradient>
    <radialGradient id="tissueGlow" cx="38%" cy="32%" r="70%">
      <stop offset="0%" stop-color="${palette.tissue}" stop-opacity="0.95"/>
      <stop offset="68%" stop-color="${palette.tissueDeep}" stop-opacity="0.86"/>
      <stop offset="100%" stop-color="${palette.stroma}" stop-opacity="0.7"/>
    </radialGradient>
    <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${caseConfig.seed % 97}" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.09"/></feComponentTransfer>
    </filter>
    <clipPath id="tissueClip">
      <path d="${tissuePath}"/>
    </clipPath>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#slideBackground)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#8b7e6b" opacity="0.035" filter="url(#grain)"/>

  <g>
    <path d="${tissuePath}" fill="url(#tissueGlow)" opacity="0.95"/>
    <path d="${tissuePath}" fill="none" stroke="${palette.tissueDeep}" stroke-width="2.4" opacity="0.38"/>
    <g clip-path="url(#tissueClip)">
      ${nucleiSheen}
      <path d="${tissuePath}" fill="${softStainColor}" opacity="0.07"/>
      ${stroma}
      ${tumorMarkup(treatment, palette, modality)}
      ${cellMarkup(treatment, palette, modality)}
      ${clearings}
      <rect width="${WIDTH}" height="${HEIGHT}" fill="${modality === 'ihc' ? '#6e4a2c' : '#8d466c'}" opacity="0.028"/>
    </g>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#7c6d5e" opacity="0.04" filter="url(#grain)"/>
  </g>

  <g opacity="0.52">
    <line x1="784" y1="942" x2="${round(784 + treatment.scale)}" y2="942" stroke="#71675d" stroke-width="2"/>
    <line x1="784" y1="937" x2="784" y2="947" stroke="#71675d" stroke-width="2"/>
    <line x1="${round(784 + treatment.scale)}" y1="937" x2="${round(784 + treatment.scale)}" y2="947" stroke="#71675d" stroke-width="2"/>
    <text x="${round(784 + treatment.scale / 2)}" y="962" fill="#71675d" font-family="monospace" font-size="12" text-anchor="middle">200 µm</text>
  </g>
  <text x="52" y="58" fill="#786e63" font-family="monospace" font-size="11" opacity="0.42">${modality === 'ihc' ? 'IHC' : 'H&amp;E'} · CASE ${caseConfig.number} · 20×</text>
</svg>`
}

const CASES = [
  {
    number: '01',
    key: 'patient01',
    geojsonName: 'pat01.geojson',
    seed: 41,
    cx: 514,
    cy: 505,
    rx: 428,
    ry: 407,
    phase: 0.7,
    tumors: [
      { x: 383, y: 603, rx: 132, ry: 105, phase: 1.4, label: 'Tumor A', grade: 'G2', confidence: 0.94 },
      { x: 640, y: 399, rx: 103, ry: 128, phase: 2.6, label: 'Tumor B', grade: 'G2', confidence: 0.88 },
      { x: 683, y: 689, rx: 88, ry: 72, phase: 0.4, label: 'Tumor C', grade: 'G1', confidence: 0.82 },
    ],
  },
  {
    number: '02',
    key: 'patient02',
    geojsonName: 'patient02.geojson',
    seed: 113,
    cx: 488,
    cy: 528,
    rx: 446,
    ry: 391,
    phase: 2.2,
    tumors: [
      { x: 345, y: 402, rx: 118, ry: 137, phase: 3.3, label: 'Lesion A', grade: 'G3', confidence: 0.91 },
      { x: 646, y: 590, rx: 152, ry: 92, phase: 1.1, label: 'Lesion B', grade: 'G2', confidence: 0.86 },
    ],
  },
  {
    number: '03',
    key: 'patient03',
    geojsonName: 'patient03_mask.geojson',
    seed: 821,
    cx: 530,
    cy: 474,
    rx: 401,
    ry: 441,
    phase: 4.1,
    tumors: [
      { x: 456, y: 353, rx: 114, ry: 81, phase: 0.2, label: 'ROI 01', grade: 'G2', confidence: 0.97 },
      { x: 537, y: 680, rx: 126, ry: 83, phase: 2.5, label: 'ROI 02', grade: 'G1', confidence: 0.79 },
      { x: 744, y: 492, rx: 65, ry: 108, phase: 1.7, label: 'ROI 03', grade: 'G2', confidence: 0.84 },
    ],
  },
]

const demoMetadata = {}

CASES.forEach((caseConfig) => {
  const treatment = createTreatment(caseConfig)

  // The SVG and the annotation export share the same top-left origin with y
  // growing downward, so GeoJSON y values need no flip here.
  const features = treatment.tumours.map((tumor, index) => {
    const closed = [...tumor.points, tumor.points[0]].map((point) => [
      Math.round(point.x * 100) / 100,
      Math.round(point.y * 100) / 100,
    ])
    return {
      type: 'Feature',
      id: `ROI-${String(index + 1).padStart(2, '0')}`,
      properties: {
        name: tumor.label,
        classification: 'tumor',
        grade: tumor.grade,
        confidence: tumor.confidence,
        area_px2: Math.round(Math.PI * tumor.rx * tumor.ry),
      },
      geometry: {
        type: 'Polygon',
        coordinates: [closed],
      },
    }
  })

  fs.writeFileSync(
    path.join(publicDir, `HE_${caseConfig.key}.svg`),
    createSVG('he', caseConfig),
  )
  fs.writeFileSync(
    path.join(publicDir, `IHC_${caseConfig.key}.svg`),
    createSVG('ihc', caseConfig),
  )
  fs.writeFileSync(
    path.join(publicDir, caseConfig.geojsonName),
    JSON.stringify(
      {
        type: 'FeatureCollection',
        name: `${caseConfig.key} annotation`,
        features,
      },
      null,
      2,
    ),
  )

  demoMetadata[caseConfig.key] = {
    number: caseConfig.number,
    key: caseConfig.key,
    geojsonName: caseConfig.geojsonName,
    heImage: `/demo/HE_${caseConfig.key}.svg`,
    ihcImage: `/demo/IHC_${caseConfig.key}.svg`,
    geojson: {
      type: 'FeatureCollection',
      name: `${caseConfig.key} annotation`,
      features,
    },
  }
})

fs.writeFileSync(
  path.join(dataDir, 'demoGeoJSON.js'),
  `// Generated by scripts/generate-demo.mjs — do not edit by hand.\nexport const DEMO_METADATA = ${JSON.stringify(demoMetadata, null, 2)}\n`,
)

console.log(`Generated ${CASES.length} demo cases in public/demo and src/data/demoGeoJSON.js`)
