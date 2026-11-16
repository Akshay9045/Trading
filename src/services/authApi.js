import axios from 'axios'

// Login for the deployed app (server/auth.js). Locally, with no APP_PASSWORD set,
// the server reports authRequired: false and the login screen never shows.
export const authApi = {
  me:     () => axios.get('/api/auth/me', { timeout: 10000 }).then(r => r.data),
  login:  (password) => axios.post('/api/auth/login', { password }, { timeout: 10000 }).then(r => r.data),
  logout: () => axios.post('/api/auth/logout').then(r => r.data),
}

// Any API call answered 401 means the session ended — tell the AuthGate to show
// the login screen. Login calls themselves are excluded (401 = wrong password).
export const watchForLogout = (instance) => {
  instance.interceptors.response.use(undefined, (err) => {
    const url = err.config?.url || ''
    if (err.response?.status === 401 && !url.includes('/api/auth/') && !err.response?.data?.providerStatus) {
      window.dispatchEvent(new Event('auth-required'))
    }
    return Promise.reject(err)
  })
}

watchForLogout(axios)
