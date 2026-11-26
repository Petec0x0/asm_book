// Syntax colouring for the sandbox editor. The editor stays a plain <textarea>
// (typing, selection, undo, Tab and mobile keyboards all keep working); this
// draws the same text, coloured, directly behind it. The textarea's own text is
// transparent, so what you see is this layer and what you edit is the textarea.
// It uses the same highlighter and theme as code blocks in the lessons.
import { memo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Font, padding and line height must match .editor-textarea exactly, or the
// coloured text drifts away from the caret. They come from the CSS class.
const PRE_STYLE = {
  margin: 0, padding: 0, background: 'transparent', border: 0, borderRadius: 0,
  textShadow: 'none', overflow: 'visible', font: 'inherit', lineHeight: 'inherit', tabSize: 'inherit',
  whiteSpace: 'pre',
};
const CODE_STYLE = { font: 'inherit', lineHeight: 'inherit', whiteSpace: 'pre', tabSize: 'inherit', textShadow: 'none' };

const languageFor = (fileName = '') => (/\.(c|h)$/i.test(fileName) ? 'c' : 'text');

function CodeHighlight({ code, fileName }) {
  // A trailing newline would otherwise be dropped from the last line's height.
  const text = code.endsWith('\n') ? `${code} ` : code;
  return (
    <SyntaxHighlighter
      language={languageFor(fileName)}
      style={atomDark}
      customStyle={PRE_STYLE}
      codeTagProps={{ style: CODE_STYLE }}
      PreTag="div"
    >
      {text}
    </SyntaxHighlighter>
  );
}

export default memo(CodeHighlight);
