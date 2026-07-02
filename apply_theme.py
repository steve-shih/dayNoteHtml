import re

with open('frontend/src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add ConfigProvider import
if 'ConfigProvider' not in content:
    content = content.replace("import { Layout, Menu, Button, Modal, Upload, Select, Input, List, Typography, Space, message, Empty, Tag, Card, Popconfirm, Spin, Divider, Grid, Drawer, Tabs } from 'antd';",
                              "import { ConfigProvider, theme as antdTheme, Layout, Menu, Button, Modal, Upload, Select, Input, List, Typography, Space, message, Empty, Tag, Card, Popconfirm, Spin, Divider, Grid, Drawer, Tabs } from 'antd';")

# 2. Add theme constants
theme_constants = """
const THEMES = {
  light: {
    bgApp: '#f0f2f5',
    bgPanel: '#ffffff',
    border: '#d9d9d9',
    textMain: '#000000',
    textInverse: '#ffffff',
    bgAiBubble: '#f5f5f5',
    tableBorder: '#f0f0f0',
    codeBg: '#f5f5f5',
    siderTheme: 'light' as const,
  },
  gray: {
    bgApp: '#e8e8e8',
    bgPanel: '#d9d9d9',
    border: '#bfbfbf',
    textMain: '#262626',
    textInverse: '#ffffff',
    bgAiBubble: '#e8e8e8',
    tableBorder: '#bfbfbf',
    codeBg: '#f5f5f5',
    siderTheme: 'light' as const,
  },
  dark: {
    bgApp: '#141414',
    bgPanel: '#1f1f1f',
    border: '#303030',
    textMain: '#ffffff',
    textInverse: '#000000',
    bgAiBubble: '#1f1f1f',
    tableBorder: '#424242',
    codeBg: '#1f1f1f',
    siderTheme: 'dark' as const,
  }
};
"""
if 'const THEMES' not in content:
    content = content.replace("export default function Home() {", theme_constants + "\nexport default function Home() {")

# 3. Add states and logic
state_logic = """
  const [appTheme, setAppTheme] = useState<'light' | 'gray' | 'dark'>('dark');
  const colors = THEMES[appTheme];
  const antdAlgorithm = appTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;
"""
if 'const [appTheme' not in content:
    content = content.replace("const [isEditingTxt, setIsEditingTxt] = useState(false);\n  const [txtEditContent, setTxtEditContent] = useState(\"\");", "const [isEditingTxt, setIsEditingTxt] = useState(false);\n  const [txtEditContent, setTxtEditContent] = useState(\"\");\n" + state_logic)

# Add load/save logic
if 'daynote_theme' not in content:
    content = content.replace("if (sessionStorage.getItem('daynote_auth') === 'true') {", "const savedTheme = localStorage.getItem('daynote_theme') as any;\n    if (savedTheme) setAppTheme(savedTheme);\n\n    if (sessionStorage.getItem('daynote_auth') === 'true') {")

# 4. Wrap with ConfigProvider
if '<ConfigProvider' not in content:
    content = content.replace("<Layout style={{ minHeight: '100vh' }}>", "<ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>\n    <Layout style={{ minHeight: '100vh', background: colors.bgApp }}>")
    content = re.sub(r'(</Layout>\n\s*);\n\s*}', r'\1\n    </ConfigProvider>\n  );\n}', content)
    content = content.replace("return (\n      <div style={{ height: '100vh'", "return (\n      <ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>\n      <div style={{ height: '100vh'")
    content = re.sub(r'(</Card>\n\s*</div>\n\s*);', r'\1\n      </ConfigProvider>\n    );', content)

# 5. Replace colors
content = content.replace('theme="dark"', 'theme={colors.siderTheme}')
content = content.replace("background: '#141414'", "background: colors.bgApp")
content = content.replace("background: '#1f1f1f'", "background: colors.bgPanel")
content = content.replace("'1px solid #303030'", "`1px solid ${colors.border}`")
content = content.replace("borderColor: '#303030'", "borderColor: colors.border")
content = content.replace("color: '#fff'", "color: colors.textMain")
content = content.replace("color: '#000'", "color: colors.textInverse")
content = content.replace("background: colors.bgPanel, borderRadius: 8 }}", "background: '#fff', borderRadius: 8 }}")
content = content.replace("border: '1px solid #303030'", "border: `1px solid ${colors.border}`")
content = content.replace("borderBottom: '1px solid #303030'", "borderBottom: `1px solid ${colors.border}`")
content = content.replace("borderTop: '1px solid #303030'", "borderTop: `1px solid ${colors.border}`")
content = content.replace("borderRight: '1px solid #303030'", "borderRight: `1px solid ${colors.border}`")
content = content.replace("border: '1px solid #424242'", "border: `1px solid ${colors.tableBorder}`")
content = content.replace("background: '#1f1f1f'", "background: colors.bgPanel") 
content = content.replace("background: '#1677ff'", "background: appTheme === 'dark' ? '#1677ff' : '#0958d9'")

# Let's add the Theme Selector to the Sider and Drawer
theme_selector = """
          <div style={{ padding: '0 16px 16px' }}>
            <Select value={appTheme} style={{ width: '100%' }} onChange={(val) => { setAppTheme(val); localStorage.setItem('daynote_theme', val); }}>
              <Option value="light">淺色模式</Option>
              <Option value="gray">灰色模式</Option>
              <Option value="dark">深色模式</Option>
            </Select>
          </div>
"""
if '<Select value={appTheme}' not in content:
    content = content.replace("<Menu \n            theme={colors.siderTheme}", theme_selector + "\n          <Menu \n            theme={colors.siderTheme}")
    content = content.replace("<Menu \n          theme={colors.siderTheme} \n          mode=\"inline\"", theme_selector + "\n        <Menu \n          theme={colors.siderTheme} \n          mode=\"inline\"")

with open('frontend/src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
