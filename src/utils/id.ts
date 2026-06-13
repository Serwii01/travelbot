/** Id corto y legible para las alertas (suficiente para uso personal/multi-usuario ligero). */
export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
