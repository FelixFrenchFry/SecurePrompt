import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../source/ui/App';
import '../../source/ui/tokens.css';
import '../../source/ui/app.css';

const root = document.getElementById('root');

if (root == null)
{
    throw new Error('SecurePrompt root element is missing.');
}

createRoot(root).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
