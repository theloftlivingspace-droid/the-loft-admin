import AdminDailyDashboard from './AdminDailyDashboard';
import { LanguageProvider } from './LanguageContext';
export default function App() {
  return (
    <LanguageProvider>
      <AdminDailyDashboard />
    </LanguageProvider>
  );
}
