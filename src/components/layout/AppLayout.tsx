import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import NotificationBell from '@/components/NotificationBell';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b flex items-center justify-end px-6 h-12">
          <NotificationBell />
        </header>
        <main className="flex-1">
          <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
