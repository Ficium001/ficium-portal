import { StrictMode }          from "react";
import { createRoot }          from "react-dom/client";
import { RouterProvider }      from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router }              from "./app/routes";
import { queryClient }         from "./app/query-client";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found in index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
