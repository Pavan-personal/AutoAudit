import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Repositories from "./pages/Repositories";
import FileSelection from "./pages/FileSelection";
import ClineFileSelection from "./pages/ClineFileSelection";
import IssuesDisplay from "./pages/IssuesDisplay";
import IssuesList from "./pages/IssuesList";
import PRsList from "./pages/PRsList";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/repositories" element={<Repositories />} />
          <Route path="/repositories/:owner/:repo/files" element={<FileSelection />} />
          <Route path="/repositories/:owner/:repo/files-cline" element={<ClineFileSelection />} />
          <Route path="/repositories/:owner/:repo/issues" element={<IssuesDisplay />} />
          <Route path="/repositories/:owner/:repo/issues-list" element={<IssuesList />} />
          <Route path="/repositories/:owner/:repo/prs-list" element={<PRsList />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
