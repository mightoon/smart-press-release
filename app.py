"""Flask backend for Press Release Generator."""
import json
import os
import uuid
import re
import base64
import logging
from logging.handlers import RotatingFileHandler
import requests as http_requests
from flask import Flask, request, jsonify, Response, render_template
from flask_cors import CORS
from openai import OpenAI

app = Flask(__name__, static_url_path='/press-release/static')
CORS(app)

# ========== Logging setup ==========
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app.log')
handler = RotatingFileHandler(LOG_PATH, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s')
handler.setFormatter(formatter)
app.logger.setLevel(logging.INFO)
app.logger.addHandler(handler)
# Also log to console
console = logging.StreamHandler()
console.setLevel(logging.INFO)
console.setFormatter(formatter)
app.logger.addHandler(console)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

# ========== Preset public models ==========
PUBLIC_MODEL_PRESETS = {
    'deepseek': {
        'model': 'deepseek-chat',
        'url': 'https://api.deepseek.com/v1'
    },
    'kimi': {
        'model': 'moonshot-v1-8k',
        'url': 'https://api.moonshot.cn/v1'
    },
    'minimax': {
        'model': 'MiniMax-Text-01',
        'url': 'https://api.minimax.chat/v1'
    }
}

# ========== Reference content for built-in types ==========
FANXING_REF = """【繁星计划参考内容】
"繁星计划"是公司内部沉淀经验、传递智慧、促进互学共进的重要知识分享平台，旨在加强员工队伍建设，鼓励员工在深耕本职工作的同时，养成总结经验、乐于分享的良好习惯，着力打造积极向上、团结协作的学习型团队，不断提升全体员工的综合能力与素质，更好助力公司高质量发展。
2月9日，xxx开展了"人工智能核心技术及应用实践"技术分享活动，各项目代表及开发人员参加了此次培训。
本次培训由研发中心xxxx主讲，他系统阐述了人工智能从哲学启蒙到技术爆发的完整历程，并重点强调了AI技术在驱动公司业务数字化转型中的战略价值。培训内容围绕人工智能的历史演进、关键突破及现代应用展开，涵盖了神经网络、深度学习、大模型等核心领域，帮助团队构建系统化的AI知识体系。
培训采用"理论讲解+案例演示"相结合的方式，通过图像识别、自然语言处理等实际场景案例，生动演示了AI技术在业务中的技术路径。主讲人通过由浅入深、条分缕析的讲解，系统阐述了从理论突破到工程实践的关键路径。参训人员全程专注聆听，并结合讲义内容认真记录要点，对人工智能的技术发展脉络与核心原理形成了更为系统、清晰的认识。大家纷纷表示，培训内容兼具理论深度与实践指导性，有效拓宽了技术视野。
此次专项培训的成功举办，不仅强化了团队对人工智能技术脉络的把握，更激发了创新应用的热情。未来，公司将持续以"技术赋能"为导向，深化AI与业务的融合，为推动高质量发展注入新动能。"""

ZHUANTI_REF = """【专题培训参考内容】
为深入贯彻落实公司"能力提升年"专项行动部署，全面提升研发人员的核心理论素养与技术应用能力，10月30日，xxx举办"傅里叶变换基础"专题培训，xxx产品部全体研发人员参与了此次培训。
此次培训由xx产品部算法工程师xxx担任主讲，围绕傅里叶变换的核心原理及其在工程实践中的关键应用展开深度解析。在基础理论层面，阐释傅里叶变换如何将复杂的时域信号分解为不同频率的正弦波组合，揭示信号的本质结构。针对研发人员的实际需求，讲解傅里叶变换这一高效计算工具的核心思想及其对现代数字信号处理工程应用的影响，培训将重点剖析傅里叶变换在DDC和多相滤波器的核心作用。此外，培训还将探讨傅里叶变换作为一种强大的思维方式，如何帮助工程师在解决通信系统的复杂技术问题时，获得全新的分析视角和解决方案。
培训通过实际工程案例，如通信信号调制、解析、检测等内容，直观展示傅里叶变换在研发过程中的具体应用，有力地推动参训人员实现从"数学工具理解"到"研发实战运用"的能力跃迁，为复杂系统设计与算法优化提供坚实支撑。
整场培训注重基础性与实用性相结合，旨在帮助研发人员打通理论瓶颈，提升在xxx产品开发任务中的自主创新与规范实施能力，为公司高质量发展注入创新动能。"""


# ========== API Key helpers (Base64 encode/decode) ==========
def encode_api_key(key):
    """Base64 encode an API key for storage."""
    if not key:
        return ''
    return base64.b64encode(key.encode('utf-8')).decode('utf-8')


def decode_api_key(encoded):
    """Base64 decode an API key from storage."""
    if not encoded:
        return ''
    try:
        return base64.b64decode(encoded.encode('utf-8')).decode('utf-8')
    except Exception:
        # If it's not base64 (legacy data), return as-is
        return encoded


# ========== Config helpers ==========
def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'models': [], 'themes': []}


def save_config(config):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


# ========== Routes ==========
@app.route('/press-release/')
def index():
    app.logger.info('Index page requested from %s', request.remote_addr)
    return render_template('index.html')


# ========== Model APIs ==========
@app.route('/press-release/api/models', methods=['GET'])
def get_models():
    app.logger.info('GET /api/models from %s', request.remote_addr)
    config = load_config()
    # Return models without exposing api_key
    safe_models = []
    for m in config['models']:
        safe_models.append({
            'id': m['id'],
            'name': m['name'],
            'model': m.get('model', ''),
            'url': m.get('url', ''),
            'type': m.get('type', 'public'),
            'preset': m.get('preset', ''),
            'has_api_key': bool(m.get('api_key', ''))
        })
    app.logger.info('Returning %d models', len(safe_models))
    return jsonify(safe_models)


@app.route('/press-release/api/models', methods=['POST'])
def add_model():
    app.logger.info('POST /api/models from %s', request.remote_addr)
    data = request.json
    config = load_config()

    model_entry = {
        'id': str(uuid.uuid4())[:8],
        'name': data.get('name', ''),
        'type': data.get('type', 'public'),
    }

    if data.get('type') == 'public':
        preset = data.get('preset', 'deepseek')
        preset_info = PUBLIC_MODEL_PRESETS.get(preset, PUBLIC_MODEL_PRESETS['deepseek'])
        model_entry['model'] = preset_info['model']
        model_entry['url'] = preset_info['url']
        model_entry['api_key'] = encode_api_key(data.get('api_key', ''))
        model_entry['preset'] = preset
    else:
        model_entry['model'] = data.get('model_id', '')
        model_entry['url'] = data.get('base_url', '')
        model_entry['api_key'] = encode_api_key(data.get('api_key', ''))
        model_entry['preset'] = ''

    config['models'].append(model_entry)
    save_config(config)
    app.logger.info('Model added: %s (%s)', model_entry['name'], model_entry['id'])
    return jsonify({'success': True, 'model': {
        'id': model_entry['id'],
        'name': model_entry['name'],
        'model': model_entry['model'],
        'url': model_entry['url'],
        'type': model_entry['type'],
        'preset': model_entry.get('preset', ''),
        'has_api_key': bool(model_entry['api_key'])
    }})


@app.route('/press-release/api/models/<model_id>', methods=['PUT'])
def update_model(model_id):
    app.logger.info('PUT /api/models/%s from %s', model_id, request.remote_addr)
    data = request.json
    config = load_config()
    model = next((m for m in config['models'] if m['id'] == model_id), None)
    if not model:
        app.logger.warning('Model not found for update: %s', model_id)
        return jsonify({'error': '模型不存在'}), 404

    model['name'] = data.get('name', model['name'])

    if data.get('type') == 'public' or model.get('type') == 'public':
        preset = data.get('preset', model.get('preset', 'deepseek'))
        preset_info = PUBLIC_MODEL_PRESETS.get(preset, PUBLIC_MODEL_PRESETS['deepseek'])
        model['type'] = 'public'
        model['preset'] = preset
        model['model'] = preset_info['model']
        model['url'] = preset_info['url']
        if data.get('api_key'):
            model['api_key'] = encode_api_key(data['api_key'])
    else:
        model['type'] = 'local'
        model['preset'] = ''
        if data.get('model_id'):
            model['model'] = data['model_id']
        if data.get('base_url'):
            model['url'] = data['base_url']
        if data.get('api_key') is not None:
            model['api_key'] = encode_api_key(data['api_key'])

    save_config(config)
    app.logger.info('Model updated: %s', model_id)
    return jsonify({'success': True, 'model': {
        'id': model['id'],
        'name': model['name'],
        'model': model['model'],
        'url': model['url'],
        'type': model['type'],
        'preset': model.get('preset', ''),
        'has_api_key': bool(model['api_key'])
    }})


@app.route('/press-release/api/models/<model_id>', methods=['DELETE'])
def delete_model(model_id):
    app.logger.info('DELETE /api/models/%s from %s', model_id, request.remote_addr)
    config = load_config()
    config['models'] = [m for m in config['models'] if m['id'] != model_id]
    save_config(config)
    app.logger.info('Model deleted: %s', model_id)
    return jsonify({'success': True})


@app.route('/press-release/api/models/<model_id>/apikey', methods=['GET'])
def get_model_apikey(model_id):
    """Return the decoded API key for editing purposes."""
    config = load_config()
    model = next((m for m in config['models'] if m['id'] == model_id), None)
    if not model:
        return jsonify({'error': '模型不存在'}), 404
    return jsonify({'api_key': decode_api_key(model.get('api_key', ''))})


@app.route('/press-release/api/verify-model', methods=['POST'])
def verify_model():
    app.logger.info('POST /api/verify-model from %s', request.remote_addr)
    data = request.json
    try:
        if data.get('type') == 'public':
            preset = data.get('preset', 'deepseek')
            preset_info = PUBLIC_MODEL_PRESETS.get(preset, PUBLIC_MODEL_PRESETS['deepseek'])
            model_name = preset_info['model']
            base_url = preset_info['url']
            api_key = data.get('api_key', '')
        else:
            model_name = data.get('model_id', '')
            base_url = data.get('base_url', '')
            api_key = data.get('api_key', '')

        client = OpenAI(
            api_key=api_key or 'dummy',
            base_url=base_url
        )
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[{'role': 'user', 'content': 'Hi'}],
                max_tokens=5,
                stream=False
            )
            app.logger.info('Model verification success: %s', model_name)
            return jsonify({'success': True})
        except Exception as e:
            error_msg = str(e)
            app.logger.error('Model verification failed: %s', error_msg)
            if 'authentication' in error_msg.lower() or 'unauthorized' in error_msg.lower() or 'invalid api' in error_msg.lower():
                return jsonify({'success': False, 'error': 'API Key无效'})
            if 'model' in error_msg.lower() and 'not found' in error_msg.lower():
                return jsonify({'success': False, 'error': '模型不存在'})
            return jsonify({'success': False, 'error': error_msg})
    except Exception as e:
        app.logger.error('Error in verify_model: %s', e, exc_info=True)
        return jsonify({'success': False, 'error': str(e)})


# ========== Theme APIs ==========
@app.route('/press-release/api/themes', methods=['GET'])
def get_themes():
    app.logger.info('GET /api/themes from %s', request.remote_addr)
    config = load_config()
    themes = config.get('themes', [])
    app.logger.info('Returning %d themes', len(themes))
    return jsonify(themes)


@app.route('/press-release/api/themes', methods=['POST'])
def add_theme():
    data = request.json
    config = load_config()
    theme = {
        'id': str(uuid.uuid4())[:8],
        'name': data.get('name', ''),
        'content': data.get('content', '')
    }
    if 'themes' not in config:
        config['themes'] = []
    config['themes'].append(theme)
    save_config(config)
    return jsonify({'success': True, 'theme': theme})


@app.route('/press-release/api/themes/<theme_id>', methods=['PUT'])
def update_theme(theme_id):
    data = request.json
    config = load_config()
    theme = next((t for t in config.get('themes', []) if t['id'] == theme_id), None)
    if not theme:
        return jsonify({'error': '主题不存在'}), 404
    if data.get('name'):
        theme['name'] = data['name']
    if data.get('content') is not None:
        theme['content'] = data['content']
    save_config(config)
    return jsonify({'success': True, 'theme': theme})


@app.route('/press-release/api/themes/<theme_id>', methods=['DELETE'])
def delete_theme(theme_id):
    config = load_config()
    config['themes'] = [t for t in config.get('themes', []) if t['id'] != theme_id]
    save_config(config)
    return jsonify({'success': True})


# ========== File Upload ==========
@app.route('/press-release/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400

    f = request.files['file']
    filename = f.filename.lower()

    try:
        if filename.endswith('.txt') or filename.endswith('.md'):
            text = f.read().decode('utf-8', errors='ignore')
        elif filename.endswith('.docx'):
            text = parse_docx(f)
        elif filename.endswith('.doc'):
            text = parse_doc(f)
        elif filename.endswith('.pdf'):
            text = parse_pdf(f)
        else:
            text = f.read().decode('utf-8', errors='ignore')

        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def parse_docx(file_obj):
    from docx import Document
    import io
    doc = Document(io.BytesIO(file_obj.read()))
    return '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])


def parse_doc(file_obj):
    try:
        return file_obj.read().decode('utf-8', errors='ignore')
    except:
        return "（.doc格式文件解析受限，建议转换为.docx格式后上传）"


def parse_pdf(file_obj):
    """Parse .pdf file using PyMuPDF (fitz)."""
    try:
        import fitz
        import io
        doc = fitz.open(stream=io.BytesIO(file_obj.read()), filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except ImportError:
        return "（PDF解析需要安装PyMuPDF：pip install PyMuPDF）"


# ========== URL Fetch + LLM Clean ==========
@app.route('/press-release/api/fetch-url', methods=['POST'])
def fetch_url():
    data = request.json
    url = data.get('url', '')
    model_id = data.get('model_id', '')
    if not url:
        return jsonify({'error': '请提供URL'}), 400

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        resp = http_requests.get(url, headers=headers, timeout=15)
        resp.encoding = resp.apparent_encoding
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(resp.text, 'html.parser')

        for s in soup(['script', 'style', 'nav', 'header', 'footer']):
            s.decompose()

        text = soup.get_text(separator='\n', strip=True)
        text = re.sub(r'\n{3,}', '\n\n', text)

        # Use LLM to clean the content - model_id is required
        if not model_id:
            return jsonify({'error': '使用URL获取内容需要大模型来清洗数据，请先选择一个模型'}), 400

        cleaned = clean_url_content_with_llm(text, model_id)
        if cleaned:
            return jsonify({'text': cleaned})

        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def clean_url_content_with_llm(raw_text, model_id):
    """Use LLM to extract main content from URL text, removing noise but preserving original wording."""
    config = load_config()
    model = next((m for m in config['models'] if m['id'] == model_id), None)
    if not model:
        return None

    try:
        api_key = decode_api_key(model.get('api_key', ''))
        client = OpenAI(
            api_key=api_key or 'dummy',
            base_url=model['url']
        )
        # Truncate if too long
        max_input = 8000
        truncated = raw_text[:max_input]

        prompt = f"""以下是从网页中提取的文本内容，其中包含大量干扰信息（如导航栏、广告、页脚、版权声明、按钮文字等）。请你识别并去除这些干扰内容，只保留页面的主要正文内容。

重要要求：
1. 不要总结或改写内容，必须保留原文的用词和表述
2. 只删除干扰信息，保留正文原文
3. 如果内容本身有清晰的段落结构，保留段落分隔
4. 如果无法判断哪些是干扰内容，宁可多保留也不要误删

以下是网页内容：
---
{truncated}
---

请输出清理后的正文内容："""

        # Detect Qwen model variants for thinking control (based on model field)
        model_field_lower = model['model'].lower()
        is_qwen3x = bool(re.match(r'^qwen3[^-]', model_field_lower))
        is_qwen3 = bool(re.match(r'^qwen3-', model_field_lower))
        if is_qwen3x:
            extra_body = {'chat_template_kwargs': {'enable_thinking': False, 'thinking': False}}
        elif is_qwen3:
            extra_body = {'enable_thinking': False}
        else:
            extra_body = None

        response = client.chat.completions.create(
            model=model['model'],
            messages=[
                {'role': 'system', 'content': '你是一个网页内容提取助手，擅长从杂乱的网页文本中提取出核心正文内容，保留原文不变，只去除干扰信息。'},
                {'role': 'user', 'content': prompt}
            ],
            stream=False,
            temperature=0.1,
            max_tokens=4096,
            **({'extra_body': extra_body} if extra_body else {})
        )
        return response.choices[0].message.content
    except Exception:
        return None


# ========== Generate ==========
@app.route('/press-release/api/generate', methods=['POST'])
def generate():
    app.logger.info('POST /api/generate from %s', request.remote_addr)
    data = request.json
    model_id = data.get('model_id')
    press_type = data.get('type', '')
    word_count = data.get('word_count', 500)
    user_input = data.get('user_input', '')
    file_texts = data.get('file_texts', [])
    ref_content = data.get('ref_content', '')

    config = load_config()
    model = next((m for m in config['models'] if m['id'] == model_id), None)
    if not model:
        app.logger.warning('Generate failed: model not found %s', model_id)
        return jsonify({'error': '模型不存在'}), 400

    # Build prompt
    prompt = build_prompt(press_type, word_count, user_input, file_texts, ref_content, config)

    api_key = decode_api_key(model.get('api_key', ''))

    # Detect Qwen model variants for thinking control (based on model field)
    model_field_lower = model['model'].lower()
    is_qwen3x = bool(re.match(r'^qwen3[^-]', model_field_lower))
    is_qwen3 = bool(re.match(r'^qwen3-', model_field_lower))
    app.logger.info('Generate using model=%s, type=qwen3x=%s qwen3=%s', model['model'], is_qwen3x, is_qwen3)

    def stream_response():
        try:
            client = OpenAI(
                api_key=api_key or 'dummy',
                base_url=model['url']
            )

            # Build extra_body for Qwen thinking control
            extra_body = None
            if is_qwen3x:
                extra_body = {
                    'chat_template_kwargs': {
                        'enable_thinking': False,
                        'thinking': False
                    }
                }
            elif is_qwen3:
                extra_body = {'enable_thinking': False}

            stream = client.chat.completions.create(
                model=model['model'],
                messages=[
                    {'role': 'system', 'content': '你是一位专业的通讯稿撰写专家。请根据用户提供的素材和要求，撰写高质量的通讯稿。'},
                    {'role': 'user', 'content': prompt}
                ],
                stream=True,
                temperature=0.7,
                max_tokens=4096,
                **({'extra_body': extra_body} if extra_body else {})
            )
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'content': content}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            app.logger.error('Generate stream error: %s', e, exc_info=True)
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    app.logger.info('Generate stream started for model=%s', model['model'])
    return Response(stream_response(), mimetype='text/event-stream')


def build_prompt(press_type, word_count, user_input, file_texts, ref_content, config):
    """Build the complete prompt for press release generation."""
    parts = []

    parts.append(f"请撰写一篇通讯稿，字数约{word_count}字。\n")

    # Type-specific reference content
    if press_type == '繁星计划':
        parts.append(f"通讯稿类型为「繁星计划」，以下为繁星计划的参考内容，请参考其写作风格和格式：\n{FANXING_REF}\n")
    elif press_type == '专题培训':
        parts.append(f"通讯稿类型为「专题培训」，以下为专题培训的参考内容，请参考其写作风格和格式：\n{ZHUANTI_REF}\n")
    else:
        # Check if it's a saved theme
        theme = next((t for t in config.get('themes', []) if t['name'] == press_type), None)
        if theme and theme.get('content'):
            parts.append(f"通讯稿类型为「{press_type}」，以下为该类型的参考内容，请参考其写作风格和格式：\n{theme['content']}\n")
        elif ref_content:
            parts.append(f"以下是用户提供的参考内容，请参考其写作风格和格式：\n{ref_content}\n")

    # User input
    if user_input:
        parts.append(f"用户的通讯稿要求：\n{user_input}\n")

    # File texts
    if file_texts:
        combined_files = '\n---\n'.join(file_texts)
        parts.append(f"用户上传的参考资料：\n{combined_files}\n")

    parts.append("请根据以上信息撰写通讯稿，注意：1. 语言正式、专业；2. 结构清晰，有标题和正文；3. 符合通讯稿的写作规范；4. 字数控制在指定范围内。")

    return '\n'.join(parts)


if __name__ == '__main__':
    app.logger.info('Press Release Generator starting...')
    app.run(debug=False, host='0.0.0.0', port=5002)
