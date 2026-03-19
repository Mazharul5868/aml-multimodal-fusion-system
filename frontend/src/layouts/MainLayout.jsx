import { Outlet } from "react-router-dom";
import NavBar from "../components/common/NavBar";

export default function MainLayout() {
  return (
    <div className="app-layout">
      <NavBar />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
