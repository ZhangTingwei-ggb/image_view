import { DEMO_METADATA } from './demoGeoJSON'
import { FILE_ROLE, groupFiles } from '../utils/grouping'

function createDemoFiles() {
  return Object.values(DEMO_METADATA).flatMap((metadata) => {
    const imageBase = {
      width: 1000,
      height: 1000,
      previewWidth: 1000,
      previewHeight: 1000,
      frameCount: 1,
      isPreview: false,
      demo: true,
    }

    return [
      {
        id: `demo-he-${metadata.key}`,
        name: `HE_${metadata.key}.tif`,
        path: `PathoAlign_Demo/HE_${metadata.key}.tif`,
        size: 0,
        role: FILE_ROLE.HE,
        image: { ...imageBase, url: metadata.heImage },
        geojson: null,
        error: null,
        demo: true,
      },
      {
        id: `demo-ihc-${metadata.key}`,
        name: `IHC_${metadata.key}.tif`,
        path: `PathoAlign_Demo/IHC_${metadata.key}.tif`,
        size: 0,
        role: FILE_ROLE.IHC,
        image: { ...imageBase, url: metadata.ihcImage },
        geojson: null,
        error: null,
        demo: true,
      },
      {
        id: `demo-geo-${metadata.key}`,
        name: metadata.geojsonName,
        path: `PathoAlign_Demo/${metadata.geojsonName}`,
        size: JSON.stringify(metadata.geojson).length,
        role: FILE_ROLE.GEOJSON,
        image: null,
        geojson: metadata.geojson,
        error: null,
        demo: true,
      },
    ]
  })
}

export function createDemoDataset() {
  const files = createDemoFiles()
  const grouped = groupFiles(files)
  return {
    name: '演示切片数据集',
    source: 'demo',
    files,
    ...grouped,
    demoCaseCount: Object.keys(DEMO_METADATA).length,
  }
}
