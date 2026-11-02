// Entry point: open the store (seeding on first load), build the runtime and
// the shell, show card 1. The compile module is never imported here; the
// description panel loads it with a dynamic import() when Save is pressed.
import { INTERPRETER_CHUNK_MARKER } from './interpreter'
import { createCardRuntime } from './runtime'
import { openCardStore } from './store'
import { createApp } from './ui'
import './styles.css'

const root = document.querySelector<HTMLElement>('#app')

if (root !== null) {
  // Anchors the marker the bundle check (task 13.3) uses to find the chunk
  // that holds the interpreter, so it is not tree-shaken away.
  document.documentElement.dataset['hcrInterpreter'] = INTERPRETER_CHUNK_MARKER
  const store = openCardStore({ storage: localStorage })
  let app: ReturnType<typeof createApp> | null = null
  const runtime = createCardRuntime({
    cardCount: () => store.getCards().length,
    onNavigate: (n) => app?.go(n),
  })
  app = createApp(root, { store, runtime, storage: localStorage })
  app.go(1)
}
