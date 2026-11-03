/** Fa scaricare un file di testo al browser. */
export function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Safari avvia il download in ritardo: revocare subito l'URL lo annullerebbe.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
