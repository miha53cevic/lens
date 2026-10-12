// The design system's gallery: every primitive of ui/ and its states, in a dark and a light code
// theme. `npm run gallery` writes it to dist/gallery.html. It is where a new control is looked at
// before it is used, and what a mock is checked against; lens itself never serves it.

import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import { Gallery } from './Gallery.tsx';

createRoot(document.getElementById('root')!).render(<Gallery />);
