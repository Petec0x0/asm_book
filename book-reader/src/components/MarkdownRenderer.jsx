import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MarkdownRenderer = ({ path }) => {
  const [content, setContent] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch(`/content/${path}`);
        if (!response.ok) throw new Error('Failed to load content');
        const text = await response.text();
        setContent(text);
        window.scrollTo(0, 0);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchContent();
  }, [path]);

  if (error) return <div className="error">Error: {error}</div>;
  if (!content) return <div className="loading">Loading...</div>;

  // Function to resolve relative paths for images and links
  const resolvePath = (src) => {
    if (src.startsWith('http') || src.startsWith('/') || src.startsWith('#')) return src;
    
    // Get the directory of the current markdown file
    const dir = path.substring(0, path.lastIndexOf('/'));
    
    // Simple resolution for ./ and ../
    let parts = dir.split('/');
    let srcParts = src.split('/');
    
    for (let part of srcParts) {
      if (part === '.') continue;
      if (part === '..') {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    
    return `/content/${parts.join('/')}`;
  };

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={atomDark}
                language={match[1]}
                PreTag="div"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img({ src, alt, ...props }) {
            return <img src={resolvePath(src)} alt={alt} {...props} />;
          },
          a({ href, children, ...props }) {
            // Internal links to other chapters
            if (href.endsWith('.md')) {
                // This is a bit tricky, would need to map it to /read/...
                // For now just resolve it
                return <a href={resolvePath(href)} {...props}>{children}</a>;
            }
            return <a href={href} {...props}>{children}</a>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
