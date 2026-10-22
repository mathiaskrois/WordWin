import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { startActivity } from "./activity";
const isUsersPage = window.location.pathname.replace(/\/$/, "") === `${import.meta.env.BASE_URL}users`;
const Users = lazy(() => import("./Users"));
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
if (!isUsersPage) startActivity();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isUsersPage ? <Suspense fallback={<main>Loading users…</main>}><Users /></Suspense> : <App />}
  </React.StrictMode>,
);
