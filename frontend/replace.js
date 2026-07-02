
const fs = require('fs');
let c = fs.readFileSync('src/app/page.tsx', 'utf-8');
c = c.replace(/axios\\.get\(\/api\\//g, 'axios.get(/daynote/api/');
c = c.replace(/axios\\.post\(\/api\\//g, 'axios.post(/daynote/api/');
c = c.replace(/axios\\.put\(\/api\\//g, 'axios.put(/daynote/api/');
c = c.replace(/axios\\.delete\(\/api\\//g, 'axios.delete(/daynote/api/');
c = c.replace(/axios\\.post\('\\/api\\//g, 'axios.post(\'/daynote/api/');
c = c.replace(/axios\\.get\('\\/api\\//g, 'axios.get(\'/daynote/api/');
c = c.replace(/\\/api\\/notes/g, '/daynote/api/notes');
fs.writeFileSync('src/app/page.tsx', c, 'utf-8');
