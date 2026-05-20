import React from 'react';
import { NavLink } from 'react-router-dom';
import manifest from '../manifest.json';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-title">Asm Book</div>
      {manifest.map((section, idx) => (
        <div key={idx} className="sidebar-section">
          <div className="sidebar-section-title">{section.title}</div>
          {section.chapters.map((chapter) => (
            <NavLink
              key={chapter.id}
              to={`/read/${encodeURIComponent(chapter.path)}`}
              className={({ isActive }) => 
                `sidebar-item ${isActive ? 'active' : ''}`
              }
              onClick={() => {
                if (window.innerWidth <= 1024) toggleSidebar();
              }}
            >
              {chapter.title}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  );
};

export default Sidebar;
