// ========== State ==========
let models = [];
let themes = [];
let currentModelId = null;
let selectedRefContent = '';
let uploadedFileTexts = [];
let uploadedFileNames = [];
let isGenerating = false;
let currentModelType = 'public';
let currentRefType = 'url';
let refContentConfirmed = false;
let generatedText = '';

// ========== Init ==========
document.addEventListener('DOMContentLoaded', () => {
  loadModels();
  loadThemes();
  setupTextareaAutoResize();
  setupWordCountToggle();
  setupModelSelect();
  setupTypeSelect();
  setupUpload();
  setupSend();
  setupCopy();
  setupEditModelListeners();
});

// ========== Load Models ==========
async function loadModels() {
  const resp = await fetch('/press-release/api/models');
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
  const manageOpt = document.createElement('option');
  manageOpt.value = '__manage__';
  manageOpt.textContent = '⚙ 管理模型';
  sel.appendChild(manageOpt);

  if (prevValue && models.some(m => m.id == prevValue)) {
    sel.value = prevValue;
  }
}

// ========== Load Themes ==========
async function loadThemes() {
  const resp = await fetch('/press-release/api/themes');
  themes = await resp.json();
  renderTypeSelect();
}

function renderTypeSelect() {
  const sel = document.getElementById('typeSelect');
  const prevValue = sel.value;
  const prevText = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
  sel.innerHTML = '<option value="" disabled selected>选择主题</option>';

  // Built-in themes
  const builtin = ['繁星计划', '专题培训'];
  builtin.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });

  // User-added themes
  themes.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });

  // Manage option
  const manageOpt = document.createElement('option');
  manageOpt.value = '__manage__';
  manageOpt.textContent = '⚙ 管理主题';
  sel.appendChild(manageOpt);

  if (prevValue && prevValue !== '__manage__') {
    sel.value = prevValue;
  }
}

// ========== Model Select Handler ==========
function setupModelSelect() {
  const sel = document.getElementById('modelSelect');
  sel.addEventListener('change', () => {
    if (sel.value === '__manage__') {
      sel.value = currentModelId || '';
      openManageModelModal();
    } else {
      currentModelId = sel.value;
    }
  });
}

// ========== Type/Theme Select Handler ==========
function setupTypeSelect() {
  const sel = document.getElementById('typeSelect');
  sel.addEventListener('change', () => {
    if (sel.value === '__manage__') {
      sel.value = '';
      openManageThemeModal();
    } else {
      selectedRefContent = '';
      refContentConfirmed = false;
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
        const resp = await fetch('/press-release/api/upload', { method: 'POST', body: formData });
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

  if (!modelSel.value || modelSel.value === '__manage__') {
    alert('请先选择一个模型');
    return;
  }

  if (!typeSel.value || typeSel.value === '__manage__') {
    alert('请先选择通讯稿类型');
    return;
  }

  // For custom themes (not built-in), load content from themes array
  let refContent = selectedRefContent;
  const builtinTypes = ['繁星计划', '专题培训'];
  if (!builtinTypes.includes(typeSel.value)) {
    const theme = themes.find(t => t.name === typeSel.value);
    if (theme) {
      refContent = theme.content;
    }
  }

  let wordCount = wordSel.value === 'custom' ? parseInt(customWord.value) || 500 : parseInt(wordSel.value);

  const model = models.find(m => m.id == modelSel.value);
  if (!model) {
    alert('模型不存在');
    return;
  }

  isGenerating = true;
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('copyBtn').style.display = 'none';
  outputArea.innerHTML = '<span class="typing-cursor"></span>';

  try {
    const resp = await fetch('/press-release/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: model.id,
        type: typeSel.value,
        word_count: wordCount,
        user_input: textarea.value,
        file_texts: uploadedFileTexts,
        ref_content: refContent
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

    generatedText = fullText;
    outputArea.textContent = fullText;
    document.getElementById('copyBtn').style.display = 'flex';
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

// ========== Copy ==========
function setupCopy() {
  const btn = document.getElementById('copyBtn');
  btn.addEventListener('click', async () => {
    if (!generatedText) return;
    try {
      await navigator.clipboard.writeText(generatedText);
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      }, 2000);
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = generatedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  });
}

// ========== Manage Model Modal ==========
function openManageModelModal() {
  document.getElementById('manageModelModal').classList.add('active');
  renderModelList();
  resetModelForm();
}

function closeManageModelModal() {
  document.getElementById('manageModelModal').classList.remove('active');
  resetModelForm();
}

function renderModelList() {
  const list = document.getElementById('modelList');
  list.innerHTML = '';
  models.forEach(m => {
    const item = document.createElement('div');
    item.className = 'manage-item';
    const detail = m.type === 'public' ? (m.preset || '公共模型') : `本地: ${m.model}`;
    item.innerHTML = `
      <div class="manage-item-info">
        <div class="manage-item-name">${escapeHtml(m.name)}</div>
        <div class="manage-item-detail">${escapeHtml(detail)}</div>
      </div>
      <div class="manage-item-actions">
        <button class="btn-sm btn-edit" onclick="openEditModel('${m.id}')">编辑</button>
        <button class="btn-sm btn-delete" onclick="deleteModel('${m.id}')">删除</button>
      </div>
    `;
    list.appendChild(item);
  });
}

function resetModelForm() {
  document.getElementById('editingModelId').value = '';
  document.getElementById('modelFormTitle').textContent = '添加模型';
  document.getElementById('modelName').value = '';
  document.getElementById('modelApiKey').value = '';
  document.getElementById('localModelName').value = '';
  document.getElementById('localModelId').value = '';
  document.getElementById('localModelUrl').value = '';
  document.getElementById('localModelApiKey').value = '';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('saveModelBtn').disabled = true;
  switchModelType('public');
}

function switchModelType(type) {
  currentModelType = type;
  document.querySelectorAll('#manageModelModal .model-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  document.getElementById('publicModelForm').style.display = type === 'public' ? 'block' : 'none';
  document.getElementById('localModelForm').style.display = type === 'local' ? 'block' : 'none';
  document.getElementById('verifyStatus').textContent = '';
  document.getElementById('saveModelBtn').disabled = true;
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
    const resp = await fetch('/press-release/api/verify-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      statusEl.textContent = '✓ 连接成功';
      statusEl.className = 'verify-status success';
      document.getElementById('saveModelBtn').disabled = false;
    } else {
      statusEl.textContent = '✗ 连接失败: ' + (data.error || '未知错误');
      statusEl.className = 'verify-status error';
    }
  } catch (e) {
    statusEl.textContent = '✗ 请求失败: ' + e.message;
    statusEl.className = 'verify-status error';
  }
}

async function saveModel() {
  const editingId = document.getElementById('editingModelId').value;
  let payload = {};

  if (editingId) {
    // Update existing
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
      const resp = await fetch(`/press-release/api/models/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data.success) {
        await loadModels();
        renderModelList();
        resetModelForm();
      } else {
        alert('更新失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('请求失败: ' + e.message);
    }
  } else {
    // Add new
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
      const resp = await fetch('/press-release/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (data.success) {
        await loadModels();
        renderModelList();
        resetModelForm();
      } else {
        alert('添加失败: ' + (data.error || '未知错误'));
      }
    } catch (e) {
      alert('请求失败: ' + e.message);
    }
  }
}

async function deleteModel(id) {
  if (!confirm('确定删除此模型？')) return;
  try {
    await fetch(`/press-release/api/models/${id}`, { method: 'DELETE' });
    await loadModels();
    renderModelList();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// ========== Edit Model Modal ==========
let editModelInitialValues = {}; // Track initial values for change detection

async function openEditModel(id) {
  const model = models.find(m => m.id === id);
  if (!model) return;

  // Fetch the API key for editing
  let apiKey = '';
  try {
    const resp = await fetch(`/press-release/api/models/${id}/apikey`);
    const data = await resp.json();
    apiKey = data.api_key || '';
  } catch (e) { /* ignore */ }

  document.getElementById('editModelId').value = id;
  document.getElementById('editModelName').value = model.name;

  const isPublic = model.type === 'public';
  document.getElementById('editPublicFields').style.display = isPublic ? 'block' : 'none';
  document.getElementById('editLocalFields').style.display = isPublic ? 'none' : 'block';

  if (isPublic) {
    document.getElementById('editModelPreset').value = model.preset || 'deepseek';
    document.getElementById('editModelApiKey').value = apiKey;
  } else {
    document.getElementById('editModelModelId').value = model.model || '';
    document.getElementById('editModelBaseUrl').value = model.url || '';
    document.getElementById('editModelApiKeyLocal').value = apiKey;
  }

  // Store initial values for change detection
  editModelInitialValues = {
    name: document.getElementById('editModelName').value,
    preset: isPublic ? document.getElementById('editModelPreset').value : '',
    apiKey: isPublic ? document.getElementById('editModelApiKey').value : document.getElementById('editModelApiKeyLocal').value,
    modelId: isPublic ? '' : document.getElementById('editModelModelId').value,
    baseUrl: isPublic ? '' : document.getElementById('editModelBaseUrl').value
  };

  // Reset edit state
  document.getElementById('editVerifyModelBtn').disabled = true;
  document.getElementById('editSaveModelBtn').disabled = true;
  document.getElementById('editVerifyStatus').textContent = '';

  document.getElementById('editModelModal').classList.add('active');
}

function closeEditModelModal() {
  document.getElementById('editModelModal').classList.remove('active');
  editModelInitialValues = {};
}

// Check if edit form has changed
function checkEditModelChanges() {
  const id = document.getElementById('editModelId').value;
  const model = models.find(m => m.id === id);
  if (!model) return false;

  const isPublic = model.type === 'public';
  const currentName = document.getElementById('editModelName').value;
  const currentPreset = isPublic ? document.getElementById('editModelPreset').value : '';
  const currentApiKey = isPublic ? document.getElementById('editModelApiKey').value : document.getElementById('editModelApiKeyLocal').value;
  const currentModelId = isPublic ? '' : document.getElementById('editModelModelId').value;
  const currentBaseUrl = isPublic ? '' : document.getElementById('editModelBaseUrl').value;

  return currentName !== editModelInitialValues.name ||
         currentPreset !== editModelInitialValues.preset ||
         currentApiKey !== editModelInitialValues.apiKey ||
         currentModelId !== editModelInitialValues.modelId ||
         currentBaseUrl !== editModelInitialValues.baseUrl;
}

// Setup change listeners for edit model form
function setupEditModelListeners() {
  const fields = ['editModelName', 'editModelPreset', 'editModelApiKey', 'editModelModelId', 'editModelBaseUrl', 'editModelApiKeyLocal'];
  fields.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', onEditModelFieldChange);
      el.addEventListener('change', onEditModelFieldChange);
    }
  });
}

function onEditModelFieldChange() {
  const hasChanges = checkEditModelChanges();
  // If changed, enable verify; if not, disable both verify and save
  document.getElementById('editVerifyModelBtn').disabled = !hasChanges;
  if (!hasChanges) {
    document.getElementById('editSaveModelBtn').disabled = true;
    document.getElementById('editVerifyStatus').textContent = '';
  } else {
    // Changes detected, need to re-verify before saving
    document.getElementById('editSaveModelBtn').disabled = true;
  }
}

async function verifyEditModel() {
  const id = document.getElementById('editModelId').value;
  const model = models.find(m => m.id === id);
  if (!model) return;

  const statusEl = document.getElementById('editVerifyStatus');
  statusEl.innerHTML = '<span class="loading"></span> 验证中...';
  statusEl.className = 'verify-status';

  const isPublic = model.type === 'public';
  let payload = { name: document.getElementById('editModelName').value.trim() };

  if (isPublic) {
    payload.type = 'public';
    payload.preset = document.getElementById('editModelPreset').value;
    const newKey = document.getElementById('editModelApiKey').value.trim();
    payload.api_key = newKey;
  } else {
    payload.type = 'local';
    payload.model_id = document.getElementById('editModelModelId').value.trim();
    payload.base_url = document.getElementById('editModelBaseUrl').value.trim();
    const newKey = document.getElementById('editModelApiKeyLocal').value.trim();
    payload.api_key = newKey;
  }

  try {
    const resp = await fetch('/press-release/api/verify-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      statusEl.textContent = '✓ 连接成功';
      statusEl.className = 'verify-status success';
      document.getElementById('editSaveModelBtn').disabled = false;
    } else {
      statusEl.textContent = '✗ 连接失败: ' + (data.error || '未知错误');
      statusEl.className = 'verify-status error';
      document.getElementById('editSaveModelBtn').disabled = true;
    }
  } catch (e) {
    statusEl.textContent = '✗ 请求失败: ' + e.message;
    statusEl.className = 'verify-status error';
    document.getElementById('editSaveModelBtn').disabled = true;
  }
}

async function saveEditedModel() {
  const id = document.getElementById('editModelId').value;
  const model = models.find(m => m.id === id);
  if (!model) return;

  const isPublic = model.type === 'public';
  let payload = { name: document.getElementById('editModelName').value.trim() };

  if (isPublic) {
    payload.type = 'public';
    payload.preset = document.getElementById('editModelPreset').value;
    const newKey = document.getElementById('editModelApiKey').value.trim();
    if (newKey) payload.api_key = newKey;
  } else {
    payload.type = 'local';
    payload.model_id = document.getElementById('editModelModelId').value.trim();
    payload.base_url = document.getElementById('editModelBaseUrl').value.trim();
    const newKey = document.getElementById('editModelApiKeyLocal').value.trim();
    if (newKey) payload.api_key = newKey;
  }

  try {
    const resp = await fetch(`/press-release/api/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (data.success) {
      await loadModels();
      renderModelList();
      closeEditModelModal();
    } else {
      alert('更新失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

// ========== Manage Theme Modal ==========
function openManageThemeModal() {
  document.getElementById('manageThemeModal').classList.add('active');
  renderThemeList();
  resetRefForm();
}

function closeManageThemeModal() {
  document.getElementById('manageThemeModal').classList.remove('active');
  resetRefForm();
}

function renderThemeList() {
  const list = document.getElementById('themeList');
  list.innerHTML = '';
  themes.forEach(t => {
    const item = document.createElement('div');
    item.className = 'manage-item';
    const preview = t.content ? t.content.substring(0, 60) + '...' : '无内容';
    item.innerHTML = `
      <div class="manage-item-info">
        <div class="manage-item-name">${escapeHtml(t.name)}</div>
        <div class="manage-item-detail">${escapeHtml(preview)}</div>
      </div>
      <div class="manage-item-actions">
        <button class="btn-sm btn-edit" onclick="openEditTheme('${t.id}')">编辑</button>
        <button class="btn-sm btn-delete" onclick="deleteTheme('${t.id}')">删除</button>
      </div>
    `;
    list.appendChild(item);
  });
}

function resetRefForm() {
  document.getElementById('refUrlInput').value = '';
  document.getElementById('refFileInput').value = '';
  document.getElementById('refContentPreview').textContent = '';
  document.getElementById('addThemeBtn').disabled = true;
  document.getElementById('tempRefBtn').disabled = true;
  selectedRefContent = '';
  switchRefType('url');
}

function switchRefType(type) {
  currentRefType = type;
  // Clear preview when switching
  document.getElementById('refContentPreview').textContent = '';
  selectedRefContent = '';
  document.getElementById('addThemeBtn').disabled = true;
  document.getElementById('tempRefBtn').disabled = true;

  document.querySelectorAll('#manageThemeModal .ref-option').forEach(el => el.classList.toggle('active', el.dataset.ref === type));
  document.getElementById('refUrlSection').style.display = type === 'url' ? 'block' : 'none';
  document.getElementById('refFileSection').style.display = type === 'file' ? 'block' : 'none';
  document.getElementById('refTextSection').style.display = type === 'text' ? 'block' : 'none';

  // For "direct input" mode, enable buttons once user types content
  if (type === 'text') {
    const preview = document.getElementById('refContentPreview');
    preview.focus();
    // Monitor input on contenteditable for direct typing
    preview.addEventListener('input', onRefContentInput);
  } else {
    document.getElementById('refContentPreview').removeEventListener('input', onRefContentInput);
  }
}

function onRefContentInput() {
  const content = document.getElementById('refContentPreview').textContent.trim();
  const hasContent = content.length > 0;
  document.getElementById('addThemeBtn').disabled = !hasContent;
  document.getElementById('tempRefBtn').disabled = !hasContent;
  if (hasContent) {
    selectedRefContent = content;
  }
}

async function fetchRefUrl() {
  const url = document.getElementById('refUrlInput').value.trim();
  if (!url) {
    alert('请输入URL');
    return;
  }

  // Check if a model is selected for cleaning
  const modelSel = document.getElementById('modelSelect');
  const modelId = (modelSel.value && modelSel.value !== '__manage__') ? modelSel.value : '';
  if (!modelId) {
    if (models.length === 0) {
      alert('使用URL获取内容需要大模型来清洗数据，请先在"管理模型"中添加一个大模型。');
    } else {
      alert('使用URL获取内容需要大模型来清洗数据，请先在主页面选择一个模型。');
    }
    return;
  }

  const preview = document.getElementById('refContentPreview');
  preview.innerHTML = '<span class="loading"></span> 获取并清洗中...';

  try {
    const resp = await fetch('/press-release/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, model_id: modelId })
    });
    const data = await resp.json();
    if (data.text) {
      preview.textContent = data.text;
      selectedRefContent = data.text;
      document.getElementById('addThemeBtn').disabled = false;
      document.getElementById('tempRefBtn').disabled = false;
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
    const resp = await fetch('/press-release/api/upload', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.text) {
      preview.textContent = data.text;
      selectedRefContent = data.text;
      document.getElementById('addThemeBtn').disabled = false;
      document.getElementById('tempRefBtn').disabled = false;
    } else {
      preview.textContent = '解析失败: ' + (data.error || '未知错误');
    }
  } catch (e) {
    preview.textContent = '请求失败: ' + e.message;
  }
}

// ========== Add as Theme ==========
function addAsTheme() {
  // Get content from editable preview - use innerText for contenteditable
  const preview = document.getElementById('refContentPreview');
  const content = preview.innerText.trim();
  if (!content) {
    alert('请先获取或输入内容');
    return;
  }
  selectedRefContent = content;
  // Open theme name input modal
  document.getElementById('themeNameInput').value = '';
  document.getElementById('themeNameModal').classList.add('active');
}

function closeThemeNameModal() {
  document.getElementById('themeNameModal').classList.remove('active');
}

async function confirmThemeName() {
  const name = document.getElementById('themeNameInput').value.trim();
  if (!name) {
    alert('请输入主题名称');
    return;
  }
  // Check for duplicates
  if (themes.some(t => t.name === name) || ['繁星计划', '专题培训'].includes(name)) {
    alert('该主题名称已存在，请使用其他名称');
    return;
  }

  try {
    const resp = await fetch('/press-release/api/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: selectedRefContent })
    });
    const data = await resp.json();
    if (data.success) {
      await loadThemes();
      renderThemeList();
      closeThemeNameModal();
      // Auto-select the new theme
      const typeSel = document.getElementById('typeSelect');
      typeSel.value = name;
      refContentConfirmed = true;
      resetRefForm();
    } else {
      alert('添加失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

// ========== Add as Temp Ref ==========
function addAsTempRef() {
  const preview = document.getElementById('refContentPreview');
  const content = preview.innerText.trim();
  if (!content) {
    alert('请先获取或输入内容');
    return;
  }
  selectedRefContent = content;
  refContentConfirmed = true;
  closeManageThemeModal();
}

// ========== Edit Theme Modal ==========
function openEditTheme(id) {
  const theme = themes.find(t => t.id === id);
  if (!theme) return;
  document.getElementById('editingThemeId').value = id;
  document.getElementById('editThemeName').value = theme.name;
  document.getElementById('editThemeContent').textContent = theme.content || '';
  document.getElementById('editThemeModal').classList.add('active');
}

function closeEditThemeModal() {
  document.getElementById('editThemeModal').classList.remove('active');
}

async function saveEditedTheme() {
  const id = document.getElementById('editingThemeId').value;
  const name = document.getElementById('editThemeName').value.trim();
  const content = document.getElementById('editThemeContent').textContent.trim();
  if (!name) {
    alert('请输入主题名称');
    return;
  }
  try {
    const resp = await fetch(`/press-release/api/themes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content })
    });
    const data = await resp.json();
    if (data.success) {
      await loadThemes();
      renderThemeList();
      closeEditThemeModal();
    } else {
      alert('更新失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('请求失败: ' + e.message);
  }
}

async function deleteTheme(id) {
  if (!confirm('确定删除此主题？')) return;
  try {
    await fetch(`/press-release/api/themes/${id}`, { method: 'DELETE' });
    await loadThemes();
    renderThemeList();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}
