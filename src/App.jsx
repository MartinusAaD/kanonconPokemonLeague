import { useEffect, useState } from "react";
import "./App.module.css";
import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";

function App() {
  return (
    <>
      <header>
        <Navbar />
      </header>
      <main>
        <Outlet />
      </main>
      <footer>
        
      </footer>
    </>
  );
}

export default App;
