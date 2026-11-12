
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fleetflow_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('fleetflow_token')
      window.dispatchEvent(new Event('fleetflow:session-expired'))
    }
    return Promise.reject(error)
  },
)

export default api
