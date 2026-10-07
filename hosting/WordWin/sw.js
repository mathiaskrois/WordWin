// Upgrade existing home-screen installs from the former uppercase scope.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    const url = new URL(client.url);
    if (url.pathname.startsWith('/WordWin/'))
      await client.navigate('/wordwin/' + url.search + url.hash);
  }
  await self.registration.unregister();
})()));
