"use client";

import Navigation from "./_components/navigation";
import { SearchCommand } from "@/components/search-command";
import { PagePicker } from "@/components/page-picker";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full flex dark:bg-[#1F1F1F]">
      <Navigation />
      <main className="flex-1 h-full overflow-y-auto">
        <SearchCommand />
        <PagePicker />
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
