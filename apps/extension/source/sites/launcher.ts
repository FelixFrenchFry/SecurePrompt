import logoSvg from '../../public/icons/logo.svg?raw';

// the logo button on chat sites that opens the side panel, inside a shadow root so the site's
// styles can't change it; only the logo shows, the click area around it stays round and invisible

const LABEL = 'Open SecurePrompt';

const STYLE = `
:host { all: initial; position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; }
button {
    display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0;
    border: 0; border-radius: 50%; background: transparent; cursor: pointer;
}
button:focus-visible { outline: 2px solid #4493f8; outline-offset: 2px; }
svg { display: block; width: 28px; height: 28px; transition: transform 0.15s ease-out; }
button:hover svg, button:focus-visible svg { transform: scale(1.18); }
@media (prefers-reduced-motion: reduce) { svg { transition: none; } }
`;

export const mountLauncher = (options: { id: string; onOpen: () => void }) =>
{
    document.getElementById(options.id)?.remove();

    const host = document.createElement('secureprompt-launcher');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    const button = document.createElement('button');
    // the logo is part of the script, so no extension file is exposed to the page
    const logo = new DOMParser().parseFromString(logoSvg, 'image/svg+xml').documentElement;

    host.id = options.id;
    style.textContent = STYLE;
    button.type = 'button';
    button.setAttribute('aria-label', LABEL);
    button.title = LABEL;
    logo.setAttribute('aria-hidden', 'true');
    button.append(document.importNode(logo, true));
    root.append(style, button);
    button.addEventListener('click', options.onOpen);
    document.documentElement.append(host);

    return host;
};
