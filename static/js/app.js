// ========== State ==========
let models = [];
let currentModelId = null;
let selectedRefContent = '';
let uploadedFileTexts = [];
let uploadedFileNames = [];
let isGenerating = false;
let currentModelType = 'public';
let currentRefType = 'url';
let refContentConfirmed = false;

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  setupTextareaAutoResize();
  setupWordCountToggle();
  setupModelSelect();
  setupUpload();
  setupSend();
  setupTypeSelect();
});

// ========== Load Models ==========
async function loadModels() {
  const resp = await fetch('/api/models');
  models = await resp.json();
  renderModelSelect();
}

function renderModelSelect() {
  const sel = document.getElementById('modelSelect');
  const prevValue = sel.value;
  sel.innerHTML = '<option value="" disabled selected>选择模型</option>';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  const addOpt = document.createElement('option');
  addOpt.value = '__add__';
  addOpt.textContent = '＋ 添加模型';
  sel.appendChild(addOpt);

  if (prevValue && models.some(m => m.id == prevValue)) {
    sel.value = prevValue;
  }
}

// ========== Model Select Handler ==========
function setupModelSelect() {
  const sel = document.getElementById('modelSelect');
  sel.addEventListener('change', () => {
    if (sel.value === '__add__') {
      sel.value = '';
      openAddModelModal();
    } else {
      currentModelId = sel.value;
    }
  });
}

// ========== Textarea Auto Resize ==========
function setupTextareaAutoResize() {
  const ta = document.getElementById('inputTextarea');
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight);
    const minH = lineHeight * 2 + 32;
    const maxH = lineHeight * 5 + 32;
    ta.style.height = Math.max(minH, Math.min(ta.scrollHeight, maxH)) + 'px';
  });
}

// ========== Word Count Toggle ==========
function setupWordCountToggle() {
  const sel = document.getElementById('wordCountSelect');
  const inp = document.getElementById('customWordInput');
  sel.addEventListener('change', () => {
    inp.style.display = sel.value === 'custom' ? 'inline-block' : 'none';
    if (sel.value === 'custom') inp.focus();
  });
}

// ========== Type Select ==========
function setupTypeSelect() {
  const sel = document.getElementById('typeSelect');
  sel.addEventListener('change', () => {
    if (sel.value === '其他') {
      openRefModal();
    }
    selectedRefContent = '';
    refContentConfirmed = false;
  });
}

// ========== Upload ==========
function setupUpload() {
  const btn = document.getElementById('uploadBtn');
  const inp = document.getElementById('fileInput');
  btn.addEventListener('click', () => inp.click());
  inp.addEventListener('change', async () => {
    const files = inp.files;
    if (!files.length) return;
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const resp = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await resp.json();
        if (data.text) {
          uploadedFileTexts.push(data.text);
          uploadedFileNames.push(file.name);
          renderFileTags();
        } else {
          alert('文件解析失败: ' + (data.error || '未知错误'));
        }
      } catch (e) {
        alert('上传失败: ' + e.message);
      }
    }
    inp.value = '';
  });
}

function renderFileTags() {
  const container = document.getElementById('fileTagContainer');
  container.innerHTML = '';
  uploadedFileNames.forEach((name, i) => {
    const tag = document.createElement('span');
    tag.className = 'file-tag';
    tag.innerHTML = `📎 ${name} <span class="remove-file" data-idx="${i}">×</span>`;
    container.appendChild(tag);
  });
  container.querySelectorAll('.remove-file').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      uploadedFileTexts.splice(idx, 1);
      uploadedFileNames.splice(idx, 1);
      renderFileTags();
    });
  });
}

// ========== Send ==========
function setupSend() {
  const btn = document.getElementById('sendBtn');
  btn.addEventListener('click', generatePressRelease);
}

async function generatePressRelease() {
  if (isGenerating) return;

  const modelSel = document.getElementById('modelSelect');
  const typeSel = document.getElementById('typeSelect');
  const wordSel = document.getElementById('wordCountSelect');
  const customWord = document.getElementById('customWordInput');
  const textarea = document.getElementById('inputTextarea');
  const outputArea = document.getElementById('outputArea');

  if (!modelSel.value || modelSel.value === '__add__') {
    alert('请先选择一个模型');
    return;
  }

  if (typeSel.value === '其他' && !refContentConfirmed) {
    alert('请先确认内容参考');
    openRefModal();
    return;
  }

  let wordCount = wordSel.value === 'custom' ? parseInt(customWord.value) || 500 : parseInt(wordSel.value);

  const model = models.find(m => m.id == modelSel.value);
  if (!model) {
    alert('模型不存在');
    return;
  }

  isGenerating = true;
  btn = document.getElementById('sendBtn');
  btn.disabled = true;
  outputArea.innerHTML = '<span class="typing-cursor"></span>';

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: model.id,
        type: typeSel.value,
        word_count: wordCount,
        user_input: textarea.value,
        file_texts: uploadedFileTexts,
        ref_content: typeSel.value === '其他' ? selectedRefContent : ''
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      outputArea.textContent = '生成失败: ' + (err.error || '未知错误');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullText += parsed.content;
              outputArea.innerHTML = escapeHtml(fullText) + '<span class="typing-cursor"></span>';
              outputArea.scrollTop = outputArea.scrollHeight;
            }
            if (parsed.error) {
              outputArea.textContent = '错误: ' + parsed.error;
              return;
            }
          } catch (e) {
            // skip
          }
        }
      }
    }

    outputArea.textContent = fullText;
  } catch (e) {
    outputArea.textContent = '请求失败: ' + e.message;
  } finally {
    isGenerating = false;
    document.getElementById('sendBtn').disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== Add Model Modal ==========
function openAddModelModal() {
  document.getElementById('addModelModal').classList.add('active');
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('addModelConfirmBtn').disabled = true;
  switchModelType('public');
}

function closeAddModelModal() {
  document.getElementById('addModelModal').classList.remove('active');
  // Clear inputs
  document.getElementById('modelName').value = '';
  document.getElementById('modelApiKey').value = '';
  document.getElementById('localModelName').value = '';
  document.getElementById('localModelId').value = '';
  document.getElementById('localModelUrl').value = '';
  document.getElementById('localModelApiKey').value = '';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('addModelConfirmBtn').disabled = true;
}

function switchModelType(type) {
  currentModelType = type;
  document.querySelectorAll('.model-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('publicModelForm').style.display = type === 'public' ? 'block' : 'none';
  document.getElementById('localModelForm').style.display = type === 'local' ? 'block' : 'none';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('addModelConfirmBtn').disabled = true;
}

async function verifyModel() {
  const statusEl = document.getElementById('verifyStatus');
  statusEl.innerHTML = '<span class="loading"></span> 验证中...';
  statusEl.className = 'verify-status';

  let payload = {};
  if (currentModelType === 'public') {
    const name = document.getElementById('modelName').value.trim();
    const preset = document.getElementById('publicModelPreset').value;
    const apiKey = document.getElementById('modelApiKey').value.trim();
    if (!name || !apiKey) {
      statusEl.textContent = '请填写模型名称和API Key';
      statusEl.className = 'verify-status error';
      return;
    }
    payload = { type: 'public', name, preset, api_key: apiKey };
  } else {
    const name = document.getElementById('localModelName').value.trim();
    const modelId = document.getElementById('localModelId').value.trim();
    const baseUrl = document.getElementById('localModelUrl').value.trim();
    const apiKey = document.getElementById('localModelApiKey').value.trim();
    if (!name || !modelId || !baseUrl) {
      statusEl.textContent = '请填写模型名称、Model ID和Base URL';
      statusEl.className = 'verify-status error';
      return;
    }
    payload = { type: 'local', name, model_id: modelId, base_url: baseUrl, api_key: apiKey };
  }

  try {
    const resp = await fetch('/api/verify-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      statusEl.textContent = '✓ 连接成功';
      statusEl.className = 'verify-status success';
      document.getElementById('addModelConfirmBtn').disabled = false;
    } else {
      statusEl.textContent = '✗ 连接失败: ' + (data.error || '未知错误');
      statusEl.className = 'verify-status error';
    }
  } catch (e) {
    statusEl.textContent = '✗ 请求失败: ' + e.message;
    statusEl.className = 'verify-status error';
  }
}

async function addModel() {
  let payload = {};
  if (currentModelType === 'public') {
    payload = {
      type: 'public',
      name: document.getElementById('modelName').value.trim(),
      preset: document.getElementById('publicModelPreset').value,
      api_key: document.getElementById('modelApiKey').value.trim()
    };
  } else {
    payload = {
      type: 'local',
      name: document.getElementById('localModelName').value.trim(),
      model_id: document.getElementById('localModelId').value.trim(),
      base_url: document.getElementById('localModelUrl').value.trim(),
      api_key: document.getElementById('localModelApiKey').value.trim()
    };
  }

  try {
    const resp = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      await loadModels();
      const sel = document.getElementById('modelSelect');
      sel.value = data.model.id;
      currentModelId = data.model.id;
      closeAddModelModal();
    } else {
      alert('添加失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

// ========== Reference Modal ==========
function openRefModal() {
  document.getElementById('refModal').classList.add('active');
  document.getElementById('refContentPreview').textContent = '';
  document.getElementById('refConfirmBtn').disabled = true;
  selectedRefContent = '';
  refContentConfirmed = false;
  switchRefType('url');
}

function closeRefModal() {
  document.getElementById('refModal').classList.remove('active');
  document.getElementById('refUrlInput').value = '';
  document.getElementById('refFileInput').value = '';
  document.getElementById('refTextInput').value = '';
  document.getElementById('refContentPreview').textContent = '';
}

function switchRefType(type) {
  currentRefType = type;
  document.querySelectorAll('.ref-option').forEach(el => el.classList.toggle('active', el.dataset.ref === type));
  document.getElementById('refUrlSection').style.display = type === 'url' ? 'block' : 'none';
  document.getElementById('refFileSection').style.display = type === 'file' ? 'block' : 'none';
  document.getElementById('refTextSection').style.display = type === 'text' ? 'block' : 'none';
}

async function fetchRefUrl() {
  const url = document.getElementById('refUrlInput').value.trim();
  if (!url) {
    alert('请输入URL');
    return;
  }
  const preview = document.getElementById('refContentPreview');
  preview.innerHTML = '<span class="loading"></span> 获取中...';
  try {
    const resp = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await resp.json();
    if (data.text) {
      preview.textContent = data.text;
      selectedRefContent = data.text;
      document.getElementById('refConfirmBtn').disabled = false;
    } else {
      preview.textContent = '获取失败: ' + (data.error || '未知错误');
    }
  } catch (e) {
    preview.textContent = '请求失败: ' + e.message;
  }
}

async function uploadRefFile() {
  const fileInput = document.getElementById('refFileInput');
  const file = fileInput.files[0];
  if (!file) return;
  const preview = document.getElementById('refContentPreview');
  preview.innerHTML = '<span class="loading"></span> 解析中...';
  const formData = new FormData();
  formData.append('file', file);
  try {
    const resp = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.text) {
      preview.textContent = data.text;
      selectedRefContent = data.text;
      document.getElementById('refConfirmBtn').disabled = false;
    } else {
      preview.textContent = '解析失败: ' + (data.error || '未知错误');
    }
  } catch (e) {
    preview.textContent = '请求失败: ' + e.message;
  }
}

function confirmRef() {
  if (currentRefType === 'text') {
    selectedRefContent = document.getElementById('refTextInput').value.trim();
    if (!selectedRefContent) {
      alert('请输入参考内容');
      return;
    }
  }
  refContentConfirmed = true;
  closeRefModal();
}
