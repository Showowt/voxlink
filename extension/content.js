// VoxLink WhatsApp Web Extension
// Adds translation capability directly in WhatsApp Web

(function() {
  'use strict';

  // Config
  const TRANSLATE_API = 'https://voxlink-v14.vercel.app/api/translate';
  let sourceLang = localStorage.getItem('voxlink_source') || 'en';
  let targetLang = localStorage.getItem('voxlink_target') || 'es';
  let isTranslating = false;

  // Create the VoxLink UI
  function createVoxLinkUI() {
    // Check if already injected
    if (document.getElementById('voxlink-container')) return;

    const container = document.createElement('div');
    container.id = 'voxlink-container';
    container.innerHTML = `
      <div id="voxlink-toggle" title="VoxLink Translator">
        <span>🌐</span>
      </div>
      <div id="voxlink-panel">
        <div id="voxlink-header">
          <span id="voxlink-title">VoxLink</span>
          <button id="voxlink-close">×</button>
        </div>
        <div id="voxlink-lang-row">
          <button id="voxlink-source" class="voxlink-lang-btn">
            <span class="voxlink-flag"></span>
            <span class="voxlink-lang-text"></span>
          </button>
          <button id="voxlink-swap">⇄</button>
          <button id="voxlink-target" class="voxlink-lang-btn">
            <span class="voxlink-flag"></span>
            <span class="voxlink-lang-text"></span>
          </button>
        </div>
        <textarea id="voxlink-input" placeholder="Type your message..."></textarea>
        <div id="voxlink-output-container">
          <div id="voxlink-output"></div>
          <div id="voxlink-verification"></div>
        </div>
        <div id="voxlink-actions">
          <button id="voxlink-send" disabled>📤 Send Translation</button>
        </div>
        <div id="voxlink-status"></div>
      </div>
    `;

    document.body.appendChild(container);

    // Update language display
    updateLangDisplay();

    // Event listeners
    document.getElementById('voxlink-toggle').addEventListener('click', togglePanel);
    document.getElementById('voxlink-close').addEventListener('click', togglePanel);
    document.getElementById('voxlink-source').addEventListener('click', () => cycleLang('source'));
    document.getElementById('voxlink-target').addEventListener('click', () => cycleLang('target'));
    document.getElementById('voxlink-swap').addEventListener('click', swapLanguages);
    document.getElementById('voxlink-input').addEventListener('input', debounce(handleInput, 500));
    document.getElementById('voxlink-send').addEventListener('click', sendTranslation);

    // Keyboard shortcuts
    document.getElementById('voxlink-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendTranslation();
      }
    });
  }

  // Toggle panel visibility
  function togglePanel() {
    const panel = document.getElementById('voxlink-panel');
    const toggle = document.getElementById('voxlink-toggle');
    const isOpen = panel.classList.toggle('open');
    toggle.classList.toggle('hidden', isOpen);

    if (isOpen) {
      document.getElementById('voxlink-input').focus();
    }
  }

  // Update language button display
  function updateLangDisplay() {
    const flags = { en: '🇺🇸', es: '🇪🇸' };
    const names = { en: 'EN', es: 'ES' };

    const sourceBtn = document.getElementById('voxlink-source');
    const targetBtn = document.getElementById('voxlink-target');

    sourceBtn.querySelector('.voxlink-flag').textContent = flags[sourceLang];
    sourceBtn.querySelector('.voxlink-lang-text').textContent = names[sourceLang];
    targetBtn.querySelector('.voxlink-flag').textContent = flags[targetLang];
    targetBtn.querySelector('.voxlink-lang-text').textContent = names[targetLang];

    // Save to storage
    localStorage.setItem('voxlink_source', sourceLang);
    localStorage.setItem('voxlink_target', targetLang);
  }

  // Cycle language
  function cycleLang(type) {
    if (type === 'source') {
      sourceLang = sourceLang === 'en' ? 'es' : 'en';
      if (sourceLang === targetLang) {
        targetLang = sourceLang === 'en' ? 'es' : 'en';
      }
    } else {
      targetLang = targetLang === 'en' ? 'es' : 'en';
      if (targetLang === sourceLang) {
        sourceLang = targetLang === 'en' ? 'es' : 'en';
      }
    }
    updateLangDisplay();

    // Re-translate if there's text
    const input = document.getElementById('voxlink-input').value;
    if (input.trim()) {
      handleInput();
    }
  }

  // Swap languages
  function swapLanguages() {
    [sourceLang, targetLang] = [targetLang, sourceLang];
    updateLangDisplay();

    // Re-translate if there's text
    const input = document.getElementById('voxlink-input').value;
    if (input.trim()) {
      handleInput();
    }
  }

  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Handle input - translate
  async function handleInput() {
    const input = document.getElementById('voxlink-input').value.trim();
    const output = document.getElementById('voxlink-output');
    const verification = document.getElementById('voxlink-verification');
    const sendBtn = document.getElementById('voxlink-send');
    const status = document.getElementById('voxlink-status');

    if (!input) {
      output.textContent = '';
      verification.textContent = '';
      sendBtn.disabled = true;
      status.textContent = '';
      return;
    }

    if (isTranslating) return;
    isTranslating = true;
    status.textContent = 'Translating...';
    status.className = 'loading';

    try {
      // Step 1: Translate
      const response = await fetch(TRANSLATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          sourceLang,
          targetLang
        })
      });

      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();

      if (!data.translation) {
        throw new Error(data.error || 'Translation failed');
      }

      output.textContent = data.translation;

      // Step 2: Back-translate for verification
      const backResponse = await fetch(TRANSLATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: data.translation,
          sourceLang: targetLang,
          targetLang: sourceLang
        })
      });

      if (backResponse.ok) {
        const backData = await backResponse.json();
        if (backData.translation) {
          verification.innerHTML = `<span class="verify-label">They'll understand:</span> ${backData.translation}`;

          // Check similarity
          const normalize = s => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
          const words1 = normalize(input).split(/\s+/);
          const words2 = normalize(backData.translation).split(/\s+/);
          const common = words1.filter(w => words2.includes(w));
          const similarity = common.length / Math.max(words1.length, words2.length);

          verification.className = similarity > 0.5 ? 'match' : 'warning';
        }
      }

      sendBtn.disabled = false;
      status.textContent = 'Ready to send (Ctrl+Enter)';
      status.className = 'ready';

    } catch (err) {
      console.error('VoxLink translation error:', err);
      output.textContent = '';
      verification.textContent = '';
      sendBtn.disabled = true;
      status.textContent = 'Translation failed';
      status.className = 'error';
    } finally {
      isTranslating = false;
    }
  }

  // Send translation to WhatsApp
  function sendTranslation() {
    const output = document.getElementById('voxlink-output').textContent;
    if (!output) return;

    // Find WhatsApp's input field
    const waInput = document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
                    document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                    document.querySelector('footer div[contenteditable="true"]');

    if (!waInput) {
      showStatus('Could not find WhatsApp input', 'error');
      return;
    }

    // Focus and insert text
    waInput.focus();

    // Clear existing content and insert translation
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, output);

    // Trigger input event for WhatsApp to recognize the change
    waInput.dispatchEvent(new InputEvent('input', { bubbles: true }));

    // Clear VoxLink input
    document.getElementById('voxlink-input').value = '';
    document.getElementById('voxlink-output').textContent = '';
    document.getElementById('voxlink-verification').textContent = '';
    document.getElementById('voxlink-send').disabled = true;

    showStatus('Inserted! Press Enter to send', 'success');

    // Close panel after short delay
    setTimeout(() => {
      const panel = document.getElementById('voxlink-panel');
      const toggle = document.getElementById('voxlink-toggle');
      panel.classList.remove('open');
      toggle.classList.remove('hidden');
    }, 1500);
  }

  // Show status message
  function showStatus(message, type) {
    const status = document.getElementById('voxlink-status');
    status.textContent = message;
    status.className = type;
  }

  // Wait for WhatsApp to load
  function waitForWhatsApp() {
    const observer = new MutationObserver((mutations, obs) => {
      // Check if WhatsApp main UI is loaded
      const mainUI = document.querySelector('#main') || document.querySelector('[data-tab="10"]');
      if (mainUI) {
        obs.disconnect();
        setTimeout(createVoxLinkUI, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also try immediately in case it's already loaded
    setTimeout(() => {
      if (document.querySelector('#main') || document.querySelector('[data-tab="10"]')) {
        observer.disconnect();
        createVoxLinkUI();
      }
    }, 2000);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForWhatsApp);
  } else {
    waitForWhatsApp();
  }

})();
