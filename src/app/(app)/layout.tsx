import { TopBar } from "@/components/navigation/TopBar";
import { Sidebar } from "@/components/navigation/Sidebar";
import { MobileNav } from "@/components/navigation/MobileNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <TopBar />
      <div className="flex flex-1">
        <Sidebar />
        <main
          id="main-content"
          className="flex-1 overflow-auto pb-24 md:pb-0"
        >
          <div className="mx-auto max-w-[1200px] p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
