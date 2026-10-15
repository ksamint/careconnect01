import { Navigate, useLocation } from 'react-router-dom'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp, homePathForUser, isAdmin } from './context/AppContext'
import type { Portal } from './auth'
import Login from './pages/Login'
import AdminHub from './pages/admin/AdminHub'
import UserManagement from './pages/admin/UserManagement'
import StudySettings from './pages/admin/StudySettings'
import { StudyProvider } from './study/StudyProvider'
import ParticipantForm from './pages/clinical/ParticipantForm'
import DataEntry from './pages/clinical/DataEntry'
import FillOnDevice from './pages/clinical/FillOnDevice'
import SubmissionDetail from './pages/clinical/SubmissionDetail'
import PatientHome from './pages/patient/Home'
import Assessment from './pages/patient/Assessment'
import AssessmentSuccess from './pages/patient/AssessmentSuccess'
import Wisdom from './pages/patient/Wisdom'
import WisdomArticle from './pages/patient/WisdomArticle'
import Notifications from './pages/patient/Notifications'
import Profile from './pages/patient/Profile'
import CohortDashboard from './pages/clinical/CohortDashboard'
import PatientProfile from './pages/clinical/PatientProfile'
import InterventionLog from './pages/clinical/InterventionLog'
import InterventionSuccess from './pages/clinical/InterventionSuccess'
import Analytics from './pages/research/Analytics'
import DataExport from './pages/research/DataExport'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useApp()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

function RequirePortal({ portal, children }: { portal: Portal; children: React.ReactNode }) {
  const { canAccess } = useApp()
  if (!canAccess(portal)) return <Navigate to="/admin" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useApp()
  if (!user || !isAdmin(user.role)) return <Navigate to={user ? homePathForUser(user) : '/login'} replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { isAuthenticated, user } = useApp()
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />
  return <Navigate to={homePathForUser(user)} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminHub /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/users" element={<RequireAuth><RequireAdmin><UserManagement /></RequireAdmin></RequireAuth>} />
      <Route path="/admin/study" element={<RequireAuth><RequireAdmin><StudySettings /></RequireAdmin></RequireAuth>} />

      <Route path="/patient/home" element={<RequireAuth><RequirePortal portal="patient"><PatientHome /></RequirePortal></RequireAuth>} />
      <Route path="/patient/assessment" element={<RequireAuth><RequirePortal portal="patient"><Assessment /></RequirePortal></RequireAuth>} />
      <Route path="/patient/assessment/success" element={<RequireAuth><RequirePortal portal="patient"><AssessmentSuccess /></RequirePortal></RequireAuth>} />
      <Route path="/patient/wisdom" element={<RequireAuth><RequirePortal portal="patient"><Wisdom /></RequirePortal></RequireAuth>} />
      <Route path="/patient/wisdom/:id" element={<RequireAuth><RequirePortal portal="patient"><WisdomArticle /></RequirePortal></RequireAuth>} />
      <Route path="/patient/notifications" element={<RequireAuth><RequirePortal portal="patient"><Notifications /></RequirePortal></RequireAuth>} />
      <Route path="/patient/profile" element={<RequireAuth><RequirePortal portal="patient"><Profile /></RequirePortal></RequireAuth>} />

      <Route path="/clinical/cohort" element={<RequireAuth><RequirePortal portal="clinical"><CohortDashboard /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id" element={<RequireAuth><RequirePortal portal="clinical"><PatientProfile /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/enroll" element={<RequireAuth><RequirePortal portal="clinical"><ParticipantForm /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id/crf" element={<RequireAuth><RequirePortal portal="clinical"><ParticipantForm /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id/entry" element={<RequireAuth><RequirePortal portal="clinical"><DataEntry /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id/fill" element={<RequireAuth><RequirePortal portal="clinical"><FillOnDevice /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id/submission/:sid" element={<RequireAuth><RequirePortal portal="clinical"><SubmissionDetail /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/patient/:id/submission/:sid/action" element={<RequireAuth><RequirePortal portal="clinical"><InterventionLog /></RequirePortal></RequireAuth>} />
      <Route path="/clinical/intervention/success" element={<RequireAuth><RequirePortal portal="clinical"><InterventionSuccess /></RequirePortal></RequireAuth>} />

      <Route path="/research/analytics" element={<RequireAuth><RequirePortal portal="research"><Analytics /></RequirePortal></RequireAuth>} />
      <Route path="/research/export" element={<RequireAuth><RequirePortal portal="research"><DataExport /></RequirePortal></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function StudyGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useApp()
  // Remount per user so one account never sees another's cached data.
  return <StudyProvider key={user?.username ?? 'anon'} enabled={isAuthenticated}>{children}</StudyProvider>
}

export default function App() {
  return (
    <AppProvider>
      <StudyGate>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </StudyGate>
    </AppProvider>
  )
}
