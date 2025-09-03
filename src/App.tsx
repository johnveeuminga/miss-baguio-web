import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useStore } from "./store/useStore";
import { Button } from "@/components/ui/button";

function Home() {
  const { count, inc } = useStore();
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4 text-gold">
        Scoring & Tabulation
      </h1>
      <p className="mb-4">Counter: {count}</p>
      <Button onClick={inc}>Increment</Button>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
