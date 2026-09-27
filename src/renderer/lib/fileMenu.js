// Rechtsklick auf Musik, Videos und Choreo Notes: Kontextmenü des Hauptprozesses öffnen.
// Ohne Desktop-App (z. B. im Browser) bleibt das normale Browser-Menü.

// Medien-URL /api/library-media?dir=…&file=… -> { dir, file }
function targetFromMediaUrl(url) {
  const params = new URL(url, window.location.origin).searchParams
  return { dir: params.get('dir'), file: params.get('file') }
}

function open(event, target) {
  if (!window.choreothek?.showFileMenu) return
  event.preventDefault()
  event.stopPropagation()
  window.choreothek.showFileMenu(target)
}

export const onMediaContextMenu = (url) => (event) => open(event, targetFromMediaUrl(url))

export const onPdfContextMenu = (sourcePath, uploadName) => (event) => {
  if (!uploadName) return
  open(event, { sourcePath, uploadName })
}
