import sys
content = open('src/app/page.tsx', 'r', encoding='utf-8').read()
content = content.replace('axios.get(\/api/', 'axios.get(\/daynote/api/')
content = content.replace('axios.post(\/api/', 'axios.post(\/daynote/api/')
content = content.replace('axios.put(\/api/', 'axios.put(\/daynote/api/')
content = content.replace('axios.delete(\/api/', 'axios.delete(\/daynote/api/')
content = content.replace('\/api/notes', '\/daynote/api/notes')
open('src/app/page.tsx', 'w', encoding='utf-8').write(content)
