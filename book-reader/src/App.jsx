import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import MarkdownRenderer from './components/MarkdownRenderer';
import { Menu, X } from 'lucide-react';

const ReaderView = () => {
  const { '*': path } = useParams();
  return <MarkdownRenderer path={decodeURIComponent(path)} />;
};

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <Router>
      <div className="mobile-header">
        <div className="sidebar-title" style={{ marginBottom: 0 }}>Asm Book</div>
        <button 
          onClick={toggleSidebar}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
        >
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/read/section_1%2Fkickstart.md" replace />} />
          <Route path="/read/*" element={<ReaderView />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
