(async () => {
  const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'fr-FR,fr;q=0.9' };
  const pages = [
    ['pays-bas', 'https://www.unibet.fr/paris-football/pays-bas/d1-pays-bas'],
    ['belgique', 'https://www.unibet.fr/paris-football/belgique/d1-belgique'],
  ];
  for (const [name, url] of pages) {
    const html = await (await fetch(url, { headers: H, signal: AbortSignal.timeout(10000) })).text();
    const titles = [...html.matchAll(/title="Voir plus de paris pour le match : ([^"]+)"/g)].map(m => m[1]);
    console.log(`=== ${name} (${titles.length} matches via title=) ===`);
    titles.slice(0, 15).forEach(t => console.log('  ', t));
  }
})();
