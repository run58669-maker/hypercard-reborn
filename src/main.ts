// Entry point. The scaffold renders the app title; later tasks build the card
// shell, store, runtime and compile pipeline on top of this.
const app = document.querySelector<HTMLElement>('#app')

if (app !== null) {
  app.textContent = 'HyperCard Reborn'
}
