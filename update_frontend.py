import re

with open('frontend/src/app/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add axios interceptor for auth
interceptor_code = """
import axios from "axios";
axios.defaults.headers.common['ngrok-skip-browser-warning'] = '69420';

axios.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('daynote_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('daynote_token');
        sessionStorage.removeItem('daynote_auth');
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);
"""
content = content.replace("import axios from \"axios\";\naxios.defaults.headers.common['ngrok-skip-browser-warning'] = '69420';", interceptor_code)

# 2. Update Auth State & Logic
auth_states = """
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
"""
content = re.sub(r'const \[isAuthenticated, setIsAuthenticated\] = useState\(false\);\n\s*const \[passwordInput, setPasswordInput\] = useState\(""\);', auth_states, content)

# Update useEffect for Auth
auth_effect = """
    const savedToken = localStorage.getItem('daynote_token');
    if (savedToken) {
      setIsAuthenticated(true);
    }
"""
content = re.sub(r"if \(sessionStorage\.getItem\('daynote_auth'\) === 'true'\) \{\n\s*setIsAuthenticated\(true\);\n\s*\}", auth_effect, content)

# 3. Replace Auth UI (Login/Register Card)
login_ui_old = """
      <ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgApp }}>
        <Card title={<Title level={3} style={{ margin: 0, color: '#1677ff', textAlign: 'center' }}>DayNote 登入</Title>} style={{ width: 350, background: colors.bgPanel, borderColor: colors.border }}>
          <Input.Password 
            size="large" 
            placeholder="請輸入密碼" 
            value={passwordInput} 
            onChange={e => setPasswordInput(e.target.value)} 
            onPressEnter={() => {
              if (passwordInput === 'daynote123') {
                sessionStorage.setItem('daynote_auth', 'true');
                setIsAuthenticated(true);
              } else {
                message.error('密碼錯誤！');
              }
            }}
          />
          <Button type="primary" size="large" block style={{ marginTop: 16 }} onClick={() => {
            if (passwordInput === 'daynote123') {
              sessionStorage.setItem('daynote_auth', 'true');
              setIsAuthenticated(true);
            } else {
              message.error('密碼錯誤！');
            }
          }}>進入系統</Button>
        </Card>
      </div>
      </ConfigProvider>
"""

login_ui_new = """
      <ConfigProvider theme={{ algorithm: antdAlgorithm, token: { colorBgBase: colors.bgPanel, colorBgContainer: colors.bgPanel, colorText: colors.textMain } }}>
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgApp }}>
        <Card title={<Title level={3} style={{ margin: 0, color: '#1677ff', textAlign: 'center' }}>{isRegisterMode ? '註冊 DayNote' : '登入 DayNote'}</Title>} style={{ width: 350, background: colors.bgPanel, borderColor: colors.border }}>
          <Input 
            size="large" 
            placeholder="帳號" 
            value={usernameInput} 
            onChange={e => setUsernameInput(e.target.value)} 
            style={{ marginBottom: 16 }}
          />
          <Input.Password 
            size="large" 
            placeholder="密碼" 
            value={passwordInput} 
            onChange={e => setPasswordInput(e.target.value)} 
            onPressEnter={async () => {
              const endpoint = isRegisterMode ? '/daynote/api/auth/register' : '/daynote/api/auth/login';
              try {
                const res = await axios.post(endpoint, { username: usernameInput, password: passwordInput });
                if (isRegisterMode) {
                  message.success('註冊成功！請登入');
                  setIsRegisterMode(false);
                } else {
                  localStorage.setItem('daynote_token', res.data.token);
                  localStorage.setItem('daynote_username', res.data.username);
                  setIsAuthenticated(true);
                  fetchCategories();
                  fetchNotes();
                }
              } catch (e: any) {
                message.error(e.response?.data?.error || '操作失敗');
              }
            }}
          />
          <Button type="primary" size="large" block style={{ marginTop: 16 }} onClick={async () => {
              const endpoint = isRegisterMode ? '/daynote/api/auth/register' : '/daynote/api/auth/login';
              try {
                const res = await axios.post(endpoint, { username: usernameInput, password: passwordInput });
                if (isRegisterMode) {
                  message.success('註冊成功！請登入');
                  setIsRegisterMode(false);
                } else {
                  localStorage.setItem('daynote_token', res.data.token);
                  localStorage.setItem('daynote_username', res.data.username);
                  setIsAuthenticated(true);
                  fetchCategories();
                  fetchNotes();
                }
              } catch (e: any) {
                message.error(e.response?.data?.error || '操作失敗');
              }
          }}>
            {isRegisterMode ? '註冊' : '登入'}
          </Button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button type="link" onClick={() => setIsRegisterMode(!isRegisterMode)}>
              {isRegisterMode ? '已有帳號？點此登入' : '還沒有帳號？點此註冊'}
            </Button>
          </div>
        </Card>
      </div>
      </ConfigProvider>
"""
if "DayNote 登入" in content:
    content = content.replace(login_ui_old, login_ui_new)


# 4. Remove the manual token passing logic in `get_note_file` UI links (since we can't easily pass auth headers in `<iframe src>` or `<Button href>`).
# Actually, the backend was modified to accept `?token=` in query string for file downloading/viewing since browser native fetches (iframe/a href) don't include Axios interceptors!
# Let's add the token to the URL in UI.
content = content.replace("`/daynote/api/notes/${activeNote.stored_filename}`", "`/daynote/api/notes/${activeNote.stored_filename}?token=${localStorage.getItem('daynote_token')}`")
content = content.replace("href={activeNote.is_url ? activeNote.url : `/daynote/api/notes/${activeNote.stored_filename}`}", "href={activeNote.is_url ? activeNote.url : `/daynote/api/notes/${activeNote.stored_filename}?token=${localStorage.getItem('daynote_token')}`}")

# Add Logout Button
logout_btn = """
          <div style={{ padding: '0 16px 16px' }}>
            <Button danger block onClick={() => { localStorage.removeItem('daynote_token'); window.location.reload(); }}>登出</Button>
          </div>
"""
if ">登出<" not in content:
    # insert before theme selector
    content = content.replace("<Select value={appTheme} style={{ width: '100%' }}", "<Button danger block style={{ marginBottom: 8 }} onClick={() => { localStorage.removeItem('daynote_token'); window.location.reload(); }}>登出</Button>\n            <Select value={appTheme} style={{ width: '100%' }}")

with open('frontend/src/app/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Frontend auth UI update complete.")
