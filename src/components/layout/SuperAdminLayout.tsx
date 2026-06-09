import { Outlet } from 'react-router-dom';
import SuperAdminSidebar from './SuperAdminSidebar';

export default function SuperAdminLayout() {
  return (
    <div className="flex min-h-screen">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b flex items-center justify-between px-6 h-12">
          <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">SUPER ADMIN</span>
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
