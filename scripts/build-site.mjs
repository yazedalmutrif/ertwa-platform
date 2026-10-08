import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const output = new URL('_site/', root);
const pages = [
    'index.html', 'dashboard.html', 'departments.html', 'events.html',
    'login.html', 'order.html', 'register.html', 'structure.html'
];
const assets = [
    'api.js', 'admin.js', 'admin-content.js', 'main.js', 'script.js', 'supabase-config.js',
    'style.css', 'register.css', 'images'
];

// Only public browser configuration belongs in the published site.
const configContext = vm.createContext({ window: {} });
vm.runInContext(await readFile(new URL('supabase-config.js', root), 'utf8'), configContext);
const config = configContext.window.ERTWA_CONFIG;
if (!config || typeof config.supabaseUrl !== 'string' || typeof config.supabasePublishableKey !== 'string') {
    throw new Error('supabase-config.js must define the project URL and public key as strings.');
}
const key = config.supabasePublishableKey;
if (key.startsWith('sb_secret_')) throw new Error('A Supabase secret key cannot be published in the website.');
if (key.split('.').length === 3) {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (payload.role !== 'anon') throw new Error('Only the legacy anon key may be published in the website.');
}

// _site is generated output; source code, tests, SQL and dependencies stay out.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [...pages, ...assets]) {
    await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
await writeFile(new URL('.nojekyll', output), '');
console.log('GitHub Pages website built in _site/');
if (!config.supabaseUrl || !key) {
    console.log('The public pages can be published. Add Supabase settings to enable login and data submissions.');
}
