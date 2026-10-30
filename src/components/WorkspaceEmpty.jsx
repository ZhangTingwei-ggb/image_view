import {
  FileJson,
  FolderOpen,
  Image as ImageIcon,
  Microscope,
  Sparkles,
  Upload,
} from 'lucide-react'

export default function WorkspaceEmpty({
  hasFiles = false,
  onImport,
  onRestoreDemo,
}) {
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1e1e1e] p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(44,74,125,0.12),transparent_46%),radial-gradient(rgba(152,169,194,0.08)_1px,transparent_1.2px)] [background-size:auto,24px_24px]" />
      <div className="relative z-10 w-full max-w-[560px] text-center">
        <div className="mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-2xl border border-[#3f4d66] bg-[linear-gradient(145deg,#29313e,#23262b)] shadow-[0_16px_50px_rgba(0,0,0,0.28)]">
          <FolderOpen className="h-7 w-7 text-[#7f9dcc]" strokeWidth={1.4} />
        </div>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#3b414a] bg-[#25272b] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.16em] text-[#758196]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5b7fe5]" />
          {hasFiles ? 'No matched case' : 'Workspace ready'}
        </div>
        <h1 className="mt-4 text-[20px] font-semibold tracking-[0.01em] text-[#e3e7ec]">
          {hasFiles ? '暂未形成可用病例' : '开始一次病理切片比对'}
        </h1>
        <p className="mx-auto mt-2 max-w-[410px] text-[11px] leading-5 text-[#818a96]">
          {hasFiles
            ? '扫描到的文件没有识别出 HE / IHC 切片组。请检查文件命名或目录结构，或重新选择文件夹。'
            : '分别选择 HE 图像、HE GeoJSON、IHC 图像、IHC GeoJSON 四个目录，或四个单独文件；也可以直接拖入，或选择一个含角色子目录的上级目录自动识别。'}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onImport}
            className="flex h-10 items-center gap-2 rounded-lg border border-[#739cff]/30 bg-[#4f7df3] px-4 text-[11.5px] font-medium text-white shadow-[0_6px_20px_rgba(54,99,220,0.3)] transition-all hover:border-[#9bb9ff]/50 hover:bg-[#5e89f5]"
          >
            <Upload className="h-4 w-4" strokeWidth={1.9} />
            导入 HE / IHC 数据
          </button>
          <button
            type="button"
            onClick={onRestoreDemo}
            className="flex h-10 items-center gap-2 rounded-lg border border-[#3f444c] bg-[#292b2f] px-4 text-[11.5px] font-medium text-[#aeb6c1] transition-colors hover:border-[#546173] hover:text-[#d9e1ec]"
          >
            <Sparkles className="h-4 w-4 text-[#7d95bc]" strokeWidth={1.7} />
            查看演示病例
          </button>
        </div>

        <div className="mx-auto mt-9 grid max-w-[440px] grid-cols-3 gap-2.5">
          {[
            {
              icon: ImageIcon,
              title: 'HE 切片',
              suffix: '.tif / .tiff',
              color: 'text-[#e9a9be]',
              bg: 'border-[#5c3c47]/70 bg-[#2b2428]/70',
            },
            {
              icon: Microscope,
              title: 'IHC 切片',
              suffix: '.tif / .tiff',
              color: 'text-[#e5bb7c]',
              bg: 'border-[#5b4a34]/70 bg-[#2b2822]/70',
            },
            {
              icon: FileJson,
              title: '标测数据',
              suffix: '.geojson',
              color: 'text-[#75d1ad]',
              bg: 'border-[#335246]/70 bg-[#222b27]/70',
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.title}
                className={`rounded-lg border px-3 py-3 text-left ${item.bg}`}
              >
                <Icon className={`h-4 w-4 ${item.color}`} strokeWidth={1.6} />
                <div className="mt-2 text-[10px] font-medium text-[#c9d0d9]">
                  {item.title}
                </div>
                <div className="mt-0.5 font-mono text-[8px] text-[#68717d]">
                  {item.suffix}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-6 font-mono text-[8.5px] uppercase tracking-[0.08em] text-[#59616d]">
          最长公共前缀自动分组 · 双屏联动 · 1 px 标测微调
        </p>
      </div>
    </div>
  )
}
