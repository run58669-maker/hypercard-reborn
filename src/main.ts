// Entry point: open the store (seeding on first load), build the runtime and
// the shell, show card 1. The compile module is never imported here; the
// description panel loads it with a dynamic import() when Save is pressed.
import { createCardRuntime } from './runtime'
import { openCardStore } from './store'
import { createApp } from './ui'
import './styles.css'

const root = document.querySelector<HTMLElement>('#app')

if (root !== null) {
  const store = openCardStore({ storage: localStorage })
  let app: ReturnType<typeof createApp> | null = null
  const runtime = createCardRuntime({
    cardCount: () => store.getCards().length,
    onNavigate: (n) => app?.go(n),
  })
  app = createApp(root, { store, runtime })
  app.go(1)
}
