import { Sidebar } from '@/components/Sidebar'
import { Chat } from '@/components/Chat'
import { SettingsPanel } from '@/components/Settings'
import { ArchivePanel } from '@/components/Archive'

function App() {
  // API Key 的加密/解密现在由 settings store 的自定义 storage 自动处理
  // 不需要手动调用 loadSettings

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <Chat />
      <SettingsPanel />
      <ArchivePanel />
    </div>
  )
}

export default App
