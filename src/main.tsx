import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'

// StrictMode disabled: Leaflet double-mounts in strict mode and breaks map event handlers
createRoot(document.getElementById('root')!).render(
  <App />,
)
