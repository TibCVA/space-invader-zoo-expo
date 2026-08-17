import { createRoot } from 'react-dom/client';
import { LandingPage } from './landing/index.js';
createRoot(document.getElementById('root')!).render(
  <LandingPage hasSave={false} onNewGame={() => {}} onContinue={() => {}} onLoad={() => {}} onCodex={() => {}} onOptions={() => {}} />,
);
