import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Navbar from '@/components/layout/Navbar'
import DashboardPage from '@/pages/DashboardPage'
import SOLookupPage from '@/pages/SOLookupPage'
import WOLookupPage from '@/pages/WOLookupPage'
import { ThemeProvider } from '@/context/ThemeProvider'
import { EmergencyProvider } from '@/context/EmergencyContext'

export default function App() {
  return (
    <ThemeProvider>
      <EmergencyProvider>
        <BrowserRouter>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/so-lookup" element={<SOLookupPage />} />
              <Route path="/wo-lookup" element={<WOLookupPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      </EmergencyProvider>
    </ThemeProvider>
  )
}
