import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { getExercisesForChapter } from '../data/lessonExercises';
import ChallengeView from './ChallengeView';
import CPULator from '../simulator/CPULator';
import CRunner from '../simulator/CRunner';
import manifest from '../manifest.json';
import { 
  Play, 
  Copy, 
  Check, 
  Cpu, 
  Terminal, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Maximize2 
} from 'lucide-react';

const MarkdownRenderer = ({ path }) => {
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activePracticeModal, setActivePracticeModal] = useState(null); // null | { type: 'cpulator' | 'crunner', code, challenge }
  const navigate = useNavigate();

  const cleanPath = path.split('#')[0];
  const targetHash = path.includes('#') ? path.split('#')[1] : null;

  // Flatten all chapters across sections for prev/next navigation
  const allChapters = manifest.flatMap(section => 
    section.chapters.map(ch => ({ ...ch, sectionTitle: section.title }))
  );
  const currentChapterIndex = allChapters.findIndex(ch => ch.path === path || ch.path === cleanPath);
  const prevChapter = currentChapterIndex > 0 ? allChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < allChapters.length - 1 
    ? allChapters[currentChapterIndex + 1] 
    : null;

  const exercises = getExercisesForChapter(cleanPath);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setError(null);
        const response = await fetch(`/content/${cleanPath}`);
        if (!response.ok) throw new Error(`Failed to load content for ${cleanPath}`);
        const text = await response.text();
        setContent(text);

        if (targetHash) {
          setTimeout(() => {
            const el = document.getElementById(targetHash);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 150);
        } else {
          window.scrollTo(0, 0);
        }
      } catch (err) {
        setError(err.message);
      }
    };
    fetchContent();
  }, [cleanPath, targetHash]);

  // Resolve relative paths for images and internal markdown links
  const resolvePath = (src) => {
    if (src.startsWith('http') || src.startsWith('/') || src.startsWith('#')) return src;
    const dir = cleanPath.substring(0, cleanPath.lastIndexOf('/'));
    const parts = dir ? dir.split('/') : [];
    const srcParts = src.split('/');

    for (const part of srcParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    return parts.join('/');
  };

  const handleCopyCode = (codeText, idx) => {
    navigator.clipboard.writeText(codeText);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleOpenSimulator = (starterCode = null, challenge = null) => {
    setActivePracticeModal({
      type: 'cpulator',
      code: starterCode,
      challenge: challenge
    });
  };

  const handleOpenCRunner = (code = null) => {
    setActivePracticeModal({
      type: 'crunner',
      code: code
    });
  };

  if (error) {
    return (
      <div className="error-card">
        <h3>Unable to load lesson content</h3>
        <p className="text-sm text-slate-400 mt-1">{error}</p>
        <button 
          onClick={() => navigate('/read/section_1%2Fkickstart.md')}
          className="cpulator-btn cpulator-btn-primary mt-4"
        >
          Return to Kickstart
        </button>
      </div>
    );
  }

  if (!content) return <div className="loading">Loading lesson content...</div>;

  let codeBlockCounter = 0;

  return (
    <div className="reader-wrapper">
      {/* Top Breadcrumb & Quick Actions */}
      <div className="reader-breadcrumb-bar">
        <div className="breadcrumb-path">
          <span className="text-slate-400">Lesson: </span>
          <strong className="text-slate-200">
            {allChapters[currentChapterIndex]?.title || cleanPath}
          </strong>
        </div>

        <div className="flex items-center gap-2">
          {exercises.length > 0 && (
            <button 
              onClick={() => handleOpenSimulator(exercises[0].starterCode, exercises[0])}
              className="breadcrumb-action-btn btn-action-sim"
            >
              <Cpu size={14} />
              <span>Practice in CPULator</span>
            </button>
          )}

          {cleanPath.startsWith('c_course') && (
            <button 
              onClick={() => handleOpenCRunner(null)}
              className="breadcrumb-action-btn btn-action-c"
            >
              <Terminal size={14} />
              <span>Open C Sandbox</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Markdown Article */}
      <article className="prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            code({ inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const lang = match ? match[1].toLowerCase() : '';
              const codeText = String(children).replace(/\n$/, '');
              const blockId = codeBlockCounter++;

              if (!inline && match) {
                const isAsm = ['s', 'asm', 'arm64', 'assembly'].includes(lang);
                const isC = ['c', 'cpp', 'h'].includes(lang);

                return (
                  <div className="code-block-container">
                    <div className="code-block-header">
                      <div className="flex items-center gap-2">
                        {isAsm && <Cpu size={14} className="text-cyan-400" />}
                        {isC && <Terminal size={14} className="text-amber-400" />}
                        <span className="code-block-lang">
                          {isAsm ? 'ARM64 Assembly' : isC ? 'C / C++' : lang.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAsm && (
                          <button 
                            onClick={() => handleOpenSimulator(codeText, null)}
                            className="code-action-btn btn-run-asm"
                            title="Open snippet in CPULator simulator"
                          >
                            <Play size={12} />
                            <span>Run in CPULator</span>
                          </button>
                        )}

                        {isC && (
                          <button 
                            onClick={() => handleOpenCRunner(codeText)}
                            className="code-action-btn btn-run-c"
                            title="Run snippet in C sandbox"
                          >
                            <Play size={12} />
                            <span>Run in C Sandbox</span>
                          </button>
                        )}

                        <button 
                          onClick={() => handleCopyCode(codeText, blockId)}
                          className="code-action-btn"
                          title="Copy code"
                        >
                          {copiedIndex === blockId ? (
                            <>
                              <Check size={12} className="text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <SyntaxHighlighter
                      style={atomDark}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {codeText}
                    </SyntaxHighlighter>
                  </div>
                );
              }

              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            img({ src, alt, ...props }) {
              const resolved = resolvePath(src);
              return <img src={`/content/${resolved}`} alt={alt} {...props} />;
            },
            a({ href, children, ...props }) {
              if (!href) return children;

              // Handle anchor hashes on same page
              if (href.startsWith('#')) {
                return (
                  <a 
                    href={href} 
                    onClick={(e) => {
                      e.preventDefault();
                      const target = document.getElementById(href.slice(1));
                      if (target) target.scrollIntoView({ behavior: 'smooth' });
                    }}
                    {...props}
                  >
                    {children}
                  </a>
                );
              }

              // Handle internal links to .md files or folders
              if (href.endsWith('.md') || href.startsWith('./') || href.startsWith('../')) {
                let cleanTarget = resolvePath(href);
                if (!cleanTarget.endsWith('.md')) {
                  cleanTarget = `${cleanTarget}/README.md`;
                }
                return (
                  <Link to={`/read/${encodeURIComponent(cleanTarget)}`} className="internal-reader-link" {...props}>
                    {children}
                  </Link>
                );
              }

              return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
            }
          }}
        >
          {content}
        </ReactMarkdown>
      </article>

      {/* Interactive Exercises Section for this Lesson */}
      <ChallengeView 
        exercises={exercises} 
        onOpenInSimulator={handleOpenSimulator} 
      />

      {/* Prev / Next Chapter Navigation Footer */}
      <footer className="chapter-nav-footer">
        {prevChapter ? (
          <Link to={`/read/${encodeURIComponent(prevChapter.path)}`} className="chapter-nav-btn nav-prev">
            <ChevronLeft size={20} />
            <div className="nav-text-col">
              <span className="nav-label">Previous Lesson</span>
              <span className="nav-title">{prevChapter.title}</span>
            </div>
          </Link>
        ) : <div />}

        {nextChapter && (
          <Link to={`/read/${encodeURIComponent(nextChapter.path)}`} className="chapter-nav-btn nav-next">
            <div className="nav-text-col text-right">
              <span className="nav-label">Next Lesson</span>
              <span className="nav-title">{nextChapter.title}</span>
            </div>
            <ChevronRight size={20} />
          </Link>
        )}
      </footer>

      {/* Interactive Practice Slide-Out Modal Drawer */}
      {activePracticeModal && (
        <div className="practice-modal-backdrop">
          <div className="practice-modal-container">
            <div className="practice-modal-header">
              <div className="flex items-center gap-2">
                {activePracticeModal.type === 'cpulator' ? (
                  <>
                    <Cpu size={18} className="text-cyan-400" />
                    <strong>CPULator Interactive Simulator</strong>
                  </>
                ) : (
                  <>
                    <Terminal size={18} className="text-amber-400" />
                    <strong>C Systems Sandbox & Disassembler</strong>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {activePracticeModal.type === 'cpulator' && (
                  <button 
                    onClick={() => {
                      setActivePracticeModal(null);
                      navigate('/simulator');
                    }}
                    className="modal-tool-btn"
                    title="Open Fullscreen Simulator"
                  >
                    <Maximize2 size={15} />
                    <span>Full Screen</span>
                  </button>
                )}

                <button 
                  onClick={() => setActivePracticeModal(null)}
                  className="modal-tool-btn"
                  title="Close practice window"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="practice-modal-body">
              {activePracticeModal.type === 'cpulator' ? (
                <CPULator 
                  initialCode={activePracticeModal.code}
                  challenge={activePracticeModal.challenge}
                />
              ) : (
                <CRunner 
                  initialCode={activePracticeModal.code}
                  onLoadAsmInCpulator={(asmCode) => {
                    setActivePracticeModal({
                      type: 'cpulator',
                      code: asmCode
                    });
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkdownRenderer;
