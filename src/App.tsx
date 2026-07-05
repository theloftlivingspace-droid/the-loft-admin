import AdminDailyDashboard from './AdminDailyDashboard';
import ThemePreview from './ThemePreview';
import { LanguageProvider } from './LanguageContext';

export default function App() {
  const isThemePreview = typeof window !== 'undefined' && window.location.hash === '#theme-preview';

  if (isThemePreview) {
    return <ThemePreview />;
  }

  return (
    <LanguageProvider>
      <AdminDailyDashboard />
    </LanguageProvider>
  );
}
