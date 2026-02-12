// VoxLink WhatsApp Web Extension
// Adds translation + voice transcription directly in WhatsApp Web

(function() {
  'use strict';

  // Config
  const TRANSLATE_API = 'https://voxlink-v14.vercel.app/api/translate';
  let sourceLang = localStorage.getItem('voxlink_source') || 'en';
  let targetLang = localStorage.getItem('voxlink_target') || 'es';
  let isTranslating = false;
  let isRecording = false;
  let recognition = null;

  // Create the VoxLink UI
  function createVoxLinkUI() {
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
        <div id="voxlink-input-row">
          <textarea id="voxlink-input" placeholder="Type or tap mic to speak..."></textarea>
          <button id="voxlink-mic" title="Voice input">🎤</button>
        </div>
        <div id="voxlink-output-container">
          <div id="voxlink-output"></div>
          <div id="voxlink-verification"></div>
        </div>
        <div id="voxlink-actions">
          <button id="voxlink-copy" disabled>📋 Copy</button>
          <button id="voxlink-send" disabled>📤 Send</button>
        </div>
        <div id="voxlink-status"></div>
      </div>
    `;

    document.body.appendChild(container);
    updateLangDisplay();

    // Event listeners
    document.getElementById('voxlink-toggle').addEventListener('click', togglePanel);
    document.getElementById('voxlink-close').addEventListener('click', togglePanel);
    document.getElementById('voxlink-source').addEventListener('click', () => cycleLang('source'));
    document.getElementById('voxlink-target').addEventListener('click', () => cycleLang('target'));
    document.getElementById('voxlink-swap').addEventListener('click', swapLanguages);
    document.getElementById('voxlink-input').addEventListener('input', debounce(handleInput, 500));
    document.getElementById('voxlink-send').addEventListener('click', sendTranslation);
    document.getElementById('voxlink-copy').addEventListener('click', copyTranslation);
    document.getElementById('voxlink-mic').addEventListener('click', toggleVoiceInput);

    // Keyboard shortcuts
    document.getElementById('voxlink-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendTranslation();
      }
    });
  }

  // Toggle panel
  function togglePanel() {
    const panel = document.getElementById('voxlink-panel');
    const toggle = document.getElementById('voxlink-toggle');
    const isOpen = panel.classList.toggle('open');
    toggle.classList.toggle('hidden', isOpen);
    if (isOpen) {
      document.getElementById('voxlink-input').focus();
    }
  }

  // Update language display
  function updateLangDisplay() {
    const flags = { en: '🇺🇸', es: '🇪🇸' };
    const names = { en: 'EN', es: 'ES' };

    document.querySelector('#voxlink-source .voxlink-flag').textContent = flags[sourceLang];
    document.querySelector('#voxlink-source .voxlink-lang-text').textContent = names[sourceLang];
    document.querySelector('#voxlink-target .voxlink-flag').textContent = flags[targetLang];
    document.querySelector('#voxlink-target .voxlink-lang-text').textContent = names[targetLang];

    localStorage.setItem('voxlink_source', sourceLang);
    localStorage.setItem('voxlink_target', targetLang);
  }

  // Cycle language
  function cycleLang(type) {
    if (type === 'source') {
      sourceLang = sourceLang === 'en' ? 'es' : 'en';
      if (sourceLang === targetLang) targetLang = sourceLang === 'en' ? 'es' : 'en';
    } else {
      targetLang = targetLang === 'en' ? 'es' : 'en';
      if (targetLang === sourceLang) sourceLang = targetLang === 'en' ? 'es' : 'en';
    }
    updateLangDisplay();
    const input = document.getElementById('voxlink-input').value;
    if (input.trim()) handleInput();
  }

  // Swap languages
  function swapLanguages() {
    [sourceLang, targetLang] = [targetLang, sourceLang];
    updateLangDisplay();
    const input = document.getElementById('voxlink-input').value;
    if (input.trim()) handleInput();
  }

  // Debounce
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Voice input toggle
  function toggleVoiceInput() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Start voice recording
  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showStatus('Voice not supported. Use Chrome.', 'error');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sourceLang === 'en' ? 'en-US' : 'es-ES';

    const input = document.getElementById('voxlink-input');
    const mic = document.getElementById('voxlink-mic');
    let finalTranscript = '';

    recognition.onstart = () => {
      isRecording = true;
      mic.classList.add('recording');
      mic.textContent = '⏹️';
      showStatus('Listening... Tap to stop', 'recording');
      input.placeholder = 'Listening...';
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim = transcript;
        }
      }
      input.value = finalTranscript + interim;
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      if (event.error === 'not-allowed') {
        showStatus('Microphone blocked. Allow access.', 'error');
      } else {
        showStatus('Voice error: ' + event.error, 'error');
      }
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) {
        // Auto-translate when done
        const text = input.value.trim();
        if (text) {
          handleInput();
        }
      }
      stopRecording();
    };

    try {
      recognition.start();
    } catch (err) {
      showStatus('Could not start voice input', 'error');
    }
  }

  // Stop recording
  function stopRecording() {
    isRecording = false;
    const mic = document.getElementById('voxlink-mic');
    const input = document.getElementById('voxlink-input');

    mic.classList.remove('recording');
    mic.textContent = '🎤';
    input.placeholder = 'Type or tap mic to speak...';

    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }

    // Translate the result
    const text = input.value.trim();
    if (text) {
      handleInput();
    } else {
      showStatus('', '');
    }
  }

  // Handle input - translate
  async function handleInput() {
    const input = document.getElementById('voxlink-input').value.trim();
    const output = document.getElementById('voxlink-output');
    const verification = document.getElementById('voxlink-verification');
    const sendBtn = document.getElementById('voxlink-send');

    if (!input) {
      output.textContent = '';
      verification.textContent = '';
      sendBtn.disabled = true;
      document.getElementById('voxlink-copy').disabled = true;
      showStatus('', '');
      return;
    }

    if (isTranslating) return;
    isTranslating = true;
    showStatus('Translating...', 'loading');

    try {
      // Translate
      const response = await fetch(TRANSLATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input, sourceLang, targetLang })
      });

      if (!response.ok) throw new Error('API error: ' + response.status);
      const data = await response.json();

      if (!data.translation) throw new Error(data.error || 'No translation');

      output.textContent = data.translation;

      // Back-translate
      const backRes = await fetch(TRANSLATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data.translation, sourceLang: targetLang, targetLang: sourceLang })
      });

      if (backRes.ok) {
        const backData = await backRes.json();
        if (backData.translation) {
          verification.innerHTML = `<span class="verify-label">They'll understand:</span> ${backData.translation}`;

          const normalize = s => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
          const words1 = normalize(input).split(/\s+/);
          const words2 = normalize(backData.translation).split(/\s+/);
          const common = words1.filter(w => words2.includes(w));
          const similarity = common.length / Math.max(words1.length, words2.length);
          verification.className = similarity > 0.5 ? 'match' : 'warning';
        }
      }

      sendBtn.disabled = false;
      document.getElementById('voxlink-copy').disabled = false;
      showStatus('Ready! Ctrl+Enter to send', 'ready');

    } catch (err) {
      console.error('VoxLink error:', err);
      output.textContent = '';
      verification.textContent = '';
      sendBtn.disabled = true;
      document.getElementById('voxlink-copy').disabled = true;
      showStatus('Error: ' + err.message, 'error');
    } finally {
      isTranslating = false;
    }
  }

  // Copy translation
  async function copyTranslation() {
    const output = document.getElementById('voxlink-output').textContent;
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output);
      showStatus('✓ Copied to clipboard!', 'success');

      // Visual feedback
      const copyBtn = document.getElementById('voxlink-copy');
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
      }, 2000);
    } catch (err) {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = output;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showStatus('✓ Copied to clipboard!', 'success');
    }
  }

  // Send translation
  function sendTranslation() {
    const output = document.getElementById('voxlink-output').textContent;
    if (!output) return;

    // Find WhatsApp input
    const selectors = [
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
      'footer div[contenteditable="true"]',
      'div[contenteditable="true"][data-lexical-editor="true"]'
    ];

    let waInput = null;
    for (const sel of selectors) {
      waInput = document.querySelector(sel);
      if (waInput) break;
    }

    if (!waInput) {
      showStatus('Open a chat first!', 'error');
      return;
    }

    waInput.focus();

    // Insert text
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, output);
    waInput.dispatchEvent(new InputEvent('input', { bubbles: true }));

    // Clear VoxLink
    document.getElementById('voxlink-input').value = '';
    document.getElementById('voxlink-output').textContent = '';
    document.getElementById('voxlink-verification').textContent = '';
    document.getElementById('voxlink-send').disabled = true;
    document.getElementById('voxlink-copy').disabled = true;

    showStatus('✓ Inserted! Press Enter to send', 'success');

    setTimeout(() => {
      document.getElementById('voxlink-panel').classList.remove('open');
      document.getElementById('voxlink-toggle').classList.remove('hidden');
    }, 1500);
  }

  // Show status
  function showStatus(message, type) {
    const status = document.getElementById('voxlink-status');
    if (status) {
      status.textContent = message;
      status.className = type || '';
    }
  }

  // Wait for WhatsApp
  function waitForWhatsApp() {
    const observer = new MutationObserver((mutations, obs) => {
      if (document.querySelector('#main') || document.querySelector('[data-tab="10"]')) {
        obs.disconnect();
        setTimeout(createVoxLinkUI, 1000);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      if (document.querySelector('#main') || document.querySelector('[data-tab="10"]')) {
        observer.disconnect();
        createVoxLinkUI();
      }
    }, 2000);
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForWhatsApp);
  } else {
    waitForWhatsApp();
  }

})();
