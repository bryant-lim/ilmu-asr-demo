import os
import base64
import json
import requests
from flask import Flask, request, jsonify, send_file, send_from_directory

app = Flask(__name__, static_folder='static', static_url_path='')

PORT = 5001
UPLOAD_FOLDER = 'temp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/audio')
def get_audio():
    # Use the default local audio Kelate.mp3
    audio_path = 'Kelate.mp3'
    if not os.path.exists(audio_path):
        return jsonify({'error': 'Default audio file Kelate.mp3 not found'}), 404
    # send_file with conditional=True supports Byte Range requests out-of-the-box in Flask
    return send_file(audio_path, mimetype='audio/mpeg', conditional=True)

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    # Retrieve the API key from request header or environment variables
    api_key = request.headers.get('X-ILMU-API-KEY') or os.environ.get('ILMU_API_KEY')
    if not api_key:
        return jsonify({'error': 'ILMU API Key is missing. Please provide it in the UI or set the ILMU_API_KEY environment variable.'}), 400

    # Determine whether to use the uploaded file or the default Kelate.mp3
    temp_file_path = None
    original_filename = 'Kelate.mp3'
    
    if 'file' in request.files and request.files['file'].filename != '':
        audio_file = request.files['file']
        original_filename = audio_file.filename
        # Save file to temp folder to process
        temp_file_path = os.path.join(UPLOAD_FOLDER, original_filename)
        audio_file.save(temp_file_path)
        file_to_send = open(temp_file_path, 'rb')
    else:
        # Fallback to local Kelate.mp3
        default_path = 'Kelate.mp3'
        if not os.path.exists(default_path):
            return jsonify({'error': 'Default audio file Kelate.mp3 not found.'}), 404
        file_to_send = open(default_path, 'rb')

    try:
        # 1. Speech-to-Text Transcription via ilmu-asr-v4.2
        asr_url = "https://api.ilmu.ai/v1/audio/transcriptions"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        files = {
            "file": (original_filename, file_to_send, "audio/mpeg")
        }
        data = {
            "model": "ilmu-asr-v4.2",
            "language": "ms",
            "response_format": "json"
        }

        # 120s timeout comfortable ceiling as specified in ILMU API ASR docs
        asr_response = requests.post(asr_url, headers=headers, files=files, data=data, timeout=120)
        file_to_send.close()

        # Clean up temp file if we saved one
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        if asr_response.status_code != 200:
            error_msg = f"ASR API Error: {asr_response.text}"
            try:
                error_json = asr_response.json()
                error_msg = error_json.get('error', {}).get('message', error_msg)
            except Exception:
                pass
            return jsonify({'error': error_msg}), asr_response.status_code

        asr_data = asr_response.json()
        raw_transcript = asr_data.get('text', '')

        if not raw_transcript.strip():
            return jsonify({
                'filename': original_filename,
                'transcript': '',
                'analysis': {
                    'standard_malay': 'Tiada audio bertutur dikesan.',
                    'english': 'No speech detected.',
                    'explanation': 'Fail audio kosong atau tidak mengandungi suara bertutur.',
                    'glossary': []
                }
            })

        # 2. Translation & Dialect Explanation via Chat Completions (ilmu-mini-v3.3)
        chat_url = "https://api.ilmu.ai/v1/chat/completions"
        chat_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        system_prompt = (
            "You are a linguistic expert specializing in Malaysian regional dialects, particularly the Kelantanese dialect (Kelate).\n"
            "Analyze the given Kelantanese transcription. Output raw JSON ONLY. Do not wrap the JSON output in markdown backticks.\n"
            "JSON structure:\n"
            "{\n"
            "  \"standard_malay\": \"(Standard Malay translation of the conversation)\",\n"
            "  \"english\": \"(English translation of the conversation)\",\n"
            "  \"explanation\": \"(A brief summary of what the speakers are discussing, cultural context, and tone)\",\n"
            "  \"glossary\": [\n"
            "    {\"word\": \"(dialect word)\", \"standard_malay_meaning\": \"(meaning in standard BM)\", \"english_meaning\": \"(meaning in English)\"}\n"
            "  ]\n"
            "}"
        )

        chat_data = {
            "model": "ilmu-mini-v3.3",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Dialect Transcript:\n{raw_transcript}"}
            ]
        }

        chat_response = requests.post(chat_url, headers=chat_headers, json=chat_data, timeout=60)
        
        analysis = {
            'standard_malay': 'Gagal menterjemah transcript.',
            'english': 'Failed to translate transcript.',
            'explanation': 'Sila semak semula sambungan API.',
            'glossary': []
        }

        if chat_response.status_code == 200:
            chat_res_json = chat_response.json()
            completion_text = chat_res_json.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
            
            # Clean potential markdown JSON block formatting if present
            if completion_text.startswith("```"):
                lines = completion_text.split('\n')
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                completion_text = "\n".join(lines).strip()

            try:
                analysis = json.loads(completion_text)
            except Exception as e:
                # Fallback parser/handling in case JSON loading fails
                analysis = {
                    'standard_malay': 'Ralat memproses hasil terjemahan.',
                    'english': 'Error parsing translation response.',
                    'explanation': completion_text,
                    'glossary': []
                }

        return jsonify({
            'filename': original_filename,
            'transcript': raw_transcript,
            'analysis': analysis
        })

    except Exception as e:
        # Final safety cleanup
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return jsonify({'error': f"Internal Server Error: {str(e)}"}), 500

@app.route('/api/synthesize', methods=['POST'])
def synthesize():
    api_key = request.headers.get('X-ILMU-API-KEY') or os.environ.get('ILMU_API_KEY')
    if not api_key:
        return jsonify({'error': 'ILMU API Key is missing. Please provide it in the UI or set the ILMU_API_KEY environment variable.'}), 400

    req_data = request.json or {}
    text = req_data.get('text', '').strip()
    voice = req_data.get('voice', 'voice_1').strip()

    if not text:
        return jsonify({'error': 'Sila masukkan teks dialek yang ingin ditranskripsikan ke audio.'}), 400

    try:
        # 1. Text-to-Speech API Call (ilmu-tts-v2)
        tts_url = "https://api.ilmu.ai/v1/audio/speech"
        tts_headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        tts_payload = {
            "model": "ilmu-tts-v2",
            "input": text,
            "voice": voice,
            "response_format": "mp3"
        }

        # 60s timeout comfortable buffer
        tts_response = requests.post(tts_url, headers=tts_headers, json=tts_payload, timeout=60)

        if tts_response.status_code != 200:
            error_msg = f"TTS API Error: {tts_response.text}"
            try:
                error_json = tts_response.json()
                error_msg = error_json.get('error', {}).get('message', error_msg)
            except Exception:
                pass
            return jsonify({'error': error_msg}), tts_response.status_code

        # Encode the generated audio bytes to base64
        audio_base64 = base64.b64encode(tts_response.content).decode('utf-8')

        # 2. Text Explanation & Translation via Chat Completions (ilmu-mini-v3.3)
        chat_url = "https://api.ilmu.ai/v1/chat/completions"
        chat_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        system_prompt = (
            "You are a linguistic expert specializing in Malaysian regional dialects, particularly the Kelantanese dialect (Kelate).\n"
            "Analyze the given Kelantanese text. Output raw JSON ONLY. Do not wrap the JSON output in markdown backticks.\n"
            "JSON structure:\n"
            "{\n"
            "  \"standard_malay\": \"(Standard Malay translation of the text)\",\n"
            "  \"english\": \"(English translation of the text)\",\n"
            "  \"explanation\": \"(A brief summary of what the text says, cultural context, and tone)\",\n"
            "  \"glossary\": [\n"
            "    {\"word\": \"(dialect word)\", \"standard_malay_meaning\": \"(meaning in standard BM)\", \"english_meaning\": \"(meaning in English)\"}\n"
            "  ]\n"
            "}"
        )

        chat_data = {
            "model": "ilmu-mini-v3.3",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Dialect Text:\n{text}"}
            ]
        }

        chat_response = requests.post(chat_url, headers=chat_headers, json=chat_data, timeout=60)
        
        analysis = {
            'standard_malay': 'Gagal menterjemah teks.',
            'english': 'Failed to translate text.',
            'explanation': 'Sila semak semula sambungan API.',
            'glossary': []
        }

        if chat_response.status_code == 200:
            chat_res_json = chat_response.json()
            completion_text = chat_res_json.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
            
            # Clean potential markdown JSON block formatting if present
            if completion_text.startswith("```"):
                lines = completion_text.split('\n')
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                completion_text = "\n".join(lines).strip()

            try:
                analysis = json.loads(completion_text)
            except Exception as e:
                analysis = {
                    'standard_malay': 'Ralat memproses hasil terjemahan.',
                    'english': 'Error parsing translation response.',
                    'explanation': completion_text,
                    'glossary': []
                }

        return jsonify({
            'audio': audio_base64,
            'text': text,
            'voice': voice,
            'analysis': analysis
        })

    except Exception as e:
        return jsonify({'error': f"Internal Server Error: {str(e)}"}), 500

@app.route('/api/voice-agent', methods=['POST'])
def voice_agent():
    import time
    api_key = request.headers.get('X-ILMU-API-KEY') or os.environ.get('ILMU_API_KEY')
    if not api_key:
        return jsonify({'error': 'ILMU API Key is missing. Please provide it in the UI or set the ILMU_API_KEY environment variable.'}), 400

    if 'file' not in request.files or request.files['file'].filename == '':
        return jsonify({'error': 'Tiada rakaman audio diterima.'}), 400

    audio_file = request.files['file']
    system_prompt = request.form.get('system_prompt', '').strip()
    history_str = request.form.get('history', '[]').strip()
    voice = request.form.get('voice', 'voice_1').strip()

    try:
        history = json.loads(history_str)
    except Exception:
        history = []

    temp_file_path = None
    original_filename = audio_file.filename
    
    try:
        # Save user recording to a temporary file
        temp_file_path = os.path.join(UPLOAD_FOLDER, f"agent_{int(time.time())}_{original_filename}")
        audio_file.save(temp_file_path)

        # Time ASR (STT)
        t0 = time.perf_counter()
        asr_url = "https://api.ilmu.ai/v1/audio/transcriptions"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }
        
        mime = "audio/mpeg"
        if original_filename.endswith(".webm"):
            mime = "audio/webm"
        elif original_filename.endswith(".wav"):
            mime = "audio/wav"
        elif original_filename.endswith(".m4a"):
            mime = "audio/mp4"

        with open(temp_file_path, 'rb') as f:
            files = {
                "file": (original_filename, f, mime)
            }
            data = {
                "model": "ilmu-asr-v4.2",
                # Omit language parameter to let ASR auto-detect language spoken
                "response_format": "json"
            }
            asr_response = requests.post(asr_url, headers=headers, files=files, data=data, timeout=120)

        # Cleanup temp file immediately
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        if asr_response.status_code != 200:
            error_msg = f"ASR API Error: {asr_response.text}"
            try:
                error_json = asr_response.json()
                error_msg = error_json.get('error', {}).get('message', error_msg)
            except Exception:
                pass
            return jsonify({'error': error_msg}), asr_response.status_code

        asr_data = asr_response.json()
        user_transcript = asr_data.get('text', '').strip()
        t1 = time.perf_counter()
        asr_latency = round(t1 - t0, 2)

        if not user_transcript:
            return jsonify({
                'user_transcript': '',
                'ai_response': 'Saya tidak mendengar sebarang suara. Sila cuba bercakap lagi.',
                'audio': '',
                'latency': {
                    'asr': asr_latency,
                    'llm': 0.0,
                    'tts': 0.0,
                    'total': asr_latency
                }
            })

        # Time LLM (Chat)
        t2 = time.perf_counter()
        chat_url = "https://api.ilmu.ai/v1/chat/completions"
        chat_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Append history (keep last 10 messages)
        for msg in history[-10:]:
            messages.append({"role": msg.get("role"), "content": msg.get("content")})
            
        messages.append({"role": "user", "content": user_transcript})

        chat_data = {
            "model": "ilmu-mini-v3.3",
            "messages": messages
        }

        chat_response = requests.post(chat_url, headers=chat_headers, json=chat_data, timeout=60)
        
        if chat_response.status_code != 200:
            error_msg = f"LLM API Error: {chat_response.text}"
            try:
                error_json = chat_response.json()
                error_msg = error_json.get('error', {}).get('message', error_msg)
            except Exception:
                pass
            return jsonify({'error': error_msg}), chat_response.status_code

        chat_res_json = chat_response.json()
        ai_response = chat_res_json.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
        t3 = time.perf_counter()
        llm_latency = round(t3 - t2, 2)

        # Time TTS
        t4 = time.perf_counter()
        tts_url = "https://api.ilmu.ai/v1/audio/speech"
        tts_headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        tts_payload = {
            "model": "ilmu-tts-v2",
            "input": ai_response,
            "voice": voice,
            "response_format": "mp3"
        }

        tts_response = requests.post(tts_url, headers=tts_headers, json=tts_payload, timeout=60)

        if tts_response.status_code != 200:
            error_msg = f"TTS API Error: {tts_response.text}"
            try:
                error_json = tts_response.json()
                error_msg = error_json.get('error', {}).get('message', error_msg)
            except Exception:
                pass
            return jsonify({'error': error_msg}), tts_response.status_code

        audio_base64 = base64.b64encode(tts_response.content).decode('utf-8')
        t5 = time.perf_counter()
        tts_latency = round(t5 - t4, 2)

        total_latency = round(t5 - t0, 2)

        return jsonify({
            'user_transcript': user_transcript,
            'ai_response': ai_response,
            'audio': audio_base64,
            'latency': {
                'asr': asr_latency,
                'llm': llm_latency,
                'tts': tts_latency,
                'total': total_latency
            }
        })

    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return jsonify({'error': f"Internal Server Error: {str(e)}"}), 500

if __name__ == '__main__':
    print(f"Starting server on port {PORT}...")
    app.run(host='0.0.0.0', port=PORT, debug=True)
