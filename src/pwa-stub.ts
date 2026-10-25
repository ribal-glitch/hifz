// Ersatz für 'virtual:pwa-register' in der Link-Version (claude.ai erlaubt dort keinen Service Worker).
export function registerSW(_options?: unknown): () => Promise<void> {
  return async () => {};
}
